/**
 * Demo: styling and configuration.
 *
 * Everything the theme controls, plus orientation and label placement. Because
 * painting is a separate stage from scene construction, every change here
 * repaints without laying the diagram out again.
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
import { paintScene, ordinalColorScale, schemeCategory10 } from "../src/render/theme.js";
import { sceneToDOM } from "../src/render/dom.js";
import { sceneToPDF } from "../src/render/pdf.js";
import { randomLcg } from "../src/internal/random.js";

const ui = page({
  title: "Styling and configuration",
  description:
    "Painting is a separate stage from layout, so restyling never moves " +
    "anything. Watch the timings."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);

note(
  ui.stage,
  "The scene is rebuilt only when a <em>layout</em> or <em>geometry</em> " +
  "control changes; the <em>style</em> controls repaint the scene that already " +
  "exists. The two timings in the readout show the difference, which is " +
  "usually an order of magnitude.<br><br>" +
  "The same painted scene drives three backends: SVG markup, live DOM " +
  "elements, and vector PDF. Use <em>download PDF</em> to get a figure fit for " +
  "print — the figures in the accompanying paper were made this way."
);

const PALETTES = {
  energy: energyColorScale,
  category10: ordinalColorScale(schemeCategory10),
  ember: ordinalColorScale(["#8c2d1e", "#c2571f", "#e08214", "#efb261", "#7a5638"]),
  ocean: ordinalColorScale(["#0b3954", "#1b6c8c", "#2a9d8f", "#69c6b0", "#a8dadc"]),
  mono: ordinalColorScale(["#4a4a4f", "#6b6b73", "#8c8c95", "#adadb6", "#cfcfd6"])
};

/** Cached across repaints, so restyling never rebuilds the scene. */
let cachedScene = null;
let cachedKey = "";
let lastPainted = null;

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Style" },
    { type: "select", key: "palette", label: "palette", value: "energy",
      options: Object.keys(PALETTES) },
    { type: "select", key: "pathColor", label: "ribbon colour", value: "source",
      options: [
        { value: "source", label: "by source" },
        { value: "target", label: "by target" },
        { value: "source-target", label: "gradient" },
        { value: "#7a7a82", label: "single colour" }
      ] },
    { type: "range", key: "pathOpacity", label: "ribbon opacity", min: 0.1, max: 1, step: 0.05,
      value: 0.55 },
    { type: "range", key: "nodeStrokeWidth", label: "node outline", min: 0, max: 3, step: 0.1,
      value: 0.5 },
    { type: "range", key: "labelSize", label: "label size", min: 6, max: 18, step: 0.5, value: 10,
      format: (v) => `${v}px` },
    { type: "toggle", key: "labelHalo", label: "label halo", value: true },

    { type: "group", key: "_g2", label: "Labels" },
    { type: "select", key: "nodeLabelPos", label: "label position", value: "left-right",
      options: ["left-right", "top-bottom", "left", "right", "top", "bottom", "center"] },
    { type: "range", key: "nodeLabelAngle", label: "label angle", min: -90, max: 90, step: 5,
      value: 0, format: (v) => `${v}°` },

    { type: "group", key: "_g3", label: "Geometry" },
    { type: "select", key: "flowDirection", label: "orientation", value: "horizontal",
      options: ["horizontal", "vertical"] },
    { type: "range", key: "nodeWidth", label: "node width", min: 2, max: 40, step: 1, value: 15 },
    { type: "range", key: "bias", label: "ribbon bias", min: 0.1, max: 1.5, step: 0.05, value: 1 },
    { type: "range", key: "maxAngle", label: "max angle", min: 0, max: 60, step: 1, value: 20,
      format: (v) => `${v}°` },

    { type: "group", key: "_g4", label: "Export" },
    { type: "button", key: "_pdf", label: "Download PDF", onClick: downloadPDF }
  ],
  render
);

function downloadPDF() {
  if (!lastPainted) return;
  const bytes = sceneToPDF(lastPainted, { title: "flex-sankey diagram", margin: 8 });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "flex-sankey.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

function render() {
  const v = values;
  const horizontal = v.flowDirection === "horizontal";
  const W = horizontal ? 680 : 460;
  const H = horizontal ? 380 : 520;

  // Rebuild the scene only when something geometric changed.
  const key = JSON.stringify([
    v.flowDirection, v.nodeWidth, v.bias, v.maxAngle, v.nodeLabelPos, v.nodeLabelAngle
  ]);
  let buildMs = 0;
  if (key !== cachedKey || !cachedScene) {
    const t0 = performance.now();
    const links = energyData({ seed: 0.5 });
    const layout = sankeyAddDummies(sankeyLayers({ links }, { nodeAlign: "center" }));
    sankeyOrderNodes(layout, { nsteps: 50, random: randomLcg(4) });
    const geometry = sankeyGeometricLayout(layout, {
      size: horizontal ? H : W, whitespace: 0.3, margin: 12
    });
    const renderLayout = sankeyRenderLayout(geometry, {
      flowDirection: /** @type {any} */ (v.flowDirection),
      length: horizontal ? W : H,
      nodeWidth: Number(v.nodeWidth)
    });
    cachedScene = buildScene(renderLayout, {
      width: W, height: H,
      bias: Number(v.bias), maxAngle: Number(v.maxAngle),
      nodeLabelPos: /** @type {any} */ (v.nodeLabelPos),
      nodeLabelAngle: Number(v.nodeLabelAngle),
      nodeLabelPadding: 5
    });
    cachedKey = key;
    buildMs = performance.now() - t0;
  }

  const t1 = performance.now();
  const painted = paintScene(cachedScene, {
    colorScale: PALETTES[/** @type {"energy"} */ (v.palette)],
    pathColor: v.pathColor,
    pathOpacity: Number(v.pathOpacity),
    nodeStrokeWidth: Number(v.nodeStrokeWidth),
    labelFont: `${v.labelSize}px sans-serif`,
    labelFilter: v.labelHalo ? "drop-shadow( 0px 0px 2px white )" : "none"
  });
  const paintMs = performance.now() - t1;
  lastPainted = painted;

  const wrap = document.createElement("div");

  wrap.appendChild(sceneToDOM(painted, { interactive: true }));
  show(host, wrap);

  setMetrics({
    "layout + scene": buildMs ? `${buildMs.toFixed(1)} ms` : "cached",
    repaint: `${paintMs.toFixed(2)} ms`,
    gradients: painted.gradients.length,
    links: painted.links.length
  });
}

render();
