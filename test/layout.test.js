/**
 * Tests for the layout pipeline stages.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { describe, it, expect } from "vitest";
import {
  sankeyLayers,
  sankeyAddDummies,
  sankeyOrderNodes,
  sankeyGeometricLayout,
  sankeyRenderLayout,
  sankeyLayoutCopy,
  bipartite
} from "../src/layout/index.js";
import { makeSyntheticSankeyData, addTotalizingNodes } from "../src/data/synthetic.js";
import { energySpec, energySumNodes } from "../src/data/energy.js";
import { randomLcg } from "../src/internal/random.js";

/** A small graph with a link spanning two layers, forcing a dummy. */
const simpleLinks = [
  { source: "a", target: "b", value: 10 },
  { source: "b", target: "c", value: 10 },
  { source: "a", target: "c", value: 5 }
];

/** @param {number} [seed] */
const sampleLinks = (seed = 0.5) =>
  makeSyntheticSankeyData(energySpec, {
    randomSeed: seed,
    regularity: 0.1,
    optionalProbability: 0.7
  });

describe("sankeyLayers", () => {
  it("places every target in a later layer than its source", () => {
    const { layers, nodeMap } = sankeyLayers({ links: sampleLinks() });
    const all = layers.flat();
    for (const node of all) {
      for (const link of node.outgoing) {
        expect(nodeMap[link.target].layer).toBeGreaterThan(node.layer);
      }
    }
  });

  it("assigns each node to the layer it is listed in", () => {
    const { layers } = sankeyLayers({ links: sampleLinks() });
    layers.forEach((layer, i) => {
      for (const node of layer) expect(node.layer).toBe(i);
    });
  });

  it("leaves no empty layers", () => {
    const { layers } = sankeyLayers({ links: sampleLinks() });
    for (const layer of layers) expect(layer.length).toBeGreaterThan(0);
  });

  it("accumulates link totals onto nodes", () => {
    const { nodeMap } = sankeyLayers({ links: simpleLinks });
    expect(nodeMap.a.total_out).toBe(15);
    expect(nodeMap.c.total_in).toBe(15);
    expect(nodeMap.b.total_in).toBe(10);
    expect(nodeMap.b.total_out).toBe(10);
  });

  it("supports every alignment strategy", () => {
    for (const nodeAlign of ["left", "right", "center", "justify", "heuristic"]) {
      const { layers } = sankeyLayers(
        { links: sampleLinks() },
        { nodeAlign: /** @type {any} */ (nodeAlign) }
      );
      expect(layers.length).toBeGreaterThan(1);
    }
  });

  it("keeps grouped nodes in the same layer", () => {
    const groups = [["Transport", "Industry", "Residential"]];
    const { nodeMap } = sankeyLayers({ links: sampleLinks(), groups });
    const ls = groups[0].filter((k) => nodeMap[k]).map((k) => nodeMap[k].layer);
    expect(new Set(ls).size).toBe(1);
  });

  it("omits hidden nodes from the layers", () => {
    const hidden = ["Imp.", "Exp."];
    const { layers } = sankeyLayers({ links: sampleLinks(), hidden });
    const keys = layers.flat().map((n) => n.key);
    for (const h of hidden) expect(keys).not.toContain(h);
  });

  it("honours a requested rank order", () => {
    const ranks = ["Transport", "Industry"];
    const { layers, nodeMap } = sankeyLayers({ links: sampleLinks(), ranks });
    const present = ranks.filter((k) => nodeMap[k]);
    if (present.length === 2) {
      const layer = layers[nodeMap[present[0]].layer];
      const positions = present.map((k) => layer.findIndex((n) => n.key === k));
      if (positions.every((p) => p >= 0)) {
        expect(positions[0]).toBeLessThan(positions[1]);
      }
    }
  });

  it("rejects a cyclic graph", () => {
    expect(() =>
      sankeyLayers({
        links: [
          { source: "a", target: "b", value: 1 },
          { source: "b", target: "a", value: 1 }
        ]
      })
    ).toThrow();
  });
});

describe("sankeyAddDummies", () => {
  it("routes a two-layer link through a dummy", () => {
    const layout = sankeyAddDummies(sankeyLayers({ links: simpleLinks }));
    const link = layout.nodeMap.a.outgoing.find((l) => l.target === "c");
    expect(/** @type {any} */ (link).dummies).toHaveLength(1);
  });

  it("adds one dummy per intervening layer", () => {
    const base = sankeyLayers({ links: sampleLinks() });
    const layout = sankeyAddDummies(base);
    // Dummy nodes share the very link object they route, so only the link's
    // real source node reports its true span.
    for (const node of layout.layers.flat()) {
      if (node.dummy || node.hidden) continue;
      for (const link of /** @type {any[]} */ (node.outgoing)) {
        if (layout.nodeMap[link.target].hidden) continue;
        const span = layout.nodeMap[link.target].layer - node.layer;
        const dummies = link.dummies?.length ?? 0;
        expect(dummies, `${link.source} -> ${link.target}`).toBe(
          Math.max(0, span - 1)
        );
      }
    }
  });

  it("leaves the input layout unmodified", () => {
    const base = sankeyLayers({ links: simpleLinks });
    const before = base.layers.map((l) => l.length);
    sankeyAddDummies(base);
    expect(base.layers.map((l) => l.length)).toEqual(before);
  });

  it("walks a link's route forwards and backwards consistently", () => {
    const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
    for (const node of layout.layers.flat()) {
      for (const link of node.outgoing) {
        if (layout.nodeMap[link.target].hidden) continue;
        const next = layout.nextNode(node, link);
        expect(layout.prevNode(next, link)).toBe(node);
      }
    }
  });
});

describe("sankeyOrderNodes", () => {
  it("never increases the crossing count", () => {
    const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
    const before = layout.layers
      .slice(1)
      .reduce(
        (acc, _, i) =>
          acc +
          bipartite(layout.layers[i], layout.layers[i + 1], (node) =>
            node.outgoing.map((l) => layout.nextNode(node, l))
          ).countCrossings(),
        0
      );
    const result = sankeyOrderNodes(layout, { nsteps: 20, random: randomLcg(7) });
    expect(result.crossings).toBeLessThanOrEqual(before);
  });

  it("is reproducible when given a seeded random source", () => {
    /** @param {number} seed */
    const run = (seed) => {
      const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
      return sankeyOrderNodes(layout, { nsteps: 30, random: randomLcg(seed) });
    };
    expect(run(123).crossings).toBe(run(123).crossings);
  });

  it("preserves every node, adding and losing none", () => {
    const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
    const before = layout.layers.flat().map((n) => n.key).sort();
    const after = sankeyOrderNodes(layout, { nsteps: 10, random: randomLcg(1) })
      .layers.flat()
      .map((n) => n.key)
      .sort();
    expect(after).toEqual(before);
  });

  it("records a non-increasing history", () => {
    const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
    const { history } = sankeyOrderNodes(layout, { nsteps: 40, random: randomLcg(3) });
    for (let i = 1; i < history.length; i++) {
      expect(history[i].crossings).toBeLessThan(history[i - 1].crossings);
    }
  });

  it("supports every heuristic and swap policy", () => {
    for (const heuristic of ["median", "barycenter"]) {
      for (const swapAlgorithm of ["simulated annealing", "sequential", "mixed"]) {
        const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
        const r = sankeyOrderNodes(layout, {
          nsteps: 5,
          heuristic: /** @type {any} */ (heuristic),
          swapAlgorithm: /** @type {any} */ (swapAlgorithm),
          random: randomLcg(5)
        });
        expect(Number.isFinite(r.crossings)).toBe(true);
      }
    }
  });
});

describe("sankeyGeometricLayout", () => {
  /** @param {object} [opts] */
  const geom = (opts = {}) => {
    const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
    sankeyOrderNodes(layout, { nsteps: 20, random: randomLcg(11) });
    return sankeyGeometricLayout(layout, { size: 500, whitespace: 0.3, ...opts });
  };

  it("gives every node a finite coordinate and size", () => {
    for (const node of geom().layers.flat()) {
      expect(Number.isFinite(node.coord)).toBe(true);
      expect(Number.isFinite(node.size)).toBe(true);
      expect(node.size).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps nodes within a layer disjoint and in order", () => {
    for (const layer of geom().layers) {
      for (let i = 1; i < layer.length; i++) {
        const prev = layer[i - 1];
        const cur = layer[i];
        if (prev.vertex === cur.vertex) continue;
        expect(cur.coord).toBeGreaterThanOrEqual(prev.coord + prev.size - 1e-6);
      }
    }
  });

  it("keeps the layout inside its extent", () => {
    const size = 500;
    for (const node of geom({ size }).layers.flat()) {
      expect(node.coord).toBeGreaterThanOrEqual(-1);
      expect(node.coord + node.size).toBeLessThanOrEqual(size + 1);
    }
  });

  it("packs consecutive dummies into one vertex when joinDummies is set", () => {
    /** @param {boolean} joinDummies */
    const vertexCount = (joinDummies) => {
      const g = geom({ joinDummies });
      return new Set(g.layers.flat().map((/** @type {any} */ n) => n.vertex)).size;
    };
    expect(vertexCount(true)).toBeLessThan(vertexCount(false));
  });

  it("packs only dummies, never real nodes", () => {
    const g = geom({ joinDummies: true });
    /** @type {Map<any, any[]>} */
    const byVertex = new Map();
    for (const node of g.layers.flat()) {
      byVertex.set(node.vertex, [...(byVertex.get(node.vertex) ?? []), node]);
    }
    for (const nodes of byVertex.values()) {
      if (nodes.length > 1) {
        for (const n of nodes) expect(n.dummy).toBe(true);
      }
    }
  });
});

describe("sankeyRenderLayout", () => {
  /** @param {object} [opts] */
  const render = (opts = {}) => {
    const layout = sankeyAddDummies(sankeyLayers({ links: sampleLinks() }));
    sankeyOrderNodes(layout, { nsteps: 20, random: randomLcg(13) });
    const g = sankeyGeometricLayout(layout, { size: 400, whitespace: 0.3 });
    return sankeyRenderLayout(g, { length: 800, ...opts });
  };

  it("produces finite boxes", () => {
    for (const box of render().boxes) {
      for (const v of [box.x, box.y, box.width, box.height]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("produces at least one path segment per group", () => {
    for (const group of render().pathGroups) {
      expect(group.paths.length).toBeGreaterThan(0);
    }
  });

  it("transposes cleanly between orientations", () => {
    const h = render({ flowDirection: "horizontal" });
    const v = render({ flowDirection: "vertical" });
    expect(v.boxes.length).toBe(h.boxes.length);
    expect(v.pathGroups.length).toBe(h.pathGroups.length);
  });

  it("attaches hidden-node links to the visible node's box", () => {
    const layout = sankeyAddDummies(
      sankeyLayers({ links: sampleLinks(), hidden: ["Imp.", "Exp."] })
    );
    sankeyOrderNodes(layout, { nsteps: 10, random: randomLcg(17) });
    const g = sankeyGeometricLayout(layout, { size: 400 });
    const r = sankeyRenderLayout(g, {});
    const withHidden = r.boxes.filter((b) => b.hiddenPaths?.length);
    expect(withHidden.length).toBeGreaterThan(0);
  });
});

describe("totalizing nodes", () => {
  it("reduce crossings relative to the unbundled graph", () => {
    /** @param {any[]} links */
    const crossings = (links) => {
      const layout = sankeyAddDummies(sankeyLayers({ links }));
      return sankeyOrderNodes(layout, { nsteps: 40, random: randomLcg(19) }).crossings;
    };
    const links = sampleLinks();
    expect(crossings(addTotalizingNodes(links, energySumNodes))).toBeLessThan(
      crossings(links)
    );
  });
});

describe("sankeyLayoutCopy", () => {
  it("detaches the copy from the original", () => {
    const original = sankeyAddDummies(sankeyLayers({ links: simpleLinks }));
    const copy = sankeyLayoutCopy(original);
    copy.nodeMap.a.total_out = 999;
    expect(original.nodeMap.a.total_out).toBe(15);
  });

  it("keeps a link shared between the nodes it joins", () => {
    const copy = sankeyLayoutCopy(sankeyAddDummies(sankeyLayers({ links: simpleLinks })));
    const out = copy.nodeMap.a.outgoing.find((l) => l.target === "b");
    const into = copy.nodeMap.b.incoming.find((l) => l.source === "a");
    expect(out).toBe(into);
  });
});
