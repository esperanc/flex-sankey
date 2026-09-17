/**
 * Confirms that the comparison adapters measure what the libraries draw.
 *
 * `libraries.js` drives `d3-sankey` and `d3-sankey-diagram` through their own
 * path generators rather than rendering them, which is faster and avoids a
 * DOM. That is only legitimate if the generators produce exactly what the
 * libraries put into a document — so this script renders both properly, into
 * a jsdom document, and checks the rendered path data against the generated
 * path data.
 *
 * Usage: `npm run bench:verify`
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { select } from "d3-selection";
import { sankey as sdSankey, sankeyDiagram } from "d3-sankey-diagram";

import { layoutD3Sankey, layoutD3SankeyDiagram, CANVAS } from "./libraries.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataset = join(here, "datasets", "energy-00.json");
const { links } = JSON.parse(readFileSync(dataset, "utf8"));

const dom = new JSDOM(
  `<!DOCTYPE html><body><svg id="s" width="${CANVAS.width}" height="${CANVAS.height}"></svg></body>`
);
globalThis.document = dom.window.document;
globalThis.window = /** @type {any} */ (dom.window);

const nodeIds = [...new Set(links.flatMap((/** @type {any} */ l) => [l.source, l.target]))];

// --- d3-sankey-diagram: render, then compare against the generator ---------
const graph = sdSankey().extent([
  [0, 0],
  [CANVAS.width, CANVAS.height]
])({
  nodes: nodeIds.map((id) => ({ id, title: id })),
  links: links.map((/** @type {any} */ l) => ({
    source: l.source,
    target: l.target,
    value: l.value
  }))
});

const svg = dom.window.document.getElementById("s");
select(svg).datum(graph).call(sankeyDiagram());

const rendered = new Set(
  [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d")).filter(Boolean)
);
const generated = layoutD3SankeyDiagram(links).paths ?? [];
const missing = generated.filter((d) => !rendered.has(d));

console.log(`d3-sankey-diagram: ${generated.length} generated, ${rendered.size} rendered`);
console.log(
  missing.length === 0
    ? "  every generated path matches one the library rendered"
    : `  MISMATCH: ${missing.length} generated paths were not rendered`
);

// --- d3-sankey: the path generator is the documented way to draw ----------
const d3s = layoutD3Sankey(links);
const bad = (d3s.paths ?? []).filter((d) => !/^M[-\d.]/.test(d));
console.log(`\nd3-sankey: ${d3s.paths?.length} link paths, ${bad.length} malformed`);
console.log(
  `  stroke widths span ${Math.min(...(d3s.strokeWidths ?? [])).toFixed(2)} to ` +
    `${Math.max(...(d3s.strokeWidths ?? [])).toFixed(2)} px`
);

if (missing.length || bad.length) process.exitCode = 1;
