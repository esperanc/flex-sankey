/**
 * The one-dimensional physics system used for geometric optimisation.
 *
 * Nodes are masses that slide along their layer (a "rail"). Three kinds of
 * spring act on them:
 *
 * - **edge springs** pull connected nodes in adjacent layers into alignment,
 *   so links run as straight as possible;
 * - **node springs** hold consecutive nodes in a layer at a target separation;
 * - **margin springs** pull the first and last node of each layer towards the
 *   layout boundary.
 *
 * Springs are soft constraints. Two hard constraints are enforced after each
 * relaxation step: a minimum separation between consecutive nodes, and
 * centring of the whole layout.
 *
 * @module layout/psystem
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * A node's position along its layer.
 * @typedef {object} Vertex
 * @property {number} coord Position along the rail.
 * @property {number} size Extent along the rail.
 * @property {number} layer Rail index.
 * @property {boolean} [fixed] True for the immovable rail anchors.
 * @property {number} [edgeCount] Number of edge springs attached.
 * @property {number} [delta] Accumulated displacement for the current step.
 * @property {number} [sum] Accumulated stiffness for the current step.
 */

/**
 * @typedef {object} PEdge
 * @property {Vertex} v1
 * @property {Vertex} v2
 * @property {number} offset1 Attachment point on `v1`, relative to its coord.
 * @property {number} offset2 Attachment point on `v2`.
 * @property {number} weight Link magnitude, in pixels.
 */

/**
 * @typedef {object} PSystemOptions
 * @property {number} [size=500] Rail length in pixels.
 * @property {number} [margin=10] Margin at each end of a rail.
 * @property {number} [minSep=10] Minimum gap between nodes in a rail.
 * @property {number} [edgeStiff=1] Stiffness of edge springs.
 * @property {number} [nodeStiff=1] Stiffness of node springs.
 * @property {number} [marginStiff=5] Stiffness of margin springs.
 * @property {number} [edgeWeightMultiplier=2] Upper end of the stiffness
 *   scaling applied to edge springs by link magnitude, so that heavy flows
 *   straighten in preference to light ones.
 * @property {number} [iterations=10] Relaxation steps.
 * @property {number} [rate=1] Fraction of the computed displacement applied
 *   per step.
 */

/**
 * Runs the relaxation, yielding the system state after each step.
 *
 * The first yield is the initial state, before any relaxation.
 *
 * @param {Vertex[]} vertices
 * @param {PEdge[]} edges
 * @param {PSystemOptions} [options]
 * @yields {{ iteration?: number, rails: Vertex[][], vertices: Vertex[], springs: any[] }}
 */
export function* pSystem(
  vertices,
  edges,
  {
    size = 500,
    margin = 10,
    minSep = 10,
    edgeStiff = 1,
    nodeStiff = 1,
    marginStiff = 5,
    edgeWeightMultiplier = 2,
    iterations = 10,
    rate = 1
  } = {}
) {
  /** @type {any[]} */
  const springs = [];
  let minWeight = Infinity;
  let maxWeight = -Infinity;

  for (const { v1, offset1, v2, offset2, weight } of edges) {
    minWeight = Math.min(weight, minWeight);
    maxWeight = Math.max(weight, maxWeight);
    springs.push({ v1, offset1, v2, offset2, len: 0, type: "edge", weight });
    v1.edgeCount = (v1.edgeCount || 0) + 1;
    v2.edgeCount = (v2.edgeCount || 0) + 1;
  }

  // Map link magnitude onto [1, edgeWeightMultiplier]. The +0.1 keeps the
  // domain non-degenerate when every link has the same value.
  const span = maxWeight + 0.1 - minWeight;
  /** @param {number} w */
  const edgeWeight = (w) =>
    1 + ((w - minWeight) / span) * (edgeWeightMultiplier - 1);

  /** @type {Vertex[][]} */
  const rails = [];
  for (const vertex of vertices) {
    const { layer } = vertex;
    if (!rails[layer]) rails[layer] = [];
    rails[layer].push(vertex);
  }

  for (let i = 0; i < rails.length; i++) {
    const rail = rails[i];
    const n = rail.length;
    const totalSize = rail.reduce((a, b) => a + b.size, 0);
    const freeSpace = size - margin * 2 - totalSize;

    /** @type {Vertex} */
    const topAnchor = { coord: 0, layer: i, fixed: true, size: 0, sum: 0, delta: 0 };
    /** @type {Vertex} */
    const bottomAnchor = { coord: size, layer: i, fixed: true, size: 0, sum: 0, delta: 0 };

    // A lone node is centred rather than pinned to a margin.
    const marginLen = n === 1 ? freeSpace / 2 : margin;
    springs.push(
      { v1: topAnchor, offset1: 0, v2: rail[0], offset2: 0, len: marginLen, type: "margin" },
      {
        v1: bottomAnchor,
        offset1: 0,
        v2: rail[n - 1],
        offset2: rail[n - 1].size,
        len: marginLen,
        type: "margin"
      }
    );

    // Spread the rail evenly to start.
    const avgSep = n > 1 ? freeSpace / (n - 1) : 0;
    let coord = margin;
    for (const vtx of rail) {
      vtx.coord = coord;
      coord += vtx.size + avgSep;
    }

    for (let j = 1; j < n; j++) {
      const v1 = rail[j - 1];
      const v2 = rail[j];
      springs.push({
        v1,
        v2,
        offset1: v1.size,
        offset2: 0,
        len: minSep,
        type: "node"
      });
    }

    rail.unshift(topAnchor);
    rail.push(bottomAnchor);
  }

  yield { rails, vertices, springs };

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const vtx of vertices) {
      vtx.sum = 0;
      vtx.delta = 0;
    }

    // Accumulate spring forces. Each spring pulls its two endpoints towards a
    // configuration separated by its rest length, weighted by stiffness.
    for (const { v1, v2, offset1, offset2, len, type, weight } of springs) {
      const p1 = v1.coord + offset1;
      const p2 = v2.coord + offset2;
      const mid = (p1 + p2) / 2;
      /** @param {Vertex} v */
      const stiffness = (v) =>
        type === "margin"
          ? marginStiff / 2
          : type === "node"
            ? nodeStiff / 2
            : (edgeStiff / (v.edgeCount || 1)) * edgeWeight(weight);
      const w1 = stiffness(v1);
      const w2 = stiffness(v2);
      const s = p1 < p2 ? 1 : -1;
      v1.delta = (v1.delta ?? 0) + (mid - (s * len) / 2 - p1) * w1;
      v2.delta = (v2.delta ?? 0) + (mid + (s * len) / 2 - p2) * w2;
      v1.sum = (v1.sum ?? 0) + w1;
      v2.sum = (v2.sum ?? 0) + w2;
    }

    for (const vtx of vertices) {
      if (vtx.fixed) continue;
      vtx.coord += ((vtx.delta ?? 0) / (vtx.sum || 1)) * rate;
      vtx.delta = 0;
      vtx.sum = 0;
    }

    // Hard constraint: push apart any nodes that ended up too close.
    for (const rail of rails) {
      let nRelax = 8 * (rail.length - 1) + 1;
      while (nRelax--) {
        for (let i = 1; i < rail.length; i++) {
          const v1 = rail[i - 1];
          const v2 = rail[i];
          const bestSep = i === 1 || i === rail.length - 1 ? margin : minSep;
          const sep = v2.coord - (v1.coord + v1.size);
          if (sep < bestSep) {
            v1.delta = (v1.delta ?? 0) - (bestSep - sep) / 2;
            v2.delta = (v2.delta ?? 0) + (bestSep - sep) / 2;
          }
        }
        for (const v of rail) {
          if (!v.fixed) v.coord += v.delta ?? 0;
          v.delta = 0;
        }
      }
    }

    // Hard constraint: recentre the whole layout.
    const top = Math.min(...rails.map((rail) => rail[1].coord));
    const bottom = Math.max(
      ...rails.map((rail) => {
        const { coord, size: sz } = rail[rail.length - 2];
        return coord + sz;
      })
    );
    const delta = size / 2 - (bottom + top) / 2;
    for (const v of vertices) v.coord += delta;

    yield { iteration, rails, vertices, springs };
  }
}
