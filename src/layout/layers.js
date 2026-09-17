/**
 * Stage 1 — layering.
 *
 * Converts a weighted acyclic directed graph into layers of nodes (columns for
 * a horizontal diagram, rows for a vertical one), so that links run
 * predominantly in one direction. A link from A to B constrains A to an
 * earlier layer than B.
 *
 * @module layout/layers
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @typedef {object} SankeyLink
 * @property {string} source Key of the source node.
 * @property {string} target Key of the target node.
 * @property {number} value Flow magnitude.
 * @property {string} [trueSource] For links split by a totalizing node, the
 *   key of the node the flow originally came from.
 * @property {string} [trueTarget] For links split by a totalizing node, the
 *   key of the node the flow originally went to.
 */

/**
 * @typedef {object} SankeyData
 * @property {SankeyLink[]} links The only required field.
 * @property {object[]} [nodes] Node objects. Each needs a unique key, named
 *   `key` by default; supply `nodeKey` to read it from elsewhere.
 * @property {string[][]} [groups] Groups of node keys. Nodes in the same group
 *   are always assigned to the same layer.
 * @property {string[]} [ranks] Node keys in a fixed relative order within
 *   their layers.
 * @property {string[]} [hidden] Node keys to omit from the layers, to be drawn
 *   with an alternative encoding instead.
 */

/**
 * @typedef {object} SankeyNode
 * @property {string} key Unique identifier.
 * @property {SankeyLink[]} incoming
 * @property {SankeyLink[]} outgoing
 * @property {number} total_in Sum of incoming link values.
 * @property {number} total_out Sum of outgoing link values.
 * @property {number|undefined} rank Position within its layer, if constrained.
 * @property {number} layer Index of the layer this node belongs to.
 * @property {number} hidden Non-zero if hidden; the value is the node's
 *   one-based position in the `hidden` list, used to order hidden links.
 * @property {boolean} [dummy] True for routing nodes added by stage 2.
 * @property {number} [depth] Minimum distance from a source node.
 * @property {number} [hgt] Minimum distance to a sink node.
 */

/**
 * @typedef {object} Layout
 * @property {SankeyNode[][]} layers Nodes grouped by layer, in order.
 * @property {Record<string, SankeyNode>} nodeMap Nodes indexed by key.
 */

/**
 * How nodes are distributed across layers.
 *
 * `left`, `right`, `center` and `justify` mirror `d3-sankey`. `heuristic` has
 * no `d3-sankey` counterpart: it applies a simplified network-simplex pass
 * that minimises the total number of layers spanned by links. In practice
 * `right` usually reaches the same result.
 *
 * @typedef {"left" | "right" | "center" | "justify" | "heuristic"} NodeAlign
 */

/**
 * @typedef {object} LayerOptions
 * @property {(node: any) => string} [nodeKey] Maps a node object to its unique
 *   key. Defaults to reading `node.key`.
 * @property {NodeAlign} [nodeAlign="right"] Layer assignment strategy.
 */

/**
 * Assigns nodes to layers.
 *
 * @param {SankeyData} data
 * @param {LayerOptions} [options]
 * @returns {Layout}
 * @throws {Error} If the graph contains a cycle, or if group constraints
 *   cannot be satisfied.
 */
export function sankeyLayers(
  data,
  { nodeKey = (node) => node.key, nodeAlign = "right" } = {}
) {
  // --- Step 0: index nodes, groups and ranks -------------------------------

  /** @type {Record<string, SankeyNode>} */
  const nodeMap = {};
  /** @type {Record<string, string[]>} */
  const groupMap = {};
  /** @type {Record<string, number>} */
  const rankMap = {};

  if (data.groups) {
    for (const group of data.groups) {
      for (const key of group) groupMap[key] = group;
    }
  }
  if (data.ranks) {
    data.ranks.forEach((d, i) => {
      rankMap[d] = i;
    });
  }
  const hiddenList = data.hidden || [];

  /**
   * @param {string} key
   * @returns {SankeyNode}
   */
  const initNode = (key) => ({
    key,
    incoming: [],
    outgoing: [],
    total_in: 0,
    total_out: 0,
    rank: rankMap[key],
    layer: 0,
    // One-based index into `hidden`, so that zero reads as "not hidden" while
    // still distinguishing the first hidden node from the rest.
    hidden: hiddenList.indexOf(key) + 1
  });

  /** @type {SankeyNode[]} */
  const nodes = [];
  if (data.nodes) {
    for (const inputNode of data.nodes) {
      const node = initNode(nodeKey(inputNode));
      Object.assign(node, inputNode);
      nodeMap[node.key] = node;
      nodes.push(node);
    }
  }

  /** @type {SankeyLink[]} */
  const links = [];
  for (const { source, target, value, trueSource, trueTarget } of data.links) {
    const link = { source, target, value, trueSource, trueTarget };
    links.push(link);
    if (!nodeMap[source]) nodes.push((nodeMap[source] = initNode(source)));
    if (!nodeMap[target]) nodes.push((nodeMap[target] = initNode(target)));
    nodeMap[source].outgoing.push(link);
    nodeMap[source].total_out += value;
    nodeMap[target].incoming.push(link);
    nodeMap[target].total_in += value;
  }

  // --- Step 1: layer assignment --------------------------------------------

  /**
   * Labels each node with its minimum distance from a source.
   * @param {SankeyNode[]} ns
   */
  function computeNodeDepths(ns) {
    const n = ns.length;
    let current = new Set(ns);
    let next = new Set();
    let depth = 0;
    while (current.size) {
      for (const node of current) {
        node.depth = depth;
        for (const { target } of node.outgoing) {
          const targetNode = nodeMap[target];
          if (!targetNode.hidden) next.add(targetNode);
        }
      }
      if (++depth > n) throw new Error("circular graph");
      current = next;
      next = new Set();
    }
  }

  /**
   * Labels each node with its minimum distance to a sink.
   * @param {SankeyNode[]} ns
   */
  function computeNodeHeights(ns) {
    const n = ns.length;
    let current = new Set(ns);
    let next = new Set();
    let height = 0;
    while (current.size) {
      for (const node of current) {
        node.hgt = height;
        for (const { source } of node.incoming) {
          const sourceNode = nodeMap[source];
          if (!sourceNode.hidden) next.add(sourceNode);
        }
      }
      if (++height > n) throw new Error("circular graph");
      current = next;
      next = new Set();
    }
  }

  /**
   * Simplified network-simplex layer assignment: topologically layer the
   * graph, then greedily relocate nodes to shorten the total span of links.
   *
   * @param {number} nlayers
   * @param {SankeyNode[]} ns
   * @param {SankeyLink[]} ls
   */
  function simplexLayerAssignment(nlayers, ns, ls) {
    function assignInitialLayers() {
      const inDegree = new Map(ns.map((node) => [node.key, 0]));
      /** @type {Map<string, string[]>} */
      const adj = new Map(ns.map((node) => [node.key, []]));

      for (const { source, target } of ls) {
        if (nodeMap[source].hidden || nodeMap[target].hidden) continue;
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
        adj.get(source)?.push(target);
      }

      // Kahn's algorithm.
      const queue = [];
      for (const [key, deg] of inDegree.entries()) if (deg === 0) queue.push(key);

      /** @type {Map<string, number>} */
      const layer = new Map();
      while (queue.length > 0) {
        const u = /** @type {string} */ (queue.shift());
        const uLayer = layer.get(u) ?? 0;
        nodeMap[u].layer = uLayer;
        for (const v of adj.get(u) ?? []) {
          layer.set(v, Math.max(layer.get(v) ?? 0, uLayer + 1));
          inDegree.set(v, (inDegree.get(v) ?? 0) - 1);
          if (inDegree.get(v) === 0) queue.push(v);
        }
      }
    }

    /**
     * Total link span if `node` were placed in `trialLayer`; `Infinity` if
     * that placement would violate a link's direction.
     * @param {SankeyNode} node
     * @param {number} trialLayer
     * @returns {number}
     */
    function scoreNodeLayer(node, trialLayer) {
      let cost = 0;
      for (const link of node.outgoing) {
        const targetLayer = nodeMap[link.target].layer;
        if (trialLayer >= targetLayer) return Infinity;
        cost += targetLayer - trialLayer;
      }
      for (const link of node.incoming) {
        const sourceLayer = nodeMap[link.source].layer;
        if (sourceLayer >= trialLayer) return Infinity;
        cost += trialLayer - sourceLayer;
      }
      return cost;
    }

    function reduceEdgeSpans(iterations = 10) {
      for (let iter = 0; iter < iterations; iter++) {
        for (const node of ns) {
          const currentLayer = node.layer;
          const minLayer = node.depth ?? 0;
          const maxLayer = nlayers - (node.hgt ?? 0) - 1;
          let bestLayer = currentLayer;
          let bestScore = scoreNodeLayer(node, currentLayer);
          for (let l = minLayer; l <= maxLayer; l++) {
            if (l === currentLayer) continue;
            node.layer = l;
            const s = scoreNodeLayer(node, l);
            if (s < bestScore) {
              bestScore = s;
              bestLayer = l;
            }
          }
          node.layer = bestLayer;
        }
      }
    }

    assignInitialLayers();
    reduceEdgeSpans(10);
  }

  const nonHidden = nodes.filter((node) => !node.hidden);
  computeNodeDepths(nonHidden);
  computeNodeHeights(nonHidden);
  const nlayers = Math.max(...nonHidden.map((node) => node.depth ?? 0)) + 1;

  if (nodeAlign !== "heuristic") {
    /** @type {Record<string, (node: SankeyNode) => number>} */
    const alignment = {
      left: (node) => node.depth ?? 0,
      right: (node) => nlayers - (node.hgt ?? 0) - 1,
      center: (node) =>
        node.incoming.length === 0 ? alignment.right(node) : alignment.left(node),
      justify: (node) =>
        node.outgoing.length === 0 ? nlayers - 1 : alignment.left(node)
    };
    for (const node of nonHidden) node.layer = alignment[nodeAlign](node);
  } else {
    simplexLayerAssignment(nlayers, nonHidden, links);
  }

  // --- Step 2: satisfy group constraints -----------------------------------
  // Pull grouped nodes onto a common layer, then push targets past their
  // sources again, until both hold simultaneously.

  let changed;
  let tries = 0;
  const maxTries = nodes.length ** 2;
  do {
    changed = false;
    for (const node of nonHidden) {
      if (groupMap[node.key]) {
        const groupLayer = Math.max(
          ...groupMap[node.key].map((key) => (nodeMap[key] ? nodeMap[key].layer : -1))
        );
        if (node.layer !== groupLayer) {
          node.layer = groupLayer;
          changed = true;
        }
      }
      for (const inLink of node.incoming) {
        const inNode = nodeMap[inLink.source];
        if (inNode.hidden) continue;
        if (node.layer <= inNode.layer) {
          node.layer = inNode.layer + 1;
          changed = true;
        }
      }
    }
  } while (changed && ++tries < maxTries);
  if (changed) throw new Error("can't satisfy group constraints");

  // --- Step 3: close gaps left by empty layers -----------------------------

  /** @type {number[]} */
  const layerCount = [];
  for (const node of nonHidden) {
    layerCount[node.layer] = (layerCount[node.layer] || 0) + 1;
  }
  /** @type {number[]} */
  const shift = [];
  let emptyCount = 0;
  for (let i = 0; i < layerCount.length; i++) {
    if (!layerCount[i]) emptyCount++;
    shift[i] = emptyCount;
  }
  for (const node of nonHidden) node.layer -= shift[node.layer];

  // --- Step 4: build the layer arrays, honouring rank order ----------------

  /** @type {SankeyNode[][]} */
  const layers = [];
  for (const node of nonHidden) {
    if (layers[node.layer]) layers[node.layer].push(node);
    else layers[node.layer] = [node];
  }

  for (const layer of layers) {
    /** @type {SankeyNode[]} */
    const sorted = new Array(layer.length);
    for (const node of layer) {
      if (node.rank !== undefined) sorted[node.rank] = node;
    }
    let i = 0;
    for (const node of layer) {
      if (node.rank === undefined) {
        while (sorted[i]) i++;
        sorted[i] = node;
      }
    }
    layer.length = 0;
    layer.push(...sorted.filter((d) => d));
  }

  return { layers, nodeMap };
}
