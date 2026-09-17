/**
 * Stage 5 — render layout.
 *
 * Resolves the settled layout into concrete boxes and path geometry in the
 * final coordinate system. For a horizontal diagram the layer index maps to x
 * and the position within a layer to y; for a vertical one, the reverse.
 *
 * This is the last stage that is free of any drawing concern, which is what
 * makes hybrid diagrams possible: two render layouts computed in different
 * orientations can be merged (see `combineRenderLayouts`) and handed to the
 * renderer as one.
 *
 * @module layout/render-layout
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * A drawn node rectangle.
 * @typedef {object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {any} vertex The vertex this box was built from.
 * @property {any[]} [hiddenPaths] Links to or from hidden nodes, drawn as
 *   symbols on this box rather than as ribbons.
 */

/**
 * One hop of a link, between two consecutive boxes along its route.
 * @typedef {object} PathSegment
 * @property {any} link
 * @property {Box} srcBox
 * @property {Box} dstBox
 * @property {number} dx0 Attachment point on `srcBox`, relative to its origin.
 * @property {number} dy0
 * @property {number} dx1 Attachment point on `dstBox`.
 * @property {number} dy1
 * @property {number} tx0 Unit tangent leaving the source.
 * @property {number} ty0
 * @property {number} tx1 Unit tangent entering the target.
 * @property {number} ty1
 * @property {number} px0 Reference anchor on `srcBox` — its centre across the
 *   flow, which is what keeps parallel ribbons from overlapping.
 * @property {number} py0
 * @property {number} px1 Reference anchor on `dstBox`.
 * @property {number} py1
 */

/**
 * All hops of one link, grouped so they can be drawn and coloured as a unit.
 * @typedef {object} PathGroup
 * @property {any} sourceNode
 * @property {Box} sourceNodeBox
 * @property {any} targetNode
 * @property {Box} targetNodeBox
 * @property {any} link
 * @property {boolean} horizontal
 * @property {PathSegment[]} paths
 */

/**
 * @typedef {object} RenderLayout
 * @property {Box[]} boxes
 * @property {PathGroup[]} pathGroups
 * @property {number} length Extent along the flow direction.
 * @property {number} breadth Extent across the flow direction.
 */

/**
 * @typedef {object} RenderLayoutOptions
 * @property {"horizontal" | "vertical"} [flowDirection="horizontal"]
 * @property {((node: any) => number) | number} [nodeWidth=15] Thickness of a
 *   node rectangle along the flow direction.
 * @property {number} [length=800] Extent along the flow direction.
 * @property {number} [marginLeft=5] Margin before the first layer.
 * @property {number} [marginRight=5] Margin after the last layer.
 */

/**
 * Computes final node boxes and path geometry.
 *
 * @param {any} layout The geometric layout from `sankeyGeometricLayout`.
 * @param {RenderLayoutOptions} [options]
 * @returns {RenderLayout}
 */
export function sankeyRenderLayout(
  layout,
  {
    flowDirection = "horizontal",
    nodeWidth = 15,
    length = 800,
    marginLeft = 5,
    marginRight = 5
  } = {}
) {
  const { layers, nodeMap } = layout;
  const nlayers = layers.length;

  /** @type {(node: any) => number} */
  const widthOf = typeof nodeWidth === "function" ? nodeWidth : () => nodeWidth;

  const layerWidth = layers.map((/** @type {any[]} */ nodes) =>
    Math.max(...nodes.map(widthOf))
  );
  const layerGap =
    (length - layerWidth.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) - marginLeft - marginRight) /
    (nlayers - 1);

  const horizontal = flowDirection === "horizontal";

  /** @type {Box[]} */
  const boxes = [];
  /** @type {Set<any>} */
  const linkSet = new Set();
  /** @type {Map<any, Box>} */
  const vertexMap = new Map();

  let lc = marginLeft;
  for (let i = 0; i < nlayers; i++) {
    const layerCoord = lc + layerWidth[i] / 2;
    for (const node of layers[i]) {
      for (const link of [...node.incoming, ...node.outgoing]) linkSet.add(link);
      // Dummy nodes are routing waypoints, drawn with zero thickness.
      const thick = node.dummy ? 0 : widthOf(node);
      const flowCoord = layerCoord - thick / 2;
      const vertex = node.vertex;
      if (vertexMap.has(vertex)) continue;
      const [x, y] = horizontal ? [flowCoord, vertex.coord] : [vertex.coord, flowCoord];
      const [width, height] = horizontal
        ? [thick, vertex.size]
        : [vertex.size, thick];
      /** @type {Box} */
      const box = { x, y, width, height, vertex };
      node.box = box;
      vertexMap.set(vertex, box);
      boxes.push(box);
    }
    lc += layerWidth[i] + layerGap;
  }

  /** @type {Map<string, PathGroup>} */
  const pathGroupMap = new Map();

  for (const link of linkSet) {
    const source = link.trueSource || link.source;
    const target = link.trueTarget || link.target;
    const sourceNode = nodeMap[source];
    const targetNode = nodeMap[target];

    if (sourceNode.hidden || targetNode.hidden) {
      // Links touching a hidden node are attached to the visible node's box
      // and drawn later as a symbol rather than a ribbon.
      const inbound = Boolean(sourceNode.hidden);
      const visible = inbound ? targetNode : sourceNode;
      const offset = inbound
        ? visible.vertex.incomingOffset.get(link)
        : visible.vertex.outgoingOffset.get(link);
      const nodeSize = widthOf(visible);
      const nodeBox = visible.box;
      const box = horizontal
        ? { x: 0, y: offset - link.size / 2, width: nodeSize, height: link.size }
        : { x: offset - link.size / 2, y: 0, width: link.size, height: nodeSize };
      if (!nodeBox.hiddenPaths) nodeBox.hiddenPaths = [];
      nodeBox.hiddenPaths.push({
        sourceNode,
        targetNode,
        horizontal,
        use: inbound ? "input" : "output",
        link,
        nodeBox,
        box
      });
      continue;
    }

    const pathGroupKey = source + target;
    const pathGroup =
      pathGroupMap.get(pathGroupKey) ||
      /** @type {PathGroup} */ ({
        sourceNode,
        sourceNodeBox: vertexMap.get(sourceNode.vertex),
        targetNode,
        targetNodeBox: vertexMap.get(targetNode.vertex),
        link,
        horizontal,
        paths: []
      });
    pathGroupMap.set(pathGroupKey, pathGroup);

    // Walk the link's full route: source, any dummies, then target.
    const linkKeys = [link.source, link.target];
    if (link.dummies) linkKeys.splice(1, 0, ...link.dummies);
    const linkNodes = linkKeys.map((/** @type {string} */ d) => nodeMap[d]);

    for (let i = 1; i < linkNodes.length; i++) {
      const srcNode = linkNodes[i - 1];
      const dstNode = linkNodes[i];
      let dx0, dy0, dx1, dy1, tx0, ty0, tx1, ty1, px0, py0, px1, py1;
      if (horizontal) {
        dx0 = px0 = srcNode.dummy ? 0 : widthOf(srcNode);
        dy0 = srcNode.vertex.outgoingOffset.get(link);
        py0 = srcNode.vertex.size / 2;
        dx1 = px1 = 0;
        dy1 = dstNode.vertex.incomingOffset.get(link);
        py1 = dstNode.vertex.size / 2;
        tx0 = 1;
        tx1 = -1;
        ty0 = ty1 = 0;
      } else {
        dx0 = srcNode.vertex.outgoingOffset.get(link);
        px0 = srcNode.vertex.size / 2;
        dy0 = py0 = srcNode.dummy ? 0 : widthOf(srcNode);
        dx1 = dstNode.vertex.incomingOffset.get(link);
        px1 = dstNode.vertex.size / 2;
        dy1 = py1 = 0;
        tx0 = tx1 = 0;
        ty0 = 1;
        ty1 = -1;
      }
      pathGroup.paths.push({
        link,
        srcBox: /** @type {Box} */ (vertexMap.get(srcNode.vertex)),
        dstBox: /** @type {Box} */ (vertexMap.get(dstNode.vertex)),
        dx0, dy0, dx1, dy1,
        tx0, ty0, tx1, ty1,
        px0, py0, px1, py1
      });
    }
  }

  return {
    boxes,
    pathGroups: [...pathGroupMap.values()],
    length,
    breadth: layout.size
  };
}

/**
 * Merges a horizontal and a vertical render layout into one hybrid diagram.
 *
 * Nodes present in both become rectangles carrying two encodings at once —
 * width from the vertical layout, height from the horizontal one. The two
 * layouts are aligned on the bounding box of those shared nodes, and nodes
 * beyond it are displaced to keep their relative position.
 *
 * @param {RenderLayout} hLayout Horizontal layout.
 * @param {RenderLayout} vLayout Vertical layout.
 * @returns {RenderLayout} The combined layout.
 */
export function combineRenderLayouts(hLayout, vLayout) {
  const { boxes: hBoxes, pathGroups: hPathGroups } = hLayout;
  const { boxes: vBoxes, pathGroups: vPathGroups } = vLayout;

  /** @param {Box} box */
  const boxKey = (box) => box.vertex.nodes[0].key;

  /** @type {Map<string, { h?: Box, v?: Box }>} */
  const keyBoxMap = new Map();
  for (const box of hBoxes) {
    const key = boxKey(box);
    keyBoxMap.set(key, Object.assign(keyBoxMap.get(key) || {}, { h: box }));
  }
  for (const box of vBoxes) {
    const key = boxKey(box);
    keyBoxMap.set(key, Object.assign(keyBoxMap.get(key) || {}, { v: box }));
  }

  /**
   * @param {any} acc
   * @param {Box|{x:number,y:number,width:number,height:number}} box
   */
  const addBbox = (acc, box) => {
    if (!acc) return { x: box.x, y: box.y, width: box.width, height: box.height };
    const x = Math.min(acc.x, box.x);
    const y = Math.min(acc.y, box.y);
    const width = Math.max(acc.x + acc.width, box.x + box.width) - x;
    const height = Math.max(acc.y + acc.height, box.y + box.height) - y;
    return { x, y, width, height };
  };

  let hBbox, vBbox, totalHBbox, totalVBbox;
  for (const value of keyBoxMap.values()) {
    if (value.h) totalHBbox = addBbox(totalHBbox, value.h);
    if (value.v) totalVBbox = addBbox(totalVBbox, value.v);
    if (value.h && value.v) {
      hBbox = addBbox(hBbox, value.h);
      vBbox = addBbox(vBbox, value.v);
    }
  }
  if (!hBbox || !vBbox) {
    throw new Error("the two layouts share no nodes, so they cannot be combined");
  }

  const X = Math.max(hBbox.x, vBbox.x);
  const Y = Math.max(hBbox.y, vBbox.y);
  const W = Math.max(hBbox.width, vBbox.width);
  const H = Math.max(hBbox.height, vBbox.height);
  const dX = X - vBbox.x;
  const dY = Y - hBbox.y;

  /** @type {Box[]} */
  const newBoxes = [];
  /** @type {Map<Box, Box>} */
  const oldNewBoxMap = new Map();

  for (const { v, h } of keyBoxMap.values()) {
    /** @type {any} */
    const newBox = {};
    if (h && v) {
      newBox.width = v.width;
      newBox.height = h.height;
      newBox.x = v.x + dX;
      newBox.y = h.y + dY;
      newBox.vertex = v.vertex;
      oldNewBoxMap.set(h, newBox);
      oldNewBoxMap.set(v, newBox);
    } else if (h) {
      Object.assign(newBox, h);
      if (h.x > hBbox.x + hBbox.width) newBox.x += W - hBbox.width;
      newBox.y += dY;
      oldNewBoxMap.set(h, newBox);
    } else if (v) {
      Object.assign(newBox, v);
      if (v.y > vBbox.y + vBbox.height) newBox.y += H - vBbox.height;
      newBox.x += dX;
      oldNewBoxMap.set(v, newBox);
    }
    newBoxes.push(newBox);
  }

  /** @type {PathGroup[]} */
  const newPathGroups = [];
  for (const pg of [...hPathGroups, ...vPathGroups]) {
    const newPg = Object.assign({}, pg);
    newPg.sourceNodeBox = /** @type {Box} */ (oldNewBoxMap.get(pg.sourceNodeBox));
    newPg.targetNodeBox = /** @type {Box} */ (oldNewBoxMap.get(pg.targetNodeBox));
    newPg.paths = pg.paths.map((path) => {
      const newp = Object.assign({}, path);
      newp.srcBox = /** @type {Box} */ (oldNewBoxMap.get(path.srcBox));
      newp.dstBox = /** @type {Box} */ (oldNewBoxMap.get(path.dstBox));
      // Shared boxes changed size, so re-anchor the departure point to the
      // box's trailing edge.
      if (pg.horizontal) newp.dx0 = newp.srcBox.width;
      else newp.dy0 = newp.srcBox.height;
      return newp;
    });
    newPathGroups.push(newPg);
  }

  let length = hLayout.length + W - hBbox.width;
  const extraW = dX + (totalVBbox?.width ?? 0) - ((totalHBbox?.width ?? 0) + W - hBbox.width);
  if (extraW > 0) length += extraW;

  let breadth = vLayout.length + H - vBbox.height;
  const extraH = dY + (totalHBbox?.height ?? 0) - ((totalVBbox?.height ?? 0) + H - vBbox.height);
  if (extraH > 0) breadth += extraH;

  return { boxes: newBoxes, pathGroups: newPathGroups, length, breadth };
}
