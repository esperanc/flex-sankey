/**
 * Tests for the inlined 2D vector helpers.
 *
 * The orientation and normalisation cases are carried over from the test cells
 * of the original `@esperanc/vec2-utils` notebook, so that replacing gl-matrix
 * with the inlined implementation is verifiably behaviour preserving.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { describe, it, expect } from "vitest";
import * as vec2 from "../src/internal/vec2.js";

describe("orient", () => {
  it("returns 0 for collinear points", () => {
    expect(vec2.orient([0, 0], [1, 0], [0.5, 0])).toBe(0);
  });

  it("is positive for a clockwise turn in SVG coordinates", () => {
    expect(vec2.orient([0, 0], [1, 0], [0, 1])).toBeGreaterThan(0);
  });

  it("is negative for a counter-clockwise turn in SVG coordinates", () => {
    expect(vec2.orient([0, 0], [1, 0], [0, -1])).toBeLessThan(0);
  });

  it("is antisymmetric in its last two arguments", () => {
    const a = [1, 2];
    const b = [4, 7];
    const c = [-3, 5];
    expect(vec2.orient(a, b, c)).toBe(-vec2.orient(a, c, b));
  });
});

describe("normalize", () => {
  it("produces a unit vector", () => {
    const out = vec2.normalize([], [3, 4]);
    expect(out[0]).toBeCloseTo(0.6, 12);
    expect(out[1]).toBeCloseTo(0.8, 12);
    expect(vec2.len(out)).toBeCloseTo(1, 12);
  });

  it("maps the zero vector to zero rather than NaN, as gl-matrix does", () => {
    expect(vec2.normalize([], [0, 0])).toEqual([0, 0]);
  });
});

describe("rotate", () => {
  it("rotates a quarter turn about the origin", () => {
    const out = vec2.rotate([], [1, 0], [0, 0], Math.PI / 2);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(1, 12);
  });

  it("rotates about an arbitrary centre", () => {
    const out = vec2.rotate([], [2, 1], [1, 1], Math.PI);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(1, 12);
  });

  it("leaves the centre of rotation fixed", () => {
    const out = vec2.rotate([], [5, -3], [5, -3], 1.234);
    expect(out[0]).toBeCloseTo(5, 12);
    expect(out[1]).toBeCloseTo(-3, 12);
  });
});

describe("perp", () => {
  it("rotates 90 degrees clockwise in SVG coordinates", () => {
    // Adding zero collapses the negative zero that [y, -x] produces for y = 0.
    expect(vec2.perp([1, 0]).map((v) => v + 0)).toEqual([0, -1]);
    expect(vec2.perp([0, 1]).map((v) => v + 0)).toEqual([1, 0]);
  });

  it("is orthogonal to its argument", () => {
    const a = [3, -7];
    expect(vec2.dot(a, vec2.perp(a))).toBe(0);
  });
});

describe("arithmetic", () => {
  it("adds, subtracts and scales", () => {
    expect(vec2.add([], [1, 2], [3, 4])).toEqual([4, 6]);
    expect(vec2.sub([], [1, 2], [3, 4])).toEqual([-2, -2]);
    expect(vec2.scale([], [1, 2], 3)).toEqual([3, 6]);
  });

  it("supports aliasing the output with an input", () => {
    const a = [1, 2];
    vec2.add(a, a, [1, 1]);
    expect(a).toEqual([2, 3]);
  });

  it("measures length and distance", () => {
    expect(vec2.len([3, 4])).toBe(5);
    expect(vec2.dist([1, 1], [4, 5])).toBe(5);
  });
});
