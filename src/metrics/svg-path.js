/**
 * SVG path parsing.
 *
 * Converts a path `d` attribute into flattened subpaths, so diagrams produced
 * by other libraries can be measured by the same code that measures this one's.
 *
 * Supports the full command set — `M L H V C S Q T A Z`, absolute and
 * relative — including the smooth variants `S` and `T`, whose reflected
 * control points are easy to get wrong, and elliptical arcs `A`, which the
 * original analysis reduced to chords.
 *
 * @module metrics/svg-path
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { flattenCubic, flattenQuadratic, flattenArc } from "./flatten.js";

/** @typedef {import("./flatten.js").Point} Point */

/**
 * One subpath: a run of points, and whether it was explicitly closed.
 * @typedef {object} SubPath
 * @property {Point[]} points
 * @property {boolean} closed
 */

/** Matches a command letter followed by its arguments. */
const COMMAND = /([astvzqmhlc])([^astvzqmhlc]*)/gi;

/**
 * Splits a command's argument string into numbers.
 * @param {string} s
 * @returns {number[]}
 */
function args(s) {
  const out = [];
  // Handles "1-2" and "1.5.5" as well as comma and space separation.
  const re = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;
  let m;
  while ((m = re.exec(s))) out.push(parseFloat(m[0]));
  return out;
}

/**
 * Parses a path `d` attribute into flattened subpaths.
 *
 * @param {string} d
 * @param {number} [tolerance=0.25] Flattening tolerance in pixels.
 * @returns {SubPath[]}
 */
export function parsePath(d, tolerance = 0.25) {
  /** @type {SubPath[]} */
  const subpaths = [];
  /** @type {Point[]} */
  let points = [];
  let closed = false;

  /** @type {Point} */
  let cur = [0, 0];
  /** @type {Point} */
  let start = [0, 0];
  // Previous curve control point, reflected by the smooth commands.
  /** @type {Point|null} */
  let lastCubic = null;
  /** @type {Point|null} */
  let lastQuad = null;

  const flush = () => {
    if (points.length > 1) subpaths.push({ points, closed });
    points = [];
    closed = false;
  };

  let m;
  COMMAND.lastIndex = 0;
  while ((m = COMMAND.exec(d))) {
    const code = m[1];
    const upper = code.toUpperCase();
    const rel = code !== upper;
    const a = args(m[2]);
    let i = 0;

    /**
     * @param {number} x
     * @param {number} y
     * @returns {Point}
     */
    const abs = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);

    if (upper === "M") {
      flush();
      cur = abs(a[0], a[1]);
      start = cur;
      points = [cur];
      i = 2;
      // Further pairs after an M are implicit L commands.
      while (i + 1 < a.length) {
        cur = abs(a[i], a[i + 1]);
        points.push(cur);
        i += 2;
      }
      lastCubic = lastQuad = null;
      continue;
    }

    if (points.length === 0) points = [cur];

    switch (upper) {
      case "L":
        while (i + 1 < a.length) {
          cur = abs(a[i], a[i + 1]);
          points.push(cur);
          i += 2;
        }
        lastCubic = lastQuad = null;
        break;

      case "H":
        while (i < a.length) {
          cur = [rel ? cur[0] + a[i] : a[i], cur[1]];
          points.push(cur);
          i++;
        }
        lastCubic = lastQuad = null;
        break;

      case "V":
        while (i < a.length) {
          cur = [cur[0], rel ? cur[1] + a[i] : a[i]];
          points.push(cur);
          i++;
        }
        lastCubic = lastQuad = null;
        break;

      case "C":
        while (i + 5 < a.length) {
          const c1 = abs(a[i], a[i + 1]);
          const c2 = abs(a[i + 2], a[i + 3]);
          const end = abs(a[i + 4], a[i + 5]);
          points.push(...flattenCubic(cur, c1, c2, end, tolerance));
          cur = end;
          lastCubic = c2;
          lastQuad = null;
          i += 6;
        }
        break;

      case "S":
        while (i + 3 < a.length) {
          // The first control point mirrors the previous curve's second one.
          const c1 = /** @type {Point} */ (
            lastCubic ? [2 * cur[0] - lastCubic[0], 2 * cur[1] - lastCubic[1]] : cur
          );
          const c2 = abs(a[i], a[i + 1]);
          const end = abs(a[i + 2], a[i + 3]);
          points.push(...flattenCubic(cur, c1, c2, end, tolerance));
          cur = end;
          lastCubic = c2;
          lastQuad = null;
          i += 4;
        }
        break;

      case "Q":
        while (i + 3 < a.length) {
          const c = abs(a[i], a[i + 1]);
          const end = abs(a[i + 2], a[i + 3]);
          points.push(...flattenQuadratic(cur, c, end, tolerance));
          cur = end;
          lastQuad = c;
          lastCubic = null;
          i += 4;
        }
        break;

      case "T":
        while (i + 1 < a.length) {
          const c = /** @type {Point} */ (
            lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : cur
          );
          const end = abs(a[i], a[i + 1]);
          points.push(...flattenQuadratic(cur, c, end, tolerance));
          cur = end;
          lastQuad = c;
          lastCubic = null;
          i += 2;
        }
        break;

      case "A":
        while (i + 6 < a.length) {
          const end = abs(a[i + 5], a[i + 6]);
          points.push(
            ...flattenArc(
              cur,
              a[i],
              a[i + 1],
              a[i + 2],
              a[i + 3] !== 0,
              a[i + 4] !== 0,
              end,
              tolerance
            )
          );
          cur = end;
          lastCubic = lastQuad = null;
          i += 7;
        }
        break;

      case "Z":
        points.push(start);
        closed = true;
        cur = start;
        flush();
        lastCubic = lastQuad = null;
        break;

      default:
        break;
    }
  }

  flush();
  return subpaths;
}
