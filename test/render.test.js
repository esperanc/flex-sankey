/**
 * Tests for the rendering stages.
 *
 * The point of splitting scene construction from painting is that geometry
 * and style can vary independently. Several tests below assert exactly that,
 * since it is the property the whole structure exists to provide.
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
  sankeyRenderLayout
} from "../src/layout/index.js";
import { buildScene, refreshLink, refreshNode } from "../src/render/scene.js";
import { paintScene, ordinalColorScale } from "../src/render/theme.js";
import { sceneToSVG } from "../src/render/svg.js";
import { sceneToDOM } from "../src/render/dom.js";
import { labelAlignment, resolveLabelPos } from "../src/render/labels.js";
import { makeSyntheticSankeyData } from "../src/data/synthetic.js";
import { energySpec } from "../src/data/energy.js";
import { randomLcg } from "../src/internal/random.js";

/** @param {object} [opts] */
function makeRenderLayout(opts = {}) {
  const links = makeSyntheticSankeyData(energySpec, {
    randomSeed: 0.5,
    regularity: 0.1,
    optionalProbability: 0.7
  });
  const layout = sankeyAddDummies(
    sankeyLayers({ links, .../** @type {any} */ (opts).data })
  );
  sankeyOrderNodes(layout, { nsteps: 20, random: randomLcg(3) });
  const geometry = sankeyGeometricLayout(layout, { size: 500, whitespace: 0.3 });
  return sankeyRenderLayout(geometry, { length: 800 });
}

describe("labelAlignment", () => {
  it("places a left label outside the box, right-aligned", () => {
    const { dx, anchor } = labelAlignment("left", 0, 20, 40, 6);
    expect(dx).toBe(-6);
    expect(anchor).toBe("end");
  });

  it("places a right label beyond the box, left-aligned", () => {
    const { dx, anchor } = labelAlignment("right", 0, 20, 40, 6);
    expect(dx).toBe(26);
    expect(anchor).toBe("start");
  });

  it("centres a center label", () => {
    const { dx, dy, anchor, baseline } = labelAlignment("center", 0, 20, 40, 6);
    expect([dx, dy]).toEqual([10, 20]);
    expect([anchor, baseline]).toEqual(["middle", "central"]);
  });
});

describe("resolveLabelPos", () => {
  it("puts left-right labels on the outward side", () => {
    const near = { x: 10, y: 0, width: 10, height: 10 };
    const far = { x: 700, y: 0, width: 10, height: 10 };
    expect(resolveLabelPos("left-right", near, {}, 800, 500)).toBe("right");
    expect(resolveLabelPos("left-right", far, {}, 800, 500)).toBe("left");
  });

  it("passes concrete positions through unchanged", () => {
    expect(resolveLabelPos("top", { x: 0, y: 0, width: 1, height: 1 }, {}, 800, 500)).toBe("top");
  });

  it("accepts a function", () => {
    const pos = resolveLabelPos(() => "bottom", { x: 0, y: 0, width: 1, height: 1 }, {}, 800, 500);
    expect(pos).toBe("bottom");
  });
});

describe("buildScene", () => {
  const scene = buildScene(makeRenderLayout(), { width: 800, height: 500 });

  it("produces finite node geometry", () => {
    for (const n of scene.nodes) {
      for (const v of [n.x, n.y, n.width, n.height]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("emits a drawable path for every link", () => {
    expect(scene.links.length).toBeGreaterThan(0);
    for (const l of scene.links) {
      expect(l.d).toMatch(/^M /);
      expect(l.d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it("exposes control points alongside the path string", () => {
    // The benchmark measures from these rather than re-parsing `d`, which is
    // what removes the arc-chord approximation from the analysis.
    for (const l of scene.links) {
      expect(l.curves.length).toBeGreaterThan(0);
      for (const pair of l.curves) {
        expect(pair).toHaveLength(2);
        for (const curve of pair) {
          expect(curve).toHaveLength(4);
          for (const [x, y] of curve) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          }
        }
      }
    }
  });

  it("labels real nodes but not dummies", () => {
    for (const n of scene.nodes) {
      if (n.dummy) expect(n.label).toBeNull();
      else expect(n.label?.text).toBeTruthy();
    }
  });

  it("carries no styling whatsoever", () => {
    // Geometry and style are separate stages; if a colour leaks into the
    // scene, that separation has been broken.
    const json = JSON.stringify(scene);
    expect(json).not.toMatch(/fill|stroke|opacity|#[0-9a-f]{6}/i);
  });

  it("is deterministic", () => {
    const layout = makeRenderLayout();
    const a = buildScene(layout, { width: 800, height: 500 });
    const b = buildScene(layout, { width: 800, height: 500 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("straightens ribbons as bias falls", () => {
    const layout = makeRenderLayout();
    /** @param {number} bias */
    const spread = (bias) => {
      const s = buildScene(layout, { bias });
      let total = 0;
      for (const l of s.links) {
        for (const [lo] of l.curves) {
          // Distance of the first control point from its endpoint.
          total += Math.hypot(lo[1][0] - lo[0][0], lo[1][1] - lo[0][1]);
        }
      }
      return total;
    };
    expect(spread(0.3)).toBeLessThan(spread(1));
  });

  it("attaches hidden marks to the visible node", () => {
    const layout = makeRenderLayout({ data: { hidden: ["Imp.", "Exp."] } });
    const s = buildScene(layout, {});
    const marked = s.nodes.filter((n) => n.hiddenMarks.length > 0);
    expect(marked.length).toBeGreaterThan(0);
    for (const n of marked) {
      for (const m of n.hiddenMarks) {
        expect(m.triangle).toHaveLength(3);
        expect(m.rules).toHaveLength(2);
        expect(["input", "output"]).toContain(m.use);
      }
    }
  });
});

describe("paintScene", () => {
  const scene = buildScene(makeRenderLayout(), {});

  it("gives every node and link a fill", () => {
    const painted = paintScene(scene);
    for (const n of painted.nodes) expect(n.fill).toMatch(/^#|^url\(/);
    for (const l of painted.links) expect(l.fill).toMatch(/^#|^url\(/);
  });

  it("colours ribbons by source, target or a literal colour", () => {
    const colorScale = ordinalColorScale(["#aaaaaa", "#bbbbbb"]);
    const bySource = paintScene(scene, { pathColor: "source", colorScale });
    const byTarget = paintScene(scene, { pathColor: "target", colorScale });
    const literal = paintScene(scene, { pathColor: "#123456" });
    expect(literal.links.every((l) => l.fill === "#123456")).toBe(true);
    // Source and target colouring must differ somewhere.
    expect(bySource.links.map((l) => l.fill).join()).not.toBe(
      byTarget.links.map((l) => l.fill).join()
    );
  });

  it("registers one gradient per ribbon in source-target mode", () => {
    const painted = paintScene(scene, { pathColor: "source-target" });
    expect(painted.gradients).toHaveLength(painted.links.length);
    for (const l of painted.links) expect(l.fill).toMatch(/^url\(#/);
  });

  it("registers no gradients otherwise", () => {
    expect(paintScene(scene, { pathColor: "source" }).gradients).toHaveLength(0);
  });

  it("leaves the geometry untouched", () => {
    // The separation property: repainting must never move anything.
    const before = JSON.stringify(scene);
    paintScene(scene, { pathColor: "source-target", nodeStroke: "red" });
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("lets one scene carry two different styles", () => {
    const a = paintScene(scene, { colorScale: ordinalColorScale(["#111111"]) });
    const b = paintScene(scene, { colorScale: ordinalColorScale(["#222222"]) });
    expect(a.nodes.map((n) => n.geometry.x)).toEqual(b.nodes.map((n) => n.geometry.x));
    expect(a.nodes[0].fill).not.toBe(b.nodes[0].fill);
  });
});

describe("sceneToSVG", () => {
  const painted = paintScene(buildScene(makeRenderLayout(), {}), {});

  it("emits a well-formed root element", () => {
    const svg = sceneToSVG(painted);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("balances its group elements", () => {
    const svg = sceneToSVG(painted);
    expect((svg.match(/<g /g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
  });

  it("contains no invalid numbers", () => {
    expect(sceneToSVG(painted)).not.toMatch(/NaN|Infinity|undefined|null/);
  });

  it("omits titles on request, for clean rasterization", () => {
    expect(sceneToSVG(painted, { titles: false })).not.toContain("<title>");
    expect(sceneToSVG(painted, { titles: true })).toContain("<title>");
  });

  it("adds an XML declaration only when standalone", () => {
    expect(sceneToSVG(painted, { standalone: true }).startsWith("<?xml")).toBe(true);
    expect(sceneToSVG(painted).startsWith("<?xml")).toBe(false);
  });

  it("escapes markup in labels and tooltips", () => {
    const layout = makeRenderLayout();
    const scene = buildScene(layout, { nodeLabel: () => '<script>&"x"' });
    const svg = sceneToSVG(paintScene(scene, {}));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("is deterministic", () => {
    expect(sceneToSVG(painted)).toBe(sceneToSVG(painted));
  });

  it("draws one rect per non-dummy node", () => {
    const svg = sceneToSVG(painted);
    const expected = painted.nodes.filter((n) => !n.geometry.dummy).length;
    expect((svg.match(/<rect /g) ?? []).length).toBe(expected);
  });
});

describe("rebuilding geometry after a node moves", () => {
  // What dragging depends on. A node's box is the same object the layout
  // produced and the ribbons reference, so moving it and refreshing must
  // re-route every ribbon attached to it — otherwise a dragged node detaches
  // from its own flows.
  const scene = buildScene(makeRenderLayout(), { width: 800, height: 500 });

  it("keeps a reference to the layout box, without making the scene circular", () => {
    const real = scene.nodes.find((n) => !n.dummy);
    expect(real?.box).toBeTruthy();
    // The back-reference must not surface when the scene is serialized.
    expect(Object.keys(real ?? {})).not.toContain("box");
    expect(() => JSON.stringify(scene)).not.toThrow();
  });

  it("re-routes exactly the ribbons attached to the moved node", () => {
    const moved = scene.nodes.find(
      (n) => !n.dummy && scene.links.some((l) => l.sourceKey === n.key)
    );
    if (!moved) throw new Error("no connected node in the fixture");

    const before = scene.links.map((l) => l.d);
    moved.box.y += 40;
    refreshNode(moved, scene);
    for (const link of scene.links) refreshLink(link, scene.options);

    const changed = scene.links.filter((l, i) => l.d !== before[i]);
    const attached = scene.links.filter(
      (l) => l.sourceKey === moved.key || l.targetKey === moved.key
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBe(attached.length);
    for (const link of changed) {
      expect([link.sourceKey, link.targetKey]).toContain(moved.key);
    }
  });

  it("moves the node's own position and label with it", () => {
    const node = scene.nodes.find((n) => n.label);
    if (!node || !node.label) throw new Error("no labelled node in the fixture");
    const y0 = node.y;
    const labelY0 = node.label.y;
    node.box.y += 25;
    refreshNode(node, scene);
    expect(node.y).toBeCloseTo(y0 + 25, 6);
    expect(node.label.y).toBeCloseTo(labelY0 + 25, 6);
  });

  it("produces drawable geometry after a move", () => {
    const node = scene.nodes.find((n) => !n.dummy);
    if (!node) throw new Error("no real node in the fixture");
    node.box.x += 15;
    refreshNode(node, scene);
    for (const link of scene.links) refreshLink(link, scene.options);
    for (const link of scene.links) {
      expect(link.d).not.toMatch(/NaN|Infinity|undefined/);
      expect(link.curves.length).toBeGreaterThan(0);
    }
  });
});

describe("sceneToDOM", () => {
  it("explains itself when no DOM is available", () => {
    const painted = paintScene(buildScene(makeRenderLayout(), {}), {});
    // vitest's node environment has no global document.
    expect(() => sceneToDOM(painted)).toThrow(/DOM/);
  });
});
