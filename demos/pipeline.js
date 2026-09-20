/**
 * Demo: the pipeline, stage by stage.
 *
 * Shows what each stage adds, by rendering the intermediate structures that
 * the library exposes but a monolithic implementation would keep private.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { page, controls, readout, note, show, energyData, energyColorScale } from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene } from "../src/render/theme.js";
import { sceneToDOM } from "../src/render/dom.js";
import { randomLcg } from "../src/internal/random.js";

const W = 700;
const H = 400;
const svgNS = "http://www.w3.org/2000/svg";
/** @param {string} n @param {Record<string, any>} a */
const el = (n, a = {}) => {
  const node = document.createElementNS(svgNS, n);
  for (const [k, val] of Object.entries(a)) node.setAttribute(k, String(val));
  return node;
};

const ui = page({
  title: "The pipeline, stage by stage",
  description:
    "Each stage is an ordinary function returning a plain structure, so the " +
    "intermediate results can be drawn."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);
const explain = note(ui.stage, "");

const STAGES = {
  1: {
    name: "Layering",
    text: "<code>sankeyLayers</code> assigns each node to a layer so that every " +
      "link runs forwards. Nodes are shown in their layer, in input order; " +
      "nothing has been positioned or ordered yet."
  },
  2: {
    name: "Dummy nodes",
    text: "<code>sankeyAddDummies</code> routes links that span more than one " +
      "layer through placeholder nodes, shown hollow. This keeps links from " +
      "passing over unrelated nodes, at the cost of more sinuous paths."
  },
  3: {
    name: "Ordering",
    text: "<code>sankeyOrderNodes</code> permutes nodes within each layer to " +
      "reduce crossings, using a median sweep refined by simulated-annealing " +
      "swaps. Only the vertical <em>order</em> changes here, not the spacing."
  },
  4: {
    name: "Geometry",
    text: "<code>sankeyGeometricLayout</code> gives every node a size and a " +
      "coordinate, settled by a one-dimensional spring relaxation. The layout " +
      "is now metric but still has no ribbons."
  },
  5: {
    name: "Render layout",
    text: "<code>sankeyRenderLayout</code> resolves node boxes and the geometry " +
      "of each link hop in the final coordinate system. This is the last stage " +
      "free of any drawing concern — which is what lets two layouts be merged."
  },
  6: {
    name: "Scene and paint",
    text: "<code>buildScene</code> resolves shapes and positions; " +
      "<code>paintScene</code> resolves colours and fonts. Separating them means " +
      "a diagram can be restyled without being laid out again, or measured " +
      "without being styled at all."
  }
};

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Stage" },
    {
      type: "range", key: "stage", label: "stage", min: 1, max: 6, step: 1, value: 6,
      format: (v) => `${v}. ${STAGES[/** @type {1} */ (v)].name}`
    },
    { type: "group", key: "_g2", label: "Data" },
    { type: "range", key: "seed", label: "data seed", min: 0, max: 0.9, step: 0.1, value: 0.5 },
    {
      type: "select", key: "nodeAlign", label: "node alignment", value: "center",
      options: ["left", "right", "center", "justify", "heuristic"]
    },
    { type: "range", key: "nsteps", label: "ordering passes", min: 0, max: 150, step: 5, value: 40 }
  ],
  render
);

/**
 * Draws a schematic of layers, before any geometry exists.
 * @param {any[][]} layers
 * @param {boolean} showDummies
 */
function schematic(layers, showDummies) {
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const gapX = (W - 80) / Math.max(1, layers.length - 1);
  const boxH = 15;
  const maxCount = Math.max(...layers.map((l) => l.length));
  const gapY = Math.min(26, (H - 60) / Math.max(1, maxCount));

  layers.forEach((layer, i) => {
    const x = 40 + i * gapX;
    const top = (H - layer.length * gapY) / 2;
    layer.forEach((node, j) => {
      const y = top + j * gapY;
      const dummy = Boolean(node.dummy);
      if (dummy && !showDummies) return;
      svg.appendChild(
        el("rect", {
          x: x - 34, y, width: 68, height: boxH, rx: 2,
          fill: dummy ? "none" : energyColorScale(node.key),
          stroke: dummy ? "#9aa0a6" : "none",
          "stroke-dasharray": dummy ? "3 2" : "none"
        })
      );
      if (!dummy) {
        const t = el("text", {
          x, y: y + boxH / 2, "text-anchor": "middle",
          "dominant-baseline": "central", "font-size": 8.5,
          "font-family": "sans-serif", fill: "#fff"
        });
        t.textContent = node.key.length > 12 ? node.key.slice(0, 11) + "…" : node.key;
        svg.appendChild(t);
      }
    });
  });

  // Links as straight connectors, so ordering is what the eye reads.
  const centre = new Map();
  layers.forEach((layer, i) => {
    const x = 40 + i * gapX;
    const top = (H - layer.length * gapY) / 2;
    layer.forEach((node, j) => centre.set(node.key, [x, top + j * gapY + boxH / 2]));
  });
  const lines = el("g", { stroke: "#94a3b8", "stroke-opacity": 0.55, fill: "none" });
  for (const layer of layers) {
    for (const node of layer) {
      for (const link of node.outgoing) {
        const from = centre.get(node.key);
        const target = showDummies && link.dummies ? link.dummies[0] : link.target;
        const to = centre.get(target);
        if (from && to) {
          lines.appendChild(
            el("line", { x1: from[0] + 34, y1: from[1], x2: to[0] - 34, y2: to[1] })
          );
        }
      }
    }
  }
  svg.insertBefore(lines, svg.firstChild);
  return svg;
}

/**
 * Draws nodes at their settled coordinates, still without ribbons.
 * @param {any} geometry
 */
function skeleton(geometry) {
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const layers = geometry.layers;
  const gapX = (W - 60) / Math.max(1, layers.length - 1);
  layers.forEach((/** @type {any[]} */ layer, /** @type {number} */ i) => {
    const x = 30 + i * gapX;
    for (const node of layer) {
      svg.appendChild(
        el("rect", {
          x: x - 7, y: node.coord, width: 14, height: Math.max(1, node.size),
          fill: node.dummy ? "none" : energyColorScale(node.key),
          stroke: node.dummy ? "#9aa0a6" : "none",
          "stroke-dasharray": node.dummy ? "3 2" : "none"
        })
      );
    }
  });
  return svg;
}

function render() {
  const v = values;
  const stage = Number(v.stage);
  const links = energyData({ seed: Number(v.seed) });

  const layered = sankeyLayers({ links }, { nodeAlign: /** @type {any} */ (v.nodeAlign) });
  if (stage === 1) {
    show(host, schematic(layered.layers, false));
    setMetrics({ layers: layered.layers.length, nodes: layered.layers.flat().length });
    explain.innerHTML = STAGES[1].text;
    return;
  }

  const withDummies = sankeyAddDummies(layered);
  if (stage === 2) {
    show(host, schematic(withDummies.layers, true));
    const dummies = withDummies.layers.flat().filter((n) => n.dummy).length;
    setMetrics({ layers: withDummies.layers.length, dummies });
    explain.innerHTML = STAGES[2].text;
    return;
  }

  const ordered = sankeyOrderNodes(withDummies, {
    nsteps: Number(v.nsteps), random: randomLcg(4)
  });
  if (stage === 3) {
    show(host, schematic(ordered.layers, true));
    setMetrics({ crossings: ordered.crossings, passes: v.nsteps });
    explain.innerHTML = STAGES[3].text;
    return;
  }

  const geometry = sankeyGeometricLayout(ordered, { size: H, whitespace: 0.3, margin: 12 });
  if (stage === 4) {
    show(host, skeleton(geometry));
    setMetrics({ crossings: ordered.crossings, "nodes positioned": geometry.layers.flat().length });
    explain.innerHTML = STAGES[4].text;
    return;
  }

  const renderLayout = sankeyRenderLayout(geometry, { length: W });
  const scene = buildScene(renderLayout, { width: W, height: H, nodeLabelPadding: 5 });
  if (stage === 5) {
    // Boxes and link endpoints only: the structure the renderer receives.
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    for (const link of scene.links) {
      for (const [lo, hi] of link.curves) {
        const mid = (/** @type {number} */ i) => [
          (lo[i][0] + hi[i][0]) / 2, (lo[i][1] + hi[i][1]) / 2
        ];
        const [a, b, c, d] = [mid(0), mid(1), mid(2), mid(3)];
        svg.appendChild(
          el("path", {
            d: `M ${a} C ${b} ${c} ${d}`, fill: "none",
            stroke: "#94a3b8", "stroke-width": 1
          })
        );
      }
    }
    for (const node of scene.nodes) {
      svg.appendChild(
        el("rect", {
          x: node.x, y: node.y, width: Math.max(1.5, node.width), height: node.height,
          fill: node.dummy ? "#cbd5e1" : energyColorScale(node.key)
        })
      );
    }
    show(host, svg);
    setMetrics({ boxes: scene.nodes.length, links: scene.links.length });
    explain.innerHTML = STAGES[5].text;
    return;
  }

  const painted = paintScene(scene, {
    colorScale: energyColorScale, pathColor: "source",
    pathOpacity: 0.55, nodeStrokeWidth: 0.5, labelFont: "10px sans-serif"
  });
  const wrap = document.createElement("div");
  wrap.appendChild(sceneToDOM(painted, { interactive: true }));
  show(host, wrap);
  setMetrics({
    crossings: ordered.crossings,
    boxes: scene.nodes.length,
    links: scene.links.length
  });
  explain.innerHTML = STAGES[6].text;
}

render();
