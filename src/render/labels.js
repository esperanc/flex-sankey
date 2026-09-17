/**
 * Label placement geometry.
 *
 * Pure geometry: where a label sits relative to its box and how it should be
 * anchored. Typography and colour are styling, and belong to the theme.
 *
 * @module render/labels
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * Where a label sits relative to its node.
 *
 * `left-right` and `top-bottom` are adaptive: the label is placed on whichever
 * side keeps it inside the diagram.
 *
 * @typedef {"left" | "right" | "top" | "bottom" | "center" | "left-right" | "top-bottom"} LabelPos
 */

/**
 * @typedef {object} LabelPlacement
 * @property {string} anchor SVG `text-anchor`.
 * @property {string} baseline SVG `dominant-baseline`.
 * @property {number} dx Offset from the box origin.
 * @property {number} dy
 */

/**
 * Resolves a label's offset and anchoring.
 *
 * When the label is rotated, the anchor and baseline swap roles so that the
 * text still reads as running away from the node rather than through it.
 *
 * @param {LabelPos} pos Must already be resolved to a concrete side.
 * @param {number} angle Rotation in degrees.
 * @param {number} width Box width.
 * @param {number} height Box height.
 * @param {number} padding Gap between box and label.
 * @returns {LabelPlacement}
 */
export function labelAlignment(pos, angle, width, height, padding) {
  if (pos === "left") {
    return {
      dx: -padding,
      dy: height / 2,
      ...(angle < 0
        ? { anchor: "middle", baseline: "alphabetic" }
        : angle > 0
          ? { anchor: "middle", baseline: "hanging" }
          : { anchor: "end", baseline: "central" })
    };
  }
  if (pos === "right") {
    return {
      dx: width + padding,
      dy: height / 2,
      ...(angle < 0
        ? { anchor: "middle", baseline: "hanging" }
        : angle > 0
          ? { anchor: "middle", baseline: "alphabetic" }
          : { anchor: "start", baseline: "central" })
    };
  }
  if (pos === "top") {
    return {
      dx: width / 2,
      dy: -padding,
      ...(angle < 0
        ? { anchor: "start", baseline: "central" }
        : angle > 0
          ? { anchor: "end", baseline: "central" }
          : { anchor: "middle", baseline: "alphabetic" })
    };
  }
  if (pos === "bottom") {
    return {
      dx: width / 2,
      dy: height + padding,
      ...(angle < 0
        ? { anchor: "end", baseline: "central" }
        : angle > 0
          ? { anchor: "start", baseline: "central" }
          : { anchor: "middle", baseline: "hanging" })
    };
  }
  return { dx: width / 2, dy: height / 2, anchor: "middle", baseline: "central" };
}

/**
 * Resolves an adaptive label position against the diagram extent.
 *
 * @param {LabelPos | ((box: any, node: any) => LabelPos)} pos
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {any} node
 * @param {number} width Diagram width.
 * @param {number} height Diagram height.
 * @returns {LabelPos} One of the concrete sides.
 */
export function resolveLabelPos(pos, box, node, width, height) {
  if (typeof pos === "function") return pos(box, node);
  if (pos === "left-right") {
    return box.x + box.width / 2 < width / 2 ? "right" : "left";
  }
  if (pos === "top-bottom") {
    return box.y + box.height / 2 < height / 2 ? "bottom" : "top";
  }
  return pos;
}
