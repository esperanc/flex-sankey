/**
 * Deep-enough copying of a layout.
 *
 * @module layout/copy
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { sankeyAddPathNavigation } from "./dummies.js";

/**
 * Copies a layout so it can be modified without disturbing the original.
 *
 * Nodes and links are duplicated; each link is copied exactly once, so the
 * sharing between a node's `outgoing` and its target's `incoming` is
 * preserved in the copy.
 *
 * @param {import("./layers.js").Layout} layout
 * @returns {import("./dummies.js").NavigableLayout}
 */
export function sankeyLayoutCopy(layout) {
  const { layers, nodeMap } = layout;
  /** @type {Record<string, any>} */
  const newNodeMap = {};
  /** @type {Map<any, any>} */
  const linkMap = new Map();

  /** @param {any} link */
  const dupLink = (link) => {
    const existing = linkMap.get(link);
    if (existing) return existing;
    const newLink = Object.assign({}, link);
    linkMap.set(link, newLink);
    return newLink;
  };

  for (const node of Object.values(nodeMap)) {
    const newNode = Object.assign({}, node);
    newNode.incoming = newNode.incoming.map(dupLink);
    newNode.outgoing = newNode.outgoing.map(dupLink);
    newNodeMap[newNode.key] = newNode;
  }

  const result = Object.assign({}, layout);
  result.layers = layers.map((layer) => layer.map((node) => newNodeMap[node.key]));
  result.nodeMap = newNodeMap;
  return sankeyAddPathNavigation(result);
}
