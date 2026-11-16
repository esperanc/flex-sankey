/**
 * The benchmark dataset manifest.
 *
 * Every dataset used for measurement is declared here and nowhere else. Each
 * is fully determined by its specification plus three numbers, so the whole
 * suite regenerates exactly from this file — no interactive sliders, no lost
 * settings.
 *
 * Run `npm run bench:data` to write the generated link lists to
 * `benchmarks/datasets/`, which are committed so results can be audited
 * without regenerating anything.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { energySpec, makeLayeredSpec } from "../src/data/index.js";

/**
 * Probability of *keeping* each optional node and link.
 *
 * Shared by both suites so they vary comparably. At this value roughly half
 * the ten seeds in each suite yield a distinct node set, with the rest varying
 * in link count and magnitudes. It must stay below 1: at exactly 1 nothing is
 * ever dropped and every seed produces the same topology.
 */
export const OPTIONAL_PROBABILITY = 0.8;

/** How evenly flow is split. Matches the value used for the paper's figures. */
export const REGULARITY = 0.1;

/** Ten seeds, giving one bar per dataset in the comparison charts. */
export const SEEDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/**
 * The shape of the abstract layered suite.
 *
 * Chosen to be roughly three times the energy suite in both nodes and links,
 * so the comparison spans two clearly different scales rather than ten
 * variants of one. `maxSpan: 3` lets links skip up to two layers, which forces
 * dummy-node routing and is what actually makes a diagram hard to lay out.
 */
export const LAYERED_SHAPE = {
  layers: [8, 10, 12, 10, 8, 6],
  fanout: 3,
  maxSpan: 3,
  optionalSources: 0.5,
  seed: 1
};

/**
 * @typedef {object} DatasetEntry
 * @property {string} id
 * @property {number} [randomSeed]
 * @property {number} [regularity]
 * @property {number} [optionalProbability]
 * @property {string} [file] A CSV under `benchmarks/real/`. When present the
 *   dataset is *loaded* rather than generated, and the seed fields do not
 *   apply. See `benchmarks/real/PROVENANCE.md`.
 */

/**
 * @typedef {object} Suite
 * @property {string} id
 * @property {string} label Shown on chart axes.
 * @property {string} description
 * @property {import("../src/data/synthetic.js").GraphSpec} [spec] Absent for
 *   suites whose datasets are loaded from files.
 * @property {DatasetEntry[]} datasets
 */

/**
 * @param {string} id
 * @returns {DatasetEntry[]}
 */
const seeded = (id) =>
  SEEDS.map((randomSeed, i) => ({
    id: `${id}-${String(i).padStart(2, "0")}`,
    randomSeed,
    regularity: REGULARITY,
    optionalProbability: OPTIONAL_PROBABILITY
  }));

/** @type {Suite[]} */
export const suites = [
  {
    id: "energy",
    label: "Energy matrix",
    description:
      "A synthetic national energy balance: primary sources feeding conversion, " +
      "conversion feeding consumption sectors, with imports, exports and losses " +
      "cutting across. The family used for the figures in the paper.",
    spec: energySpec,
    datasets: seeded("energy")
  },
  {
    id: "layered",
    label: "Layered process",
    description:
      "An abstract layered flow graph with no domain attached, generated to a " +
      "requested shape. Roughly three times the size of the energy suite, and " +
      "scalable further by widening LAYERED_SHAPE.",
    spec: makeLayeredSpec(LAYERED_SHAPE),
    datasets: seeded("layered")
  },
  {
    id: "real",
    label: "Published data",
    description:
      "Real published data rather than generated data. A UK energy scenario " +
      "for 2050 from the Department of Energy & Climate Change, via Tom " +
      "Counsell, obtained from the d3-sankey example that uses it. Included " +
      "so the comparison rests on data this project did not choose or shape.",
    datasets: [{ id: "real-uk-energy-2050", file: "uk-energy-2050.csv" }]
  }
];

/**
 * Looks up a suite by id.
 * @param {string} id
 * @returns {Suite}
 */
export function suiteById(id) {
  const suite = suites.find((s) => s.id === id);
  if (!suite) throw new Error(`no such suite: ${id}`);
  return suite;
}
