/**
 * Synthetic Sankey dataset generation.
 *
 * Builds link lists from a declarative graph specification plus a seed, so
 * that a whole family of related datasets can be described by a manifest and
 * regenerated exactly.
 *
 * @module data/synthetic
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { randomLcg } from "../internal/random.js";

/**
 * @typedef {object} GraphSpec
 * @property {[string[], string[]][]} linkPairs Pairs of `[sources, targets]`.
 *   Every source is linked to every target in each pair.
 * @property {string[]} sources Node keys that originate flow.
 * @property {number} [sourceTotal=1000] Total flow distributed across
 *   `sources`.
 * @property {string[]} [optionalNodes] Nodes that may be dropped, varying the
 *   graph's topology between datasets.
 * @property {[string|RegExp, string|RegExp][]} [optionalLinks] Patterns
 *   `[sourcePat, targetPat]` marking links that may be dropped.
 */

/**
 * @typedef {object} SyntheticOptions
 * @property {number} [randomSeed=0.5] Seed for the generator.
 * @property {number} [regularity=0] How evenly flow is split, from 0 (fully
 *   random) to 1 (perfectly even).
 * @property {number} [optionalProbability=1] Probability of *keeping* each
 *   optional node and link.
 *
 *   **A value of exactly 1 keeps everything.** The inclusion test is
 *   `random() >= optionalProbability`, and `random()` returns a value in
 *   `[0, 1)`, so at 1 it can never fire. Every seed then yields the same
 *   topology and only the flow magnitudes vary. To generate datasets that
 *   differ structurally — in the number of sources, or the number of import
 *   and export links — this must be set below 1.
 */

/**
 * Generates a synthetic dataset.
 *
 * Fully deterministic: the same specification and options always produce the
 * same links, which is what makes the benchmark suite reproducible.
 *
 * @param {GraphSpec} metadata
 * @param {SyntheticOptions} [options]
 * @returns {import("../layout/layers.js").SankeyLink[]}
 * @throws {Error} If the specification describes a cyclic graph.
 */
export function makeSyntheticSankeyData(
  metadata,
  { randomSeed = 0.5, regularity = 0, optionalProbability = 1 } = {}
) {
  const {
    linkPairs,
    sources,
    optionalNodes = [],
    optionalLinks = [],
    sourceTotal = 1000
  } = metadata;

  const random = randomLcg(randomSeed);

  /**
   * Splits `x` into `n` parts. `regularity` blends between a random split and
   * an even one.
   * @param {number} x
   * @param {number} n
   * @returns {number[]}
   */
  function randomSplit(x, n) {
    let s = 0;
    /** @type {number[]} */
    const p = [];
    for (let i = 0; i < n; i++) {
      p[i] = (random() + regularity) / (1 + regularity);
      s += p[i];
    }
    return p.map((q) => (q / s) * x);
  }

  const excludeOptional = () => random() >= optionalProbability;

  const nodeSet = new Set(linkPairs.flat(2));
  for (const nodeKey of optionalNodes) {
    if (excludeOptional()) nodeSet.delete(nodeKey);
  }

  const inputs = sources.filter((d) => nodeSet.has(d));

  /** @type {Record<string, { value: number, outgoing: any[], predecessors: number, successors: number }>} */
  const nodeInfo = {};
  for (const node of nodeSet) {
    nodeInfo[node] = { value: 0, outgoing: [], predecessors: 0, successors: 0 };
  }

  const shares = randomSplit(sourceTotal, inputs.length);
  inputs.forEach((src, i) => {
    nodeInfo[src].value = shares[i];
  });

  for (const [srcs, tgts] of linkPairs) {
    for (const s of srcs) {
      if (!nodeSet.has(s)) continue;
      for (const t of tgts) {
        if (!nodeSet.has(t)) continue;
        let include = true;
        for (const [os, ot] of optionalLinks) {
          if (s.match(os) && t.match(ot) && excludeOptional()) include = false;
        }
        if (include) {
          const link = { source: s, target: t };
          nodeInfo[t].predecessors++;
          nodeInfo[s].outgoing.push(link);
          nodeInfo[s].successors++;
        }
      }
    }
  }

  // Walk the graph in topological order, splitting each node's accumulated
  // value across its outgoing links.
  /** @type {any[]} */
  const links = [];
  let guard = nodeSet.size + 1;
  while (nodeSet.size > 0) {
    if (--guard < 0) throw new Error("synthetic generation failed to terminate");
    /** @type {string|null} */
    let source = null;
    for (const node of nodeSet) {
      if (nodeInfo[node].predecessors === 0) {
        source = node;
        break;
      }
    }
    if (!source) throw new Error("circular sankey");
    nodeSet.delete(source);
    // A node stranded by optional exclusions carries no flow, so it emits no
    // links. Its targets must still be released, or they keep waiting on a
    // predecessor that will never arrive and the walk stalls — which surfaced
    // as a spurious "circular sankey" on a graph that was perfectly acyclic.
    if (nodeInfo[source].value === 0) {
      for (const link of nodeInfo[source].outgoing) {
        nodeInfo[link.target].predecessors--;
      }
      continue;
    }
    const values = randomSplit(nodeInfo[source].value, nodeInfo[source].successors);
    for (const link of nodeInfo[source].outgoing) {
      link.value = values.pop();
      nodeInfo[link.target].value += link.value;
      nodeInfo[link.target].predecessors--;
      links.push(link);
    }
  }
  return links;
}

/**
 * @typedef {object} SumNodeSpec
 * @property {string[]} sources Source node keys to bundle.
 * @property {string[]} targets Target node keys to bundle.
 * @property {string} sumNode Key for the totalizing node.
 */

/**
 * Inserts totalizing nodes, which gather a bundle of links and redistribute
 * them, cutting the crossings among them.
 *
 * Each bundled link `A -> B` becomes two: `A -> sumNode` carrying
 * `trueTarget: B`, and `sumNode -> B` carrying `trueSource: A`. Those extra
 * fields let this library keep colouring and interaction tied to the original
 * endpoints; other Sankey libraries ignore them and simply see two links.
 *
 * @param {import("../layout/layers.js").SankeyLink[]} sankeyData
 * @param {SumNodeSpec[]} sumNodes Applied in order, so a later bundle can
 *   gather links produced by an earlier one.
 * @returns {import("../layout/layers.js").SankeyLink[]}
 */
export function addTotalizingNodes(sankeyData, sumNodes) {
  let paths = sankeyData;
  for (const { sources, targets, sumNode } of sumNodes) {
    /** @type {any[]} */
    const newPaths = [];
    for (const p of paths) {
      const { source, target, value } = p;
      if (sources.includes(source) && targets.includes(target)) {
        newPaths.push({ source, target: sumNode, trueTarget: target, value });
        newPaths.push({ source: sumNode, target, trueSource: source, value });
      } else newPaths.push(p);
    }
    paths = newPaths;
  }
  return paths;
}
