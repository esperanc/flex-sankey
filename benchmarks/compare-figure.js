/**
 * Renders one dataset as drawn by all three libraries, side by side.
 *
 * Reviewers of the manuscript asked for two things this answers at once: a
 * real-world instance rather than generated data, and the comparison figure
 * shown for the competing implementations rather than for this library alone.
 *
 * Every panel is built by the *same* construction the benchmark measures —
 * `shapesFromPaths` / `shapesFromScene`, with stroked centre lines thickened
 * exactly as `measurePaths` thickens them — so the picture shows what was
 * counted rather than a separate rendering that might differ from it. The one
 * difference is the flattening tolerance: curves are reduced to polylines at
 * `DRAW_TOLERANCE` rather than the measurement tolerance, which keeps the
 * figure to a sane file size. At the scale the panels are drawn the
 * difference is far below a printed dot.
 *
 * Usage: `node benchmarks/compare-figure.js [dataset-id] [output-directory]`
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { shapesFromPaths, shapesFromScene, thickenCentrelines } from "../src/metrics/shapes.js";
import { LIBRARIES, CANVAS } from "./libraries.js";

const here = dirname(fileURLToPath(import.meta.url));
const datasetId = process.argv[2] ?? "real-uk-energy-2050";
const outDir = process.argv[3] ?? join(here, "out", "figures");
mkdirSync(outDir, { recursive: true });

/**
 * Panel label per library id.
 * @type {Record<string, string>}
 */
const LABEL = {
  "d3-sankey": "d3-sankey",
  "d3-sankey-diagram": "d3-sankey-diagram",
  "flex-sankey": "flex-sankey"
};

/**
 * Flattening tolerance for drawing, in diagram units. The metrics use 0.25;
 * panels are drawn at 0.56 scale, so 1.0 here is ~0.56pt of deviation on the
 * page — invisible in print, and about a third of the file size.
 */
const DRAW_TOLERANCE = 1.0;

/** Ribbon fill, as RGB in 0..1. Translucent so overlap is visible as darkening. */
const FILL = [0.15, 0.35, 0.62];
const ALPHA = 0.45;

/**
 * Reduces one library's output to filled polygons, one group per link.
 *
 * @param {import("./libraries.js").DiagramResult} result
 * @returns {import("../src/metrics/flatten.js").Point[][][]} polygons, grouped by link
 */
function polygonsOf(result) {
  if (result.scene) return shapesFromScene(result.scene, DRAW_TOLERANCE).polygons;

  const shapes = shapesFromPaths(result.paths ?? [], {
    filled: result.filled,
    tolerance: DRAW_TOLERANCE
  });
  if (result.filled) return shapes.polygons;

  // Stroked centre lines: widen them the way the metrics do, then regroup by
  // link so one route's pieces stay together.
  const widened = thickenCentrelines(
    shapes.centrelines,
    /** @type {number[]} */ (result.strokeWidths),
    shapes.centrelineOwner
  );
  const byLink = shapes.polygons.map(() => /** @type {any[]} */ ([]));
  widened.forEach((polys, i) => byLink[shapes.centrelineOwner[i]].push(...polys));
  return byLink;
}

// ---------------------------------------------------------------- PDF writing

const f = (/** @type {number} */ n) =>
  (Math.round(n * 10) / 10).toString();

/**
 * Emits a minimal single-page PDF.
 *
 * Only what this figure needs: filled paths with a constant alpha, and
 * Helvetica labels. Kept here rather than in `src/` because it serves the
 * benchmark, not the library.
 *
 * @param {string} content Page content stream.
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function pdf(content, width, height) {
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(width)} ${f(height)}] ` +
    `/Resources << /Font << /F1 5 0 R >> /ExtGState << /GA 6 0 R >> >> ` +
    `/Contents 4 0 R >>`;
  objects[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[6] = `<< /Type /ExtGState /ca ${ALPHA} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  out +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return out;
}

// ------------------------------------------------------------------- the page

const { links } = JSON.parse(
  readFileSync(join(here, "datasets", `${datasetId}.json`), "utf8")
);

const GAP = 26;
const PAD = 10;
const TITLE = 16;
const scale = 0.56; // three 800pt panels would overflow a journal column
const panelW = CANVAS.width * scale;
const panelH = CANVAS.height * scale;
const pageW = PAD * 2 + panelW * 3 + GAP * 2;
const pageH = PAD * 2 + panelH + TITLE;

let content = "";
/** @type {string[]} */
const svg = [];

LIBRARIES.forEach((library, index) => {
  const result = library.run(links);
  const groups = polygonsOf(result);
  const originX = PAD + index * (panelW + GAP);
  // PDF y grows upward; the diagrams are in screen coordinates.
  const originY = PAD;

  content += `q /GA gs ${FILL.join(" ")} rg\n`;
  for (const polygons of groups) {
    for (const ring of polygons) {
      if (!ring || ring.length < 3) continue;
      ring.forEach(([px, py], i) => {
        const x = originX + px * scale;
        const y = originY + (CANVAS.height - py) * scale;
        content += `${f(x)} ${f(y)} ${i === 0 ? "m" : "l"}\n`;
      });
      content += "h\n";
    }
  }
  content += "f\nQ\n";

  const label = LABEL[library.id] ?? library.id;
  content +=
    `BT /F1 9 Tf 0 0 0 rg ${f(originX)} ${f(PAD + panelH + 5)} Td (${label}) Tj ET\n`;

  // An SVG twin, for looking at without a PDF viewer.
  const paths = groups.flatMap((polygons) =>
    polygons
      .filter((r) => r && r.length >= 3)
      .map(
        (r) =>
          `<path d="${r.map(([px, py], i) => `${i ? "L" : "M"}${f(px)},${f(py)}`).join("")}Z"/>`
      )
  );
  svg.push(
    `<g transform="translate(${f(index * (CANVAS.width + 40))},0)">` +
      `<text x="0" y="-6" font-family="Helvetica" font-size="15">${label}</text>` +
      `<g fill="rgb(38,89,158)" fill-opacity="${ALPHA}">${paths.join("")}</g></g>`
  );
});

writeFileSync(join(outDir, `compare-${datasetId}.pdf`), pdf(content, pageW, pageH));
writeFileSync(
  join(outDir, `compare-${datasetId}.svg`),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width * 3 + 80}" ` +
    `height="${CANVAS.height + 30}" viewBox="-5 -25 ${CANVAS.width * 3 + 90} ${CANVAS.height + 40}">` +
    `<rect x="-5" y="-25" width="100%" height="100%" fill="white"/>` +
    svg.join("") +
    `</svg>\n`
);

console.log(`wrote compare-${datasetId}.pdf and .svg to ${outDir}`);
