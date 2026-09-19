/**
 * Tests for the diagram quality metrics.
 *
 * These pin the metrics to shapes whose answers are known analytically. A
 * measurement nobody has checked against a known value is not evidence, and
 * these are the numbers the paper reports.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { describe, it, expect } from "vitest";
import {
  rasterizeCoverage,
  overlapStatistics,
  countCrossings,
  parsePath,
  polylineLength,
  flattenArc,
  shapesFromScene,
  shapesFromPaths,
  measureScene,
  measurePaths
} from "../src/metrics/index.js";
import { resampleByLength } from "../src/metrics/flatten.js";
import { outlinePath, outlinePathPoints } from "../src/paths/outline.js";
import { buildScene } from "../src/render/scene.js";
import {
  sankeyLayers,
  sankeyAddDummies,
  sankeyOrderNodes,
  sankeyGeometricLayout,
  sankeyRenderLayout
} from "../src/layout/index.js";
import { makeSyntheticSankeyData, addTotalizingNodes } from "../src/data/synthetic.js";
import { energySpec, energySumNodes } from "../src/data/energy.js";
import { randomLcg } from "../src/internal/random.js";

/**
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @returns {[number, number][]}
 */
const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];

/** Covered area in pixels, from a sample count at a given scale. */
const areaOf = (/** @type {any} */ stats, /** @type {number} */ scale) =>
  stats.covered / (scale * scale);

describe("rasterizeCoverage", () => {
  it("measures a rectangle's area exactly, at every sample scale", () => {
    for (const scale of [1, 2, 4]) {
      const stats = overlapStatistics(
        rasterizeCoverage([[rect(10, 10, 100, 50)]], { width: 200, height: 100, scale })
      );
      expect(areaOf(stats, scale)).toBe(5000);
      expect(stats.overlapRatio).toBe(0);
    }
  });

  it("reports full overlap for two coincident links", () => {
    const stats = overlapStatistics(
      rasterizeCoverage([[rect(10, 10, 100, 50)], [rect(10, 10, 100, 50)]], {
        width: 200,
        height: 100,
        scale: 2
      })
    );
    expect(stats.overlapRatio).toBeCloseTo(1, 10);
    expect(stats.maxDepth).toBe(2);
  });

  it("measures a partial overlap exactly", () => {
    // Two 100x100 squares offset by 50: union 15000, intersection 5000.
    const stats = overlapStatistics(
      rasterizeCoverage([[rect(0, 0, 100, 100)], [rect(50, 0, 100, 100)]], {
        width: 200,
        height: 100,
        scale: 4
      })
    );
    expect(areaOf(stats, 4)).toBe(15000);
    expect(stats.overlapping / 16).toBe(5000);
    expect(stats.overlapRatio).toBeCloseTo(1 / 3, 6);
  });

  it("does not count one link's abutting pieces as overlap", () => {
    // A link routed through a dummy node is drawn as several pieces meeting
    // edge to edge. That shared edge is not overlap.
    const stats = overlapStatistics(
      rasterizeCoverage([[rect(0, 0, 50, 100), rect(50, 0, 50, 100)]], {
        width: 200,
        height: 100,
        scale: 2
      })
    );
    expect(stats.overlapRatio).toBe(0);
    expect(areaOf(stats, 2)).toBe(10000);
  });

  it("honours the nonzero winding rule", () => {
    // An inner ring wound the other way cuts a hole: 100^2 - 50^2 = 7500.
    const stats = overlapStatistics(
      rasterizeCoverage([[rect(0, 0, 100, 100), rect(25, 25, 50, 50).reverse()]], {
        width: 100,
        height: 100,
        scale: 4
      })
    );
    expect(areaOf(stats, 4)).toBe(7500);
  });

  it("separates the two overlap ratios by depth", () => {
    // Three coincident links: every covered sample has surplus 2.
    const stats = overlapStatistics(
      rasterizeCoverage(
        [[rect(0, 0, 50, 50)], [rect(0, 0, 50, 50)], [rect(0, 0, 50, 50)]],
        { width: 60, height: 60, scale: 2 }
      )
    );
    expect(stats.overlapRatio).toBeCloseTo(1, 10);
    expect(stats.excessRatio).toBeCloseTo(2, 10);
    expect(stats.maxDepth).toBe(3);
  });
});

describe("countCrossings", () => {
  it("finds a proper crossing", () => {
    expect(
      countCrossings([
        [
          [0, 0],
          [100, 100]
        ],
        [
          [0, 100],
          [100, 0]
        ]
      ]).crossings
    ).toBe(1);
  });

  it("ignores parallel lines", () => {
    expect(
      countCrossings([
        [
          [0, 0],
          [100, 0]
        ],
        [
          [0, 10],
          [100, 10]
        ]
      ]).crossings
    ).toBe(0);
  });

  it("ignores a shared endpoint", () => {
    expect(
      countCrossings([
        [
          [0, 0],
          [50, 50]
        ],
        [
          [50, 50],
          [100, 0]
        ]
      ]).crossings
    ).toBe(0);
  });

  it("ignores a link crossing itself", () => {
    // A link passing through dummy nodes may double back; that is not a
    // crossing between links.
    expect(
      countCrossings([
        [
          [0, 0],
          [100, 100],
          [0, 100],
          [100, 0]
        ]
      ]).crossings
    ).toBe(0);
  });

  it("can report where the crossings are", () => {
    const { points } = countCrossings(
      [
        [
          [0, 0],
          [100, 100]
        ],
        [
          [0, 100],
          [100, 0]
        ]
      ],
      { collect: true }
    );
    expect(points).toHaveLength(1);
    expect(points[0].point[0]).toBeCloseTo(50, 6);
    expect(points[0].point[1]).toBeCloseTo(50, 6);
  });
});

describe("arc flattening", () => {
  it("measures a semicircle by its arc, not its chord", () => {
    // The original analysis approximated every elliptical arc by a straight
    // line to its endpoint, losing about a third of a semicircle's length and
    // penalising the one compared library that draws with arcs.
    const [sub] = parsePath("M 0 0 A 50 50 0 0 1 100 0", 0.05);
    expect(polylineLength(sub.points)).toBeCloseTo(Math.PI * 50, 1);
  });

  it("measures a quarter arc correctly", () => {
    const [sub] = parsePath("M 0 0 A 50 50 0 0 1 50 50", 0.05);
    expect(polylineLength(sub.points)).toBeCloseTo((Math.PI * 50) / 2, 1);
  });

  it("treats a zero radius as a straight line", () => {
    expect(flattenArc([0, 0], 0, 0, 0, false, true, [10, 10])).toEqual([[10, 10]]);
  });

  it("follows the sweep flag", () => {
    const cw = parsePath("M 0 0 A 50 50 0 0 1 100 0", 0.5)[0].points;
    const ccw = parsePath("M 0 0 A 50 50 0 0 0 100 0", 0.5)[0].points;
    // One bulges above the chord, the other below.
    const midY = (/** @type {any[]} */ p) => p[Math.floor(p.length / 2)][1];
    expect(Math.sign(midY(cw))).toBe(-Math.sign(midY(ccw)));
  });
});

describe("parsePath", () => {
  it("handles relative commands", () => {
    const [sub] = parsePath("M 10 10 l 10 0 l 0 10 z");
    expect(sub.closed).toBe(true);
    expect(sub.points[1]).toEqual([20, 10]);
    expect(sub.points[2]).toEqual([20, 20]);
  });

  it("handles horizontal and vertical commands", () => {
    const [sub] = parsePath("M 0 0 H 50 V 50 H 0 Z");
    expect(sub.points).toContainEqual([50, 0]);
    expect(sub.points).toContainEqual([50, 50]);
  });

  it("reflects the control point for a smooth cubic", () => {
    // S must mirror the previous curve's second control point; getting this
    // wrong produces a visible kink and a wrong length.
    const [sub] = parsePath("M 0 0 C 0 50 50 50 50 0 S 100 -50 100 0", 0.1);
    expect(polylineLength(sub.points)).toBeGreaterThan(100);
    expect(sub.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it("splits multiple subpaths", () => {
    expect(parsePath("M 0 0 L 10 0 Z M 20 0 L 30 0 Z")).toHaveLength(2);
  });

  it("returns nothing for an empty path", () => {
    expect(parsePath("")).toHaveLength(0);
  });
});

describe("centre-line recovery", () => {
  // Round trip: build a ribbon whose true centre line is known exactly,
  // serialize it to SVG, parse it back, and compare. This is the step the
  // cross-library comparison depends on — every figure reported for a library
  // that draws filled ribbons is computed from a centre line recovered this
  // way.
  const spec = {
    a: /** @type {[number, number]} */ ([0, 100]),
    b: /** @type {[number, number]} */ ([400, 300]),
    at: /** @type {[number, number]} */ ([200, 0]),
    bt: /** @type {[number, number]} */ ([-200, 0]),
    ap: /** @type {[number, number]} */ ([0, 150]),
    bp: /** @type {[number, number]} */ ([400, 260]),
    size: 40,
    maxAngle: 30
  };

  /** @param {number[][]} p @param {number} t */
  const cubicAt = (p, t) => {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t ** 3 * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t ** 3 * p[3][1]
    ];
  };

  const [lo, hi] = outlinePathPoints(spec);
  /** @type {[number, number][]} */
  const truth = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const A = cubicAt(lo, t);
    const B = cubicAt(hi, t);
    truth.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]);
  }

  const { centrelines } = shapesFromPaths([outlinePath(spec)], {
    filled: true,
    tolerance: 0.05
  });
  const recovered = centrelines[0];

  it("recovers the centre line to sub-pixel accuracy", () => {
    const N = 200;
    const a = resampleByLength(truth, N);
    const b = resampleByLength(recovered, N);
    let maxErr = 0;
    for (let i = 0; i < N; i++) {
      maxErr = Math.max(maxErr, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
    }
    // Splitting the outline by index rather than at the caps put this at half
    // the ribbon's breadth — 20 px for this ribbon.
    expect(maxErr).toBeLessThan(0.5);
  });

  it("recovers the centre line's length to within a tenth of a percent", () => {
    const expected = polylineLength(truth);
    const actual = polylineLength(recovered);
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.001);
  });

  it("does not place the recovered ends on the ribbon edge", () => {
    // The failure mode of a cap-inclusive split: endpoints pulled out to the
    // boundary by half the breadth.
    expect(Math.hypot(recovered[0][0] - truth[0][0], recovered[0][1] - truth[0][1]))
      .toBeLessThan(0.5);
    const last = recovered[recovered.length - 1];
    const truthLast = truth[truth.length - 1];
    expect(Math.hypot(last[0] - truthLast[0], last[1] - truthLast[1])).toBeLessThan(0.5);
  });
});

describe("thickenCentrelines", () => {
  it("gives a straight stroked line exactly length times width", () => {
    const m = measurePaths(["M 50 250 L 450 250"], {
      width: 500,
      height: 500,
      filled: false,
      strokeWidths: [20],
      sampleScale: 4
    });
    expect(m.coveredPixels / 16).toBe(400 * 20);
  });

  it("gives a curved stroked line its length times width", () => {
    const d = "M 50 400 C 200 400 200 100 450 100";
    const { centrelines } = shapesFromPaths([d], { filled: false, tolerance: 0.05 });
    const expected = polylineLength(centrelines[0]) * 24;
    const m = measurePaths([d], {
      width: 500,
      height: 500,
      filled: false,
      strokeWidths: [24],
      sampleScale: 4,
      tolerance: 0.05
    });
    expect(m.coveredPixels / 16).toBeCloseTo(expected, -1);
  });
});

describe("resampleByLength", () => {
  it("spaces points evenly along a polyline", () => {
    const line = /** @type {[number, number][]} */ ([[0, 0], [10, 0], [10, 10]]);
    const out = resampleByLength(line, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual([0, 0]);
    expect(out[4][0]).toBeCloseTo(10, 6);
    expect(out[4][1]).toBeCloseTo(10, 6);
    // Every step covers a fifth of the total length of 20.
    for (let i = 1; i < out.length; i++) {
      expect(Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]))
        .toBeCloseTo(5, 6);
    }
  });

  it("handles a degenerate line", () => {
    expect(resampleByLength([[1, 1]], 5)).toEqual([[1, 1]]);
    expect(resampleByLength([], 5)).toEqual([]);
  });
});

describe("measureScene", () => {
  const links = makeSyntheticSankeyData(energySpec, {
    randomSeed: 0.5,
    regularity: 0.1,
    optionalProbability: 0.8
  });
  const layout = sankeyAddDummies(sankeyLayers({ links }));
  sankeyOrderNodes(layout, { nsteps: 30, random: randomLcg(1) });
  const geometry = sankeyGeometricLayout(layout, { size: 500, whitespace: 0.3 });
  const renderLayout = sankeyRenderLayout(geometry, { length: 800 });
  const scene = buildScene(renderLayout, { width: 800, height: 500 });

  it("returns plausible figures for a real diagram", () => {
    const m = measureScene(scene, { sampleScale: 1 });
    expect(m.linkCount).toBe(scene.links.length);
    expect(m.crossings).toBeGreaterThan(0);
    expect(m.totalLength).toBeGreaterThan(0);
    expect(m.coveredPixels).toBeGreaterThan(0);
    expect(m.overlapRatio).toBeGreaterThanOrEqual(0);
    expect(m.overlapRatio).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    expect(measureScene(scene, { sampleScale: 1 })).toEqual(
      measureScene(scene, { sampleScale: 1 })
    );
  });

  it("extracts one centre line per link", () => {
    const shapes = shapesFromScene(scene);
    expect(shapes.centrelines).toHaveLength(scene.links.length);
    expect(shapes.polygons).toHaveLength(scene.links.length);
    for (const line of shapes.centrelines) expect(line.length).toBeGreaterThan(1);
  });

  it("agrees closely with itself across sample scales", () => {
    // Overlap is an area ratio, so supersampling should refine it, not move it.
    const coarse = measureScene(scene, { sampleScale: 1 });
    const fine = measureScene(scene, { sampleScale: 4 });
    expect(fine.overlapRatio).toBeCloseTo(coarse.overlapRatio, 1);
  });
});

describe("routes broken at a totalizing node", () => {
  // A link gathered by a totalizing node enters at its incoming offset and
  // leaves at its outgoing offset, which are different points on that node.
  // Joining the two hops into one polyline would draw a leap across the node's
  // interior that no reader ever sees, since the node is painted opaque over
  // it — and those leaps would register as crossings with every other link
  // through the same node, making totalizing nodes appear to *raise* the
  // crossing count when they sharply lower it.
  const links = makeSyntheticSankeyData(energySpec, {
    randomSeed: 0,
    regularity: 0.1,
    optionalProbability: 0.8
  });

  /** @param {any[]} data */
  const analyse = (data) => {
    const layout = sankeyAddDummies(sankeyLayers({ links: data }));
    const ordered = sankeyOrderNodes(layout, { nsteps: 60, random: randomLcg(4) });
    const geometry = sankeyGeometricLayout(ordered, {
      size: 300, whitespace: 0.32, joinDummies: true
    });
    const scene = buildScene(sankeyRenderLayout(geometry, { length: 560 }), {
      width: 560, height: 300
    });
    return {
      topological: ordered.crossings,
      geometric: measureScene(scene, { sampleScale: 1 }).crossings,
      shapes: shapesFromScene(scene)
    };
  };

  const plain = analyse(links);
  const totalizing = analyse(addTotalizingNodes(links, energySumNodes));

  it("leaves no leap across a node's interior", () => {
    for (const shapes of [plain.shapes, totalizing.shapes]) {
      for (const line of shapes.centrelines) {
        for (let i = 1; i < line.length; i++) {
          const step = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
          expect(step).toBeLessThan(8);
        }
      }
    }
  });

  it("splits a gathered link's route into pieces owned by that link", () => {
    expect(totalizing.shapes.centrelines.length).toBeGreaterThan(
      totalizing.shapes.polygons.length
    );
    expect(totalizing.shapes.centrelineOwner).toHaveLength(
      totalizing.shapes.centrelines.length
    );
    for (const owner of totalizing.shapes.centrelineOwner) {
      expect(owner).toBeLessThan(totalizing.shapes.polygons.length);
    }
  });

  it("agrees with the topological count, with totalizing nodes and without", () => {
    // Two independent implementations reaching the same integer.
    expect(plain.geometric).toBe(plain.topological);
    expect(totalizing.geometric).toBe(totalizing.topological);
  });

  it("finds that totalizing nodes reduce crossings", () => {
    expect(totalizing.geometric).toBeLessThan(plain.geometric);
  });
});

describe("measurePaths", () => {
  it("measures stroked centre lines when given their widths", () => {
    const m = measurePaths(["M 0 250 C 200 250 200 100 400 100"], {
      width: 400,
      height: 500,
      filled: false,
      strokeWidths: [20],
      sampleScale: 2
    });
    expect(m.linkCount).toBe(1);
    expect(m.coveredPixels).toBeGreaterThan(0);
    expect(m.crossings).toBe(0);
  });

  it("insists on stroke widths for unfilled paths", () => {
    expect(() =>
      measurePaths(["M 0 0 L 10 10"], { width: 10, height: 10, filled: false })
    ).toThrow(/strokeWidths/);
  });

  it("measures a filled ribbon outline", () => {
    const m = measurePaths(
      ["M 0 0 C 50 0 50 50 100 50 L 100 70 C 50 70 50 20 0 20 Z"],
      { width: 100, height: 100, sampleScale: 2 }
    );
    expect(m.coveredPixels).toBeGreaterThan(0);
    expect(m.totalLength).toBeGreaterThan(50);
  });
});
