/**
 * The whole pipeline in one call.
 *
 * Convenience only: it runs the six stages back to back with a single options
 * object. Anything beyond the common case — inspecting a stage, tuning one
 * independently, reusing an ordering across datasets, combining a horizontal
 * and a vertical layout — wants the stages called directly.
 *
 * @module flex-sankey/oneshot
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { sankeyLayers } from "./layout/layers.js";
import { sankeyOptimalLayers } from "./layout/optimal-layers.js";
import { sankeyAddDummies } from "./layout/dummies.js";
import { sankeyOrderNodes } from "./layout/ordering.js";
import { sankeyGeometricLayout } from "./layout/geometry.js";
import { sankeyRenderLayout } from "./layout/render-layout.js";
import { buildScene } from "./render/scene.js";
import { paintScene } from "./render/theme.js";
import { sceneToSVG } from "./render/svg.js";
import { sceneToDOM } from "./render/dom.js";

/**
 * Runs every stage and returns the intermediate results alongside the final
 * painted scene.
 *
 * Layer assignment uses `sankeyLayers` when `nodeAlign` is given, and
 * `sankeyOptimalLayers` — which tries them all — when it is not.
 *
 * @param {import("./layout/layers.js").SankeyData} data
 * @param {import("./layout/layers.js").LayerOptions &
 *   import("./layout/ordering.js").OrderOptions &
 *   import("./layout/geometry.js").GeometricOptions &
 *   import("./layout/render-layout.js").RenderLayoutOptions &
 *   import("./render/scene.js").SceneOptions &
 *   import("./render/theme.js").Theme} [options]
 * @returns {{
 *   layout: any,
 *   renderLayout: import("./layout/render-layout.js").RenderLayout,
 *   scene: import("./render/scene.js").Scene,
 *   painted: import("./render/theme.js").PaintedScene,
 *   crossings: number
 * }}
 */
export function flexSankeyScene(data, options = {}) {
  const layered = options.nodeAlign
    ? sankeyLayers(data, options)
    : sankeyOptimalLayers(data, options);
  const ordered = sankeyOrderNodes(sankeyAddDummies(layered), options);
  const geometry = sankeyGeometricLayout(ordered, options);
  const renderLayout = sankeyRenderLayout(geometry, options);
  const scene = buildScene(renderLayout, options);
  const painted = paintScene(scene, options);
  return {
    layout: geometry,
    renderLayout,
    scene,
    painted,
    crossings: ordered.crossings
  };
}

/**
 * Builds a diagram as SVG markup. Works under Node.
 *
 * @param {import("./layout/layers.js").SankeyData} data
 * @param {Parameters<typeof flexSankeyScene>[1] & import("./render/svg.js").SvgOptions} [options]
 * @returns {string}
 */
export function flexSankeySVG(data, options = {}) {
  return sceneToSVG(flexSankeyScene(data, options).painted, options);
}

/**
 * Builds a diagram as a live SVG element. Requires a DOM.
 *
 * @param {import("./layout/layers.js").SankeyData} data
 * @param {Parameters<typeof flexSankeyScene>[1] & import("./render/dom.js").DomOptions} [options]
 * @returns {SVGSVGElement}
 */
export function flexSankey(data, options = {}) {
  return sceneToDOM(flexSankeyScene(data, options).painted, options);
}
