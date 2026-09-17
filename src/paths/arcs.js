/**
 * Baseline circular-arc Sankey path construction.
 *
 * A ribbon is stitched together from two circular arcs — one leaving the
 * source, one entering the target — joined by the internal tangent common to
 * the two circles. This is the geometry used by `d3-sankey-diagram`, retained
 * here as a comparison baseline. Its advantage is that a constant-breadth
 * ribbon follows from adjusting the radii; its drawback is that long links
 * require a straight interpolating segment and tight node spacing forces small
 * radii.
 *
 * These return a **centre line**, to be stroked with `stroke-width` equal to
 * the ribbon breadth.
 *
 * @module paths/arcs
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/** Smallest arc radius, in pixels, used before the layout is consulted. */
const R_MIN = 5;

/**
 * A point on a circle where a tangent touches.
 * @typedef {{ x: number, y: number }} TangentPoint
 */

/**
 * A node's extent, in the coordinate system of the diagram.
 * @typedef {object} ArcNode
 * @property {number} x Left edge.
 * @property {number} y Top edge.
 * @property {number} size Extent across the flow direction.
 * @property {number} nodeWidth Extent along the flow direction.
 */

/**
 * Computes the internal (crossing) tangents common to two circles.
 *
 * Internal tangents exist only when the circles are separated, that is when
 * the distance between centres is at least the sum of the radii.
 *
 * @param {number} x1 Centre x of the first circle.
 * @param {number} y1 Centre y of the first circle.
 * @param {number} r1 Radius of the first circle.
 * @param {number} x2 Centre x of the second circle.
 * @param {number} y2 Centre y of the second circle.
 * @param {number} r2 Radius of the second circle.
 * @returns {[TangentPoint, TangentPoint][] | null} The two tangents, each as
 *   its pair of touch points, or `null` if none exist.
 */
export function circleInternalTangents(x1, y1, r1, x2, y2, r2) {
  const dSq = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  if (dSq === 0) return null; // Concentric circles share no tangent.
  const d = Math.sqrt(dSq);

  const angle = Math.atan2(y2 - y1, x2 - x1);

  /** @type {[TangentPoint, TangentPoint][]} */
  const tangents = [];

  if (d >= r1 + r2) {
    const beta = Math.acos((r1 + r2) / d);
    for (const s of [1, -1]) {
      const a1 = angle + s * beta;
      const a2 = a1 + Math.PI;
      tangents.push([
        { x: x1 + r1 * Math.cos(a1), y: y1 + r1 * Math.sin(a1) },
        { x: x2 + r2 * Math.cos(a2), y: y2 + r2 * Math.sin(a2) }
      ]);
    }
  }

  return tangents.length > 0 ? tangents : null;
}

/**
 * @typedef {object} HorizontalArcSpec
 * @property {ArcNode} source
 * @property {ArcNode} target
 * @property {number} y0 Ribbon centre y where it leaves the source.
 * @property {number} y1 Ribbon centre y where it meets the target.
 * @property {number} size Ribbon breadth in pixels.
 */

/**
 * Centre line for a left-to-right ribbon built from two arcs.
 *
 * @param {HorizontalArcSpec} spec
 * @param {number} [bias=1] Controls the arc radii. Values below `1` shrink the
 *   arcs, straightening the ribbon.
 * @returns {string} An SVG path `d` attribute value, to be stroked.
 */
export function horizontalCirclePath({ source, target, y0, y1, size }, bias = 1) {
  const x0 = source.x + source.nodeWidth;
  const x1 = target.x;

  const A = `${x0} ${y0}`;
  const D = `${x1} ${y1}`;

  // Endpoints level across the flow: a straight segment is exact.
  if (Math.abs(y0 - y1) < 0.5) return `M ${A} L ${D}`;

  const dtop = Math.min(y0 - source.y, y1 - target.y);
  const dbot = Math.min(source.y + source.size - y0, target.y + target.size - y1);

  // `descending` is true when the ribbon runs downward on screen.
  const descending = y1 > y0;
  const s = descending ? 1 : -1;

  let r0 = Math.max(R_MIN, descending ? dbot : dtop);
  let r1 = Math.max(R_MIN, descending ? dtop : dbot);

  let slack = x1 - x0 - (r0 + r1);
  if (slack > 0) slack *= Math.min(bias, 1);
  r0 = Math.max(size / 2, r0 + slack / 2);
  r1 = Math.max(size / 2, r1 + slack / 2);

  const cy0 = y0 + s * r0;
  const cy1 = y1 - s * r1;

  if (Math.hypot(x1 - x0, cy1 - cy0) > r0 + r1) {
    const tangents = circleInternalTangents(x0, cy0, r0, x1, cy1, r1);
    if (tangents) {
      // Of the two internal tangents, take the one that keeps the ribbon on
      // the near side of the centre line.
      const tg = descending
        ? tangents[0][0].y < tangents[1][0].y
          ? tangents[0]
          : tangents[1]
        : tangents[0][0].y > tangents[1][0].y
          ? tangents[0]
          : tangents[1];
      const [p, q] = tg;
      const B = `${p.x} ${p.y}`;
      const C = `${q.x} ${q.y}`;
      const [sweep0, sweep1] = descending ? [1, 0] : [0, 1];
      return `M ${A} A ${r0} ${r0} 0 0 ${sweep0} ${B} L ${C} A ${r1} ${r1} 0 0 ${sweep1} ${D}`;
    }
  }

  // Fallback: the circles interpenetrate, so no internal tangent exists.
  return `M ${A} C ${x0 + size / 2} ${y0} ${x1 - size / 2} ${y1} ${D}`;
}

/**
 * @typedef {object} VerticalArcSpec
 * @property {ArcNode} source
 * @property {ArcNode} target
 * @property {number} x0 Ribbon centre x where it leaves the source.
 * @property {number} x1 Ribbon centre x where it meets the target.
 * @property {number} size Ribbon breadth in pixels.
 */

/**
 * Centre line for a top-to-bottom ribbon built from two arcs.
 *
 * Note on a fixed defect: the original notebook tested `|y0 - y1| < 0.5` here,
 * copied from the horizontal case. In a vertical diagram y is the *along-flow*
 * coordinate, so that test asked whether the two layers coincide rather than
 * whether the ribbon is straight. A straight vertical ribbon therefore fell
 * through to the arc branch and was drawn with a spurious pair of arcs. The
 * test now uses the across-flow coordinate, `|x0 - x1|`, matching the intent of
 * the horizontal case. This changes measured overlap and length for the
 * arc baseline in vertical diagrams.
 *
 * @param {VerticalArcSpec} spec
 * @param {number} [bias=1] Controls the arc radii.
 * @returns {string} An SVG path `d` attribute value, to be stroked.
 */
export function verticalCirclePath({ source, target, x0, x1, size }, bias = 1) {
  const y0 = source.y + source.nodeWidth;
  const y1 = target.y;

  const A = `${x0} ${y0}`;
  const D = `${x1} ${y1}`;

  // Endpoints level across the flow: a straight segment is exact.
  if (Math.abs(x0 - x1) < 0.5) return `M ${A} L ${D}`;

  const dleft = Math.min(x0 - source.x, x1 - target.x);
  const dright = Math.min(source.x + source.size - x0, target.x + target.size - x1);

  // `rightward` is true when the ribbon runs to the right on screen.
  const rightward = x1 > x0;
  const s = rightward ? 1 : -1;

  let r0 = Math.max(R_MIN, rightward ? dright : dleft);
  let r1 = Math.max(R_MIN, rightward ? dleft : dright);

  let slack = y1 - y0 - (r0 + r1);
  if (slack > 0) slack *= Math.min(bias, 1);
  r0 = Math.max(size / 2, r0 + slack / 2);
  r1 = Math.max(size / 2, r1 + slack / 2);

  const cx0 = x0 + s * r0;
  const cx1 = x1 - s * r1;

  if (Math.hypot(cx1 - cx0, y1 - y0) > r0 + r1) {
    const tangents = circleInternalTangents(cx0, y0, r0, cx1, y1, r1);
    if (tangents) {
      const tg = rightward
        ? tangents[0][0].x < tangents[1][0].x
          ? tangents[0]
          : tangents[1]
        : tangents[0][0].x > tangents[1][0].x
          ? tangents[0]
          : tangents[1];
      const [p, q] = tg;
      const B = `${p.x} ${p.y}`;
      const C = `${q.x} ${q.y}`;
      const [sweep0, sweep1] = rightward ? [0, 1] : [1, 0];
      return `M ${A} A ${r0} ${r0} 0 0 ${sweep0} ${B} L ${C} A ${r1} ${r1} 0 0 ${sweep1} ${D}`;
    }
  }

  // Fallback: the circles interpenetrate, so no internal tangent exists.
  return `M ${A} C ${x0} ${y0 + size / 2} ${x1} ${y1 - size / 2} ${D}`;
}
