/**
 * Demo: ribbon geometry.
 *
 * The core of the library. Two nodes joined by a bundle of parallel ribbons,
 * drawn by each of the three constructions, with the overlap measured live so
 * the difference is a number and not an impression.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { page, controls, readout, note, show } from "./kit.js";
import { outlinePathPoints } from "../src/paths/outline.js";
import { standardHorizontalPath } from "../src/paths/standard.js";
import { horizontalCirclePath } from "../src/paths/arcs.js";
import { measurePaths, measureShapes, flattenCubic } from "../src/metrics/index.js";

const W = 620;
const H = 430;
const NODE_W = 16;
const LEFT_X = 70;
const RIGHT_X = W - 70 - NODE_W;

const ui = page({
  title: "Ribbon geometry",
  description:
    "Parallel ribbons between two nodes, under each construction. Overlap is " +
    "measured on what you see."
});

const svgNS = "http://www.w3.org/2000/svg";
/** @param {string} name @param {Record<string, any>} attrs */
const el = (name, attrs = {}) => {
  const node = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);

note(
  ui.stage,
  "<strong>Improved</strong> builds each ribbon from two independent Bézier " +
  "curves whose control points derive from a reference line joining the node " +
  "centres. That makes each ribbon's lower boundary <em>exactly</em> the next " +
  "one's upper boundary, so parallel ribbons cannot overlap. " +
  "<strong>Standard</strong> dilates a single centre line, which is what " +
  "<code>d3-sankey</code> does; the offset of a cubic Bézier is not itself a " +
  "Bézier, so the ribbons drift into one another. <strong>Arcs</strong> " +
  "stitches two circular arcs, as <code>d3-sankey-diagram</code> does. " +
  "Raise <em>alignment</em> to skew the bundle and the difference becomes stark."
);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Construction" },
    {
      type: "select", key: "algorithm", label: "algorithm", value: "improved",
      options: [
        { value: "improved", label: "improved (flex-sankey)" },
        { value: "standard", label: "standard dilated Bézier" },
        { value: "arcs", label: "circular arcs" }
      ]
    },
    { type: "range", key: "bias", label: "bias", min: 0, max: 1.5, step: 0.05, value: 1,
      hint: "Curviness. Below 1 straightens the ribbon." },
    { type: "range", key: "maxAngle", label: "max angle", min: 0, max: 80, step: 1, value: 30,
      format: (v) => `${v}°`,
      hint: "Limits the slant of the reference line. Improved only." },

    { type: "group", key: "_g2", label: "Geometry" },
    { type: "range", key: "ribbons", label: "ribbons", min: 1, max: 12, step: 1, value: 5 },
    { type: "range", key: "size", label: "node size", min: 40, max: 320, step: 1, value: 190 },
    { type: "range", key: "alignment", label: "alignment", min: -260, max: 260, step: 1, value: 120,
      hint: "Vertical offset between the two nodes." },
    { type: "range", key: "distance", label: "node distance", min: 80, max: 520, step: 1, value: 470 },

    { type: "group", key: "_g3", label: "Presets" },
    {
      type: "button", key: "_p1", label: "Parallel bundle",
      onClick: () => preset({ distance: 470, alignment: 120, size: 190, ribbons: 5, bias: 1 })
    },
    {
      type: "button", key: "_p2", label: "Hard case",
      onClick: () => preset({ distance: 110, alignment: 260, size: 150, ribbons: 4, bias: 1 })
    },
    {
      type: "button", key: "_p3", label: "Long, gentle span",
      onClick: () => preset({ distance: 520, alignment: 30, size: 260, ribbons: 10, bias: 1 })
    },

    { type: "group", key: "_g4", label: "Display" },
    { type: "toggle", key: "construction", label: "show construction", value: false,
      hint: "Control polygons and the reference line." },
    { type: "toggle", key: "outline", label: "outline ribbons", value: false }
  ],
  render
);

/**
 * Applies a named configuration to the sliders, so the interesting regimes are
 * one click away rather than something to hunt for.
 *
 * @param {Record<string, number>} settings
 */
function preset(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const input = /** @type {HTMLInputElement|null} */ (
      document.querySelector(`.controls input[data-key="${key}"]`)
    );
    if (!input) continue;
    input.value = String(value);
    input.dispatchEvent(new Event("input"));
  }
}

/**
 * Geometry of the bundle for the current settings.
 * @param {Record<string, any>} v
 */
function bundle(v) {
  const rightX = LEFT_X + NODE_W + v.distance - NODE_W;
  const leftCy = H / 2 - v.alignment / 2;
  const rightCy = H / 2 + v.alignment / 2;
  const breadth = v.size / v.ribbons;
  const rows = [];
  for (let i = 0; i < v.ribbons; i++) {
    const offset = -v.size / 2 + breadth / 2 + breadth * i;
    rows.push({
      a: /** @type {[number, number]} */ ([LEFT_X + NODE_W, leftCy + offset]),
      b: /** @type {[number, number]} */ ([rightX, rightCy + offset]),
      breadth
    });
  }
  return { rows, rightX, leftCy, rightCy, breadth };
}

function render() {
  const v = values;
  const { rows, rightX, leftCy, rightCy } = bundle(v);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  const tangent = ((rightX - (LEFT_X + NODE_W)) / 2) * v.bias;
  const at = /** @type {[number, number]} */ ([tangent, 0]);
  const bt = /** @type {[number, number]} */ ([-tangent, 0]);

  /** @type {string[]} */
  const paths = [];
  /** @type {number[]} */
  const widths = [];
  /** @type {any[]} */
  const polygons = [];
  /** @type {any[]} */
  const centrelines = [];

  const ribbonGroup = el("g");
  const guideGroup = el("g");

  rows.forEach((row, i) => {
    const hue = 205 + (i / Math.max(1, rows.length - 1)) * 120;
    const color = `hsl(${hue} 62% 52%)`;

    if (v.algorithm === "improved") {
      const spec = {
        a: row.a, b: row.b, at, bt,
        ap: /** @type {[number, number]} */ ([row.a[0], leftCy]),
        bp: /** @type {[number, number]} */ ([row.b[0], rightCy]),
        size: row.breadth,
        maxAngle: v.maxAngle
      };
      const [lo, hi] = outlinePathPoints(spec);
      const d =
        `M ${lo[0]} C ${lo[1]} ${lo[2]} ${lo[3]} L ${hi[3]} C ${hi[2]} ${hi[1]} ${hi[0]} Z`;
      ribbonGroup.appendChild(
        el("path", {
          d, fill: color, "fill-opacity": 0.55,
          stroke: v.outline ? "#333" : "none", "stroke-width": 0.6
        })
      );
      // Measure from the control points, as the metrics module does.
      const flat = (/** @type {any} */ c) => [c[0], ...flattenCubic(c[0], c[1], c[2], c[3], 0.2)];
      const loPts = flat(lo);
      const hiPts = flat(hi);
      polygons.push([[...loPts, ...hiPts.slice().reverse()]]);
      centrelines.push(
        loPts.map((p, k) => [
          (p[0] + hiPts[k][0]) / 2,
          (p[1] + hiPts[k][1]) / 2
        ])
      );
      if (v.construction) {
        for (const curve of [lo, hi]) {
          guideGroup.appendChild(
            el("polyline", {
              points: curve.map((p) => p.join(",")).join(" "),
              fill: "none", stroke: "#2b6cb0", "stroke-dasharray": "3 3", "stroke-width": 0.9
            })
          );
          for (const p of curve) {
            guideGroup.appendChild(
              el("circle", { cx: p[0], cy: p[1], r: 2.4, fill: "#bee3f8", stroke: "#2b6cb0" })
            );
          }
        }
      }
    } else if (v.algorithm === "standard") {
      const d = standardHorizontalPath({ source: row.a, target: row.b, bias: v.bias });
      ribbonGroup.appendChild(
        el("path", {
          d, fill: "none", stroke: color, "stroke-width": row.breadth, "stroke-opacity": 0.55
        })
      );
      paths.push(d);
      widths.push(row.breadth);
    } else {
      const node = (/** @type {number} */ x, /** @type {number} */ cy) => ({
        x, y: cy - v.size / 2, size: v.size, nodeWidth: NODE_W
      });
      const d = horizontalCirclePath(
        {
          source: node(LEFT_X, leftCy),
          target: node(rightX, rightCy),
          y0: row.a[1], y1: row.b[1], size: row.breadth
        },
        v.bias
      );
      ribbonGroup.appendChild(
        el("path", {
          d, fill: "none", stroke: color, "stroke-width": row.breadth, "stroke-opacity": 0.55
        })
      );
      paths.push(d);
      widths.push(row.breadth);
    }
  });

  if (v.construction && v.algorithm === "improved") {
    guideGroup.appendChild(
      el("polyline", {
        points: `${LEFT_X + NODE_W},${leftCy} ${rightX},${rightCy}`,
        fill: "none", stroke: "#c53030", "stroke-width": 1.4, "stroke-dasharray": "6 3"
      })
    );
  }

  svg.appendChild(ribbonGroup);

  // Node rectangles.
  for (const [x, cy] of [[LEFT_X, leftCy], [rightX, rightCy]]) {
    svg.appendChild(
      el("rect", {
        x, y: cy - v.size / 2, width: NODE_W, height: v.size,
        fill: "#2d3748", rx: 1.5
      })
    );
  }
  svg.appendChild(guideGroup);
  show(host, svg);

  // --- live measurement --------------------------------------------------
  let metrics;
  if (v.algorithm === "improved") {
    metrics = measureShapes({ polygons, centrelines }, { width: W, height: H, sampleScale: 2 });
  } else {
    metrics = measurePaths(paths, {
      width: W, height: H, filled: false, strokeWidths: widths, sampleScale: 2
    });
  }
  setMetrics({
    overlap: `${(100 * metrics.overlapRatio).toFixed(2)}%`,
    "max depth": metrics.maxDepth,
    crossings: metrics.crossings,
    "inked area": `${Math.round(metrics.coveredPixels / 4)} px`
  });
}

render();
