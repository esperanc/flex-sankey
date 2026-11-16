/**
 * Tests for the improved ("outline") Sankey path construction.
 *
 * The central test here is `parallel ribbons`: it asserts, as an executable
 * claim, the property the paper's Section 3 rests on — that anchoring the
 * reference line at the node centres makes adjacent parallel ribbons share
 * their boundary curve exactly, and therefore never overlap.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { describe, it, expect } from "vitest";
import {
  outlinePathPoints,
  outlinePath,
  outlineHorizontalPath,
  outlineVerticalPath
} from "../src/paths/outline.js";
import * as vec2 from "../src/internal/vec2.js";

/**
 * Builds `n` stacked parallel ribbons spanning a node of extent `nodeSize`,
 * as a horizontal diagram would.
 *
 * @param {object} opts
 * @param {number} opts.n Number of ribbons.
 * @param {number} opts.nodeSize Extent of the source and target nodes.
 * @param {number} opts.distance Gap between the nodes along the flow.
 * @param {number} opts.offset Vertical displacement of the target node.
 * @param {boolean} opts.anchorAtNode Anchor the reference line at the node
 *   centres (the improved behaviour) rather than at each ribbon's endpoints.
 * @param {number} [opts.maxAngle]
 * @returns {import("../src/paths/outline.js").CubicBezier[][]} Per ribbon, its
 *   two boundary curves.
 */
function stackedRibbons({
  n,
  nodeSize,
  distance,
  offset,
  anchorAtNode,
  maxAngle = 30
}) {
  const sourceX = 0;
  const targetX = distance;
  const sourceCentreY = 0;
  const targetCentreY = offset;
  const at = [distance / 2, 0];
  const bt = [-distance / 2, 0];
  const size = nodeSize / n;

  const out = [];
  for (let i = 0; i < n; i++) {
    // Centre of ribbon i on each node, stacked from the top edge downwards.
    const dy = -nodeSize / 2 + size / 2 + size * i;
    const a = [sourceX, sourceCentreY + dy];
    const b = [targetX, targetCentreY + dy];
    out.push(
      outlinePathPoints({
        a,
        b,
        at,
        bt,
        ap: anchorAtNode ? [sourceX, sourceCentreY] : a,
        bp: anchorAtNode ? [targetX, targetCentreY] : b,
        size,
        maxAngle
      })
    );
  }
  return out;
}

/**
 * Largest distance between corresponding control points of two cubics.
 * @param {number[][]} c1
 * @param {number[][]} c2
 * @returns {number}
 */
function curveDistance(c1, c2) {
  let worst = 0;
  for (let i = 0; i < 4; i++) worst = Math.max(worst, vec2.dist(c1[i], c2[i]));
  return worst;
}

describe("outlinePathPoints", () => {
  it("returns exactly two curves, one per side", () => {
    const curves = outlinePathPoints({
      a: [0, 0],
      b: [100, 40],
      at: [50, 0],
      bt: [-50, 0],
      size: 20
    });
    expect(curves).toHaveLength(2);
    for (const c of curves) expect(c).toHaveLength(4);
  });

  it("separates the two sides by exactly the ribbon breadth at the endpoints", () => {
    const size = 24;
    const [lo, hi] = outlinePathPoints({
      a: [0, 0],
      b: [200, 60],
      at: [100, 0],
      bt: [-100, 0],
      size
    });
    // Endpoint 0 sits on the source node, endpoint 3 on the target node.
    expect(vec2.dist(lo[0], hi[0])).toBeCloseTo(size, 9);
    expect(vec2.dist(lo[3], hi[3])).toBeCloseTo(size, 9);
  });

  it("keeps the ribbon centred on the endpoints it was given", () => {
    const a = [0, 17];
    const b = [150, -23];
    const [lo, hi] = outlinePathPoints({
      a,
      b,
      at: [75, 0],
      bt: [-75, 0],
      size: 16
    });
    expect((lo[0][1] + hi[0][1]) / 2).toBeCloseTo(a[1], 9);
    expect((lo[3][1] + hi[3][1]) / 2).toBeCloseTo(b[1], 9);
  });

  it("clamps the reference line to maxAngle", () => {
    // A severely skewed pair of nodes, with the reference line limited to
    // 10 degrees. The resulting geometry must not lean further than that.
    const maxAngle = 10;
    const at = [100, 0];
    const bt = [-100, 0];
    const curves = outlinePathPoints({
      a: [0, 0],
      b: [200, 600],
      at,
      bt,
      ap: [0, 0],
      bp: [200, 600],
      size: 40,
      maxAngle
    });
    // Recover the side-to-side direction actually used, from the offset
    // between the two curves at the source end.
    const [lo, hi] = curves;
    const across = vec2.normalize([], vec2.sub([], hi[0], lo[0]));
    const flowNormal = vec2.normalize([], vec2.perp(vec2.sub([], at, bt)));
    const deg =
      (Math.acos(Math.min(1, Math.abs(vec2.dot(across, flowNormal)))) * 180) /
      Math.PI;
    expect(deg).toBeLessThanOrEqual(maxAngle + 1e-6);
  });

  it("is unaffected by maxAngle when the nodes are already aligned", () => {
    const spec = {
      a: [0, 0],
      b: [100, 0],
      at: [50, 0],
      bt: [-50, 0],
      ap: [0, 0],
      bp: [100, 0],
      size: 10
    };
    const tight = outlinePathPoints({ ...spec, maxAngle: 0 });
    const loose = outlinePathPoints({ ...spec, maxAngle: 60 });
    expect(curveDistance(tight[0], loose[0])).toBeCloseTo(0, 9);
    expect(curveDistance(tight[1], loose[1])).toBeCloseTo(0, 9);
  });
});

describe("parallel ribbons", () => {
  // This is the property Section 3 of the paper claims. Adjacent ribbons
  // leaving the same node share a boundary: ribbon i's lower side must be the
  // very same curve as ribbon i+1's upper side. Sharing it exactly means the
  // ribbons tile the node's extent with neither gap nor overlap.
  it("share an exact boundary curve when anchored at the node centres", () => {
    const ribbons = stackedRibbons({
      n: 6,
      nodeSize: 180,
      distance: 300,
      offset: 120,
      anchorAtNode: true
    });
    for (let i = 0; i + 1 < ribbons.length; i++) {
      // curves[0] is the offset -size/2 side, which for a left-to-right
      // ribbon is the lower edge; curves[1] is the upper edge.
      const lowerSideOfThis = ribbons[i][0];
      const upperSideOfNext = ribbons[i + 1][1];
      expect(curveDistance(lowerSideOfThis, upperSideOfNext)).toBeCloseTo(0, 9);
    }
  });

  it("share boundaries across a range of geometries", () => {
    for (const offset of [0, 40, -40, 200, -350]) {
      for (const distance of [80, 300, 900]) {
        for (const maxAngle of [0, 20, 30, 45]) {
          const ribbons = stackedRibbons({
            n: 4,
            nodeSize: 120,
            distance,
            offset,
            anchorAtNode: true,
            maxAngle
          });
          for (let i = 0; i + 1 < ribbons.length; i++) {
            const gap = curveDistance(ribbons[i][0], ribbons[i + 1][1]);
            expect(
              gap,
              `offset=${offset} distance=${distance} maxAngle=${maxAngle}`
            ).toBeCloseTo(0, 9);
          }
        }
      }
    }
  });

  it("do NOT share boundaries when anchored at their own endpoints", () => {
    // The contrast case, documenting why the node-centre reference line is
    // required: with per-ribbon anchors the boundaries diverge, which is the
    // overlap the improved construction exists to remove.
    const ribbons = stackedRibbons({
      n: 6,
      nodeSize: 180,
      distance: 300,
      offset: 120,
      anchorAtNode: false
    });
    let worst = 0;
    for (let i = 0; i + 1 < ribbons.length; i++) {
      worst = Math.max(worst, curveDistance(ribbons[i][0], ribbons[i + 1][1]));
    }
    expect(worst).toBeGreaterThan(1);
  });
});

describe("non-crossing boundaries", () => {
  /** A point on a cubic. @param {number[][]} P @param {number} t */
  const at = (P, t) => {
    const u = 1 - t;
    return [0, 1].map(
      (i) =>
        u * u * u * P[0][i] +
        3 * u * u * t * P[1][i] +
        3 * u * t * t * P[2][i] +
        t * t * t * P[3][i]
    );
  };

  // Sharing a boundary is not by itself enough to rule out overlap: two
  // boundary curves could still cross between their endpoints. What rules it
  // out is that every boundary of a bundle has the same y profile, because
  // P0/P1 share the source y and P2/P3 share the target y. That collapses the
  // cubic's y component to a blend of its two endpoint heights by the fixed
  // weight g(t) = (1-t)^2 (1+2t), which decreases monotonically from 1 to 0.
  it("gives every boundary the same monotone y profile", () => {
    const g = (/** @type {number} */ t) => (1 - t) ** 2 * (1 + 2 * t);
    for (const offset of [0, 60, -150]) {
      for (const distance of [40, 300]) {
        for (const maxAngle of [0, 20, 30, 60]) {
          const ribbons = stackedRibbons({
            n: 3, nodeSize: 120, distance, offset, anchorAtNode: true, maxAngle
          });
          for (const curves of ribbons) {
            for (const P of curves) {
              const alpha = P[0][1];
              const beta = P[3][1];
              for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                expect(at(P, t)[1]).toBeCloseTo(alpha * g(t) + beta * (1 - g(t)), 9);
              }
            }
          }
        }
      }
    }
  });

  // With the reference line parallel to the flow direction the tangent scale
  // is identically 1, so all the boundaries of a bundle share one x profile
  // too. Equal x then means equal t, and the ordering above leaves them no
  // way to cross. This is the case the paper proves; beyond it the x profile
  // varies from boundary to boundary and we only claim what we measure.
  it("never crosses within a bundle when the reference line is parallel to the flow", () => {
    /** @param {number[][]} A @param {number[][]} B */
    const crosses = (A, B) => {
      const N = 160;
      const sgn = (/** @type {number} */ v) => (Math.abs(v) < 1e-9 ? 0 : Math.sign(v));
      /** @param {number[]} p @param {number[]} q @param {number[]} r */
      const side = (p, q, r) =>
        sgn((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      const a = [], b = [];
      for (let i = 0; i <= N; i++) { a.push(at(A, i / N)); b.push(at(B, i / N)); }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const o1 = side(a[i], a[i + 1], b[j]);
          const o2 = side(a[i], a[i + 1], b[j + 1]);
          const o3 = side(b[j], b[j + 1], a[i]);
          const o4 = side(b[j], b[j + 1], a[i + 1]);
          if (o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4) return true;
        }
      }
      return false;
    };

    for (const offset of [0, 60, -150, 300]) {
      for (const distance of [20, 60, 300]) {
        const ribbons = stackedRibbons({
          n: 4, nodeSize: 140, distance, offset, anchorAtNode: true, maxAngle: 0
        });
        const sides = ribbons.flat();
        for (let i = 0; i < sides.length; i++) {
          for (let j = i + 1; j < sides.length; j++) {
            // Shared boundaries are the same curve, not a crossing.
            if (curveDistance(sides[i], sides[j]) < 1e-9) continue;
            expect(
              crosses(sides[i], sides[j]),
              `offset=${offset} distance=${distance} sides ${i},${j}`
            ).toBe(false);
          }
        }
      }
    }
  });
});

describe("path string builders", () => {
  it("outlinePath emits a closed two-sided outline", () => {
    const d = outlinePath({
      a: [0, 0],
      b: [100, 20],
      at: [50, 0],
      bt: [-50, 0],
      size: 10
    });
    expect(d).toMatch(/^M .* C .* L .* C .* Z$/);
  });

  it("outlineHorizontalPath is invariant to the order of its endpoints", () => {
    const forward = outlineHorizontalPath({
      source: [0, 10],
      target: [200, 90],
      trueSourceY: 30,
      trueTargetY: 70,
      size: 12
    });
    const reversed = outlineHorizontalPath({
      source: [200, 90],
      target: [0, 10],
      trueSourceY: 70,
      trueTargetY: 30,
      size: 12
    });
    expect(reversed).toBe(forward);
  });

  it("outlineVerticalPath is invariant to the order of its endpoints", () => {
    const forward = outlineVerticalPath({
      source: [10, 0],
      target: [90, 200],
      trueSourceX: 30,
      trueTargetX: 70,
      size: 12
    });
    const reversed = outlineVerticalPath({
      source: [90, 200],
      target: [10, 0],
      trueSourceX: 70,
      trueTargetX: 30,
      size: 12
    });
    expect(reversed).toBe(forward);
  });

  it("outlineVerticalPath is the transpose of outlineHorizontalPath, up to side order", () => {
    // The two wrappers pick opposite node normals: horizontally the positive
    // offset runs upwards, vertically it runs rightwards. Transposing one
    // therefore yields the other with its two sides exchanged. The ribbon
    // occupies the same region either way, so this is cosmetic — but it means
    // the path strings are not identical, and the difference is pinned here
    // rather than left to surprise someone.
    const spec = {
      size: 12,
      at: [100, 0],
      bt: [-100, 0]
    };
    const horizontal = outlinePathPoints({
      a: [0, 10],
      b: [200, 90],
      ap: [0, 30],
      bp: [200, 70],
      ...spec
    });
    const vertical = outlinePathPoints({
      a: [10, 0],
      b: [90, 200],
      ap: [30, 0],
      bp: [70, 200],
      size: 12,
      at: [0, 100],
      bt: [0, -100]
    });
    /** @param {number[][]} c */
    const transposeCurve = (c) => c.map(([x, y]) => [y, x]);
    const transposed = vertical.map(transposeCurve);
    // Sides come out exchanged, so match curve 0 against curve 1.
    expect(curveDistance(transposed[0], horizontal[1])).toBeCloseTo(0, 9);
    expect(curveDistance(transposed[1], horizontal[0])).toBeCloseTo(0, 9);
  });

  it("produces finite coordinates for a zero bias", () => {
    // bias = 0 makes both tangents zero length. The original notebook divided
    // by the tangent length here and emitted NaN coordinates.
    const d = outlineHorizontalPath({
      source: [0, 10],
      target: [200, 90],
      trueSourceY: 30,
      trueTargetY: 70,
      size: 12,
      bias: 0
    });
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it("produces finite coordinates for degenerate input", () => {
    // Coincident reference anchors make the reference direction undefined;
    // the construction must still yield drawable numbers.
    const d = outlineHorizontalPath({
      source: [0, 0],
      target: [0, 0],
      size: 10
    });
    expect(d).not.toMatch(/NaN|Infinity/);
  });
});
