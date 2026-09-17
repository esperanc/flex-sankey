/**
 * Runs every library over every dataset and records the results.
 *
 * Writes `out/results.csv` and `out/results.json`, plus a per-suite summary to
 * the console. Nothing here is interactive and nothing is sampled by hand: the
 * datasets come from the manifest, the ordering stage is seeded, and the
 * metrics are deterministic, so the whole table regenerates identically.
 *
 * Usage: `npm run bench`
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { measureScene, measurePaths } from "../src/metrics/index.js";
import { suites } from "./manifest.js";
import { LIBRARIES } from "./libraries.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "datasets");
const outDir = join(here, "out");

/** Rasterization samples per pixel along each axis. */
const SAMPLE_SCALE = 2;

/**
 * Measures one library's output for one dataset.
 * @param {import("./libraries.js").DiagramResult} result
 */
function measure(result) {
  if (result.scene) {
    return measureScene(result.scene, { sampleScale: SAMPLE_SCALE });
  }
  return measurePaths(result.paths ?? [], {
    width: result.width,
    height: result.height,
    filled: result.filled,
    strokeWidths: result.strokeWidths,
    sampleScale: SAMPLE_SCALE
  });
}

mkdirSync(outDir, { recursive: true });

/** @type {any[]} */
const rows = [];

for (const suite of suites) {
  for (const entry of suite.datasets) {
    const { links } = JSON.parse(
      readFileSync(join(dataDir, `${entry.id}.json`), "utf8")
    );
    for (const library of LIBRARIES) {
      const started = performance.now();
      let result;
      try {
        result = library.run(links);
      } catch (error) {
        // A library that cannot lay out a dataset is recorded, not hidden.
        rows.push({
          suite: suite.id,
          dataset: entry.id,
          library: library.id,
          failed: String(/** @type {Error} */ (error).message)
        });
        console.error(`  ${library.id} failed on ${entry.id}: ${error}`);
        continue;
      }
      const layoutMs = performance.now() - started;
      const metrics = measure(result);
      rows.push({
        suite: suite.id,
        dataset: entry.id,
        library: library.id,
        layoutMs: +layoutMs.toFixed(1),
        ...metrics,
        totalLength: +metrics.totalLength.toFixed(1),
        overlapRatio: +metrics.overlapRatio.toFixed(6),
        excessRatio: +metrics.excessRatio.toFixed(6)
      });
    }
  }
  console.log(`${suite.id}: done`);
}

writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 2) + "\n");

const columns = [
  "suite", "dataset", "library", "crossings", "totalLength",
  "overlapRatio", "excessRatio", "maxDepth", "coveredPixels", "linkCount", "layoutMs"
];
const csv = [
  columns.join(","),
  ...rows.map((r) => columns.map((c) => (r[c] ?? "")).join(","))
].join("\n");
writeFileSync(join(outDir, "results.csv"), csv + "\n");

// --- console summary -------------------------------------------------------

/**
 * @param {any[]} xs
 * @param {string} key
 */
const mean = (xs, key) => xs.reduce((a, r) => a + (r[key] ?? 0), 0) / (xs.length || 1);

for (const suite of suites) {
  console.log(`\n=== ${suite.label} (${suite.id}) ===`);
  console.log(
    "library              crossings   overlap%   excess%   length   ms"
  );
  for (const library of LIBRARIES) {
    const subset = rows.filter(
      (r) => r.suite === suite.id && r.library === library.id && !r.failed
    );
    if (!subset.length) continue;
    console.log(
      library.label.padEnd(20) +
        mean(subset, "crossings").toFixed(1).padStart(10) +
        (100 * mean(subset, "overlapRatio")).toFixed(2).padStart(11) +
        (100 * mean(subset, "excessRatio")).toFixed(2).padStart(10) +
        mean(subset, "totalLength").toFixed(0).padStart(9) +
        mean(subset, "layoutMs").toFixed(0).padStart(5)
    );
  }
}

console.log(`\nwrote ${rows.length} rows to benchmarks/out/`);
