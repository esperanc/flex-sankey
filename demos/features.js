/**
 * Demo: the three design features.
 *
 * Packed paths, totalizing nodes and hidden nodes, each switchable, with the
 * effect on clutter measured as you go.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import {
  page, controls, readout, note, show, energyData, energyColorScale, INCIDENTAL
} from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene } from "../src/render/theme.js";
import { sceneToDOM } from "../src/render/dom.js";
import { measureScene } from "../src/metrics/index.js";
import { randomLcg } from "../src/internal/random.js";

const W = 700;
const H = 400;

const ui = page({
  title: "Design features",
  description:
    "Packed paths, totalizing nodes and hidden nodes, and what each does to " +
    "the clutter. Drag a node; hover a ribbon."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);

note(
  ui.stage,
  "<strong>Packed paths</strong> merge runs of adjacent dummy nodes, so links " +
  "following similar routes run side by side instead of being spread apart. " +
  "It only changes the drawing, never the ordering — watch the crossing count " +
  "stay put while the box count halves.<br><br>" +
  "<strong>Totalizing nodes</strong> gather a bundle of links into an " +
  "intermediate node. They cut overlap sharply, but note that they " +
  "<em>raise</em> the geometric crossing count: splitting each link in two " +
  "obliges the ribbons to fan in and out of the new node. Their benefit is in " +
  "overlap and density, not in crossings.<br><br>" +
  "<strong>Hidden nodes</strong> drop the incidental categories — here " +
  "imports, exports and losses — from the layout entirely, showing their flows " +
  "as triangular markers with dashed rules conveying magnitude."
);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "Features" },
    { type: "toggle", key: "packed", label: "packed paths", value: false },
    { type: "toggle", key: "totalizing", label: "totalizing nodes", value: false,
      hint: "Adds 'Primary energy' and 'Total consumption'." },
    { type: "toggle", key: "hidden", label: "hidden nodes", value: false,
      hint: "Hides imports, exports, heat & waste." },

    { type: "group", key: "_g2", label: "Layout" },
    { type: "range", key: "seed", label: "data seed", min: 0, max: 0.9, step: 0.1, value: 0.5 },
    { type: "range", key: "nsteps", label: "ordering passes", min: 5, max: 200, step: 5, value: 60 },
    { type: "range", key: "whitespace", label: "white space", min: 0.1, max: 0.6, step: 0.02,
      value: 0.3, format: (x) => `${Math.round(x * 100)}%` }
  ],
  render
);

function render() {
  const v = values;
  const links = energyData({ seed: Number(v.seed), totalizing: v.totalizing });
  const layout = sankeyAddDummies(
    sankeyLayers(
      { links, hidden: v.hidden ? INCIDENTAL : undefined },
      { nodeAlign: "center" }
    )
  );
  const ordered = sankeyOrderNodes(layout, {
    nsteps: Number(v.nsteps),
    random: randomLcg(4)
  });
  const geometry = sankeyGeometricLayout(ordered, {
    size: H, whitespace: Number(v.whitespace), margin: 12, joinDummies: v.packed
  });
  const renderLayout = sankeyRenderLayout(geometry, {
    length: W, marginLeft: v.hidden ? 44 : 6, marginRight: 6
  });
  const scene = buildScene(renderLayout, { width: W, height: H, nodeLabelPadding: 5 });
  const painted = paintScene(scene, {
    colorScale: energyColorScale, pathColor: "source",
    pathOpacity: 0.55, nodeStrokeWidth: 0.5, labelFont: "10px sans-serif"
  });

  show(host, sceneToDOM(painted, { interactive: true }));

  const metrics = measureScene(scene, { sampleScale: 2 });
  setMetrics({
    crossings: metrics.crossings,
    "crossings (layers)": ordered.crossings,
    overlap: `${(100 * metrics.overlapRatio).toFixed(2)}%`,
    boxes: scene.nodes.filter((n) => !n.dummy).length,
    "drawn boxes": scene.nodes.length,
    links: scene.links.length
  });
}

render();
