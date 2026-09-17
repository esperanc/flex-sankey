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
 */

/**
 * Unique node keys appearing in a link list.
 * @param {any[]} links
 * @returns {string[]}
 */
const nodeIds = (links) => [...new Set(links.flatMap((l) => [l.source, l.target]))];

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
 * @returns {DiagramResult}
 */
export function layoutD3Sankey(links) {
  const { width, height } = CANVAS;
  const graph = d3Sankey()
    .nodeId((/** @type {any} */ d) => d.id)
    .nodeWidth(15)
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
 * @returns {DiagramResult}
 */
export function layoutD3SankeyDiagram(links) {
  const { width, height } = CANVAS;
  const graph = sdSankey().extent([
    [0, 0],
    [width, height]
  ])({
    nodes: nodeIds(links).map((id) => ({ id, title: id })),
    links: links.map((l) => ({ source: l.source, target: l.target, value: l.value }))
  });

  const generator = sankeyLink();
  return {
    paths: graph.links.map((/** @type {any} */ l) => String(generator(l))),
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
 * @returns {DiagramResult}
 */
export function layoutFlexSankey(links, { seed = 1, nsteps = 40, joinDummies = false } = {}) {
  const { width, height } = CANVAS;
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
