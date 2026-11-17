/**
 * Renders one dataset as drawn by the competing libraries.
 *
 * The manuscript already shows this library's own drawing of the dataset —
 * it is panel (a) of the strategies figure, produced by `figures.js` — so
 * this script supplies the missing halves of that comparison rather than
 * redrawing all three. It therefore matches `figures.js` in everything that
 * is a presentation choice rather than a layout one: the same canvas, the
 * same palette keyed on the source node, the same ribbon opacity, node
 * thickness, stroke and label size. What differs between the panels is only
 * what the libraries themselves do.
 *
 * Link geometry comes from each library's *own* published path generator, by
 * way of the same `shapesFromPaths` / `thickenCentrelines` reduction the
 * benchmark measures, so the ribbons are the libraries' own and not a
 * reconstruction. The one liberty is the flattening tolerance: curves are
 * reduced to polylines at `DRAW_TOLERANCE` rather than the measurement
 * tolerance, which keeps the files small. At the size the panels are printed
 * the difference is far below a dot.
 *
 * Usage: `node benchmarks/compare-figure.js [dataset-id] [out-dir] [library-id...]`
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { shapesFromPaths, shapesFromScene, thickenCentrelines } from "../src/metrics/shapes.js";
import { energyCategories, energyColors } from "../src/data/energy.js";
import { labelAlignment, resolveLabelPos } from "../src/render/labels.js";
import { LIBRARIES } from "./libraries.js";

const here = dirname(fileURLToPath(import.meta.url));
const datasetId = process.argv[2] ?? "energy-05";
const outDir = process.argv[3] ?? join(here, "out", "figures");
const wanted = process.argv.slice(4);
mkdirSync(outDir, { recursive: true });

/**
 * Which libraries get a panel. The default leaves this one out, because the
 * manuscript shows it separately; naming it on the command line brings it
 * back, for looking at outside the paper.
 */
const chosen = wanted.length
  ? LIBRARIES.filter((l) => wanted.includes(l.id))
  : LIBRARIES.filter((l) => l.id !== "flex-sankey");
if (!chosen.length) throw new Error(`no such library: ${wanted.join(", ")}`);

// ------------------------------------------------- presentation, from figures.js

/** Page of the manuscript's example, so the panels sit beside it unscaled. */
const PANEL = { width: 700, height: 265 };
/** Margin, matching the `marginLeft`/`marginRight` of `figures.js`. */
const MARGIN = 6;
/** Canvas the libraries lay out within: the page less its margins. */
const CANVAS = { width: PANEL.width - 2 * MARGIN, height: PANEL.height - 2 * MARGIN };
const NODE_WIDTH = 15;
const NODE_STROKE_WIDTH = 0.4;
const PATH_OPACITY = 0.55;
/**
 * Label size, in canvas units. Larger than the 11 of `figures.js` because
 * these two panels share one float where that one has four stacked, so they
 * are printed at roughly two thirds of its scale. The size is chosen to put
 * the names on the page at the same number of points as its do; a label that
 * matched it in canvas units would not survive the reduction.
 */
const LABEL_SIZE = 17;
const LABEL_PADDING = 5;
const LABEL_HALO = 1.6;

/** Flattening tolerance for drawing, in diagram units. The metrics use 0.25. */
const DRAW_TOLERANCE = 1.0;

const palette = new Map(energyCategories.map((c, i) => [c, energyColors[i]]));
const colorScale = (/** @type {string} */ key) => palette.get(key) ?? "#8a8a8a";

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
//
// A minimal writer, kept here rather than in `src/` because it serves the
// benchmark and not the library. The number formatting, colour conversion,
// Helvetica metrics and label placement mirror `src/render/pdf.js` so that a
// panel drawn here is set the same way as one drawn by the library's own
// backend.

/** Advance widths for Helvetica, in 1/1000 em, for printable ASCII. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

/**
 * Width of a string in points at a given size.
 * @param {string} text
 * @param {number} size
 * @returns {number}
 */
function textWidth(text, size) {
  let total = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    total += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (total / 1000) * size;
}

/**
 * Escapes a string for a PDF literal.
 * @param {string} s
 * @returns {string}
 */
const pdfString = (s) =>
  s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/**
 * Formats a number for a PDF operator, at a tenth of a unit.
 * @param {number} n
 * @returns {string}
 */
const f = (n) => (Math.round(n * 10) / 10).toString();

/**
 * Converts a CSS hex colour to PDF's `r g b` in the range 0 to 1.
 * @param {string} color
 * @returns {string}
 */
function rgb(color) {
  let hex = color.trim().replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "0.5 0.5 0.5";
  return [0, 2, 4]
    .map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3))
    .join(" ");
}

/**
 * Emits a minimal single-page PDF whose coordinate system is SVG's.
 *
 * @param {string} content Page content stream, in screen coordinates.
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function pdf(content, width, height) {
  // PDF's origin is bottom-left with y increasing upwards; the diagrams are
  // built in SVG's convention. Flip the axis once for the whole page, exactly
  // as the library's own backend does.
  const stream = `q 1 0 0 -1 0 ${f(height)} cm\n${content}\nQ`;

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(width)} ${f(height)}] ` +
    `/Resources << /Font << /F1 5 0 R >> /ExtGState << /GA 6 0 R >> >> ` +
    `/Contents 4 0 R >>`;
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[6] = `<< /Type /ExtGState /ca ${PATH_OPACITY} /CA 1 >>`;

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

// --------------------------------------------------------------- the panels

const { links } = JSON.parse(
  readFileSync(join(here, "datasets", `${datasetId}.json`), "utf8")
);

/**
 * Where each node's name is set, and how it is anchored, by the same rule the
 * library's renderer uses: outside the box, on whichever side keeps it within
 * the canvas.
 *
 * @param {import("./libraries.js").NodeBox[]} nodes
 */
function labelsOf(nodes) {
  return nodes.map((n) => {
    const box = { x: n.x0, y: n.y0, width: n.x1 - n.x0, height: n.y1 - n.y0 };
    const pos = resolveLabelPos("left-right", box, n, CANVAS.width, CANVAS.height);
    const { anchor, baseline, dx, dy } = labelAlignment(
      pos,
      0,
      box.width,
      box.height,
      LABEL_PADDING
    );
    const w = textWidth(n.id, LABEL_SIZE);
    return {
      text: n.id,
      x: box.x + dx + (anchor === "middle" ? -w / 2 : anchor === "end" ? -w : 0),
      y: box.y + dy + (baseline === "central" ? LABEL_SIZE * 0.36 : 0),
      anchor
    };
  });
}

/** @type {string[]} */
const svg = [];

for (const [index, library] of chosen.entries()) {
  const result = library.run(links, { extent: CANVAS, nodeWidth: NODE_WIDTH });
  const groups = polygonsOf(result);
  const sources = result.sources ?? links.map((/** @type {any} */ l) => String(l.source));
  const nodes = result.nodes ?? [];
  const labels = labelsOf(nodes);

  /** @type {string[]} */
  const ops = [`1 0 0 1 ${f(MARGIN)} ${f(MARGIN)} cm`];

  // --- ribbons, coloured after the node they leave
  ops.push("q", "/GA gs");
  groups.forEach((polygons, i) => {
    const rings = polygons.filter((r) => r && r.length >= 3);
    if (!rings.length) return;
    ops.push(`${rgb(colorScale(sources[i]))} rg`);
    for (const ring of rings) {
      ring.forEach(([px, py], j) => ops.push(`${f(px)} ${f(py)} ${j === 0 ? "m" : "l"}`));
      ops.push("h");
    }
    ops.push("f");
  });
  ops.push("Q");

  // --- node rectangles
  ops.push("q", "0 0 0 RG", `${f(NODE_STROKE_WIDTH)} w`);
  for (const n of nodes) {
    const w = n.x1 - n.x0;
    const h = n.y1 - n.y0;
    if (!(w > 0) || !(h > 0)) continue;
    ops.push(`${rgb(colorScale(n.id))} rg`);
    ops.push(`${f(n.x0)} ${f(n.y0)} ${f(w)} ${f(h)} re`, "B");
  }
  ops.push("Q");

  // --- labels: a white stroked pass for the halo, then the glyphs on top
  /** @param {{text: string, x: number, y: number}} label */
  const place = (label) =>
    ops.push(
      `1 0 0 -1 ${f(label.x)} ${f(label.y)} Tm`,
      `(${pdfString(label.text)}) Tj`
    );

  ops.push("q", "1 1 1 RG", `${f(LABEL_HALO)} w`, "1 j", "1 J");
  ops.push("BT", `/F1 ${f(LABEL_SIZE)} Tf`, "1 Tr");
  labels.forEach(place);
  ops.push("ET", "Q");

  ops.push("q", "0 0 0 rg", "BT", `/F1 ${f(LABEL_SIZE)} Tf`, "0 Tr");
  labels.forEach(place);
  ops.push("ET", "Q");

  writeFileSync(
    join(outDir, `compare-${datasetId}-${library.id}.pdf`),
    pdf(ops.join("\n"), PANEL.width, PANEL.height)
  );

  // --- an SVG twin of the strip, for looking at without a PDF viewer
  const ribbons = groups
    .map((polygons, i) => {
      const d = polygons
        .filter((r) => r && r.length >= 3)
        .map((r) => `${r.map(([px, py], j) => `${j ? "L" : "M"}${f(px)},${f(py)}`).join("")}Z`)
        .join("");
      return d ? `<path d="${d}" fill="${colorScale(sources[i])}"/>` : "";
    })
    .join("");
  const boxes = nodes
    .map(
      (n) =>
        `<rect x="${f(n.x0)}" y="${f(n.y0)}" width="${f(n.x1 - n.x0)}" ` +
        `height="${f(n.y1 - n.y0)}" fill="${colorScale(n.id)}" stroke="black" ` +
        `stroke-width="${NODE_STROKE_WIDTH}"/>`
    )
    .join("");
  const text = labels
    .map(
      (l) =>
        `<text x="${f(l.x)}" y="${f(l.y)}" font-family="Helvetica" ` +
        `font-size="${LABEL_SIZE}">${l.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`
    )
    .join("");
  svg.push(
    `<g transform="translate(${MARGIN},${MARGIN + index * (PANEL.height + 40)})">` +
      `<text x="0" y="-8" font-family="Helvetica" font-size="15">${library.id}</text>` +
      `<g fill-opacity="${PATH_OPACITY}">${ribbons}</g>${boxes}${text}</g>`
  );
}

const svgH = chosen.length * (PANEL.height + 40);
writeFileSync(
  join(outDir, `compare-${datasetId}.svg`),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL.width + 10}" ` +
    `height="${svgH + 20}" viewBox="-5 -25 ${PANEL.width + 10} ${svgH + 20}">` +
    `<rect x="-5" y="-25" width="100%" height="100%" fill="white"/>` +
    svg.join("") +
    `</svg>\n`
);

console.log(
  `wrote ${chosen.length} panel PDFs (${chosen.map((l) => l.id).join(", ")}) ` +
    `and compare-${datasetId}.svg to ${outDir}`
);
