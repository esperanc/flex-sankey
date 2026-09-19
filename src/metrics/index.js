/**
 * Measuring the visual quality of a Sankey diagram.
 *
 * Three figures, each defined precisely enough to reimplement:
 *
 * - **crossings** — the number of proper intersections between the centre
 *   lines of two *different* links. Touching at a shared endpoint does not
 *   count, nor does one link meeting itself where it passes through a dummy
 *   node.
 * - **total length** — the summed length of every link's centre line, in
 *   pixels, after flattening curves at a fixed tolerance.
 * - **overlap** — what fraction of the inked area is covered by more than one
 *   link, measured by exact scanline rasterization at pixel centres.
 *
 * The same code measures any diagram, whether built here or parsed out of
 * another library's SVG, and both go through the same flattening, so the
 * comparison is like for like.
 *
 * @module metrics
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { polylineLength } from "./flatten.js";
import { countCrossings } from "./crossings.js";
import { rasterizeCoverage, overlapStatistics } from "./raster.js";
import { shapesFromScene, shapesFromPaths, thickenCentrelines } from "./shapes.js";

export { flattenCubic, flattenQuadratic, flattenArc, polylineLength } from "./flatten.js";
export { parsePath } from "./svg-path.js";
export { countCrossings } from "./crossings.js";
export { rasterizeCoverage, overlapStatistics } from "./raster.js";
export { shapesFromScene, shapesFromPaths, thickenCentrelines } from "./shapes.js";

/**
 * @typedef {object} DiagramMetrics
 * @property {number} crossings Proper intersections between different links.
 * @property {number} totalLength Summed centre-line length, in pixels.
 * @property {number} overlapRatio Fraction of inked area covered more than
 *   once.
 * @property {number} excessRatio Depth-weighted overlap: surplus coverage per
 *   unit of inked area.
 * @property {number} maxDepth Greatest number of links over one sample.
 * @property {number} coveredPixels Inked area, in samples.
 * @property {number} linkCount Links measured.
 */

/**
 * Measures a set of extracted shapes.
 *
 * @param {import("./shapes.js").DiagramShapes} shapes
 * @param {object} options
 * @param {number} options.width Diagram width in pixels.
 * @param {number} options.height Diagram height in pixels.
 * @param {number} [options.sampleScale=2] Rasterization samples per pixel.
 * @returns {DiagramMetrics}
 */
export function measureShapes(shapes, { width, height, sampleScale = 2 }) {
  const { crossings } = countCrossings(shapes.centrelines, {
    owner: shapes.centrelineOwner
  });
  const totalLength = shapes.centrelines.reduce(
    (sum, line) => sum + polylineLength(line),
    0
  );
  const coverage = rasterizeCoverage(shapes.polygons, {
    width,
    height,
    scale: sampleScale
  });
  const overlap = overlapStatistics(coverage);

  return {
    crossings,
    totalLength,
    overlapRatio: overlap.overlapRatio,
    excessRatio: overlap.excessRatio,
    maxDepth: overlap.maxDepth,
    coveredPixels: overlap.covered,
    linkCount: shapes.polygons.length
  };
}

/**
 * Measures a diagram built by this library.
 *
 * @param {import("../render/scene.js").Scene} scene
 * @param {object} [options]
 * @param {number} [options.sampleScale=2]
 * @param {number} [options.tolerance=0.25]
 * @returns {DiagramMetrics}
 */
export function measureScene(scene, { sampleScale = 2, tolerance = 0.25 } = {}) {
  return measureShapes(shapesFromScene(scene, tolerance), {
    width: scene.width,
    height: scene.height,
    sampleScale
  });
}

/**
 * Measures a diagram rendered by another library.
 *
 * @param {string[]} pathData One `d` attribute per link.
 * @param {object} options
 * @param {number} options.width
 * @param {number} options.height
 * @param {boolean} [options.filled=true] Whether the paths are closed ribbon
 *   outlines or stroked centre lines.
 * @param {number[]} [options.strokeWidths] Ribbon breadth per link. Required
 *   when `filled` is false, since a stroked line encloses no measurable area
 *   on its own.
 * @param {number} [options.sampleScale=2]
 * @param {number} [options.tolerance=0.25]
 * @returns {DiagramMetrics}
 */
export function measurePaths(
  pathData,
  { width, height, filled = true, strokeWidths, sampleScale = 2, tolerance = 0.25 }
) {
  const shapes = shapesFromPaths(pathData, { filled, tolerance });
  if (!filled) {
    if (!strokeWidths) {
      throw new Error("measurePaths needs strokeWidths when filled is false");
    }
    const widened = thickenCentrelines(
      shapes.centrelines,
      strokeWidths,
      shapes.centrelineOwner
    );
    // Regroup by link: coverage counts links, not pieces, so the several
    // pieces of one route must not register as overlapping one another.
    const byLink = shapes.polygons.map(() => /** @type {any[]} */ ([]));
    widened.forEach((polygons, i) => {
      byLink[shapes.centrelineOwner[i]].push(...polygons);
    });
    shapes.polygons = byLink;
  }
  return measureShapes(shapes, { width, height, sampleScale });
}
