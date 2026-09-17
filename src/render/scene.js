/**
 * Scene construction — stage 6a.
 *
 * Turns a render layout into a flat, serializable description of *what shapes
 * to draw and where*, saying nothing about how they should look. Colours,
 * fonts and opacities are applied afterwards by `paintScene`; emitting a
 * string or DOM nodes happens later still.
 *
 * Keeping these apart means the benchmark can measure geometry straight from
 * the scene — every ribbon's Bézier control points are right here — instead of
 * rendering to SVG and parsing the path strings back. That removes a whole
 * class of measurement error, notably the chord approximation of circular arcs
 * that the original analysis relied on.
 *
 * @module render/scene
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { outlinePath, outlinePathPoints } from "../paths/outline.js";
import { labelAlignment, resolveLabelPos } from "./labels.js";

/**
 * @typedef {import("../layout/render-layout.js").RenderLayout} RenderLayout
 * @typedef {import("./labels.js").LabelPos} LabelPos
 */

/**
 * @typedef {object} SceneLabel
 * @property {string} text
 * @property {number} x Absolute position.
 * @property {number} y
 * @property {string} anchor SVG `text-anchor`.
 * @property {string} baseline SVG `dominant-baseline`.
 * @property {number} angle Rotation in degrees.
 */

/**
 * A dashed line across a node marking the magnitude of a hidden flow, plus the
 * triangle that points to where it goes.
 *
 * @typedef {object} SceneHiddenMark
 * @property {string} sourceKey
 * @property {string} targetKey
 * @property {"input" | "output"} use Whether the flow enters or leaves.
 * @property {number} value
 * @property {[number, number][][]} rules Dashed lines, in absolute coordinates.
 * @property {[number, number][]} triangle Marker polygon, absolute.
 * @property {SceneLabel} label
 */

/**
 * @typedef {object} SceneNode
 * @property {string} key
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} dummy True for routing waypoints, which are not drawn.
 * @property {number} value Total flow through the node.
 * @property {SceneLabel|null} label
 * @property {SceneHiddenMark[]} hiddenMarks
 */

/**
 * @typedef {object} SceneLink
 * @property {string} sourceKey
 * @property {string} targetKey
 * @property {number} value
 * @property {string} d SVG path data: a closed, fillable outline covering
 *   every hop of the link.
 * @property {import("../paths/outline.js").CubicBezier[][]} curves The same
 *   geometry as control points, one pair of boundary curves per hop. Measure
 *   from this rather than re-parsing `d`.
 * @property {[number, number]} tangent Flow direction at the source, used to
 *   orient a gradient.
 */

/**
 * @typedef {object} Scene
 * @property {number} width
 * @property {number} height
 * @property {SceneNode[]} nodes
 * @property {SceneLink[]} links
 */

/**
 * @typedef {object} SceneOptions
 * @property {number} [width=800] Diagram width in pixels.
 * @property {number} [height=500] Diagram height in pixels.
 * @property {number} [bias=1] Ribbon curviness. Below 1 straightens.
 * @property {number} [maxAngle=20] Reference-line angle limit, in degrees.
 * @property {(node: any) => string} [nodeLabel] Label text for a node.
 *   Defaults to its key.
 * @property {LabelPos | ((box: any, node: any) => LabelPos)} [nodeLabelPos="left-right"]
 *   Where labels sit.
 * @property {number} [nodeLabelAngle=0] Label rotation in degrees.
 * @property {number} [nodeLabelPadding=6] Gap between node and label.
 * @property {number} [hiddenSymbolSize=10] Size of the hidden-flow marker.
 */

/**
 * Builds the geometric scene for a render layout.
 *
 * @param {RenderLayout} renderLayout From `sankeyRenderLayout`.
 * @param {SceneOptions} [options]
 * @returns {Scene}
 */
export function buildScene(
  renderLayout,
  {
    width = 800,
    height = 500,
    bias = 1,
    maxAngle = 20,
    nodeLabel = (node) => node.key,
    nodeLabelPos = "left-right",
    nodeLabelAngle = 0,
    nodeLabelPadding = 6,
    hiddenSymbolSize = 10
  } = {}
) {
  const { boxes, pathGroups } = renderLayout;

  /** @type {SceneNode[]} */
  const nodes = [];
  for (const box of boxes) {
    const node = box.vertex.nodes[0];
    const dummy = Boolean(box.vertex.dummy);

    /** @type {SceneLabel|null} */
    let label = null;
    if (!dummy) {
      const pos = resolveLabelPos(nodeLabelPos, box, node, width, height);
      const { anchor, baseline, dx, dy } = labelAlignment(
        pos,
        nodeLabelAngle,
        box.width,
        box.height,
        nodeLabelPadding
      );
      label = {
        text: nodeLabel(node),
        x: box.x + dx,
        y: box.y + dy,
        anchor,
        baseline,
        angle: nodeLabelAngle
      };
    }

    nodes.push({
      key: node.key,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      dummy,
      value: node.total ?? 0,
      label,
      hiddenMarks: box.hiddenPaths
        ? box.hiddenPaths.map((hp) =>
            buildHiddenMark(hp, box, {
              hiddenSymbolSize,
              nodeLabel,
              nodeLabelAngle,
              nodeLabelPadding
            })
          )
        : []
    });
  }

  /** @type {SceneLink[]} */
  const links = [];
  for (const group of pathGroups) {
    let d = "";
    /** @type {import("../paths/outline.js").CubicBezier[][]} */
    const curves = [];
    /** @type {[number, number]} */
    let tangent = [1, 0];

    for (const path of group.paths) {
      const { link, srcBox, dstBox, dx0, dy0, dx1, dy1 } = path;
      const { tx0, ty0, tx1, ty1, px0, py0, px1, py1 } = path;
      const a = /** @type {[number, number]} */ ([srcBox.x + dx0, srcBox.y + dy0]);
      const b = /** @type {[number, number]} */ ([dstBox.x + dx1, dstBox.y + dy1]);
      // Tangent length is half the gap between the boxes, along whichever axis
      // the flow runs, scaled by the curviness bias.
      const tsize = ((tx0 > ty0 ? b[0] - a[0] : b[1] - a[1]) / 2) * bias;
      const at = /** @type {[number, number]} */ ([tx0 * tsize, ty0 * tsize]);
      const bt = /** @type {[number, number]} */ ([tx1 * tsize, ty1 * tsize]);
      const ap = /** @type {[number, number]} */ ([srcBox.x + px0, srcBox.y + py0]);
      const bp = /** @type {[number, number]} */ ([dstBox.x + px1, dstBox.y + py1]);
      const size = Math.max(link.size, 1);
      const spec = { a, b, at, bt, ap, bp, size, maxAngle };
      d += outlinePath(spec);
      curves.push(outlinePathPoints(spec));
      tangent = [tx0, ty0];
    }

    links.push({
      sourceKey: group.sourceNode.key,
      targetKey: group.targetNode.key,
      value: group.link.value,
      d,
      curves,
      tangent
    });
  }

  return { width, height, nodes, links };
}

/**
 * Builds the marker geometry for a flow to or from a hidden node.
 *
 * A hidden node is not drawn. Instead its flow is shown by a pair of dashed
 * rules across the visible node, spanning the flow's magnitude, and a small
 * triangle pointing out of the node towards where the flow goes.
 *
 * @param {any} hiddenPath
 * @param {any} nodeBox
 * @param {{hiddenSymbolSize: number, nodeLabel: (node: any) => string, nodeLabelAngle: number, nodeLabelPadding: number}} opts
 * @returns {SceneHiddenMark}
 */
function buildHiddenMark(hiddenPath, nodeBox, opts) {
  const { sourceNode, targetNode, horizontal, use, box, link } = hiddenPath;
  const { hiddenSymbolSize: sz, nodeLabel, nodeLabelAngle, nodeLabelPadding } = opts;
  const input = use === "input";
  const { x, y, width: w, height: h } = box;

  // Box coordinates are relative to the node, so lift them into the diagram.
  const ox = nodeBox.x;
  const oy = nodeBox.y;

  /** @type {[number, number][][]} */
  const rules = horizontal
    ? [
        [[ox + x, oy + y], [ox + x + w, oy + y]],
        [[ox + x, oy + y + h], [ox + x + w, oy + y + h]]
      ]
    : [
        [[ox + x, oy + y], [ox + x, oy + y + h]],
        [[ox + x + w, oy + y], [ox + x + w, oy + y + h]]
      ];

  // An equilateral triangle pointing away from the node.
  const a = sz / 2;
  const b = (sz * Math.sqrt(3)) / 2;
  const [tx, ty] = horizontal
    ? input
      ? [ox - b, oy + y + h / 2]
      : [ox + w, oy + y + h / 2]
    : input
      ? [ox + x + w / 2, oy - b]
      : [ox + x + w / 2, oy + h];

  /** @type {[number, number][]} */
  const triangle = horizontal
    ? [
        [tx, ty - a],
        [tx + b, ty],
        [tx, ty + a]
      ]
    : [
        [tx + a, ty],
        [tx, ty + b],
        [tx - a, ty]
      ];

  const pos = /** @type {LabelPos} */ (
    input && horizontal
      ? "left"
      : !input && horizontal
        ? "right"
        : input
          ? "top"
          : "bottom"
  );
  const { anchor, baseline, dx, dy } = labelAlignment(
    pos,
    nodeLabelAngle,
    pos === "right" ? b : 0,
    pos === "bottom" ? b : 0,
    nodeLabelPadding
  );

  return {
    sourceKey: sourceNode.key,
    targetKey: targetNode.key,
    use: input ? "input" : "output",
    value: link.value,
    rules,
    triangle,
    label: {
      text: nodeLabel(input ? sourceNode : targetNode),
      x: tx + dx,
      y: ty + dy,
      anchor,
      baseline,
      angle: nodeLabelAngle
    }
  };
}
