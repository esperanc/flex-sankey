/**
 * flex-sankey — a flexible, modular Sankey diagram layout library.
 *
 * The layout is exposed as separate stages rather than a single entry point,
 * so each can be tuned, inspected, or replaced between steps:
 *
 * 1. `sankeyLayers` — assign nodes to layers
 * 2. `sankeyAddDummies` — route multi-layer links through dummy nodes
 * 3. `sankeyOrderNodes` — combinatorial optimisation, minimising crossings
 * 4. `sankeyGeometricLayout` — geometric optimisation, assigning coordinates
 * 5. `sankeyRenderLayout` — resolve node boxes and path geometry
 * 6. rendering — `buildScene`, then `paintScene`, then either `sceneToSVG`
 *    (markup, headless) or `sceneToDOM` (live elements, interactive)
 *
 * Stages 1 to 5, scene construction and painting are all free of any DOM
 * dependency and run headless. Only `sceneToDOM` needs a browser.
 *
 * `flexSankey`, `flexSankeySVG` and `flexSankeyScene` run every stage in one
 * call, for the common case.
 *
 * @module flex-sankey
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

export * from "./paths/index.js";
export * from "./layout/index.js";
export * from "./data/index.js";
export * from "./render/index.js";
export * from "./metrics/index.js";
export { flexSankey, flexSankeySVG, flexSankeyScene } from "./flex-sankey.js";
export { randomLcg } from "./internal/random.js";
