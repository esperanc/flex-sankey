/**
 * A parametric, domain-free graph specification.
 *
 * The energy-matrix example is fixed in size, which makes it a poor probe of
 * how a layout behaves as a diagram grows. This builds an abstract layered
 * flow graph to any requested shape, so difficulty becomes a dial: more
 * layers, wider layers, higher fan-out, longer link spans.
 *
 * Nodes are named by layer letter and index — `A1`, `B3`, `C2` — which stays
 * legible in a rendered diagram at any size and is obviously synthetic, so no
 * reader mistakes it for real data.
 *
 * The result is an ordinary `GraphSpec`, so it feeds `makeSyntheticSankeyData`
 * exactly as the energy specification does.
 *
 * @module data/layered
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { randomLcg } from "../internal/random.js";

/**
 * Names a layer: A, B, ... Z, then AA, AB, and so on.
 * @param {number} i
 * @returns {string}
 */
function layerName(i) {
  let name = "";
  i += 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    i = Math.floor((i - 1) / 26);
  }
  return name;
}

/**
 * @typedef {object} LayeredSpecOptions
 * @property {number[]} [layers=[4, 5, 5, 4]] Node count per layer. Its length
 *   is the number of layers.
 * @property {number} [fanout=2] Outgoing links per node, capped by how many
 *   targets are reachable.
 * @property {number} [maxSpan=2] Greatest number of layers a link may jump.
 *   Above 1, links skip layers and the layout must route them through dummy
 *   nodes — which is what makes a diagram hard to read, so it is worth
 *   exercising.
 * @property {number} [optionalSources=0.3] Fraction of source nodes that may
 *   be dropped, varying topology between datasets. Sources that are the sole
 *   supplier of a second-layer node are never dropped, so no node is ever
 *   orphaned.
 * @property {boolean} [optionalSinks=true] Allow links into the final layer to
 *   be dropped, mirroring the optional export flows of the energy example.
 * @property {number} [sourceTotal=1000] Total flow entering the graph.
 * @property {number} [seed=1] Seed for the structure. Distinct from the seed
 *   used later for magnitudes: this one fixes the shape.
 */

/**
 * Builds a layered graph specification.
 *
 * The structure is deterministic given `seed` and the shape parameters. Every
 * node beyond the first layer is guaranteed at least one incoming link, and
 * every node before the last at least one outgoing link, so no node is
 * stranded without flow.
 *
 * @param {LayeredSpecOptions} [options]
 * @returns {import("./synthetic.js").GraphSpec}
 */
export function makeLayeredSpec({
  layers = [4, 5, 5, 4],
  fanout = 2,
  maxSpan = 2,
  optionalSources = 0.3,
  optionalSinks = true,
  sourceTotal = 1000,
  seed = 1
} = {}) {
  const random = randomLcg(seed);
  /** @param {number} n */
  const pick = (n) => Math.floor(random() * n) % n;

  /** @type {string[][]} */
  const names = layers.map((count, l) =>
    Array.from({ length: count }, (_, i) => `${layerName(l)}${i + 1}`)
  );
  const L = names.length;

  /** Outgoing targets per node key. @type {Map<string, Set<string>>} */
  const out = new Map();
  /** @type {Map<string, Set<string>>} */
  const incoming = new Map();
  for (const layer of names) {
    for (const key of layer) {
      out.set(key, new Set());
      incoming.set(key, new Set());
    }
  }

  /**
   * @param {string} from
   * @param {string} to
   */
  const connect = (from, to) => {
    out.get(from)?.add(to);
    incoming.get(to)?.add(from);
  };

  // Fan out from every node that is not in the final layer. Targets are drawn
  // from the next `maxSpan` layers, biased towards the nearest one so that
  // most links are short and only some skip.
  for (let l = 0; l < L - 1; l++) {
    const reach = [];
    for (let s = 1; s <= maxSpan && l + s < L; s++) {
      // Weight by 1/s: adjacent layers are chosen more often than distant ones.
      const repeats = Math.max(1, Math.round(maxSpan / s));
      for (let r = 0; r < repeats; r++) reach.push(l + s);
    }
    for (const key of names[l]) {
      const wanted = Math.min(fanout, names.slice(l + 1).flat().length);
      let guard = wanted * 20;
      while ((out.get(key)?.size ?? 0) < wanted && guard-- > 0) {
        const targetLayer = reach[pick(reach.length)];
        connect(key, names[targetLayer][pick(names[targetLayer].length)]);
      }
    }
  }

  // Guarantee every node past the first layer has a supplier.
  for (let l = 1; l < L; l++) {
    for (const key of names[l]) {
      if ((incoming.get(key)?.size ?? 0) > 0) continue;
      const from = Math.max(0, l - maxSpan);
      const candidates = names.slice(from, l).flat();
      connect(candidates[pick(candidates.length)], key);
    }
  }

  // Guarantee every node before the last layer has a consumer.
  for (let l = 0; l < L - 1; l++) {
    for (const key of names[l]) {
      if ((out.get(key)?.size ?? 0) > 0) continue;
      const to = Math.min(L - 1, l + maxSpan);
      const candidates = names.slice(l + 1, to + 1).flat();
      connect(key, candidates[pick(candidates.length)]);
    }
  }

  /** @type {[string[], string[]][]} */
  const linkPairs = [];
  for (const layer of names) {
    for (const key of layer) {
      const targets = [...(out.get(key) ?? [])];
      if (targets.length) linkPairs.push([[key], targets]);
    }
  }

  // A source may be dropped unless some node depends on it *exclusively* —
  // that is, the source is that node's only supplier of any kind. Checking
  // only whether it is the node's sole *source* would protect far more than
  // necessary, since such a node usually has other, non-source suppliers.
  const sources = names[0];
  const sole = new Set();
  for (const key of names.slice(1).flat()) {
    const suppliers = [...(incoming.get(key) ?? [])];
    if (suppliers.length === 1 && sources.includes(suppliers[0])) {
      sole.add(suppliers[0]);
    }
  }
  const droppable = sources.filter((s) => !sole.has(s));
  const optionalNodes = droppable.slice(
    0,
    Math.floor(sources.length * optionalSources)
  );

  /** @type {[string|RegExp, string|RegExp][]} */
  const optionalLinks = [];
  if (optionalSinks && L > 1) {
    // Links terminating in the final layer may be dropped, the way export
    // flows are in the energy example.
    optionalLinks.push([/.*/, new RegExp(`^${layerName(L - 1)}\\d+$`)]);
  }

  return { linkPairs, sources, sourceTotal, optionalNodes, optionalLinks };
}
