/**
 * SVG string serialization — stage 6c.
 *
 * Emits a painted scene as standalone SVG markup. Needs no DOM, so diagrams
 * can be produced under Node — which is what lets the benchmark harness
 * rasterize and measure them headlessly.
 *
 * @module render/svg
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @typedef {import("./theme.js").PaintedScene} PaintedScene
 */

/**
 * Escapes text for inclusion in XML character data or an attribute value.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Formats a number for an SVG attribute, trimming pointless precision.
 * @param {number} n
 * @returns {string}
 */
function num(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * @param {[number, number][]} points
 * @returns {string}
 */
function pointsAttr(points) {
  return points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");
}

/**
 * @param {import("./scene.js").SceneLabel} label
 * @param {string} fill
 * @param {PaintedScene["style"]} style
 * @returns {string}
 */
function textEl(label, fill, style) {
  const transform =
    label.angle === 0
      ? `translate(${num(label.x)},${num(label.y)})`
      : `translate(${num(label.x)},${num(label.y)}) rotate(${num(label.angle)})`;
  return (
    `<text transform="${transform}" text-anchor="${label.anchor}"` +
    ` dominant-baseline="${label.baseline}" fill="${esc(fill)}"` +
    ` style="font:${esc(style.labelFont)};filter:${esc(style.labelFilter)};` +
    `user-select:none">${esc(label.text)}</text>`
  );
}

/**
 * @typedef {object} SvgOptions
 * @property {boolean} [standalone=false] Prepend an XML declaration, for
 *   writing to a `.svg` file.
 * @property {boolean} [titles=true] Include `<title>` tooltips. Turn off when
 *   rasterizing, so text never affects the pixels measured.
 */

/**
 * Serializes a painted scene as SVG markup.
 *
 * @param {PaintedScene} scene
 * @param {SvgOptions} [options]
 * @returns {string}
 */
export function sceneToSVG(scene, { standalone = false, titles = true } = {}) {
  const { width, height, gradients, nodes, links, style } = scene;
  const out = [];

  if (standalone) out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}"` +
      ` height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">`
  );

  if (gradients.length) {
    out.push("<defs>");
    for (const g of gradients) {
      out.push(
        `<linearGradient id="${esc(g.id)}" x1="${num(g.x1)}" y1="${num(g.y1)}"` +
          ` x2="${num(g.x2)}" y2="${num(g.y2)}">` +
          `<stop offset="0%" stop-color="${esc(g.from)}"/>` +
          `<stop offset="100%" stop-color="${esc(g.to)}"/>` +
          `</linearGradient>`
      );
    }
    out.push("</defs>");
  }

  // Ribbons first, so node rectangles and labels sit above them.
  out.push('<g class="links">');
  for (const link of links) {
    const title = titles ? `<title>${esc(link.title)}</title>` : "";
    out.push(
      `<path class="link" d="${link.geometry.d}" fill="${esc(link.fill)}"` +
        ` fill-opacity="${num(link.fillOpacity)}" stroke="none">${title}</path>`
    );
  }
  out.push("</g>");

  out.push('<g class="nodes">');
  for (const node of nodes) {
    const g = node.geometry;
    if (g.dummy) continue;
    const title = titles ? `<title>${esc(node.title)}</title>` : "";
    out.push(
      `<rect class="node" x="${num(g.x)}" y="${num(g.y)}" width="${num(g.width)}"` +
        ` height="${num(g.height)}" fill="${esc(node.fill)}"` +
        ` stroke="${esc(node.stroke)}" stroke-width="${num(node.strokeWidth)}"` +
        ` stroke-opacity="${num(node.strokeOpacity)}"` +
        ` stroke-linejoin="${esc(node.strokeLinejoin)}">${title}</rect>`
    );
    for (const { mark, fill, title: markTitle } of node.hiddenMarks) {
      for (const rule of mark.rules) {
        out.push(
          `<polyline points="${pointsAttr(rule)}" fill="none"` +
            ` stroke="${esc(node.stroke)}" stroke-dasharray="2 2"/>`
        );
      }
      const mt = titles ? `<title>${esc(markTitle)}</title>` : "";
      out.push(
        `<polygon points="${pointsAttr(mark.triangle)}" fill="${esc(fill)}"` +
          ` fill-opacity="${num(style.pathOpacity)}"` +
          ` stroke="${esc(node.stroke)}">${mt}</polygon>`
      );
      out.push(textEl(mark.label, style.labelColor, style));
    }
  }
  out.push("</g>");

  out.push('<g class="labels">');
  for (const node of nodes) {
    if (node.label) out.push(textEl(node.label.label, node.label.fill, style));
  }
  out.push("</g>");

  out.push("</svg>");
  return out.join("");
}
