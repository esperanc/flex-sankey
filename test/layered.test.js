/**
 * Tests for the parametric layered graph specification.
 *
 * The structural guarantees asserted here are what let the specification scale
 * safely: without them a larger graph eventually strands a node with no
 * supplier, and generation fails on some seeds but not others.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { describe, it, expect } from "vitest";
import { makeLayeredSpec } from "../src/data/layered.js";
import { makeSyntheticSankeyData } from "../src/data/synthetic.js";

const SHAPES = [
  { layers: [3, 3, 3], fanout: 2, maxSpan: 1 },
  { layers: [4, 5, 5, 4], fanout: 2, maxSpan: 2 },
  { layers: [8, 10, 12, 10, 8, 6], fanout: 3, maxSpan: 3 },
  { layers: [2, 2], fanout: 1, maxSpan: 1 }
];

/** @param {import("../src/data/synthetic.js").GraphSpec} spec */
function edgesOf(spec) {
  /** @type {[string, string][]} */
  const edges = [];
  for (const [sources, targets] of spec.linkPairs) {
    for (const s of sources) for (const t of targets) edges.push([s, t]);
  }
  return edges;
}

describe("makeLayeredSpec", () => {
  it("is deterministic for a given seed", () => {
    const a = makeLayeredSpec({ seed: 5 });
    const b = makeLayeredSpec({ seed: 5 });
    expect(a).toEqual(b);
  });

  it("produces different structures for different seeds", () => {
    const a = makeLayeredSpec({ seed: 1 });
    const b = makeLayeredSpec({ seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("only ever links forwards, so the graph is acyclic by construction", () => {
    for (const shape of SHAPES) {
      const spec = makeLayeredSpec({ ...shape, seed: 3 });
      /** @param {string} key */
      const layerOf = (key) => {
        const letters = key.match(/^[A-Z]+/)?.[0] ?? "A";
        let n = 0;
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n - 1;
      };
      for (const [s, t] of edgesOf(spec)) {
        expect(layerOf(t), `${s} -> ${t}`).toBeGreaterThan(layerOf(s));
      }
    }
  });

  it("gives every non-source node a supplier", () => {
    for (const shape of SHAPES) {
      const spec = makeLayeredSpec({ ...shape, seed: 4 });
      const edges = edgesOf(spec);
      const hasIncoming = new Set(edges.map(([, t]) => t));
      const all = new Set(edges.flat());
      for (const key of all) {
        if (spec.sources.includes(key)) continue;
        expect(hasIncoming.has(key), `${key} has no supplier`).toBe(true);
      }
    }
  });

  it("gives every non-sink node a consumer", () => {
    const spec = makeLayeredSpec({ layers: [4, 5, 5, 4], fanout: 2, seed: 6 });
    const edges = edgesOf(spec);
    const hasOutgoing = new Set(edges.map(([s]) => s));
    const lastLayer = "D";
    for (const key of new Set(edges.flat())) {
      if (key.startsWith(lastLayer)) continue;
      expect(hasOutgoing.has(key), `${key} has no consumer`).toBe(true);
    }
  });

  it("respects the requested span limit", () => {
    for (const maxSpan of [1, 2, 3]) {
      const spec = makeLayeredSpec({
        layers: [5, 5, 5, 5, 5],
        fanout: 3,
        maxSpan,
        seed: 7
      });
      /** @param {string} key */
      const layerOf = (key) => (key.charCodeAt(0) - 65);
      for (const [s, t] of edgesOf(spec)) {
        expect(layerOf(t) - layerOf(s)).toBeLessThanOrEqual(maxSpan);
      }
    }
  });

  it("never marks a node's only supplier as optional", () => {
    for (const shape of SHAPES) {
      const spec = makeLayeredSpec({ ...shape, optionalSources: 1, seed: 8 });
      const edges = edgesOf(spec);
      /** @type {Map<string, string[]>} */
      const suppliers = new Map();
      for (const [s, t] of edges) suppliers.set(t, [...(suppliers.get(t) ?? []), s]);
      for (const [key, sup] of suppliers) {
        if (sup.length === 1) {
          expect(spec.optionalNodes ?? [], `${key} depends only on ${sup[0]}`)
            .not.toContain(sup[0]);
        }
      }
    }
  });

  it("generates successfully across every seed, at any optional probability", () => {
    for (const shape of SHAPES) {
      const spec = makeLayeredSpec({ ...shape, optionalSources: 0.5, seed: 9 });
      for (const optionalProbability of [1, 0.8, 0.5, 0.2]) {
        for (let i = 0; i < 10; i++) {
          expect(() =>
            makeSyntheticSankeyData(spec, {
              randomSeed: i / 10,
              regularity: 0.1,
              optionalProbability
            })
          ).not.toThrow();
        }
      }
    }
  });

  it("scales with the shape it is given", () => {
    const small = makeLayeredSpec({ layers: [3, 3, 3], fanout: 2, seed: 1 });
    const large = makeLayeredSpec({
      layers: [8, 10, 12, 10, 8, 6],
      fanout: 3,
      seed: 1
    });
    expect(edgesOf(large).length).toBeGreaterThan(edgesOf(small).length * 3);
  });
});

describe("makeSyntheticSankeyData with a stranded node", () => {
  it("does not mistake a stranded node for a cycle", () => {
    // B1's only supplier is A1. Dropping A1 leaves B1 with no flow; its
    // targets must still be released or the topological walk stalls and the
    // generator reports a cycle in a graph that plainly has none.
    /** @type {import("../src/data/synthetic.js").GraphSpec} */
    const spec = {
      linkPairs: [
        [["A1"], ["B1"]],
        [["A2"], ["B2"]],
        [["B1", "B2"], ["C1"]]
      ],
      sources: ["A1", "A2"],
      optionalNodes: ["A1"],
      sourceTotal: 100
    };
    for (let i = 0; i < 10; i++) {
      expect(() =>
        makeSyntheticSankeyData(spec, {
          randomSeed: i / 10,
          optionalProbability: 0.5
        })
      ).not.toThrow();
    }
  });
});
