/**
 * Adapters for the libraries under comparison.
 *
 * Each adapter lays out one dataset and returns the geometry of its links in a
 * form the metrics can measure, along with whether those links are filled
 * ribbon outlines or stroked centre lines.
 *
 * Both comparison libraries are driven through their *own* published path
 * generators — `sankeyLinkHorizontal` for `d3-sankey`, `sankeyLink` for
 * `d3-sankey-diagram` — so nothing about their geometry is reconstructed here.
 * `verify.js` confirms that those generators emit exactly what the libraries
 * render into a document.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyCenter } from "d3-sankey";
import { sankey as sdSankey, sankeyLink } from "d3-sankey-diagram";

import {
  sankeyLayers,
  sankeyAddDummies,
  sankeyOrderNodes,
  sankeyGeometricLayout,
  sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { randomLcg } from "../src/internal/random.js";

/**
 * @typedef {object} DiagramResult
 * @property {string[]} [paths] One `d` attribute per link, for foreign
 *   libraries.
 * @property {number[]} [strokeWidths] Ribbon breadth per link, when the links
 *   are stroked rather than filled.
 * @property {boolean} filled
 * @property {import("../src/render/scene.js").Scene} [scene] Exact geometry,
 *   for this library.
 * @property {number} width
 * @property {number} height
 * @property {number} [crossings] Crossing count from the layout stage, where
 *   the library reports one.
 * @property {string[]} [sources] Source node id of each link, in the same
 *   order as `paths`. Only the comparison figure needs it, to colour a ribbon
 *   after the node it leaves.
 * @property {NodeBox[]} [nodes] Node rectangles, for figures that draw them.
 */

/**
 * @typedef {object} NodeBox
 * @property {string} id
 * @property {number} x0
 * @property {number} y0
 * @property {number} x1
 * @property {number} y1
 */

/**
 * @typedef {object} LayoutOptions
 * @property {{width: number, height: number}} [extent] Canvas to lay out
 *   within, `CANVAS` by default. The benchmark always uses `CANVAS`; the
 *   comparison figure passes the canvas of the manuscript's own example, so
 *   that its panels can be set beside it.
 * @property {number} [nodeWidth] Node thickness, where the library exposes one.
 */

/**
 * Unique node keys appearing in a link list.
 * @param {any[]} links
 * @returns {string[]}
 */
const nodeIds = (links) => [...new Set(links.flatMap((l) => [l.source, l.target]))];

/**
 * Reduces a laid-out node to its rectangle. Both comparison libraries expose
 * the same four properties.
 *
 * @param {any} node
 * @returns {NodeBox}
 */
const boxOf = (node) => ({
  id: String(node.id),
  x0: node.x0,
  y0: node.y0,
  x1: node.x1,
  y1: node.y1
});

/**
 * Shared layout extent. Every library is given the same canvas, or the
 * comparison measures nothing but a difference in scale.
 */
export const CANVAS = { width: 800, height: 500 };

/**
 * Lays out a dataset with `d3-sankey`.
 *
 * Links are stroked centre lines, so their breadth comes from `link.width`.
 *
 * @param {any[]} links
 * @param {LayoutOptions} [options]
 * @returns {DiagramResult}
 */
export function layoutD3Sankey(links, { extent = CANVAS, nodeWidth = 15 } = {}) {
  const { width, height } = extent;
  const graph = d3Sankey()
    .nodeId((/** @type {any} */ d) => d.id)
    .nodeWidth(nodeWidth)
    .nodePadding(15)
    .nodeAlign(sankeyCenter)
    .extent([
      [1, 1],
      [width - 1, height - 1]
    ])({
    nodes: nodeIds(links).map((id) => ({ id })),
    links: links.map((l) => ({ source: l.source, target: l.target, value: l.value }))
  });

  const generator = sankeyLinkHorizontal();
  return {
    paths: graph.links.map((/** @type {any} */ l) => String(generator(l))),
    strokeWidths: graph.links.map((/** @type {any} */ l) => l.width),
    sources: graph.links.map((/** @type {any} */ l) => String(l.source.id ?? l.source)),
    nodes: graph.nodes.map(boxOf),
    filled: false,
    width,
    height
  };
}

/**
 * Lays out a dataset with `d3-sankey-diagram`.
 *
 * Links are filled outlines, one closed subpath per hop.
 *
 * @param {any[]} links
 * @param {LayoutOptions} [options]
 * @returns {DiagramResult}
 */
export function layoutD3SankeyDiagram(links, { extent = CANVAS, nodeWidth } = {}) {
  const { width, height } = extent;
  const layout = sdSankey().extent([
    [0, 0],
    [width, height]
  ]);
  // Left alone unless asked: the benchmark measures this library at its own
  // default, and setting the property would be a silent change to that.
  if (nodeWidth != null) layout.nodeWidth(nodeWidth);
  const graph = layout({
    nodes: nodeIds(links).map((id) => ({ id, title: id })),
    links: links.map((l) => ({ source: l.source, target: l.target, value: l.value }))
  });

  const generator = sankeyLink();
  return {
    paths: graph.links.map((/** @type {any} */ l) => String(generator(l))),
    sources: graph.links.map((/** @type {any} */ l) => String(l.source.id ?? l.source)),
    nodes: graph.nodes.map(boxOf),
    filled: true,
    width,
    height
  };
}

/**
 * Lays out a dataset with this library.
 *
 * Returns the scene rather than path strings, so its geometry is measured from
 * the control points directly. The flattening applied downstream is the same
 * either way, so this is a shortcut past serialization, not a different
 * measurement.
 *
 * @param {any[]} links
 * @param {object} [options]
 * @param {number} [options.seed=1] Seed for the ordering stage.
 * @param {number} [options.nsteps=40] Ordering passes.
 * @param {boolean} [options.joinDummies=false] Pack adjacent dummy nodes.
 * @param {{width: number, height: number}} [options.extent] Canvas, `CANVAS`
 *   by default.
 * @returns {DiagramResult}
 */
export function layoutFlexSankey(
  links,
  { seed = 1, nsteps = 40, joinDummies = false, extent = CANVAS } = {}
) {
  const { width, height } = extent;
  const layout = sankeyAddDummies(sankeyLayers({ links }, { nodeAlign: "center" }));
  const ordered = sankeyOrderNodes(layout, { nsteps, random: randomLcg(seed) });
  const geometry = sankeyGeometricLayout(ordered, {
    size: height,
    whitespace: 0.3,
    joinDummies
  });
  const renderLayout = sankeyRenderLayout(geometry, { length: width });
  return {
    scene: buildScene(renderLayout, { width, height }),
    filled: true,
    width,
    height,
    crossings: ordered.crossings
  };
}

/**
 * The three libraries, in the order they appear left to right within each
 * group of bars. Each carries a fixed colour, used consistently across every
 * chart so that a library is identifiable without consulting a legend twice.
 */
export const LIBRARIES = [
  { id: "d3-sankey", label: "d3-sankey", color: "#2c4b7c", run: layoutD3Sankey },
  {
    id: "d3-sankey-diagram",
    label: "d3-sankey-diagram",
    color: "#e08214",
    run: layoutD3SankeyDiagram
  },
  {
    id: "flex-sankey",
    label: "flex-sankey (ours)",
    color: "#8c2d1e",
    run: layoutFlexSankey
  }
];
