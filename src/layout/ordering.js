/**
 * Stage 3 — combinatorial optimisation.
 *
 * Reorders nodes within each layer to reduce the number of link crossings.
 * Minimising crossings exactly is NP-complete, so this combines two
 * heuristics: a median (or barycentre) sweep that pulls each node towards its
 * neighbours, followed by pairwise node swaps accepted under a
 * simulated-annealing rule.
 *
 * **Reproducibility.** The swap phase is randomised. Pass a seeded `random`
 * source to make a run repeatable — the default, `Math.random`, does not give
 * the same answer twice. See `internal/random.js`.
 *
 * @module layout/ordering
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { bipartite } from "./bipartite.js";
import { shuffle, range } from "../internal/random.js";

/**
 * @typedef {import("./dummies.js").NavigableLayout} NavigableLayout
 * @typedef {import("./layers.js").SankeyNode} SankeyNode
 * @typedef {import("./layers.js").SankeyLink} SankeyLink
 * @typedef {import("../internal/random.js").RandomSource} RandomSource
 */

/**
 * @typedef {object} OrderOptions
 * @property {"median" | "barycenter"} [heuristic="median"] Sweep heuristic.
 * @property {"simulated annealing" | "sequential" | "mixed"} [swapAlgorithm="simulated annealing"]
 *   Node swap policy.
 * @property {"zigzag" | "successive"} [application="zigzag"] Whether each
 *   layer is swept and swapped before moving on (`zigzag`), or all layers are
 *   swept and only then all swapped (`successive`).
 * @property {number} [nsteps=10] Number of passes.
 * @property {number} [coolingRate=0.5] Probability multiplier for accepting a
 *   non-improving swap. Halved each iteration at the default.
 * @property {number} [shuffleInterval=10] Passes between forced shuffles, for
 *   the sequential swap policy.
 * @property {Record<string, number>|null} [initialOrdering=null] Seed ordering,
 *   mapping node keys to positions. Supplying one from a previous run
 *   converges markedly faster.
 * @property {RandomSource} [random=Math.random] Randomness source. Pass a
 *   seeded generator for reproducible results.
 */

/**
 * A record of when the best-known crossing count improved.
 * @typedef {object} OrderHistoryEntry
 * @property {number} steps Passes completed.
 * @property {number} crossings Best crossing count at that point.
 */

/**
 * Orders nodes within layers to reduce link crossings.
 *
 * Mutates and returns `layout`, adding `crossings` (the best count found) and
 * `history` (how it got there).
 *
 * @param {NavigableLayout} layout Typically the result of `sankeyAddDummies`.
 *   Without dummies, only links between adjacent layers are considered.
 * @param {OrderOptions} [options]
 * @returns {NavigableLayout & { crossings: number, history: OrderHistoryEntry[] }}
 */
export function sankeyOrderNodes(
  layout,
  {
    heuristic = "median",
    swapAlgorithm = "simulated annealing",
    application = "zigzag",
    nsteps = 10,
    coolingRate = 0.5,
    shuffleInterval = 10,
    initialOrdering = null,
    random = Math.random
  } = {}
) {
  const { nodeMap, nextNode, prevNode } = layout;

  /**
   * Hidden nodes are drawn with a separate encoding, so links touching them
   * must not influence the ordering.
   * @param {SankeyLink} path
   */
  const filterHidden = (path) =>
    !(
      nodeMap[path.source].hidden ||
      nodeMap[path.target].hidden ||
      (path.trueSource && nodeMap[path.trueSource].hidden) ||
      (path.trueTarget && nodeMap[path.trueTarget].hidden)
    );

  /** @param {SankeyNode[][]} ls */
  const dupLayers = (ls) => ls.map((layer) => layer.slice());

  let layers = layout.layers;
  const nodes = layers.flat();

  // Seed from a previous ordering when one is supplied. Nodes absent from it
  // are inserted at random positions.
  if (initialOrdering) {
    for (const layerNodes of layers) {
      /** @type {SankeyNode[]} */
      const toSort = [];
      /** @type {SankeyNode[]} */
      const other = [];
      for (const node of layerNodes) {
        if (initialOrdering[node.key] === undefined) other.push(node);
        else toSort.push(node);
      }
      toSort.sort((a, b) => initialOrdering[a.key] - initialOrdering[b.key]);
      layerNodes.length = 0;
      layerNodes.push(...toSort);
      shuffle(other, random);
      for (const node of other) {
        const i = Math.round(random() * layerNodes.length);
        layerNodes.splice(i, 0, node);
      }
    }
  }

  // Precompute each node's neighbours in the adjacent layers, excluding
  // anything touching a hidden node.
  /** @type {Map<SankeyNode, SankeyNode[]>} */
  const outgoingNodes = new Map();
  /** @type {Map<SankeyNode, SankeyNode[]>} */
  const incomingNodes = new Map();
  for (const node of nodes) {
    incomingNodes.set(
      node,
      node.incoming.filter(filterHidden).map((link) => prevNode(node, link))
    );
    outgoingNodes.set(
      node,
      node.outgoing.filter(filterHidden).map((link) => nextNode(node, link))
    );
  }

  /**
   * Bipartite view of layers `i` and `j`, which must be adjacent.
   * @param {number} i
   * @param {number} j
   */
  const makeGraph = (i, j) => {
    const left = layers[i];
    const right = layers[j];
    const leftToRight =
      i > j
        ? (/** @type {SankeyNode} */ node) => incomingNodes.get(node) ?? []
        : (/** @type {SankeyNode} */ node) => outgoingNodes.get(node) ?? [];
    return bipartite(left, right, leftToRight);
  };

  /**
   * Total crossings across every adjacent pair of layers.
   * @returns {number}
   */
  const totalCrossings = () => {
    let total = 0;
    for (let i = 1; i < layers.length; i++) {
      total += makeGraph(i - 1, i).countCrossings();
    }
    return total;
  };

  /**
   * Sweeps layer `i` into the order suggested by layer `j`, keeping the result
   * only if it actually reduces crossings.
   * @param {number} i
   * @param {number} j
   * @param {"median" | "barycenter"} h
   */
  const reorderHeuristic = (i, j, h) => {
    const g = makeGraph(i, j);
    const before = g.countCrossings();
    const leftPrime =
      h === "barycenter" ? g.reorderLeftByBarycenter() : g.reorderLeftByMedian();
    g.changeLeft(leftPrime);
    if (g.countCrossings() < before) layers[i] = leftPrime;
  };

  /**
   * Builds the two bipartite views that a swap in layer `i` affects.
   *
   * The forward graph is built before `layers[i]` is copied and the backward
   * graph after, so the two hold distinct arrays. Swaps are therefore applied
   * to both explicitly, keeping them in step.
   *
   * @param {number} i
   */
  const swapContext = (i) => {
    const nullGraph = { swapLeft: () => {}, countCrossings: () => 0 };
    const forward = i + 1 < layers.length ? makeGraph(i, i + 1) : nullGraph;
    layers[i] = layers[i].slice();
    const backward = i > 0 ? makeGraph(i, i - 1) : nullGraph;
    return {
      forward,
      backward,
      crossings: () => forward.countCrossings() + backward.countCrossings(),
      swap: (/** @type {number} */ a, /** @type {number} */ b) => {
        forward.swapLeft(a, b);
        backward.swapLeft(a, b);
      }
    };
  };

  /**
   * Repeatedly sweeps adjacent pairs, keeping any swap that helps.
   * @param {number} i
   */
  const sequentialSwapNodes = (i) => {
    const ctx = swapContext(i);
    const n = layers[i].length;
    const sequence = range(1, n);
    let improved = true;
    while (improved) {
      improved = false;
      let before = ctx.crossings();
      for (const k of sequence) {
        ctx.swap(k - 1, k);
        const after = ctx.crossings();
        if (after >= before) {
          ctx.swap(k - 1, k);
        } else {
          before = after;
          improved = true;
        }
      }
    }
  };

  /** Swap budget by layer size; larger layers get more attempts, capped. */
  const maxIterTable = [0, 0, 2, 6, 24, 100];

  /**
   * Tries random swaps, accepting non-improving ones with a probability that
   * decays by `coolingRate` each iteration.
   * @param {number} i
   */
  const simAnnealingSwapNodes = (i) => {
    if (layers[i].length < 2) return;
    const ctx = swapContext(i);
    const n = layers[i].length;
    const sequence = range(0, n);
    let prob = coolingRate;
    const maxIter = n < maxIterTable.length ? maxIterTable[n] : 100;
    let iter = 0;
    let improved = true;
    while (improved || iter++ < maxIter) {
      improved = false;
      const before = ctx.crossings();
      shuffle(sequence, random);
      const [k1, k2] = sequence;
      ctx.swap(k1, k2);
      const after = ctx.crossings();
      improved = after < before;
      prob *= coolingRate;
      if (!improved && random() > prob) ctx.swap(k1, k2);
    }
  };

  /**
   * Restores any user-specified rank order disturbed by the heuristics.
   * @param {number} i
   */
  const rankSort = (i) => {
    layers[i].sort((a, b) =>
      a.rank !== undefined && b.rank !== undefined ? a.rank - b.rank : 0
    );
  };

  const swapNodes =
    swapAlgorithm === "sequential"
      ? sequentialSwapNodes
      : swapAlgorithm === "mixed"
        ? (/** @type {number} */ i) => {
            simAnnealingSwapNodes(i);
            sequentialSwapNodes(i);
          }
        : simAnnealingSwapNodes;

  let best = totalCrossings();
  let bestLayers = dupLayers(layers);
  /** @type {OrderHistoryEntry[]} */
  const history = [{ steps: 0, crossings: best }];

  for (let step = 0; step < nsteps; step++) {
    if (step % shuffleInterval === 0 && swapAlgorithm === "sequential") {
      for (const layer of layers) shuffle(layer, random);
    }

    if (application === "zigzag") {
      for (let i = 1; i < layers.length; i++) {
        reorderHeuristic(i, i - 1, heuristic);
        swapNodes(i);
        rankSort(i);
      }
      for (let i = layers.length - 2; i >= 0; i--) {
        reorderHeuristic(i, i + 1, heuristic);
        swapNodes(i);
        rankSort(i);
      }
    } else {
      for (let i = 0; i < layers.length; i++) {
        if (i > 0) reorderHeuristic(i, i - 1, heuristic);
        if (i + 1 < layers.length) reorderHeuristic(i, i + 1, heuristic);
        rankSort(i);
      }
      for (let i = 0; i < layers.length; i++) {
        swapNodes(i);
        rankSort(i);
      }
    }

    const crossings = totalCrossings();
    if (crossings < best) {
      history.push({ steps: step + 1, crossings });
      best = crossings;
      bestLayers = dupLayers(layers);
    }
  }

  layout.layers = bestLayers;
  sankeyOrderLayoutLinks(layout);

  return Object.assign(layout, { history, crossings: best });
}

/**
 * Sorts each node's incoming and outgoing links to match the node order in the
 * adjacent layers, so that links leave and arrive without needless crossings.
 *
 * Hidden nodes sort outside the visible range — incoming before every real
 * node, outgoing after — keeping their symbols clear of the ribbons.
 *
 * @param {import("./layers.js").Layout} layout
 */
export function sankeyOrderLayoutLinks(layout) {
  for (const nodes of layout.layers) {
    nodes.forEach((node, i) => {
      /** @type {any} */ (node).index = i;
    });
  }

  /**
   * @param {string} key
   * @param {boolean} incoming
   * @returns {number}
   */
  const nodeRank = (key, incoming) => {
    const node = layout.nodeMap[key];
    if (node.hidden) return incoming ? -1000 - node.hidden : 1000 + node.hidden;
    return /** @type {any} */ (node).index;
  };

  for (const nodes of layout.layers) {
    for (const node of nodes) {
      node.incoming.sort(
        (a, b) => nodeRank(a.source, true) - nodeRank(b.source, true)
      );
      node.outgoing.sort(
        (a, b) => nodeRank(a.target, false) - nodeRank(b.target, false)
      );
    }
  }
}
