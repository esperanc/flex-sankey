/**
 * Rendering — stage 6, in three independent steps.
 *
 * ```
 * renderLayout --buildScene--> Scene --paintScene--> PaintedScene --+--> sceneToSVG  (string, headless)
 *              (geometry)            (style)                        +--> sceneToPDF  (vector, print)
 *                                                                    \--> sceneToDOM  (live, interactive)
 * ```
 *
 * The split means geometry can be measured without styling it, a diagram can
 * be restyled without relaying it out, and the same scene can be emitted as a
 * string under Node or as live elements in a browser.
 *
 * @module render
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

export { buildScene, refreshLink, refreshNode } from "./scene.js";
export { paintScene, ordinalColorScale, schemeCategory10 } from "./theme.js";
export { sceneToSVG } from "./svg.js";
export { sceneToPDF } from "./pdf.js";
export { sceneToDOM } from "./dom.js";
export { labelAlignment, resolveLabelPos } from "./labels.js";
