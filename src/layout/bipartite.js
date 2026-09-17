/**
 * Crossing counting and reordering across a pair of adjacent layers.
 *
 * The ordering stage works on two layers at a time. This module wraps that
 * pair as a bipartite graph whose left side can be reordered and whose
 * crossings can be recounted.
 *
 * @module layout/bipartite
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @template T
 * @typedef {object} BipartiteGraph
 * @property {() => number} countCrossings Number of pairs of links that cross.
 * @property {() => T[]} reorderLeftByMedian A copy of the left side, reordered
 *   by the weighted median of each node's neighbours.
 * @property {() => T[]} reorderLeftByBarycenter A copy of the left side,
 *   reordered by the mean position of each node's neighbours.
 * @property {(newLeft: T[]) => void} changeLeft Replaces the left side.
 * @property {(i: number, j: number) => void} swapLeft Swaps two left nodes in
 *   place.
 * @property {T[]} left
 * @property {T[]} right
 */

/**
 * Builds a bipartite view of two adjacent layers.
 *
 * @template T
 * @param {T[]} left
 * @param {T[]} right
 * @param {(node: T) => T[]} leftToRight Maps a left node to the right nodes it
 *   connects to.
 * @returns {BipartiteGraph<T>}
 */
export function bipartite(left, right, leftToRight) {
  /** @type {Map<T, number>} */
  const index = new Map();
  right.forEach((node, i) => index.set(node, i));

  /** @type {[number, number][]} */
  let edges = [];

  function computeEdges() {
    edges = [];
    left.forEach((node, i) => {
      for (const other of leftToRight(node)) {
        const j = index.get(other);
        if (j !== undefined) edges.push([i, j]);
      }
    });
  }
  computeEdges();

  /**
   * Counts crossing link pairs by brute force over all pairs.
   *
   * Two links cross exactly when their endpoints are in opposite orders on
   * the two sides.
   *
   * @returns {number}
   */
  function countCrossings() {
    let crossings = 0;
    for (let a = 0; a < edges.length; a++) {
      const [x1, y1] = edges[a];
      for (let b = a + 1; b < edges.length; b++) {
        const [x2, y2] = edges[b];
        if ((x1 < x2 && y1 > y2) || (x1 > x2 && y1 < y2)) crossings++;
      }
    }
    return crossings;
  }

  /**
   * Neighbour positions on the right, per left node.
   * @returns {number[][]}
   */
  function leftNeighbors() {
    const out = Array.from({ length: left.length }, () => /** @type {number[]} */ ([]));
    for (const [i, j] of edges) out[i].push(j);
    return out;
  }

  /**
   * Weighted median of a sorted list of neighbour positions.
   *
   * With an even number of neighbours split unevenly, the two central
   * positions are weighted by the spread on either side, which resolves ties
   * better than a plain mean. `-1` marks a node with no neighbours, which is
   * left where it is.
   *
   * @param {number[]} positions Sorted ascending.
   * @returns {number}
   */
  function medianValue(positions) {
    const m = Math.floor(positions.length / 2);
    if (positions.length === 0) return -1;
    if (positions.length % 2 === 1) return positions[m];
    if (positions.length === 2) return (positions[0] + positions[1]) / 2;
    const l = positions[m - 1] - positions[0];
    const r = positions[positions.length - 1] - positions[m];
    return (positions[m - 1] * r + positions[m] * l) / (l + r);
  }

  function reorderLeftByMedian() {
    const neighbors = leftNeighbors();
    const data = left.map((node, i) => ({
      index: i,
      median: medianValue(neighbors[i].sort((a, b) => a - b))
    }));
    data.sort((a, b) => (a.median < 0 || b.median < 0 ? 0 : a.median - b.median));
    return data.map((d) => left[d.index]);
  }

  function reorderLeftByBarycenter() {
    const neighbors = leftNeighbors();
    const data = left.map((node, i) => {
      const ns = neighbors[i];
      if (ns.length === 0) return { index: i, barycenter: Infinity };
      return { index: i, barycenter: ns.reduce((a, b) => a + b, 0) / ns.length };
    });
    data.sort((a, b) => a.barycenter - b.barycenter);
    return data.map((d) => left[d.index]);
  }

  /**
   * @param {number} i
   * @param {number} j
   */
  function swapLeft(i, j) {
    [left[i], left[j]] = [left[j], left[i]];
    for (const e of edges) {
      if (e[0] === i) e[0] = j;
      else if (e[0] === j) e[0] = i;
    }
  }

  /** @param {T[]} newLeft */
  function changeLeft(newLeft) {
    left = newLeft;
    computeEdges();
  }

  return {
    countCrossings,
    reorderLeftByMedian,
    reorderLeftByBarycenter,
    changeLeft,
    swapLeft,
    left,
    right
  };
}
