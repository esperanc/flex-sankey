/**
 * The energy-matrix example: a synthetic national energy balance.
 *
 * This is the specification behind the figures in the accompanying paper, and
 * the basis of the benchmark suite. It is a realistic shape — primary sources
 * feeding conversion, conversion feeding consumption sectors, with imports,
 * exports and losses cutting across — without being anyone's real data.
 *
 * @module data/energy
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/** @type {import("./synthetic.js").GraphSpec} */
export const energySpec = {
  linkPairs: [
    [
      [
        "Hydro",
        "Nat Gas",
        "Coal",
        "Biofuels",
        "Nuclear",
        "Geothermal",
        "Solar & Wind",
        "Oil Products"
      ],
      ["Electricity"]
    ],
    [["Crude"], ["Oil Products"]],
    [["Imp."], ["Crude", "Nat Gas", "Coal", "Oil Products", "Electricity"]],
    [["Crude", "Nat Gas", "Coal", "Oil Products", "Electricity"], ["Exp."]],
    [["Oil Products", "Electricity"], ["Heat & Waste"]],
    [
      ["Nat Gas", "Coal", "Biofuels", "Oil Products", "Electricity"],
      ["Transport", "Industry", "Residential", "Commercial", "Other"]
    ]
  ],
  sources: [
    "Crude",
    "Nat Gas",
    "Coal",
    "Hydro",
    "Biofuels",
    "Nuclear",
    "Solar & Wind",
    "Geothermal",
    "Imp."
  ],
  sourceTotal: 1000,
  optionalNodes: [
    "Hydro",
    "Nuclear",
    "Solar & Wind",
    "Geothermal",
    "Biofuels",
    "Coal"
  ],
  optionalLinks: [
    ["Imp.", /.*/],
    [/.*/, "Exp."]
  ]
};

/**
 * Totalizing nodes for the energy example: one gathering primary supply, one
 * gathering final consumption.
 *
 * @type {import("./synthetic.js").SumNodeSpec[]}
 */
export const energySumNodes = [
  {
    sources: [
      "Crude",
      "Hydro",
      "Nat Gas",
      "Coal",
      "Biofuels",
      "Nuclear",
      "Geothermal",
      "Solar & Wind"
    ],
    targets: [
      "Oil Products",
      "Electricity",
      "Transport",
      "Industry",
      "Residential",
      "Commercial",
      "Other"
    ],
    sumNode: "Primary energy"
  },
  {
    sources: ["Nat Gas", "Coal", "Biofuels", "Oil Products", "Electricity"],
    targets: ["Transport", "Industry", "Residential", "Commercial", "Other"],
    sumNode: "Total consumption"
  }
];

/** Node keys, in the order the colour scheme below matches. */
export const energyCategories = [
  "Nat Gas", "Other", "Biofuels", "Electricity", "Coal", "Residential",
  "Imp.", "Heat & Waste", "Solar & Wind", "Crude", "Exp.", "Hydro",
  "Oil Products", "Transport", "Industry", "Commercial",
  "Primary energy", "Total consumption", "Nuclear"
];

/** Colours matching `energyCategories`, index for index. */
export const energyColors = [
  "#f45125", // Nat Gas
  "#bbbc99", // Other
  "#80c250", // Biofuels
  "#cc9900", // Electricity
  "#3c3c49", // Coal
  "#976828", // Residential
  "#1abc9c", // Imp.
  "#e74c3c", // Heat & Waste
  "#fcd200", // Solar & Wind
  "#3252a3", // Crude
  "#9b59b6", // Exp.
  "#478ecc", // Hydro
  "#0d666e", // Oil Products
  "#39773a", // Transport
  "#46c7f4", // Industry
  "#d791c1", // Commercial
  "#969696", // Primary energy
  "#969696", // Total consumption
  "#a66aab"  // Nuclear
];
