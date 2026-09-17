/**
 * Stage 4 — geometric optimisation.
 *
 * Turns an ordering into actual coordinates. Node magnitudes are scaled to
 * pixels, links are assigned attachment offsets on each node, and positions
 * along each layer are settled by the spring relaxation in `psystem.js`.
 *
 * @module layout/geometry
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { pSystem } from "./psystem.js";

/**
 * @typedef {import("./dummies.js").NavigableLayout} NavigableLayout
 * @typedef {import("./layers.js").SankeyNode} SankeyNode
 * @typedef {import("./psystem.js").Vertex} Vertex
 */

/**
 * Whether two adjacent nodes in a layer should be packed together with no gap.
 *
 * Only consecutive dummy nodes pack, and only when `joinDummies` is on. This
 * is the "packed paths" behaviour: runs of dummies collapse into a single
 * vertex, so the links routed through them run side by side instead of being
 * spread apart.
 *
 * @param {SankeyNode|null} prev
 * @param {SankeyNode} node
 * @param {boolean} joinDummies
 * @returns {boolean}
 */
function packsWith(prev, node, joinDummies) {
  return Boolean(joinDummies && prev && prev.dummy && node.dummy);
}

/**
 * @typedef {object} PSystemInfo
 * @property {Vertex[]} vertices
 * @property {import("./psystem.js").PEdge[]} edges
 * @property {number} scale Pixels per unit of flow.
 * @property {number} minSep
 * @property {number} maxLayerTotal
 * @property {number} maxGroupCount
 */

/**
 * Scales the layout to pixels and builds the spring system inputs.
 *
 * @param {NavigableLayout} layout
 * @param {object} [options]
 * @param {boolean} [options.joinDummies=true]
 * @param {number} [options.size=600] Rail length in pixels.
 * @param {number} [options.margin=0] Margin at each end of a rail.
 * @param {number} [options.whitespace=0.2] Fraction of the rail to leave empty
 *   in the most crowded layer.
 * @param {number} [options.minSep] Minimum gap between nodes. Computed from
 *   `whitespace` when omitted.
 * @returns {PSystemInfo}
 */
export function layoutToPSystem(
  layout,
  { joinDummies = true, size = 600, margin = 0, whitespace = 0.2, minSep = undefined } = {}
) {
  const { layers, nextNode, prevNode } = layout;

  // --- Choose a scale that fits the most crowded layer ---------------------

  let scale = Infinity;
  let maxGroupCount = 0;
  let maxLayerTotal = 0;

  for (const nodes of layers) {
    let layerTotal = 0;
    let groupCount = 0;
    /** @type {SankeyNode|null} */
    let prev = null;
    for (let j = 0; j < nodes.length; j++) {
      const node = nodes[j];
      node.rank = j;
      /** @type {any} */ (node).total = Math.max(node.total_in, node.total_out);
      layerTotal += /** @type {any} */ (node).total;
      // Count runs of packed nodes as one group, matching how vertices are
      // built below. (The notebook's predicate here always returned undefined,
      // so every node counted as its own group and the gap budget was computed
      // as though packing never happened.)
      if (!packsWith(prev, node, joinDummies)) groupCount++;
      prev = node;
    }
    maxGroupCount = Math.max(maxGroupCount, groupCount);
    maxLayerTotal = Math.max(maxLayerTotal, layerTotal);
    // Space this layer must leave empty. `whitespace` is the fraction of the
    // rail left empty overall, margins included; an explicit `minSep` can
    // demand more, and then the margins must be added on top of the gaps it
    // asks for.
    const layerWhiteSpace =
      minSep === undefined
        ? whitespace * size
        : Math.max((groupCount - 1) * minSep + margin * 2, whitespace * size);
    scale = Math.min((size - layerWhiteSpace) / layerTotal, scale);
  }
  if (minSep === undefined) {
    // Whatever is left after the nodes and the two margins is shared equally
    // between the gaps.
    const gaps = size - margin * 2 - scale * maxLayerTotal;
    minSep = maxGroupCount > 1 ? gaps / (maxGroupCount - 1) : 0;
  }

  // --- Order each node's links by where they go ----------------------------

  for (const nodes of layers) {
    for (const node of nodes) {
      /** @type {any} */ (node).size = /** @type {any} */ (node).total * scale;
      if (node.hidden || node.dummy) continue;
      /** @type {Map<any, number>} */
      const outRank = new Map();
      for (const link of node.outgoing) outRank.set(link, nextNode(node, link).rank ?? 0);
      node.outgoing.sort((a, b) => (outRank.get(a) ?? 0) - (outRank.get(b) ?? 0));
      /** @type {Map<any, number>} */
      const inRank = new Map();
      for (const link of node.incoming) inRank.set(link, prevNode(node, link).rank ?? 0);
      node.incoming.sort((a, b) => (inRank.get(a) ?? 0) - (inRank.get(b) ?? 0));
    }
  }

  // --- Build vertices, packing runs of dummies into one --------------------

  /** @type {any[]} */
  const vertices = [];
  for (const nodes of layers) {
    /** @type {SankeyNode|null} */
    let prev = null;
    for (const node of nodes) {
      if (node.hidden) continue;
      if (packsWith(prev, node, joinDummies)) {
        const vtx = vertices[vertices.length - 1];
        /** @type {any} */ (node).vertex = vtx;
        vtx.nodes.push(node);
        vtx.size += /** @type {any} */ (node).size;
      } else {
        const vtx = {
          nodes: [node],
          size: /** @type {any} */ (node).size,
          layer: node.layer,
          dummy: node.dummy,
          offsetOutgoing: 0,
          offsetIncoming: 0,
          outgoingOffset: new Map(),
          incomingOffset: new Map()
        };
        /** @type {any} */ (node).vertex = vtx;
        vertices.push(vtx);
      }
      prev = node;
    }
  }

  // --- Assign each link an attachment offset on its vertex -----------------

  for (const nodes of layers) {
    for (const node of nodes) {
      if (node.hidden) continue;
      const vtx = /** @type {any} */ (node).vertex;
      for (const link of node.outgoing) {
        const linkSize = link.value * scale;
        /** @type {any} */ (link).size = linkSize;
        vtx.outgoingOffset.set(link, vtx.offsetOutgoing + linkSize / 2);
        vtx.offsetOutgoing += linkSize;
      }
      for (const link of node.incoming) {
        const linkSize = link.value * scale;
        /** @type {any} */ (link).size = linkSize;
        vtx.incomingOffset.set(link, vtx.offsetIncoming + linkSize / 2);
        vtx.offsetIncoming += linkSize;
      }
    }
  }

  // --- Turn links into spring-system edges ---------------------------------

  /** @type {any[]} */
  const edges = [];
  for (const nodes of layers) {
    for (const node of nodes) {
      if (node.hidden) continue;
      const v1 = /** @type {any} */ (node).vertex;
      for (const link of node.outgoing) {
        const targetNode = nextNode(node, link);
        if (targetNode.hidden) continue;
        const v2 = /** @type {any} */ (targetNode).vertex;
        edges.push({
          v1,
          v2,
          offset1: v1.outgoingOffset.get(link),
          offset2: v2.incomingOffset.get(link),
          weight: /** @type {any} */ (link).size
        });
      }
    }
  }

  return { vertices, edges, scale, minSep, maxLayerTotal, maxGroupCount };
}

/**
 * Copies settled vertex positions back onto the nodes.
 *
 * @param {NavigableLayout} layout
 * @param {{ vertices: any[] }} psystem
 * @returns {any}
 */
export function PSystemToGeometricLayout(layout, psystem) {
  const { layers, nodeMap, nextNode, prevNode } = layout;
  for (const vertex of psystem.vertices) {
    let { coord } = vertex;
    for (const node of vertex.nodes) {
      Object.assign(node, { coord, vertex });
      coord += node.size;
    }
  }

  /**
   * @param {any} node
   * @param {any} link
   * @returns {number}
   */
  const incomingCoord = (node, link) => {
    const offset = node.vertex.incomingOffset.get(link);
    // Compare against undefined: an offset of exactly 0 is legitimate.
    if (offset === undefined) throw new Error("can't find incoming link");
    return node.vertex.coord + offset;
  };

  /**
   * @param {any} node
   * @param {any} link
   * @returns {number}
   */
  const outgoingCoord = (node, link) => {
    const offset = node.vertex.outgoingOffset.get(link);
    if (offset === undefined) throw new Error("can't find outgoing link");
    return node.vertex.coord + offset;
  };

  return { layers, nodeMap, nextNode, prevNode, incomingCoord, outgoingCoord, psystem };
}

/**
 * @typedef {object} GeometricOptions
 * @property {boolean} [joinDummies=true] Pack adjacent dummy nodes together,
 *   producing packed paths.
 * @property {number} [size=500] Layer length in pixels.
 * @property {number} [whitespace=0.4] Fraction of the most crowded layer to
 *   leave empty.
 * @property {number} [margin=15] Layer margins in pixels.
 * @property {number} [minSep] Minimum gap between consecutive nodes. Computed
 *   automatically when omitted.
 * @property {number} [edgeStiff=1] Stiffness of springs between layers.
 * @property {number} [nodeStiff=1] Stiffness of springs within a layer.
 * @property {number} [marginStiff=5] Stiffness of springs to the boundary.
 * @property {number} [edgeWeightMultiplier=10] How strongly link magnitude
 *   scales edge spring stiffness.
 * @property {number} [iterations=10] Relaxation steps.
 */

/**
 * Assigns coordinates to every node.
 *
 * @param {NavigableLayout} layout Typically the result of `sankeyOrderNodes`.
 * @param {GeometricOptions} [options]
 * @returns {any} The layout with geometry attached.
 */
export function sankeyGeometricLayout(
  layout,
  {
    joinDummies = true,
    size = 500,
    whitespace = 0.4,
    margin = 15,
    minSep = undefined,
    edgeStiff = 1,
    nodeStiff = 1,
    marginStiff = 5,
    edgeWeightMultiplier = 10,
    iterations = 10
  } = {}
) {
  const { vertices, edges, minSep: autoMinSep } = layoutToPSystem(layout, {
    joinDummies,
    size,
    margin,
    whitespace,
    minSep
  });

  const ps = pSystem(vertices, edges, {
    size,
    margin,
    minSep: autoMinSep,
    edgeStiff,
    nodeStiff,
    marginStiff,
    edgeWeightMultiplier,
    iterations
  });

  let state;
  for (state of ps);

  const result = PSystemToGeometricLayout(layout, /** @type {any} */ (state));
  result.size = size;
  return result;
}
