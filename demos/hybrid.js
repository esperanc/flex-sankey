/**
 * Demo: a hybrid horizontal and vertical diagram.
 *
 * Two layouts computed in different orientations, merged before rendering.
 * This is possible only because stage 5 produces a plain description of boxes
 * and paths with no drawing concerns attached.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { page, controls, readout, note, show } from "./kit.js";
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout, combineRenderLayouts
} from "../src/layout/index.js";
import { buildScene } from "../src/render/scene.js";
import { paintScene, ordinalColorScale } from "../src/render/theme.js";
import { sceneToSVG } from "../src/render/svg.js";
import { makeSyntheticSankeyData } from "../src/data/synthetic.js";
import { randomLcg } from "../src/internal/random.js";

const ui = page({
  title: "Hybrid horizontal and vertical",
  description:
    "An energy balance flowing left to right, and the emissions it causes " +
    "flowing bottom to top, in one figure."
});

const setMetrics = readout(ui.stage);
const host = document.createElement("div");
ui.stage.appendChild(host);

note(
  ui.stage,
  "The two diagrams are laid out independently, then " +
  "<code>combineRenderLayouts</code> merges them. Nodes present in both — the " +
  "six sectors — become rectangles carrying two encodings at once: their " +
  "width comes from the vertical layout, their height from the horizontal one. " +
  "The two layouts are aligned on the bounding box of those shared nodes.<br><br>" +
  "Emissions are drawn bottom to top so that the gases read as escaping " +
  "upward. No part of the library knows about this construction: it follows " +
  "from stage 5 being free of rendering concerns."
);

/** Sectors common to both diagrams; they are what the merge hinges on. */
const SECTORS = [
  "Power industry", "Buildings", "Transport",
  "Industrial combustion", "Processes", "Fuel exploitation"
];

const ENERGY_SPEC = {
  linkPairs: [
    [["Coal", "Nat Gas", "Oil", "Other fossil"], ["From fossil"]],
    [["Biofuel", "Hydro", "Nuclear", "Other renew.", "Solar", "Wind"], ["Clean energy"]],
    [["Clean energy", "From fossil"],
     ["Power industry", "Buildings", "Transport", "Industrial combustion"]],
    [["From fossil"], ["Fuel exploitation", "Processes"]]
  ],
  sources: ["Biofuel", "Hydro", "Nuclear", "Other renew.", "Solar", "Wind",
            "Coal", "Nat Gas", "Oil", "Other fossil"]
};

const EMISSION_SPEC = {
  linkPairs: [
    [["Emissions"], [...SECTORS, "Agriculture", "LULUCF"]],
    [["CO2", "CH4", "FGas", "N2O"], ["Emissions"]]
  ],
  sources: ["CO2", "CH4", "FGas", "N2O"]
};

const palette = ordinalColorScale([
  "#4c7d6f", "#69a493", "#6bceb3", "#90ebd2", "#233933", "#36594f",
  "#970000", "#742d1c", "#371f16", "#c95757", "#ce7a7a", "#e59663",
  "#e77e37", "#b18f17", "#f0b900", "#ffda14", "#ffdd68", "#444444",
  "#2c0051", "#2b0099", "#4600fa", "#62a6ff", "#6e3cee", "#6e4cbb", "#5e00ae"
]);

const values = controls(
  ui.controls,
  [
    { type: "group", key: "_g1", label: "View" },
    { type: "select", key: "view", label: "show", value: "combined",
      options: [
        { value: "combined", label: "combined" },
        { value: "horizontal", label: "energy only" },
        { value: "vertical", label: "emissions only" }
      ] },
    { type: "group", key: "_g2", label: "Layout" },
    { type: "range", key: "size", label: "extent", min: 300, max: 560, step: 10, value: 400 },
    { type: "range", key: "minSep", label: "node separation", min: 8, max: 60, step: 1, value: 25 },
    { type: "range", key: "bias", label: "ribbon bias", min: 0.2, max: 1.2, step: 0.05, value: 0.6 },
    { type: "range", key: "energySeed", label: "energy seed", min: 0, max: 0.9, step: 0.1, value: 0.6 },
    { type: "range", key: "emissionSeed", label: "emissions seed", min: 0, max: 0.9, step: 0.1,
      value: 0.8 }
  ],
  render
);

/**
 * Lays out one half of the figure.
 * @param {any} spec
 * @param {number} seed
 * @param {string[]} ranks
 * @param {"horizontal"|"vertical"} flowDirection
 * @param {number} size
 * @param {number} minSep
 */
function half(spec, seed, ranks, flowDirection, size, minSep) {
  const links = makeSyntheticSankeyData(spec, { randomSeed: seed, regularity: 0.1 });
  const layout = sankeyAddDummies(sankeyLayers({ links, ranks }));
  sankeyOrderNodes(layout, { nsteps: 30, random: randomLcg(2) });
  const geometry = sankeyGeometricLayout(layout, { size, minSep });
  return sankeyRenderLayout(geometry, {
    flowDirection, length: size, marginLeft: 40, marginRight: 46
  });
}

function render() {
  const v = values;
  const size = Number(v.size);
  const minSep = Number(v.minSep);

  const horizontal = half(
    ENERGY_SPEC, Number(v.energySeed),
    ["From fossil", "Clean energy", ...SECTORS],
    "horizontal", size, minSep
  );
  const vertical = half(
    EMISSION_SPEC, Number(v.emissionSeed),
    SECTORS, "vertical", size, minSep
  );

  const layout =
    v.view === "horizontal" ? horizontal
    : v.view === "vertical" ? vertical
    : combineRenderLayouts(horizontal, vertical);

  const scene = buildScene(layout, {
    width: layout.length,
    height: layout.breadth,
    bias: Number(v.bias),
    nodeLabelPos: v.view === "vertical" ? "top-bottom" : "top",
    nodeLabelAngle: v.view === "vertical" ? -90 : 0,
    nodeLabelPadding: 5
  });
  const painted = paintScene(scene, {
    colorScale: palette, pathColor: "source-target",
    pathOpacity: 0.55, nodeStrokeWidth: 0, labelFont: "9px sans-serif"
  });

  const wrap = document.createElement("div");
  wrap.innerHTML = sceneToSVG(painted, { titles: false });
  show(host, wrap);

  const shared = new Set(scene.nodes.map((n) => n.key).filter((k) => SECTORS.includes(k)));
  setMetrics({
    view: v.view,
    "shared nodes": shared.size,
    boxes: scene.nodes.length,
    links: scene.links.length,
    extent: `${Math.round(layout.length)}×${Math.round(layout.breadth)}`
  });
}

render();
