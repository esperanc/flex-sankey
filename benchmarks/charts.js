/**
 * Renders the benchmark results as grouped bar charts.
 *
 * One chart per metric per suite, one group of bars per dataset. Bars are
 * coloured by the library's rank on that dataset — first, second, third —
 * rather than by library identity, so which library wins where is readable at
 * a glance without consulting a legend.
 *
 * Emits plain SVG with no dependencies, so the charts drop straight into the
 * manuscript.
 *
 * Usage: `npm run bench:charts` (or `npm run bench:all`)
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { suites } from "./manifest.js";
import { LIBRARIES } from "./libraries.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");

/** The metrics charted, and how each is presented. */
const METRICS = [
  { key: "crossings", label: "Number of crossings", scale: 1, decimals: 0 },
  { key: "overlapRatio", label: "Path overlap ratio (%)", scale: 100, decimals: 1 },
  { key: "totalLength", label: "Total path length (px)", scale: 1, decimals: 0 }
];

/**
 * Rounds up to the next "nice" axis bound — 1, 2, 2.5 or 5 times a power of
 * ten. Rounding to a bare power of ten wastes up to half the plot height: a
 * maximum of 1100 would push the axis to 2000.
 *
 * @param {number} max
 * @returns {number}
 */
function niceCeiling(max) {
  if (!(max > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => normalized <= s) ?? 10;
  return step * magnitude;
}

/**
 * @param {string} s
 * @returns {string}
 */
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Builds one grouped bar chart.
 *
 * Colour identifies the library and is consistent across every chart, so a
 * bar can be read without counting positions. The bars within a group always
 * appear in the same order, which the legend states explicitly. A caret marks
 * the best result in each group, since lower is better for all three metrics.
 *
 * @param {any[]} rows
 * @param {{id: string, label: string, datasets: {id: string}[]}} suite
 * @param {{key: string, label: string, scale: number, decimals: number}} metric
 * @returns {string}
 */
function chart(rows, suite, metric) {
  const width = 780;
  const height = 300;
  const margin = { top: 46, right: 12, bottom: 58, left: 62 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const datasets = suite.datasets.map((d) => d.id);
  const value = (/** @type {string} */ ds, /** @type {string} */ lib) => {
    const row = rows.find((r) => r.dataset === ds && r.library === lib && !r.failed);
    return row ? row[metric.key] * metric.scale : 0;
  };

  const max = Math.max(
    ...datasets.flatMap((d) => LIBRARIES.map((l) => value(d, l.id)))
  );
  const top = niceCeiling(max);

  const groupW = plotW / datasets.length;
  const barW = (groupW * 0.8) / LIBRARIES.length;

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  out.push(
    `<text x="${margin.left}" y="17" font-family="sans-serif" font-size="13" font-weight="600">${esc(metric.label)} — ${esc(suite.label)}</text>`
  );

  // Legend, stating the within-group order explicitly.
  let lx = margin.left;
  LIBRARIES.forEach((library, i) => {
    out.push(
      `<rect x="${lx}" y="27" width="10" height="10" fill="${library.color}"/>`
    );
    out.push(
      `<text x="${lx + 14}" y="36" font-family="sans-serif" font-size="10" fill="#333">${i + 1}. ${esc(library.label)}</text>`
    );
    lx += 30 + library.label.length * 5.6;
  });
  out.push(
    `<text x="${width - margin.right}" y="36" text-anchor="end" font-family="sans-serif" font-size="9" fill="#777" font-style="italic">bars left to right within each group; caret marks the best</text>`
  );

  // Gridlines and y-axis labels.
  for (let i = 0; i <= 4; i++) {
    const v = (top * i) / 4;
    const y = margin.top + plotH - (plotH * i) / 4;
    out.push(
      `<line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${margin.left + plotW}" y2="${y.toFixed(1)}" stroke="#e5e5e5" stroke-width="1"/>`
    );
    out.push(
      `<text x="${margin.left - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#555">${v.toFixed(metric.decimals)}</text>`
    );
  }

  datasets.forEach((ds, di) => {
    const values = LIBRARIES.map((l) => ({ id: l.id, color: l.color, v: value(ds, l.id) }));
    // Lower is better for every metric charted here.
    const bestValue = Math.min(...values.map((d) => d.v));
    const x0 = margin.left + di * groupW + groupW * 0.1;

    values.forEach((entry, li) => {
      const h = top > 0 ? (entry.v / top) * plotH : 0;
      const x = x0 + li * barW;
      const y = margin.top + plotH - h;
      out.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.86).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${entry.color}"/>`
      );
      if (entry.v === bestValue) {
        const cx = x + (barW * 0.86) / 2;
        const cy = y - 4;
        out.push(
          `<polygon points="${cx.toFixed(1)},${cy.toFixed(1)} ${(cx - 3.5).toFixed(1)},${(cy - 5).toFixed(1)} ${(cx + 3.5).toFixed(1)},${(cy - 5).toFixed(1)}" fill="#333"/>`
        );
      }
    });

    out.push(
      `<text x="${(margin.left + di * groupW + groupW / 2).toFixed(1)}" y="${margin.top + plotH + 15}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#333">${esc(ds.replace(/^[a-z]+-/, ""))}</text>`
    );
  });

  out.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`
  );
  out.push(
    `<text x="${(margin.left + plotW / 2).toFixed(1)}" y="${height - 24}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#555">dataset</text>`
  );

  // Mean across the suite, as a compact readout under the axis label.
  const means = LIBRARIES.map((l) => {
    const vs = datasets.map((d) => value(d, l.id));
    return { label: l.label, color: l.color, v: vs.reduce((a, b) => a + b, 0) / vs.length };
  });
  out.push(
    `<text x="${margin.left}" y="${height - 8}" font-family="sans-serif" font-size="10" fill="#555">mean: ` +
      means
        .map((m) => `<tspan fill="${m.color}" font-weight="600">${m.v.toFixed(metric.decimals)}</tspan>`)
        .join(`<tspan fill="#aaa"> · </tspan>`) +
      `</text>`
  );

  out.push("</svg>");
  return out.join("");
}

mkdirSync(outDir, { recursive: true });
const rows = JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"));

let count = 0;
for (const suite of suites) {
  const suiteRows = rows.filter((/** @type {any} */ r) => r.suite === suite.id);
  for (const metric of METRICS) {
    const name = `${suite.id}-${metric.key}.svg`;
    writeFileSync(join(outDir, name), chart(suiteRows, suite, metric));
    count++;
  }
}
console.log(`wrote ${count} charts to benchmarks/out/`);
