/**
 * Sankey path geometry: the improved outline construction and the two
 * baselines it is compared against.
 *
 * @module paths
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

export {
  outlinePathPoints,
  outlinePath,
  outlineHorizontalPath,
  outlineVerticalPath
} from "./outline.js";

export { standardHorizontalPath, standardVerticalPath } from "./standard.js";

export {
  circleInternalTangents,
  horizontalCirclePath,
  verticalCirclePath
} from "./arcs.js";
