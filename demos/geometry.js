/**
 * Demo: geometric optimisation.
 *
 * The spring system that settles node coordinates, with the springs drawn so
 * the effect of each stiffness is visible rather than inferred.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { page, controls, readout, note, show, energyData, energyColorScale } from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes, sankeyRenderLayout,
  layoutToPSystem, PSystemToGeometricLayout, pSystem
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene } from "../src/render/theme.js";
import { sceneToDOM } from "../src/render/dom.js";
import { measureScene } from "../src/metrics/index.js";
import { randomLcg } from "../src/internal/random.js";

const W = 680;
const H = 380;
const svgNS = "http://www.w3.org/2000/svg";
/** @param {string} n @param {Record<string, any>} a */
const el = (n, a = {}) => {
  const node = document.createElementNS(svgNS, n);
  for (const [k, v] of Object.entries(a)) node.setAttribute(k, String(v));
  return node;
};

/** Spring colours, matching the description in the paper. */
const SPRING_COLOR = { edge: "#8c2d1e", node: "#e08214", margin: "#2c4b7c" };

const ui = page({
  title: "Geometric optimisation",
  description:
    "Nodes slide along their layer under three kinds of spring, with hard " +
    "constraints applied after each step."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);

note(
  ui.stage,
  "<strong>Edge springs</strong> (dark red) pull connected nodes in adjacent " +
  "layers into alignment, straightening links. <strong>Node springs</strong> " +
  "(orange) hold a minimum separation within a layer. <strong>Margin " +
  "springs</strong> (blue) draw the first and last node of each layer toward " +
  "the boundary.<br><br>" +
  "Raise edge stiffness and the diagram tightens around its heaviest flows; " +
  "raise margin stiffness and it spreads to fill the height. " +
  "<em>Iterations</em> shows convergence — ten is enough for everything we " +
  "have measured, and the display barely changes beyond it."
);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Spring stiffness" },
    { type: "range", key: "edgeStiff", label: "edge", min: 0, max: 6, step: 0.1, value: 1 },
    { type: "range", key: "nodeStiff", label: "node", min: 0, max: 6, step: 0.1, value: 1 },
    { type: "range", key: "marginStiff", label: "margin", min: 0, max: 12, step: 0.2, value: 5 },
    { type: "range", key: "edgeWeightMultiplier", label: "weight emphasis",
      min: 1, max: 30, step: 1, value: 10,
      hint: "How much a heavy link outpulls a light one." },

    { type: "group", key: "_g2", label: "Spacing" },
    { type: "range", key: "iterations", label: "iterations", min: 0, max: 40, step: 1, value: 10 },
    { type: "range", key: "whitespace", label: "white space", min: 0.05, max: 0.6, step: 0.01,
      value: 0.3, format: (x) => `${Math.round(x * 100)}%` },
    { type: "range", key: "margin", label: "margin", min: 0, max: 60, step: 1, value: 12 },

    { type: "group", key: "_g3", label: "Display" },
    { type: "toggle", key: "springs", label: "show springs", value: true },
    { type: "toggle", key: "ribbons", label: "show ribbons", value: true },
    { type: "range", key: "seed", label: "data seed", min: 0, max: 0.9, step: 0.1, value: 0.5 }
  ],
  render
);

function render() {
  const v = values;
  const links = energyData({ seed: Number(v.seed) });
  const layout = sankeyAddDummies(sankeyLayers({ links }, { nodeAlign: "center" }));
  sankeyOrderNodes(layout, { nsteps: 50, random: randomLcg(4) });

  // Run the relaxation by hand so the spring structure can be drawn.
  const info = layoutToPSystem(layout, {
    joinDummies: false, size: H, margin: Number(v.margin), whitespace: Number(v.whitespace)
  });
  const simulation = pSystem(info.vertices, info.edges, {
    size: H,
    margin: Number(v.margin),
    minSep: info.minSep,
    edgeStiff: Number(v.edgeStiff),
    nodeStiff: Number(v.nodeStiff),
    marginStiff: Number(v.marginStiff),
    edgeWeightMultiplier: Number(v.edgeWeightMultiplier),
    iterations: Number(v.iterations)
  });
  let state;
  for (state of simulation);
  const geometry = PSystemToGeometricLayout(layout, /** @type {any} */ (state));
  geometry.size = H;

  const renderLayout = sankeyRenderLayout(geometry, { length: W });
  const scene = buildScene(renderLayout, { width: W, height: H, nodeLabelPadding: 4 });
  const painted = paintScene(scene, {
    colorScale: energyColorScale, pathColor: "source",
    pathOpacity: v.springs ? 0.25 : 0.55, nodeStrokeWidth: 0.4,
    labelFont: "9px sans-serif"
  });

  const wrap = document.createElement("div");
  // With ribbons hidden the spring overlay needs a bare canvas of the same
  // size to draw into.
  const svg = v.ribbons
    ? sceneToDOM(painted, { interactive: true })
    : el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  wrap.appendChild(svg);

  if (v.springs && svg) {
    // Layer coordinate for each vertex, taken from the boxes already placed.
    const xOf = new Map();
    for (const box of renderLayout.boxes) {
      xOf.set(box.vertex, box.x + box.width / 2);
    }
    const group = el("g", { "stroke-opacity": 0.75 });
    for (const spring of /** @type {any[]} */ (state.springs)) {
      const { v1, v2, offset1, offset2, type } = spring;
      const x1 = xOf.get(v1);
      const x2 = xOf.get(v2);
      // Anchors are not drawn; they have no box.
      const ax = x1 ?? x2;
      const bx = x2 ?? x1;
      if (ax === undefined || bx === undefined) continue;
      group.appendChild(el("line", {
        x1: ax, y1: v1.coord + offset1, x2: bx, y2: v2.coord + offset2,
        stroke: SPRING_COLOR[/** @type {"edge"} */ (type)] ?? "#999",
        "stroke-width": type === "edge" ? 1 : 1.4,
        "stroke-dasharray": type === "margin" ? "3 2" : "none"
      }));
    }
    svg.appendChild(group);
  }
  show(host, wrap);

  const metrics = measureScene(scene, { sampleScale: 1 });
  const counts = { edge: 0, node: 0, margin: 0 };
  for (const s of /** @type {any[]} */ (state.springs)) counts[s.type]++;
  setMetrics({
    "edge springs": counts.edge,
    "node springs": counts.node,
    "margin springs": counts.margin,
    "path length": Math.round(metrics.totalLength),
    overlap: `${(100 * metrics.overlapRatio).toFixed(2)}%`,
    "min sep": info.minSep.toFixed(1)
  });
}

render();
