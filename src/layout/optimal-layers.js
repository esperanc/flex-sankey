/**
 * Layer assignment by trial.
 *
 * @module layout/optimal-layers
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { sankeyLayers } from "./layers.js";
import { sankeyAddDummies } from "./dummies.js";
import { sankeyOrderNodes } from "./ordering.js";

/** Every alignment strategy, in the order they are tried. */
const ALIGNMENTS = /** @type {const} */ ([
  "center",
  "left",
  "right",
  "justify",
  "heuristic"
]);

/**
 * Runs `sankeyLayers` under every `nodeAlign` strategy and keeps whichever
 * yields the fewest crossings after a short probe.
 *
 * The probe is deliberately shallow: it only has to rank the strategies, not
 * produce the final ordering.
 *
 * @param {import("./layers.js").SankeyData} data
 * @param {import("./layers.js").LayerOptions & import("./ordering.js").OrderOptions} [options]
 * @param {number} [maxProbeSteps=5] Ordering passes per trial.
 * @returns {import("./layers.js").Layout} The best layering found.
 */
export function sankeyOptimalLayers(data, options = {}, maxProbeSteps = 5) {
  let optimalLayout;
  let best = Infinity;
  for (const nodeAlign of ALIGNMENTS) {
    // Copy rather than mutate: the caller's options object is theirs.
    const layout = sankeyLayers(data, { ...options, nodeAlign });
    const { crossings } = sankeyOrderNodes(sankeyAddDummies(layout), {
      ...options,
      nsteps: maxProbeSteps
    });
    if (crossings < best) {
      optimalLayout = layout;
      best = crossings;
    }
  }
  return /** @type {import("./layers.js").Layout} */ (optimalLayout);
}
