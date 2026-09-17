/**
 * Baseline "standard" Sankey path construction: a single cubic Bézier centre
 * line, stroked to the ribbon breadth.
 *
 * This is the geometry used by `d3-sankey` and is retained here as a
 * comparison baseline for the overlap measurements. Because the offset of a
 * cubic Bézier is not itself a Bézier, stroking distorts the ribbon when the
 * endpoints are far apart across the flow direction, and parallel ribbons
 * between the same node pair overlap. See `paths/outline.js` for the improved
 * construction.
 *
 * Unlike the outline construction these return a **centre line**, to be
 * stroked with `stroke-width` equal to the ribbon breadth — not a closed,
 * filled outline.
 *
 * @module paths/standard
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @typedef {object} StandardPathSpec
 * @property {[number, number] | number[]} source Ribbon centre at the source.
 * @property {[number, number] | number[]} target Ribbon centre at the target.
 * @property {number} [bias=1] Curviness. `1` places the interior control
 *   points at the midpoint between the endpoints; `0` gives a straight line.
 */

/**
 * Centre line for a left-to-right (horizontal) ribbon.
 *
 * @param {StandardPathSpec} spec
 * @returns {string} An SVG path `d` attribute value, to be stroked.
 */
export function standardHorizontalPath({ source, target, bias = 1 }) {
  const [x1, y1] = source;
  const [x2, y2] = target;
  const delta = ((x1 + x2) / 2 - x1) * bias;
  return `M${x1},${y1} C${x1 + delta},${y1} ${x2 - delta},${y2} ${x2},${y2}`;
}

/**
 * Centre line for a top-to-bottom (vertical) ribbon.
 *
 * @param {StandardPathSpec} spec
 * @returns {string} An SVG path `d` attribute value, to be stroked.
 */
export function standardVerticalPath({ source, target, bias = 1 }) {
  const [x1, y1] = source;
  const [x2, y2] = target;
  const delta = ((y1 + y2) / 2 - y1) * bias;
  return `M${x1},${y1} C${x1},${y1 + delta} ${x2},${y2 - delta} ${x2},${y2}`;
}
