/**
 * PDF serialization — stage 6c, print variant.
 *
 * Emits a painted scene as a single-page PDF. Ribbons are written as native
 * cubic Bézier path operators rather than rasterized, so figures stay sharp at
 * any magnification, which is what a publication needs.
 *
 * Needs no DOM and no dependencies. Text uses the standard Helvetica face,
 * which every PDF viewer provides, so nothing has to be embedded.
 *
 * @module render/pdf
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @typedef {import("./theme.js").PaintedScene} PaintedScene
 * @typedef {import("./scene.js").SceneLabel} SceneLabel
 */

/**
 * Advance widths for Helvetica, in 1/1000 em, for printable ASCII.
 *
 * Needed to honour `text-anchor`: placing a centred or right-aligned label
 * requires knowing how wide the string will be.
 */
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
 *
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
function pdfString(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Formats a number for a PDF operator.
 * @param {number} n
 * @returns {string}
 */
function num(n) {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

/**
 * Converts a CSS hex colour to PDF's `r g b` in the range 0 to 1.
 * @param {string} color
 * @returns {string}
 */
function rgb(color) {
  let hex = color.trim();
  if (hex.startsWith("url(")) hex = "#808080"; // Gradients flatten to grey.
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "0.5 0.5 0.5";
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return `${num(r)} ${num(g)} ${num(b)}`;
}

/**
 * @typedef {object} PdfOptions
 * @property {string} [title] Document title metadata.
 * @property {number} [margin=0] Blank border around the drawing, in points.
 * @property {boolean} [labels=true] Draw node labels.
 * @property {number} [labelHalo=1.6] Width, in points, of the white outline
 *   drawn behind label text so it stays readable over a ribbon. The SVG
 *   backend gets this from a CSS drop-shadow filter, which PDF has no
 *   equivalent for, so it is stroked explicitly. Set to 0 to disable.
 */

/**
 * Serializes a painted scene as a one-page PDF document.
 *
 * @param {PaintedScene} scene
 * @param {PdfOptions} [options]
 * @returns {Uint8Array} The PDF file's bytes.
 */
export function sceneToPDF(
  scene,
  { title = "Sankey diagram", margin = 0, labels = true, labelHalo = 1.6 } = {}
) {
  const { width, height, nodes, links, style } = scene;
  const pageW = width + margin * 2;
  const pageH = height + margin * 2;

  /** Alpha values needing a graphics state, keyed by value. */
  const alphas = new Map();
  /** @param {number} a */
  const alphaName = (a) => {
    const key = a.toFixed(3);
    if (!alphas.has(key)) alphas.set(key, `GS${alphas.size}`);
    return alphas.get(key);
  };

  const ops = [];
  // PDF's origin is bottom-left with y increasing upwards; scenes are built in
  // SVG's convention. This flips the axis once for the whole page.
  ops.push("q", `1 0 0 -1 ${num(margin)} ${num(pageH - margin)} cm`);

  // --- ribbons -------------------------------------------------------------
  for (const link of links) {
    ops.push("q", `/${alphaName(link.fillOpacity)} gs`, `${rgb(link.fill)} rg`);
    for (const [lo, hi] of link.geometry.curves) {
      ops.push(`${num(lo[0][0])} ${num(lo[0][1])} m`);
      ops.push(
        `${num(lo[1][0])} ${num(lo[1][1])} ${num(lo[2][0])} ${num(lo[2][1])} ` +
          `${num(lo[3][0])} ${num(lo[3][1])} c`
      );
      ops.push(`${num(hi[3][0])} ${num(hi[3][1])} l`);
      ops.push(
        `${num(hi[2][0])} ${num(hi[2][1])} ${num(hi[1][0])} ${num(hi[1][1])} ` +
          `${num(hi[0][0])} ${num(hi[0][1])} c`
      );
      ops.push("h");
    }
    ops.push("f");
    ops.push("Q");
  }

  // --- node rectangles and hidden-flow markers -----------------------------
  for (const node of nodes) {
    const g = node.geometry;
    if (g.dummy) continue;
    ops.push("q", `${rgb(node.fill)} rg`, `${rgb(node.stroke)} RG`);
    ops.push(`${num(node.strokeWidth)} w`);
    ops.push(`${num(g.x)} ${num(g.y)} ${num(g.width)} ${num(g.height)} re`);
    ops.push(node.strokeWidth > 0 ? "B" : "f");

    for (const { mark, fill } of node.hiddenMarks) {
      ops.push("q", `${rgb(node.stroke)} RG`, "[2 2] 0 d", "0.7 w");
      for (const rule of mark.rules) {
        ops.push(`${num(rule[0][0])} ${num(rule[0][1])} m`);
        ops.push(`${num(rule[1][0])} ${num(rule[1][1])} l`, "S");
      }
      ops.push("Q");
      ops.push("q", `/${alphaName(style.pathOpacity)} gs`, `${rgb(fill)} rg`);
      const [p0, p1, p2] = mark.triangle;
      ops.push(`${num(p0[0])} ${num(p0[1])} m`);
      ops.push(`${num(p1[0])} ${num(p1[1])} l`);
      ops.push(`${num(p2[0])} ${num(p2[1])} l`, "h", "f", "Q");
    }
    ops.push("Q");
  }

  // --- labels --------------------------------------------------------------
  if (labels) {
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(style.labelFont)?.[1] ?? "10");

    /** Every label to draw, node labels and hidden-flow markers alike. */
    /** @type {SceneLabel[]} */
    const allLabels = [];
    for (const node of nodes) {
      if (node.label) allLabels.push(node.label.label);
      for (const { mark } of node.hiddenMarks) allLabels.push(mark.label);
    }

    /**
     * Emits the text-positioning matrix and the string for one label.
     *
     * PDF has neither `text-anchor` nor `dominant-baseline`, so alignment is
     * applied by shifting the origin, and the page's y-flip is undone in the
     * same matrix so the text reads upright.
     *
     * @param {SceneLabel} label
     */
    const place = (label) => {
      const w = textWidth(label.text, size);
      const dx = label.anchor === "middle" ? -w / 2 : label.anchor === "end" ? -w : 0;
      const dy =
        label.baseline === "central"
          ? size * 0.36
          : label.baseline === "hanging"
            ? size * 0.72
            : 0;
      const rad = (-label.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      ops.push(
        `${num(cos)} ${num(sin)} ${num(sin)} ${num(-cos)} ` +
          `${num(label.x + dx * cos)} ${num(label.y + dy)} Tm`
      );
      ops.push(`(${pdfString(label.text)}) Tj`);
    };

    const drawable = allLabels.filter((label) => label.text);

    // Halo first, as a stroked pass in white, then the glyphs on top.
    if (labelHalo > 0) {
      ops.push("q", "1 1 1 RG", `${num(labelHalo)} w`, "1 j", "1 J");
      ops.push("BT", `/F1 ${num(size)} Tf`, "1 Tr");
      for (const label of drawable) place(label);
      ops.push("ET", "Q");
    }

    ops.push("q", `${rgb(style.labelColor)} rg`);
    ops.push("BT", `/F1 ${num(size)} Tf`, "0 Tr");
    for (const label of drawable) place(label);
    ops.push("ET", "Q");
  }

  ops.push("Q");
  const content = ops.join("\n");

  // --- assemble the file ---------------------------------------------------
  const extGState = [...alphas.entries()]
    .map(([value, name]) => `/${name} << /Type /ExtGState /ca ${value} /CA 1 >>`)
    .join(" ");

  /** @type {string[]} */
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] ` +
    `/Resources << /Font << /F1 5 0 R >> /ExtGState << ${extGState} >> >> ` +
    `/Contents 4 0 R >>`;
  objects[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[6] = `<< /Title (${pdfString(title)}) /Producer (flex-sankey) >>`;

  let pdf = "%PDF-1.4\n";
  /** @type {number[]} */
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 6 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
