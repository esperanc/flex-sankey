/**
 * Minimal 2D vector helpers.
 *
 * The Observable notebooks this library is derived from depended on
 * `@esperanc/vec2-utils`, which wrapped gl-matrix's `vec2` and added a few
 * predicates. Only nine of those functions were ever used by the Sankey code,
 * so they are reproduced here to keep the package dependency-free.
 *
 * Semantics deliberately match gl-matrix 3.x exactly — including the
 * out-parameter calling convention and `normalize`'s behaviour on the zero
 * vector — so that geometry computed here is numerically identical to the
 * geometry produced by the original notebooks.
 *
 * @module internal/vec2
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * A 2D vector or point, as a two-element array.
 * @typedef {[number, number] | number[]} Vec2
 */

/**
 * Adds two vectors: `out = a + b`.
 * @param {number[]} out Receives the result. May alias `a` or `b`.
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number[]} `out`
 */
export function add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  return out;
}

/**
 * Subtracts two vectors: `out = a - b`.
 * @param {number[]} out Receives the result. May alias `a` or `b`.
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number[]} `out`
 */
export function sub(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  return out;
}

/**
 * Scales a vector by a scalar: `out = a * k`.
 * @param {number[]} out Receives the result. May alias `a`.
 * @param {Vec2} a
 * @param {number} k
 * @returns {number[]} `out`
 */
export function scale(out, a, k) {
  out[0] = a[0] * k;
  out[1] = a[1] * k;
  return out;
}

/**
 * Euclidean length of a vector.
 * @param {Vec2} a
 * @returns {number}
 */
export function len(a) {
  return Math.hypot(a[0], a[1]);
}

/**
 * Euclidean distance between two points.
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number}
 */
export function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Dot product.
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number}
 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * Normalizes a vector to unit length: `out = a / |a|`.
 *
 * Matches gl-matrix: the zero vector normalizes to `[0, 0]` rather than
 * producing `NaN`. Callers in this library rely on that.
 *
 * @param {number[]} out Receives the result. May alias `a`.
 * @param {Vec2} a
 * @returns {number[]} `out`
 */
export function normalize(out, a) {
  const x = a[0];
  const y = a[1];
  let l = x * x + y * y;
  if (l > 0) l = 1 / Math.sqrt(l);
  out[0] = x * l;
  out[1] = y * l;
  return out;
}

/**
 * Rotates point `a` around origin `origin` by `rad` radians.
 *
 * In SVG's coordinate system (y increasing downwards) a positive angle is a
 * clockwise rotation on screen.
 *
 * @param {number[]} out Receives the result. May alias `a`.
 * @param {Vec2} a Point to rotate.
 * @param {Vec2} origin Centre of rotation.
 * @param {number} rad Angle in radians.
 * @returns {number[]} `out`
 */
export function rotate(out, a, origin, rad) {
  const p0 = a[0] - origin[0];
  const p1 = a[1] - origin[1];
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  out[0] = p0 * c - p1 * s + origin[0];
  out[1] = p0 * s + p1 * c + origin[1];
  return out;
}

/**
 * Orientation of the ordered triple `(a, b, c)`.
 *
 * Returns the sign of the cross product `(b - a) x (c - a)`:
 * `+1`, `0` or `-1`. In SVG coordinates `+1` means `c` lies clockwise of
 * `a -> b` on screen.
 *
 * @param {Vec2} a
 * @param {Vec2} b
 * @param {Vec2} c
 * @returns {number} `-1`, `0` or `1`
 */
export function orient(a, b, c) {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

/**
 * Rotates a vector 90 degrees clockwise in SVG coordinates: `[y, -x]`.
 *
 * This idiom appears throughout the path construction; naming it makes the
 * geometry easier to follow than the inline literal.
 *
 * @param {Vec2} a
 * @returns {[number, number]}
 */
export function perp(a) {
  return [a[1], -a[0]];
}
