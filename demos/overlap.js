/**
 * Demo: how overlap is measured.
 *
 * Renders the coverage buffer the metric is computed from, so the number has a
 * picture attached. Each pixel is shaded by how many links cover it.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { page, controls, readout, note, show, energyData, energyColorScale } from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene } from "../src/render/theme.js";
import { sceneToSVG } from "../src/render/svg.js";
import { shapesFromScene, rasterizeCoverage, overlapStatistics } from "../src/metrics/index.js";
import { randomLcg } from "../src/internal/random.js";

const W = 680;
const H = 380;

const ui = page({
  title: "Measuring overlap",
  description:
    "The coverage buffer behind the overlap figure: every sample shaded by how " +
    "many links cover it."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);

note(
  ui.stage,
  "Ribbons are filled into an integer buffer by scanline rasterization under " +
  "the nonzero winding rule, sampling at sample centres with no " +
  "anti-aliasing — so the figure is exactly reproducible on any machine. Each " +
  "sample counts how many <em>links</em> cover it, not how many drawn pieces: " +
  "one link routed through dummy nodes is drawn as several abutting pieces, " +
  "and their shared edges are not overlap.<br><br>" +
  "Grey is covered once. Warmer colours are deeper pileups. The earlier " +
  "approach inferred depth from alpha compositing at 50 % opacity, which " +
  "cannot separate anything past four layers; raise the sample scale here and " +
  "the count stays exact."
);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "View" },
    { type: "select", key: "view", label: "show", value: "coverage",
      options: [
        { value: "coverage", label: "coverage buffer" },
        { value: "diagram", label: "diagram" },
        { value: "split", label: "both" }
      ] },
    { type: "range", key: "sampleScale", label: "sample scale", min: 1, max: 4, step: 1, value: 2,
      format: (v) => `${v}×${v} per px` },

    { type: "group", key: "_g2", label: "Layout" },
    { type: "range", key: "seed", label: "data seed", min: 0, max: 0.9, step: 0.1, value: 0.5 },
    { type: "range", key: "nsteps", label: "ordering passes", min: 0, max: 150, step: 5, value: 40,
      hint: "Fewer passes, more crossings and more overlap." },
    { type: "range", key: "bias", label: "ribbon bias", min: 0.1, max: 1.5, step: 0.05, value: 1 },
    { type: "toggle", key: "joinDummies", label: "packed paths", value: false }
  ],
  render
);

/** Colour ramp for coverage depth. */
const DEPTH_COLORS = [
  [235, 235, 238], // 1 — covered once
  [252, 211, 133], // 2
  [244, 147, 66],  // 3
  [214, 76, 44],   // 4
  [140, 30, 30]    // 5+
];

function render() {
  const v = values;
  const links = energyData({ seed: Number(v.seed) });
  const layout = sankeyAddDummies(sankeyLayers({ links }, { nodeAlign: "center" }));
  sankeyOrderNodes(layout, { nsteps: Number(v.nsteps), random: randomLcg(4) });
  const geometry = sankeyGeometricLayout(layout, {
    size: H, whitespace: 0.3, margin: 12, joinDummies: v.joinDummies
  });
  const scene = buildScene(sankeyRenderLayout(geometry, { length: W }), {
    width: W, height: H, bias: Number(v.bias), nodeLabelPadding: 4
  });

  const scale = Number(v.sampleScale);
  const shapes = shapesFromScene(scene);
  const coverage = rasterizeCoverage(shapes.polygons, { width: W, height: H, scale });
  const stats = overlapStatistics(coverage);

  const container = document.createElement("div");

  if (v.view !== "diagram") {
    const canvas = document.createElement("canvas");
    canvas.width = coverage.width;
    canvas.height = coverage.height;
    canvas.style.width = `${W}px`;
    canvas.style.maxWidth = "100%";
    canvas.style.border = "1px solid var(--line)";
    canvas.style.borderRadius = "5px";
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(coverage.width, coverage.height);
    for (let i = 0; i < coverage.counts.length; i++) {
      const depth = coverage.counts[i];
      const p = i * 4;
      if (depth === 0) {
        image.data[p] = image.data[p + 1] = image.data[p + 2] = 255;
        image.data[p + 3] = 255;
        continue;
      }
      const [r, g, b] = DEPTH_COLORS[Math.min(DEPTH_COLORS.length - 1, depth - 1)];
      image.data[p] = r;
      image.data[p + 1] = g;
      image.data[p + 2] = b;
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    container.appendChild(canvas);

    const legend = document.createElement("div");
    legend.style.cssText =
      "display:flex;gap:12px;margin-top:8px;font-family:var(--mono);font-size:11px;align-items:center";
    DEPTH_COLORS.forEach((c, i) => {
      const item = document.createElement("span");
      item.style.cssText = "display:flex;align-items:center;gap:5px";
      const swatch = document.createElement("span");
      swatch.style.cssText =
        `width:12px;height:12px;border-radius:2px;display:inline-block;background:rgb(${c.join(",")})`;
      item.append(swatch, i === DEPTH_COLORS.length - 1 ? `${i + 1}+ links` : `${i + 1} link${i ? "s" : ""}`);
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  if (v.view !== "coverage") {
    const painted = paintScene(scene, {
      colorScale: energyColorScale, pathColor: "source",
      pathOpacity: 0.55, nodeStrokeWidth: 0.4, labelFont: "9px sans-serif"
    });
    const wrap = document.createElement("div");
    wrap.style.marginTop = v.view === "split" ? "16px" : "0";
    wrap.innerHTML = sceneToSVG(painted, { titles: false });
    container.appendChild(wrap);
  }

  show(host, container);

  setMetrics({
    overlap: `${(100 * stats.overlapRatio).toFixed(2)}%`,
    excess: `${(100 * stats.excessRatio).toFixed(2)}%`,
    "max depth": stats.maxDepth,
    "covered": stats.covered.toLocaleString(),
    "overlapping": stats.overlapping.toLocaleString()
  });
}

render();
