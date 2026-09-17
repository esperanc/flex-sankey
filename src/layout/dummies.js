/**
 * Stage 2 — dummy nodes.
 *
 * A link spanning more than one layer is routed through placeholder nodes in
 * the layers it crosses. This keeps links from passing over unrelated nodes,
 * at the cost of paths that can become excessively sinuous. Packing adjacent
 * dummies back together (stage 4's `joinDummies`) recovers some of that.
 *
 * @module layout/dummies
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @typedef {import("./layers.js").Layout} Layout
 * @typedef {import("./layers.js").SankeyNode} SankeyNode
 * @typedef {import("./layers.js").SankeyLink} SankeyLink
 */

/**
 * A layout that can be walked link by link, hop by hop.
 * @typedef {Layout & {
 *   nextNode: (node: SankeyNode, link: SankeyLink) => SankeyNode,
 *   prevNode: (node: SankeyNode, link: SankeyLink) => SankeyNode
 * }} NavigableLayout
 */

/**
 * Attaches hop-by-hop navigation to a layout.
 *
 * A link that was split across dummy nodes is a chain, not a single edge;
 * these two functions step along that chain in either direction.
 *
 * @param {Layout} layout
 * @returns {NavigableLayout}
 */
export function sankeyAddPathNavigation(layout) {
  const { layers, nodeMap } = layout;

  /**
   * The next node along `link`, starting from `node`.
   * @param {SankeyNode} node
   * @param {SankeyLink & { dummies?: string[] }} link
   * @returns {SankeyNode}
   */
  const nextNode = (node, link) => {
    if (node.key === link.source) {
      return nodeMap[link.dummies ? link.dummies[0] : link.target];
    }
    const dummies = link.dummies ?? [];
    const n = dummies.length;
    for (let i = 0; i < n - 1; i++) {
      if (node.key === dummies[i]) return nodeMap[dummies[i + 1]];
    }
    return nodeMap[link.target];
  };

  /**
   * The previous node along `link`, ending at `node`.
   * @param {SankeyNode} node
   * @param {SankeyLink & { dummies?: string[] }} link
   * @returns {SankeyNode}
   */
  const prevNode = (node, link) => {
    const dummies = link.dummies ?? [];
    const n = dummies.length;
    if (node.key === link.target) {
      return nodeMap[n > 0 ? dummies[n - 1] : link.source];
    }
    for (let i = 1; i < n; i++) {
      if (node.key === dummies[i]) return nodeMap[dummies[i - 1]];
    }
    return nodeMap[link.source];
  };

  return { layers, nodeMap, nextNode, prevNode };
}

/**
 * Inserts dummy nodes for every link spanning more than one layer.
 *
 * The input layout is left untouched; layers and node map are copied first.
 *
 * @param {Layout} initialLayout Typically the result of `sankeyLayers`.
 * @returns {NavigableLayout} The augmented layout.
 * @throws {Error} If a unique dummy key cannot be derived.
 */
export function sankeyAddDummies(initialLayout) {
  const layers = initialLayout.layers.map((layer) => layer.slice());
  const nodeMap = Object.assign({}, initialLayout.nodeMap);
  const nodes = initialLayout.layers.flat().filter((node) => !node.hidden);

  for (const node of nodes) {
    for (const link of /** @type {(SankeyLink & {dummies?: string[]})[]} */ (
      node.outgoing
    )) {
      // For links split by a totalizing node, name dummies after the original
      // endpoints so that the two halves of one flow stay recognisably related.
      const sourceName = link.trueSource || link.source;
      const targetName = link.trueTarget || link.target;
      const value = link.value;
      const targetNode = nodeMap[link.target];
      if (targetNode.hidden) continue;
      if (targetNode.layer - node.layer > 1) {
        link.dummies = [];
        for (let i = node.layer + 1; i < targetNode.layer; i++) {
          const prefix = `${sourceName}-${targetName}-`;
          let suffix = 1;
          while (nodeMap[prefix + suffix] && suffix < 5) suffix++;
          if (suffix >= 5) throw new Error("dummy key heuristic exhausted");
          const key = prefix + suffix;
          /** @type {SankeyNode} */
          const dummy = {
            key,
            dummy: true,
            layer: i,
            incoming: [link],
            outgoing: [link],
            total_in: value,
            total_out: value,
            rank: undefined,
            hidden: 0
          };
          nodeMap[key] = dummy;
          link.dummies.push(key);
          layers[i].push(dummy);
        }
      }
    }
  }
  return sankeyAddPathNavigation({ layers, nodeMap });
}
