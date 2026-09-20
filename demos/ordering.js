/**
 * Demo: combinatorial optimisation.
 *
 * The ordering stage's heuristics and swap policies, with a convergence trace
 * so the cost of each extra pass is visible.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import {
  page, controls, readout, note, show, energyData, layeredData, energyColorScale
} from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene } from "../src/render/theme.js";
import { sceneToDOM } from "../src/render/dom.js";
import { randomLcg } from "../src/internal/random.js";

const W = 660;
const H = 340;
const svgNS = "http://www.w3.org/2000/svg";
/** @param {string} n @param {Record<string, any>} a */
const el = (n, a = {}) => {
  const node = document.createElementNS(svgNS, n);
  for (const [k, v] of Object.entries(a)) node.setAttribute(k, String(v));
  return node;
};

const ui = page({
  title: "Combinatorial optimisation",
  description:
    "Ordering nodes within layers to reduce crossings. Minimising them exactly " +
    "is NP-complete, so this is heuristic search."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);
const chartHost = document.createElement("div");
ui.stage.appendChild(chartHost);

note(
  ui.stage,
  "The stage sweeps each layer into the order suggested by its neighbour — by " +
  "<strong>median</strong> or <strong>barycentre</strong> — then tries pairwise " +
  "swaps. <strong>Simulated annealing</strong> accepts a worsening swap with a " +
  "probability that decays each pass, which escapes local minima; " +
  "<strong>sequential</strong> keeps only improvements.<br><br>" +
  "The trace shows the best count found so far against passes completed. " +
  "Because the search is randomised, the <em>seed</em> changes the answer — " +
  "which is why every published measurement in this project fixes it. Without " +
  "a seed the stage uses <code>Math.random</code> and the same input can give " +
  "different results twice running."
);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Algorithm" },
    { type: "select", key: "heuristic", label: "sweep heuristic", value: "median",
      options: ["median", "barycenter"] },
    { type: "select", key: "swapAlgorithm", label: "swap policy", value: "simulated annealing",
      options: ["simulated annealing", "sequential", "mixed"] },
    { type: "select", key: "application", label: "application", value: "zigzag",
      options: ["zigzag", "successive"] },
    { type: "range", key: "nsteps", label: "passes", min: 0, max: 200, step: 1, value: 40 },
    { type: "range", key: "coolingRate", label: "cooling rate", min: 0.1, max: 0.95, step: 0.05,
      value: 0.5, hint: "How fast the annealing probability decays." },
    { type: "range", key: "rngSeed", label: "search seed", min: 1, max: 30, step: 1, value: 1,
      hint: "Changes the random search, not the data." },

    { type: "group", key: "_g2", label: "Data" },
    { type: "select", key: "dataset", label: "dataset", value: "energy",
      options: [
        { value: "energy", label: "energy matrix" },
        { value: "layered", label: "layered, large" }
      ] },
    { type: "range", key: "seed", label: "data seed", min: 0, max: 0.9, step: 0.1, value: 0.5 }
  ],
  render
);

/**
 * A small line chart of the convergence history.
 * @param {{steps: number, crossings: number}[]} history
 * @param {number} totalSteps
 */
function chart(history, totalSteps) {
  const w = W;
  const h = 130;
  const pad = { l: 42, r: 8, t: 10, b: 24 };
  const svg = el("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  const maxY = Math.max(...history.map((p) => p.crossings), 1);
  const x = (/** @type {number} */ s) =>
    pad.l + (s / Math.max(1, totalSteps)) * (w - pad.l - pad.r);
  const y = (/** @type {number} */ c) =>
    h - pad.b - (c / maxY) * (h - pad.t - pad.b);

  for (let i = 0; i <= 3; i++) {
    const value = (maxY * i) / 3;
    svg.appendChild(el("line", {
      x1: pad.l, x2: w - pad.r, y1: y(value), y2: y(value), stroke: "#e5e7eb"
    }));
    const t = el("text", {
      x: pad.l - 6, y: y(value) + 3, "text-anchor": "end",
      "font-size": 9, "font-family": "monospace", fill: "#6b7280"
    });
    t.textContent = String(Math.round(value));
    svg.appendChild(t);
  }

  // The history records improvements only; hold the line flat between them.
  const points = [];
  for (const entry of history) points.push(`${x(entry.steps)},${y(entry.crossings)}`);
  const last = history[history.length - 1];
  points.push(`${x(totalSteps)},${y(last.crossings)}`);
  svg.appendChild(el("polyline", {
    points: points.join(" "), fill: "none", stroke: "#8c2d1e",
    "stroke-width": 1.6, "stroke-linejoin": "round"
  }));
  for (const entry of history) {
    svg.appendChild(el("circle", {
      cx: x(entry.steps), cy: y(entry.crossings), r: 2.4, fill: "#8c2d1e"
    }));
  }
  const label = el("text", {
    x: pad.l, y: h - 6, "font-size": 9.5, "font-family": "sans-serif", fill: "#6b7280"
  });
  label.textContent = "passes completed →";
  svg.appendChild(label);
  return svg;
}

function render() {
  const v = values;
  const links =
    v.dataset === "energy"
      ? energyData({ seed: Number(v.seed) })
      : layeredData({ seed: Number(v.seed), scale: 2 });

  const layout = sankeyAddDummies(sankeyLayers({ links }, { nodeAlign: "center" }));
  const t0 = performance.now();
  const ordered = sankeyOrderNodes(layout, {
    heuristic: /** @type {any} */ (v.heuristic),
    swapAlgorithm: /** @type {any} */ (v.swapAlgorithm),
    application: /** @type {any} */ (v.application),
    nsteps: Number(v.nsteps),
    coolingRate: Number(v.coolingRate),
    random: randomLcg(Number(v.rngSeed))
  });
  const ms = performance.now() - t0;

  const geometry = sankeyGeometricLayout(ordered, { size: H, whitespace: 0.3, margin: 10 });
  const scene = buildScene(
    sankeyRenderLayout(geometry, { length: W }),
    { width: W, height: H, nodeLabelPadding: 4 }
  );
  const painted = paintScene(scene, {
    colorScale: energyColorScale, pathColor: "source",
    pathOpacity: 0.5, nodeStrokeWidth: 0.4, labelFont: "9px sans-serif"
  });
  const wrap = document.createElement("div");
  wrap.appendChild(sceneToDOM(painted, { interactive: true }));
  show(host, wrap);
  show(chartHost, chart(ordered.history, Number(v.nsteps)));

  const first = ordered.history[0].crossings;
  setMetrics({
    crossings: ordered.crossings,
    "from": first,
    "reduction": `${first ? Math.round((100 * (first - ordered.crossings)) / first) : 0}%`,
    "improvements": ordered.history.length - 1,
    time: `${ms.toFixed(0)} ms`
  });
}

render();
