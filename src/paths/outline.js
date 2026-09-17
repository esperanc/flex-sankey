/**
 * Improved ("outline") Sankey path construction.
 *
 * A Sankey link is drawn as a ribbon of constant breadth. The usual approach
 * dilates a single cubic Bézier centre line, but the offset of a Bézier is not
 * itself a Bézier, so dilated ribbons distort badly when two nodes are close
 * along the flow direction and far apart across it, and parallel ribbons
 * between the same pair of nodes overlap.
 *
 * This module instead builds the ribbon from **two independent cubic Béziers**,
 * one per side, whose interior control points are derived from a *reference
 * line* joining the two nodes. Writing `size` for the ribbon breadth, the two
 * sides are generated at signed offsets `-size/2` and `+size/2`.
 *
 * The reference line is the crux. Anchoring it at the ribbon's own endpoints
 * (`ap = a`, `bp = b`) is simple but lets parallel ribbons overlap. Anchoring
 * it at the *centres of the source and target nodes* — pass the node centres as
 * `ap` and `bp` — makes adjacent parallel ribbons share their boundary curve
 * exactly, so they can never overlap. See `test/outline.test.js`, which pins
 * that property down as an executable claim.
 *
 * Steeply slanted reference lines distort the ribbon, so the angle between the
 * reference line and the flow direction is clamped to `maxAngle` degrees.
 *
 * @module paths/outline
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import * as vec2 from "../internal/vec2.js";

/**
 * @typedef {[number, number] | number[]} Point
 */

/**
 * A cubic Bézier as its four control points.
 * @typedef {[number[], number[], number[], number[]]} CubicBezier
 */

/**
 * @typedef {object} OutlineSpec
 * @property {Point} a Centre of the ribbon where it meets the source node.
 * @property {Point} b Centre of the ribbon where it meets the target node.
 * @property {Point} at Tangent vector at `a`, pointing into the ribbon. Its
 *   length sets how far the first interior control point sits from `a`, and so
 *   controls curviness (the `bias` parameter scales it).
 * @property {Point} bt Tangent vector at `b`, pointing into the ribbon.
 * @property {Point} [ap] Reference-line anchor at the source end. Defaults to
 *   `a`. Pass the source node's centre to guarantee parallel ribbons do not
 *   overlap.
 * @property {Point} [bp] Reference-line anchor at the target end. Defaults to
 *   `b`.
 * @property {number} size Ribbon breadth in pixels.
 * @property {number} [limit=0.1] Lower bound on the tangent scale factor.
 *   Prevents interior control points from collapsing onto the endpoints when
 *   the geometry is extreme.
 * @property {number} [maxAngle=30] Maximum angle, in degrees, between the
 *   reference line and the flow direction. `0` yields pinched but provably
 *   non-overlapping ribbons.
 */

/**
 * Computes the two cubic Béziers bounding a ribbon.
 *
 * @param {OutlineSpec} spec
 * @returns {CubicBezier[]} Exactly two curves: the side at offset `-size/2`
 *   followed by the side at offset `+size/2`. Both run from the source end to
 *   the target end.
 */
export function outlinePathPoints({
  a,
  b,
  at,
  bt,
  ap,
  bp,
  size,
  limit = 0.1,
  maxAngle = 30
}) {
  const maxAngleRad = (maxAngle * Math.PI) / 180;

  // Tangent lengths, used to normalise the offset correction below.
  const atlen = vec2.len(at);
  const btlen = vec2.len(bt);

  // Overall flow direction.
  const dir = vec2.normalize([], vec2.sub([], at, bt));

  // Unit normals to each tangent (90 degrees clockwise in SVG coordinates).
  const an = vec2.normalize([], vec2.perp(at));
  const bn = vec2.normalize([], vec2.perp(bt));

  // Reference-line anchors default to the ribbon's own endpoints.
  ap = ap || a;
  bp = bp || b;

  // Signed offsets of the anchors from the ribbon centre, measured along the
  // node normals.
  const apd = vec2.dist(a, ap) * (vec2.dot(an, vec2.sub([], ap, a)) > 0 ? 1 : -1);
  const bpd = vec2.dist(b, bp) * (vec2.dot(bn, vec2.sub([], bp, b)) > 0 ? 1 : -1);

  // Reference direction, clamped so it never slants more than maxAngle away
  // from the flow direction.
  let u = vec2.normalize([], vec2.sub([], bp, ap));
  // Two guards, both behaviour preserving for non-degenerate input:
  //
  // - `dir` is the zero vector when the two tangents coincide, leaving the
  //   flow direction undefined and the clamp meaningless. Skip it.
  // - floating point can push the dot product just outside [-1, 1], where
  //   Math.acos returns NaN. A dot product of ~1 means an angle of ~0, which
  //   never triggers the clamp, so clamping the input changes no outcome.
  if (vec2.len(dir) > 0) {
    const ang = Math.acos(Math.min(1, Math.max(-1, vec2.dot(u, dir))));
    if (Math.abs(ang) > maxAngleRad) {
      const sign = vec2.orient([0, 0], dir, u) > 0 ? 1 : -1;
      u = vec2.rotate([], dir, [0, 0], sign * maxAngleRad);
    }
  }
  const v = vec2.perp(u);

  /**
   * Scales a tangent so the two sides of the ribbon stay a constant distance
   * apart as it leans over.
   *
   * A zero-length tangent carries no direction to scale, so the control point
   * collapses onto its endpoint and that end of the ribbon becomes straight.
   * Computing the factor would divide by zero — which is reachable whenever
   * the two nodes coincide along the flow direction, and for `bias = 0`.
   *
   * @param {Point} t Tangent to scale.
   * @param {number} tlen Its length.
   * @param {number} offset Signed offset of this side from the ribbon centre.
   * @returns {number[]} The scaled tangent.
   */
  const scaleTangent = (t, tlen, offset) =>
    tlen === 0
      ? [0, 0]
      : vec2.scale(
          [],
          t,
          Math.max(limit, 1 + (vec2.dot(t, v) * offset) / tlen / tlen)
        );

  const curves = /** @type {CubicBezier[]} */ ([]);
  for (const d of [-size / 2, size / 2]) {
    const atp = scaleTangent(at, atlen, d - apd);
    const btp = scaleTangent(bt, btlen, d + bpd);
    const p0 = vec2.add([], a, vec2.scale([], an, d));
    const p1 = vec2.add([], p0, atp);
    const p3 = vec2.add([], b, vec2.scale([], bn, -d));
    const p2 = vec2.add([], p3, btp);
    curves.push([p0, p1, p2, p3]);
  }
  return curves;
}

/**
 * Builds a closed SVG path string for a ribbon.
 *
 * The result is a filled outline (not a stroked centre line): down one side,
 * across the target end, back up the other side, closed.
 *
 * @param {OutlineSpec} spec
 * @returns {string} An SVG path `d` attribute value.
 */
export function outlinePath(spec) {
  const [[a, b, c, d], [e, f, g, h]] = outlinePathPoints(spec);
  return `M ${a} C ${b} ${c} ${d} L ${h} C ${g} ${f} ${e} Z`;
}

/**
 * @typedef {object} HorizontalOutlineSpec
 * @property {Point} source Ribbon centre where it leaves the source node.
 * @property {Point} target Ribbon centre where it meets the target node.
 * @property {number|null} [trueSourceY] y coordinate of the source node's
 *   centre. Supply it when this ribbon is one of several leaving the same node,
 *   to prevent parallel ribbons from overlapping. Defaults to `source[1]`.
 * @property {number|null} [trueTargetY] y coordinate of the target node's
 *   centre. Defaults to `target[1]`.
 * @property {number} [size=5] Ribbon breadth in pixels.
 * @property {number} [bias=1] Curviness. `1` places interior control points at
 *   the midpoint between the nodes; smaller values straighten the ribbon.
 * @property {number} [limit=0.1] Lower bound on the tangent scale factor.
 * @property {number} [maxAngle=30] Reference-line angle limit, in degrees.
 */

/**
 * Convenience wrapper for a left-to-right (horizontal) diagram.
 *
 * Endpoints are swapped if given in reverse order, so the caller need not sort
 * them.
 *
 * @param {HorizontalOutlineSpec} spec
 * @returns {string} An SVG path `d` attribute value.
 */
export function outlineHorizontalPath({
  source,
  target,
  trueSourceY = null,
  trueTargetY = null,
  size = 5,
  bias = 1,
  limit = 0.1,
  maxAngle = 30
}) {
  if (trueSourceY === null) trueSourceY = source[1];
  if (trueTargetY === null) trueTargetY = target[1];
  if (source[0] > target[0]) {
    [source, target] = [target, source];
    [trueSourceY, trueTargetY] = [trueTargetY, trueSourceY];
  }
  const d = ((target[0] - source[0]) / 2) * bias;
  return outlinePath({
    a: source,
    b: target,
    at: [d, 0],
    bt: [-d, 0],
    ap: [source[0], trueSourceY],
    bp: [target[0], trueTargetY],
    size,
    limit,
    maxAngle
  });
}

/**
 * @typedef {object} VerticalOutlineSpec
 * @property {Point} source Ribbon centre where it leaves the source node.
 * @property {Point} target Ribbon centre where it meets the target node.
 * @property {number|null} [trueSourceX] x coordinate of the source node's
 *   centre. Defaults to `source[0]`.
 * @property {number|null} [trueTargetX] x coordinate of the target node's
 *   centre. Defaults to `target[0]`.
 * @property {number} [size=5] Ribbon breadth in pixels.
 * @property {number} [bias=1] Curviness.
 * @property {number} [limit=0.1] Lower bound on the tangent scale factor.
 * @property {number} [maxAngle=30] Reference-line angle limit, in degrees.
 */

/**
 * Convenience wrapper for a top-to-bottom (vertical) diagram.
 *
 * @param {VerticalOutlineSpec} spec
 * @returns {string} An SVG path `d` attribute value.
 */
export function outlineVerticalPath({
  source,
  target,
  trueSourceX = null,
  trueTargetX = null,
  size = 5,
  bias = 1,
  limit = 0.1,
  maxAngle = 30
}) {
  if (trueSourceX === null) trueSourceX = source[0];
  if (trueTargetX === null) trueTargetX = target[0];
  if (source[1] > target[1]) {
    [source, target] = [target, source];
    [trueSourceX, trueTargetX] = [trueTargetX, trueSourceX];
  }
  const d = ((target[1] - source[1]) / 2) * bias;
  return outlinePath({
    a: source,
    b: target,
    at: [0, d],
    bt: [0, -d],
    ap: [trueSourceX, source[1]],
    bp: [trueTargetX, target[1]],
    size,
    limit,
    maxAngle
  });
}
