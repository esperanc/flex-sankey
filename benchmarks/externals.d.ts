/**
 * Ambient declarations for the untyped packages used by the benchmark.
 *
 * These are development-only dependencies of the comparison harness; the
 * library itself has no runtime dependencies at all. Declaring them loosely
 * here keeps `checkJs` strict over our own source without pulling in several
 * more `@types` packages for code that only runs offline.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

declare module "d3-sankey" {
  export const sankey: any;
  export const sankeyLinkHorizontal: any;
  export const sankeyCenter: any;
  export const sankeyLeft: any;
  export const sankeyRight: any;
  export const sankeyJustify: any;
}

declare module "d3-sankey-diagram" {
  export const sankey: any;
  export const sankeyDiagram: any;
  export const sankeyLink: any;
  export const sankeyNode: any;
  export const sankeyLinkTitle: any;
  export const sankeyPositionJustified: any;
  export const sankeyPositionRelaxation: any;
}

declare module "d3-selection" {
  export const select: any;
  export const selectAll: any;
  export const create: any;
}

declare module "jsdom" {
  export const JSDOM: any;
}
