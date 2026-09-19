/**
 * Counting crossings between ribbon centre lines.
 *
 * A crossing is a proper intersection — the two segments meet at a point
 * interior to both. Touching at a shared endpoint is not a crossing, and
 * neither is a segment meeting another segment of the same link, which happens
 * wherever a link passes through a dummy node.
 *
 * @module metrics/crossings
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/** @typedef {import("./flatten.js").Point} Point */

/** Tolerance for treating two points as coincident, in pixels. */
const EPSILON = 1e-9;

/**
 * @typedef {object} Crossing
 * @property {Point} point Where the two centre lines meet.
 * @property {number} a Index of the first link.
 * @property {number} b Index of the second link.
 */

/**
 * Proper intersection of two segments, or `null`.
 *
 * @param {Point} a
 * @param {Point} b
 * @param {Point} c
 * @param {Point} d
 * @returns {Point|null}
 */
function properIntersection(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < EPSILON) return null; // Parallel or collinear.

  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denom;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denom;

  // Strict inequalities exclude intersections at either segment's endpoints.
  if (t <= EPSILON || t >= 1 - EPSILON) return null;
  if (u <= EPSILON || u >= 1 - EPSILON) return null;

  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/**
 * Counts proper crossings between the centre lines of different links.
 *
 * Uses a sweep over x: segments enter the active set at their left end and
 * leave at their right, so only segments whose x ranges overlap are ever
 * tested against one another.
 *
 * @param {Point[][]} centrelines The drawn centre lines.
 * @param {object} [options]
 * @param {boolean} [options.collect=false] Also return each crossing point,
 *   which is useful for drawing a diagnostic overlay.
 * @param {number[]} [options.owner] The link each centre line belongs to.
 *   Defaults to one link per centre line. Supply it where a link's route is
 *   broken into several pieces — at a totalizing node, for instance — so the
 *   pieces are not counted as crossing one another.
 * @returns {{ crossings: number, points: Crossing[] }}
 */
export function countCrossings(centrelines, { collect = false, owner } = {}) {
  /** @type {{ a: Point, b: Point, link: number, minX: number, maxX: number }[]} */
  const segments = [];
  centrelines.forEach((line, i0) => {
    const link = owner ? owner[i0] : i0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      segments.push({
        a,
        b,
        link,
        minX: Math.min(a[0], b[0]),
        maxX: Math.max(a[0], b[0])
      });
    }
  });

  segments.sort((p, q) => p.minX - q.minX);

  let crossings = 0;
  /** @type {Crossing[]} */
  const points = [];

  /** @type {typeof segments} */
  let active = [];
  for (const seg of segments) {
    // Retire segments that ended before this one begins.
    if (active.length > 32) {
      active = active.filter((other) => other.maxX >= seg.minX);
    }
    for (const other of active) {
      if (other.maxX < seg.minX) continue;
      if (other.link === seg.link) continue; // Same link: not a crossing.
      const p = properIntersection(seg.a, seg.b, other.a, other.b);
      if (p) {
        crossings++;
        if (collect) points.push({ point: p, a: other.link, b: seg.link });
      }
    }
    active.push(seg);
  }

  return { crossings, points };
}
