/**
 * Dataset generation and the bundled example specification.
 *
 * @module data
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

export { makeSyntheticSankeyData, addTotalizingNodes } from "./synthetic.js";
export { makeLayeredSpec } from "./layered.js";
export {
  energySpec,
  energySumNodes,
  energyCategories,
  energyColors
} from "./energy.js";
