/**
 * Demo: side-by-side comparison against the two D3 implementations.
 *
 * The same dataset laid out by all three libraries, each measured by the same
 * code, so the comparison is visual and numerical at once. The two D3
 * libraries are loaded from a CDN and driven through their own published path
 * generators, so nothing about their geometry is reconstructed here.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { page, controls, note, energyData, layeredData, energyColorScale } from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene } from "../src/render/theme.js";
import { sceneToDOM } from "../src/render/dom.js";
import { measureScene, measurePaths } from "../src/metrics/index.js";
import { randomLcg } from "../src/internal/random.js";

const W = 430;
const H = 320;

const ui = page({
  title: "Library comparison",
  description:
    "One dataset, three libraries, one measurement routine. Figures are " +
    "computed on the geometry each library actually produces."
});

const stage = document.createElement("div");
stage.className = "panels";
ui.stage.appendChild(stage);

note(
  ui.stage,
  "<code>d3-sankey</code> routes every link straight from source to target " +
  "without dummy nodes, so its ribbons pass over intervening nodes — cheap " +
  "to compute, but the worst on both crossings and overlap. " +
  "<code>d3-sankey-diagram</code> routes through dummy nodes and draws with " +
  "circular arcs; it reaches overlap comparable to <code>flex-sankey</code> " +
  "but is markedly slower and crosses more. Times are wall-clock for the " +
  "layout only, measured in your browser, so they will vary.<br><br>" +
  "The <code>flex-sankey</code> panel is live \u2014 drag a node and its ribbons " +
  "re-route with it. The other two are drawn from the path strings their " +
  "libraries produce, which carry no layout to update."
);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Data" },
    {
      type: "select", key: "dataset", label: "dataset", value: "energy",
      options: [
        { value: "energy", label: "energy matrix (~17 nodes)" },
        { value: "layered1", label: "layered, medium (~33)" },
        { value: "layered2", label: "layered, large (~54)" }
      ]
    },
    { type: "range", key: "seed", label: "data seed", min: 0, max: 0.9, step: 0.1, value: 0.5 },

    { type: "group", key: "_g2", label: "flex-sankey settings" },
    { type: "range", key: "nsteps", label: "ordering passes", min: 5, max: 200, step: 5, value: 40,
      hint: "More passes, fewer crossings, slower." },
    {
      type: "select", key: "nodeAlign", label: "node alignment", value: "center",
      options: ["left", "right", "center", "justify", "heuristic"]
    },
    { type: "toggle", key: "joinDummies", label: "packed paths", value: false },

    { type: "group", key: "_g3", label: "Display" },
    { type: "toggle", key: "labels", label: "show labels", value: true }
  ],
  render
);

/** Cached CDN modules; loaded once, on first use. */
let d3sankey = null;
let d3sankeyDiagram = null;

async function loadPeers() {
  if (!d3sankey) {
    d3sankey = await import("https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/+esm");
  }
  if (!d3sankeyDiagram) {
    d3sankeyDiagram = await import(
      "https://cdn.jsdelivr.net/npm/d3-sankey-diagram@0.9.4/+esm"
    );
  }
}

/** @param {any[]} links */
const nodeIds = (links) => [...new Set(links.flatMap((l) => [l.source, l.target]))];

/**
 * Renders one panel.
 * @param {string} title
 * @param {string|Node} content Markup for the foreign libraries, live elements
 *   for ours — only our own panel can be dragged, since the others are drawn
 *   from path strings their libraries produced.
 * @param {any} metrics
 * @param {number} ms
 */
function panel(title, content, metrics, ms) {
  const box = document.createElement("div");
  box.className = "panel";
  const h = document.createElement("h3");
  h.textContent = title;
  const sub = document.createElement("p");
  sub.className = "sub";
  sub.textContent = metrics
    ? `${metrics.crossings} crossings · ` +
      `${(100 * metrics.overlapRatio).toFixed(1)}% overlap · ` +
      `${Math.round(metrics.totalLength)} px · ${ms.toFixed(0)} ms`
    : "—";
  const body = document.createElement("div");
  if (typeof content === "string") body.innerHTML = content;
  else body.appendChild(content);
  box.append(h, sub, body);
  return box;
}

async function render() {
  const v = values;
  const links =
    v.dataset === "energy"
      ? energyData({ seed: Number(v.seed) })
      : layeredData({ seed: Number(v.seed), scale: v.dataset === "layered1" ? 1 : 2 });

  stage.replaceChildren(Object.assign(document.createElement("p"), {
    textContent: "laying out…",
    style: "color:var(--muted);font-size:13px"
  }));

  await loadPeers();
  const panels = [];

  // --- d3-sankey ---------------------------------------------------------
  {
    const t0 = performance.now();
    const graph = d3sankey.sankey()
      .nodeId((/** @type {any} */ d) => d.id)
      .nodeWidth(14).nodePadding(12)
      .nodeAlign(d3sankey.sankeyCenter)
      .extent([[1, 1], [W - 1, H - 1]])({
        nodes: nodeIds(links).map((id) => ({ id })),
        links: links.map((l) => ({ source: l.source, target: l.target, value: l.value }))
      });
    const ms = performance.now() - t0;
    const gen = d3sankey.sankeyLinkHorizontal();
    const paths = graph.links.map((/** @type {any} */ l) => String(gen(l)));
    const widths = graph.links.map((/** @type {any} */ l) => l.width);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      ...graph.links.map((/** @type {any} */ l, /** @type {number} */ i) =>
        `<path d="${paths[i]}" fill="none" stroke="${energyColorScale(l.source.id)}" ` +
        `stroke-width="${l.width}" stroke-opacity="0.5"/>`),
      ...graph.nodes.map((/** @type {any} */ n) =>
        `<rect x="${n.x0}" y="${n.y0}" width="${n.x1 - n.x0}" height="${n.y1 - n.y0}" ` +
        `fill="${energyColorScale(n.id)}"/>`),
      ...(v.labels ? graph.nodes.map((/** @type {any} */ n) =>
        `<text x="${n.x0 < W / 2 ? n.x1 + 4 : n.x0 - 4}" y="${(n.y0 + n.y1) / 2}" ` +
        `text-anchor="${n.x0 < W / 2 ? "start" : "end"}" dominant-baseline="central" ` +
        `font="9px sans-serif" font-size="9" font-family="sans-serif">${n.id}</text>`) : []),
      "</svg>"
    ].join("");
    const metrics = measurePaths(paths, {
      width: W, height: H, filled: false, strokeWidths: widths, sampleScale: 1
    });
    panels.push(panel("d3-sankey", svg, metrics, ms));
  }

  // --- d3-sankey-diagram -------------------------------------------------
  {
    const t0 = performance.now();
    const graph = d3sankeyDiagram.sankey().extent([[0, 0], [W, H]])({
      nodes: nodeIds(links).map((id) => ({ id, title: id })),
      links: links.map((l) => ({ source: l.source, target: l.target, value: l.value }))
    });
    const ms = performance.now() - t0;
    const gen = d3sankeyDiagram.sankeyLink();
    const paths = graph.links.map((/** @type {any} */ l) => String(gen(l)));
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      ...graph.links.map((/** @type {any} */ l, /** @type {number} */ i) =>
        `<path d="${paths[i]}" fill="${energyColorScale(l.source.id)}" fill-opacity="0.5"/>`),
      ...graph.nodes.map((/** @type {any} */ n) =>
        `<rect x="${n.x0}" y="${n.y0}" width="${n.x1 - n.x0}" height="${n.y1 - n.y0}" ` +
        `fill="${energyColorScale(n.id)}"/>`),
      "</svg>"
    ].join("");
    const metrics = measurePaths(paths, {
      width: W, height: H, filled: true, sampleScale: 1
    });
    panels.push(panel("d3-sankey-diagram", svg, metrics, ms));
  }

  // --- flex-sankey -------------------------------------------------------
  {
    const t0 = performance.now();
    const layout = sankeyAddDummies(
      sankeyLayers({ links }, { nodeAlign: /** @type {any} */ (v.nodeAlign) })
    );
    sankeyOrderNodes(layout, { nsteps: Number(v.nsteps), random: randomLcg(1) });
    const geometry = sankeyGeometricLayout(layout, {
      size: H, whitespace: 0.3, joinDummies: v.joinDummies
    });
    const renderLayout = sankeyRenderLayout(geometry, { length: W });
    const ms = performance.now() - t0;
    const scene = buildScene(renderLayout, {
      width: W, height: H, nodeLabelPadding: 4,
      nodeLabel: v.labels ? undefined : () => ""
    });
    const painted = paintScene(scene, {
      colorScale: energyColorScale, pathColor: "source",
      pathOpacity: 0.5, nodeStrokeWidth: 0, labelFont: "9px sans-serif"
    });
    const metrics = measureScene(scene, { sampleScale: 1 });
    // Ours is rendered live: drag a node and the ribbons follow.
    panels.push(
      panel("flex-sankey", sceneToDOM(painted, { interactive: true }), metrics, ms)
    );
  }

  stage.replaceChildren(...panels);
}

render();
