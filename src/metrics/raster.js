/**
 * Scanline rasterization, for measuring how much ribbons overlap.
 *
 * Ribbons are filled into an integer coverage buffer: each pixel records how
 * many *links* cover it. Counting links rather than painted shapes matters,
 * because one link routed through dummy nodes is drawn as several abutting
 * pieces, and those pieces meeting along a shared edge is not overlap.
 *
 * Deliberately exact rather than anti-aliased. The original measurement
 * rendered at 50% opacity and inferred coverage depth from the composited
 * alpha channel, which is lossy — it cannot distinguish three layers from
 * four — and depends on the browser's compositing and anti-aliasing. Sampling
 * pixel centres with integer counts gives a figure that is exactly
 * reproducible on any machine.
 *
 * @module metrics/raster
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/** @typedef {import("./flatten.js").Point} Point */

/**
 * @typedef {object} CoverageResult
 * @property {Uint16Array} counts Links covering each pixel, row-major.
 * @property {number} width Buffer width in samples.
 * @property {number} height Buffer height in samples.
 * @property {number} scale Samples per pixel along each axis.
 */

/**
 * Fills closed polygons into a coverage buffer, one link at a time.
 *
 * Uses the nonzero winding rule, matching SVG's default `fill-rule`.
 *
 * @param {Point[][][]} links Per link, the closed polygons covering it.
 * @param {object} options
 * @param {number} options.width Diagram width in pixels.
 * @param {number} options.height Diagram height in pixels.
 * @param {number} [options.scale=2] Samples per pixel along each axis.
 *   Supersampling reduces quantization error at the ribbon edges.
 * @returns {CoverageResult}
 */
export function rasterizeCoverage(links, { width, height, scale = 2 }) {
  const w = Math.max(1, Math.ceil(width * scale));
  const h = Math.max(1, Math.ceil(height * scale));
  const counts = new Uint16Array(w * h);
  // Records which link last touched a sample, so a link covering one sample
  // through several of its pieces still counts once.
  const stamp = new Int32Array(w * h).fill(-1);

  /** @type {{x0: number, y0: number, x1: number, y1: number, dir: number}[]} */
  const edges = [];

  for (let li = 0; li < links.length; li++) {
    edges.length = 0;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const polygon of links[li]) {
      const n = polygon.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        const ay = a[1] * scale;
        const by = b[1] * scale;
        if (ay === by) continue; // Horizontal edges never cross a scanline.
        edges.push({
          x0: a[0] * scale,
          y0: ay,
          x1: b[0] * scale,
          y1: by,
          dir: ay < by ? 1 : -1
        });
        minY = Math.min(minY, ay, by);
        maxY = Math.max(maxY, ay, by);
      }
    }
    if (!edges.length) continue;

    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(h - 1, Math.ceil(maxY));

    /** @type {{x: number, dir: number}[]} */
    const hits = [];
    for (let y = yStart; y <= yEnd; y++) {
      const sy = y + 0.5;
      hits.length = 0;
      for (const e of edges) {
        const lo = Math.min(e.y0, e.y1);
        const hi = Math.max(e.y0, e.y1);
        if (sy < lo || sy >= hi) continue;
        const t = (sy - e.y0) / (e.y1 - e.y0);
        hits.push({ x: e.x0 + t * (e.x1 - e.x0), dir: e.dir });
      }
      if (hits.length < 2) continue;
      hits.sort((p, q) => p.x - q.x);

      // Nonzero winding: a span is inside wherever the accumulated direction
      // is not zero.
      let winding = 0;
      for (let i = 0; i < hits.length - 1; i++) {
        winding += hits[i].dir;
        if (winding === 0) continue;
        const xa = Math.max(0, Math.ceil(hits[i].x - 0.5));
        const xb = Math.min(w - 1, Math.floor(hits[i + 1].x - 0.5));
        const row = y * w;
        for (let x = xa; x <= xb; x++) {
          const idx = row + x;
          if (stamp[idx] === li) continue;
          stamp[idx] = li;
          counts[idx]++;
        }
      }
    }
  }

  return { counts, width: w, height: h, scale };
}

/**
 * @typedef {object} OverlapResult
 * @property {number} covered Samples covered by at least one link.
 * @property {number} overlapping Samples covered by more than one link.
 * @property {number} excess Total surplus coverage, the sum of `count - 1`
 *   over every covered sample.
 * @property {number} overlapRatio `overlapping / covered` — the fraction of
 *   the drawing where ribbons obscure one another.
 * @property {number} excessRatio `excess / covered` — the same thing weighted
 *   by depth, so a threefold pileup counts more than a twofold one.
 * @property {number} maxDepth Greatest number of links over a single sample.
 */

/**
 * Reduces a coverage buffer to overlap statistics.
 *
 * Two ratios are reported because the paper's phrasing admits both readings.
 * `overlapRatio` answers "what fraction of the inked area is ambiguous?";
 * `excessRatio` answers "how much ink is piled up?". They agree when overlaps
 * are shallow and diverge when they are deep.
 *
 * @param {CoverageResult} coverage
 * @returns {OverlapResult}
 */
export function overlapStatistics({ counts }) {
  let covered = 0;
  let overlapping = 0;
  let excess = 0;
  let maxDepth = 0;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i];
    if (c === 0) continue;
    covered++;
    if (c > 1) {
      overlapping++;
      excess += c - 1;
    }
    if (c > maxDepth) maxDepth = c;
  }
  return {
    covered,
    overlapping,
    excess,
    overlapRatio: covered ? overlapping / covered : 0,
    excessRatio: covered ? excess / covered : 0,
    maxDepth
  };
}
