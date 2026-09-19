/**
 * Extracting measurable shapes from a diagram.
 *
 * Measurement needs two things per link: the closed polygons it covers, for
 * overlap, and its centre line, for crossings and length. This module produces
 * both — either from this library's own scene geometry, or from another
 * library's rendered SVG — so that the same measurement code applies to all of
 * them.
 *
 * @module metrics/shapes
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { flattenCubic, resampleByLength } from "./flatten.js";
import { parsePath } from "./svg-path.js";

/** @typedef {import("./flatten.js").Point} Point */

/**
 * @typedef {object} DiagramShapes
 * @property {Point[][][]} polygons Per link, the closed polygons it covers.
 * @property {Point[][]} centrelines The drawn centre lines. A link normally
 *   contributes one, but contributes several where its route is interrupted —
 *   see `centrelineOwner`.
 * @property {number[]} centrelineOwner The index of the link each centre line
 *   belongs to. Two centre lines of the same link are not counted as crossing
 *   each other.
 */

/**
 * Narrows a plain number array to a point.
 * @param {number[]} p
 * @returns {Point}
 */
const pt = (p) => [p[0], p[1]];

/** How close two points must be to count as the same point, in pixels. */
const JOIN_TOLERANCE = 0.5;

/**
 * Appends a hop's centre line to a link's route.
 *
 * Consecutive hops usually meet, and are joined into one polyline. They do not
 * meet at a totalizing node: a link enters at its incoming offset and leaves at
 * its outgoing offset, which are different points on that node. Joining them
 * anyway would draw a straight leap across the node's interior that no reader
 * ever sees — the node is painted opaque over it — and those leaps would
 * register as crossings with every other link passing through the same node.
 * So the route is broken instead, and the pieces stay owned by the same link.
 *
 * @param {Point[][]} route Polylines accumulated for this link so far.
 * @param {Point[]} hop The next hop's centre line.
 */
function appendHop(route, hop) {
  if (hop.length === 0) return;
  const current = route[route.length - 1];
  if (current && current.length) {
    const end = current[current.length - 1];
    const start = hop[0];
    if (Math.hypot(start[0] - end[0], start[1] - end[1]) <= JOIN_TOLERANCE) {
      current.push(...hop.slice(1));
      return;
    }
  }
  route.push(hop.slice());
}

/**
 * Averages two polylines, giving the line midway between them.
 *
 * Both are reparameterized by arc length first, so points are paired with the
 * point genuinely opposite them rather than with whichever happened to share
 * an index. The two sides of a ribbon are rarely sampled alike: an arc-based
 * ribbon has a different radius on each side, and a Bézier one a different
 * control-polygon length, so both flatten to different point counts.
 *
 * @param {Point[]} a
 * @param {Point[]} b
 * @returns {Point[]}
 */
function midline(a, b) {
  if (a.length < 2 || b.length < 2) return [];
  const n = Math.max(a.length, b.length);
  const ra = resampleByLength(a, n);
  const rb = resampleByLength(b, n);
  /** @type {Point[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([(ra[i][0] + rb[i][0]) / 2, (ra[i][1] + rb[i][1]) / 2]);
  }
  return out;
}

/**
 * Splits a closed ribbon outline into its two long sides.
 *
 * A ribbon outline is a loop of four parts: one long side, a short cap across
 * the ribbon's breadth, the other long side, and a second cap closing back to
 * the start. Recovering the centre line means averaging the two *sides* — the
 * caps must be excluded, or the ends of the recovered line are pulled out to
 * the ribbon's edge by half its breadth.
 *
 * The far cap is located near the vertex farthest from the start. Which of the
 * two vertices there begins the cap is settled by trying both and keeping the
 * split whose sides come out closest in length, since a ribbon's two sides are
 * nearly equal and a mis-split shifts one cap's worth of length from one to
 * the other.
 *
 * @param {Point[]} outline
 * @returns {[Point[], Point[]]} The two sides, both running from the same end.
 */
function splitOutline(outline) {
  // Drop a duplicated closing point, if present.
  const pts = outline.slice();
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 2 && first[0] === last[0] && first[1] === last[1]) pts.pop();
  const n = pts.length;
  if (n < 4) return [pts, []];

  let far = 1;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i][0] - first[0]) ** 2 + (pts[i][1] - first[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }

  /**
   * @param {number} k Last index of the first side.
   * @returns {[Point[], Point[]]}
   */
  const split = (k) => [pts.slice(0, k + 1), pts.slice(k + 1).reverse()];

  /** @param {Point[]} side */
  const lengthOf = (side) => {
    let total = 0;
    for (let i = 1; i < side.length; i++) {
      total += Math.hypot(side[i][0] - side[i - 1][0], side[i][1] - side[i - 1][1]);
    }
    return total;
  };

  /** @type {[Point[], Point[]]} */
  let bestSplit = split(far);
  let bestSkew = Infinity;
  for (const k of [far - 1, far]) {
    if (k < 1 || k > n - 2) continue;
    const candidate = split(k);
    const skew = Math.abs(lengthOf(candidate[0]) - lengthOf(candidate[1]));
    if (skew < bestSkew) {
      bestSkew = skew;
      bestSplit = candidate;
    }
  }
  return bestSplit;
}

/**
 * Extracts shapes from this library's scene geometry.
 *
 * The scene carries each ribbon's Bézier control points, so nothing has to be
 * parsed back out of a path string. The curves are flattened at the same
 * tolerance used for foreign SVG, so the comparison stays like for like.
 *
 * @param {import("../render/scene.js").Scene} scene
 * @param {number} [tolerance=0.25]
 * @returns {DiagramShapes}
 */
export function shapesFromScene(scene, tolerance = 0.25) {
  /** @type {Point[][][]} */
  const polygons = [];
  /** @type {Point[][]} */
  const centrelines = [];
  /** @type {number[]} */
  const centrelineOwner = [];

  scene.links.forEach((link, index) => {
    /** @type {Point[][]} */
    const linkPolygons = [];
    /** @type {Point[][]} */
    const route = [];

    for (const [lo, hi] of link.curves) {
      // Control points arrive as plain number arrays; narrow them to points.
      const [l0, l1, l2, l3] = lo.map(pt);
      const [h0, h1, h2, h3] = hi.map(pt);
      const loPts = [l0, ...flattenCubic(l0, l1, l2, l3, tolerance)];
      const hiPts = [h0, ...flattenCubic(h0, h1, h2, h3, tolerance)];
      // The ribbon outline runs down one side and back up the other.
      linkPolygons.push([...loPts, ...hiPts.slice().reverse()]);
      appendHop(route, midline(loPts, hiPts));
    }

    polygons.push(linkPolygons);
    for (const line of route) {
      centrelines.push(line);
      centrelineOwner.push(index);
    }
  });

  return { polygons, centrelines, centrelineOwner };
}

/**
 * Extracts shapes from rendered SVG produced by another library.
 *
 * @param {string[]} pathData One `d` attribute per link.
 * @param {object} [options]
 * @param {boolean} [options.filled=true] Whether each path is a closed ribbon
 *   outline (as `d3-sankey-diagram` and this library draw them) or a stroked
 *   centre line (as `d3-sankey` does).
 * @param {number} [options.tolerance=0.25]
 * @returns {DiagramShapes}
 */
export function shapesFromPaths(pathData, { filled = true, tolerance = 0.25 } = {}) {
  /** @type {Point[][][]} */
  const polygons = [];
  /** @type {Point[][]} */
  const centrelines = [];
  /** @type {number[]} */
  const centrelineOwner = [];

  for (const d of pathData) {
    const subpaths = parsePath(d, tolerance);
    if (!subpaths.length) continue;

    const index = polygons.length;

    if (!filled) {
      // A stroked path is already its own centre line, and covers no area we
      // can measure without knowing the stroke width.
      polygons.push([]);
      /** @type {Point[][]} */
      const strokeRoute = [];
      for (const sub of subpaths) appendHop(strokeRoute, sub.points);
      for (const line of strokeRoute) {
        centrelines.push(line);
        centrelineOwner.push(index);
      }
      continue;
    }

    /** @type {Point[][]} */
    const linkPolygons = [];
    /** @type {Point[][]} */
    const route = [];
    for (const sub of subpaths) {
      linkPolygons.push(sub.points);
      // A closed ribbon outline runs out along one side and back along the
      // other; averaging the two recovers the centre line.
      const [sideA, sideB] = splitOutline(sub.points);
      appendHop(route, midline(sideA, sideB));
    }
    polygons.push(linkPolygons);
    for (const line of route) {
      centrelines.push(line);
      centrelineOwner.push(index);
    }
  }

  return { polygons, centrelines, centrelineOwner };
}

/**
 * Widens stroked centre lines into ribbons, so a library that strokes its
 * links can still be measured for overlap.
 *
 * @param {Point[][]} centrelines
 * @param {number[]} widths Ribbon breadth, indexed by link.
 * @param {number[]} [owner] The link each centre line belongs to, where a
 *   link contributes more than one.
 * @returns {Point[][][]} One closed polygon per centre line.
 */
export function thickenCentrelines(centrelines, widths, owner) {
  return centrelines.map((line, i) => {
    const half = (widths[owner ? owner[i] : i] ?? 1) / 2;
    if (line.length < 2) return [];
    /** @type {Point[]} */
    const left = [];
    /** @type {Point[]} */
    const right = [];
    for (let j = 0; j < line.length; j++) {
      // Normal from the local tangent, averaged at interior vertices.
      const prev = line[Math.max(0, j - 1)];
      const next = line[Math.min(line.length - 1, j + 1)];
      const tx = next[0] - prev[0];
      const ty = next[1] - prev[1];
      const len = Math.hypot(tx, ty) || 1;
      const nx = (ty / len) * half;
      const ny = (-tx / len) * half;
      left.push([line[j][0] + nx, line[j][1] + ny]);
      right.push([line[j][0] - nx, line[j][1] - ny]);
    }
    return [[...left, ...right.reverse()]];
  });
}
