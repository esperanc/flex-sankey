/**
 * Curve flattening.
 *
 * Every measurement in this package works on polylines, and every curve is
 * flattened by the routines here — whether it came from this library's own
 * geometry or was parsed out of another library's SVG. Using one flattener for
 * both is what makes a cross-library comparison fair: the two differ only in
 * where the curve came from, never in how finely it was sampled.
 *
 * @module metrics/flatten
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/** @typedef {[number, number]} Point */

/**
 * Samples a cubic Bézier at parameter `t`.
 *
 * @param {Point} p0
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @param {number} t
 * @returns {Point}
 */
export function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
  ];
}

/**
 * Samples a quadratic Bézier at parameter `t`.
 *
 * @param {Point} p0
 * @param {Point} p1
 * @param {Point} p2
 * @param {number} t
 * @returns {Point}
 */
export function quadraticAt(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
  ];
}

/**
 * Number of segments to split a curve into, from the length of its control
 * polygon. Longer curves get more segments, within fixed bounds.
 *
 * @param {number} controlLength
 * @param {number} tolerance Approximate maximum deviation, in pixels.
 * @returns {number}
 */
function segmentCount(controlLength, tolerance) {
  return Math.max(4, Math.min(256, Math.ceil(controlLength / Math.max(0.05, tolerance))));
}

/**
 * Flattens a cubic Bézier to a polyline.
 *
 * The start point is omitted, so flattened pieces can be appended one after
 * another without duplicating shared endpoints.
 *
 * @param {Point} p0
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @param {number} [tolerance=0.25]
 * @returns {Point[]} Points after `p0`, ending at `p3`.
 */
export function flattenCubic(p0, p1, p2, p3, tolerance = 0.25) {
  const control =
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
    Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = segmentCount(control, tolerance);
  /** @type {Point[]} */
  const out = [];
  for (let i = 1; i <= n; i++) out.push(cubicAt(p0, p1, p2, p3, i / n));
  return out;
}

/**
 * Flattens a quadratic Bézier to a polyline.
 *
 * @param {Point} p0
 * @param {Point} p1
 * @param {Point} p2
 * @param {number} [tolerance=0.25]
 * @returns {Point[]}
 */
export function flattenQuadratic(p0, p1, p2, tolerance = 0.25) {
  const control =
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = segmentCount(control, tolerance);
  /** @type {Point[]} */
  const out = [];
  for (let i = 1; i <= n; i++) out.push(quadraticAt(p0, p1, p2, i / n));
  return out;
}

/**
 * Flattens an SVG elliptical arc to a polyline.
 *
 * Implements the endpoint-to-centre conversion from the SVG specification.
 * This matters for cross-library comparison: `d3-sankey-diagram` draws its
 * ribbons from circular arcs, and approximating each arc by its chord — as the
 * original analysis did — systematically understates its path length and
 * misplaces its crossings, in that library's disfavour.
 *
 * @param {Point} p0 Current point.
 * @param {number} rx
 * @param {number} ry
 * @param {number} xAxisRotation In degrees.
 * @param {boolean} largeArc
 * @param {boolean} sweep
 * @param {Point} p1 Endpoint.
 * @param {number} [tolerance=0.25]
 * @returns {Point[]} Points after `p0`, ending at `p1`.
 */
export function flattenArc(p0, rx, ry, xAxisRotation, largeArc, sweep, p1, tolerance = 0.25) {
  // Degenerate radii mean a straight line, per the specification.
  if (rx === 0 || ry === 0) return [p1];

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (p0[0] - p1[0]) / 2;
  const dy2 = (p0[1] - p1[1]) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Scale up radii that are too small to span the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (p0[0] + p1[0]) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0[1] + p1[1]) / 2;

  /**
   * @param {number} ux
   * @param {number} uy
   * @param {number} vx
   * @param {number} vy
   */
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const arcLength = Math.abs(delta) * Math.max(rx, ry);
  const n = segmentCount(arcLength, tolerance);

  /** @type {Point[]} */
  const out = [];
  for (let i = 1; i <= n; i++) {
    const theta = theta1 + (delta * i) / n;
    const x = rx * Math.cos(theta);
    const y = ry * Math.sin(theta);
    out.push([cosPhi * x - sinPhi * y + cx, sinPhi * x + cosPhi * y + cy]);
  }
  return out;
}

/**
 * Total length of a polyline.
 *
 * @param {Point[]} points
 * @returns {number}
 */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/**
 * Resamples a polyline to `n` points spaced evenly by arc length.
 *
 * Needed because the two sides of a ribbon are not sampled alike. An
 * arc-based ribbon has a different radius on each side — they differ by the
 * ribbon's breadth — so the outer side flattens to more points than the inner
 * one. Pairing the two by index would then match points that are not opposite
 * each other and skew the centre line. Reparameterizing both by arc length
 * first makes the pairing meaningful.
 *
 * @param {Point[]} points
 * @param {number} n Number of output points; at least 2.
 * @returns {Point[]}
 */
export function resampleByLength(points, n) {
  if (points.length === 0) return [];
  if (points.length === 1 || n < 2) return [points[0]];

  /** @type {number[]} */
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return new Array(n).fill(points[0]);

  /** @type {Point[]} */
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (j < cumulative.length - 2 && cumulative[j + 1] < target) j++;
    const span = cumulative[j + 1] - cumulative[j];
    const t = span > 0 ? (target - cumulative[j]) / span : 0;
    out.push([
      points[j][0] + t * (points[j + 1][0] - points[j][0]),
      points[j][1] + t * (points[j + 1][1] - points[j][1])
    ]);
  }
  return out;
}
