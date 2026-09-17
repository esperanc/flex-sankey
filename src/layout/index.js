/**
 * The layout pipeline, stage by stage.
 *
 * Every export here is free of any DOM or drawing dependency, so the whole
 * pipeline runs headless — which is what lets the benchmark harness measure it
 * in Node.
 *
 * @module layout
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

export { sankeyLayers } from "./layers.js";
export { sankeyOptimalLayers } from "./optimal-layers.js";
export { sankeyAddDummies, sankeyAddPathNavigation } from "./dummies.js";
export { sankeyOrderNodes, sankeyOrderLayoutLinks } from "./ordering.js";
export { bipartite } from "./bipartite.js";
export { pSystem } from "./psystem.js";
export {
  sankeyGeometricLayout,
  layoutToPSystem,
  PSystemToGeometricLayout
} from "./geometry.js";
export { sankeyRenderLayout, combineRenderLayouts } from "./render-layout.js";
export { sankeyLayoutCopy } from "./copy.js";
