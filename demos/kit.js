/**
 * Shared scaffolding for the demo pages.
 *
 * Provides a small declarative control panel, the common page chrome, and the
 * sample datasets. Written without dependencies, like the library itself, so a
 * demo page is nothing but an HTML file and an ES module.
 *
 * @module demos/kit
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { makeSyntheticSankeyData, addTotalizingNodes } from "../src/data/synthetic.js";
import {
  energySpec, energySumNodes, energyCategories, energyColors
} from "../src/data/energy.js";
import { makeLayeredSpec } from "../src/data/layered.js";

/**
 * @typedef {object} ControlSpec
 * @property {string} key Property name in the resulting values object.
 * @property {"range"|"select"|"toggle"|"button"|"group"} type
 * @property {string} [label]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {any} [value] Initial value.
 * @property {{value: any, label: string}[]|string[]} [options] For `select`.
 * @property {string} [hint] Explanatory line beneath the control.
 * @property {() => void} [onClick] For `button`.
 * @property {(v: number) => string} [format] Formats the displayed value.
 */

/**
 * Builds a control panel.
 *
 * Returns a live `values` object; the callback fires whenever anything
 * changes, so a demo redraws by reading `values` rather than tracking events.
 *
 * @param {HTMLElement} host
 * @param {ControlSpec[]} specs
 * @param {(values: Record<string, any>) => void} onChange
 * @returns {Record<string, any>} The live values.
 */
export function controls(host, specs, onChange) {
  /** @type {Record<string, any>} */
  const values = {};
  let raf = 0;
  const fire = () => {
    // Coalesce bursts from a dragged slider into one redraw per frame.
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => onChange(values));
  };

  for (const spec of specs) {
    if (spec.type === "group") {
      const h = document.createElement("h2");
      h.textContent = spec.label ?? "";
      host.appendChild(h);
      continue;
    }

    if (spec.type === "button") {
      const wrap = document.createElement("div");
      wrap.className = "control";
      const btn = document.createElement("button");
      btn.textContent = spec.label ?? spec.key;
      btn.addEventListener("click", () => spec.onClick?.());
      wrap.appendChild(btn);
      host.appendChild(wrap);
      continue;
    }

    const wrap = document.createElement("div");
    wrap.className = `control ${spec.type}`;
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = spec.label ?? spec.key;

    if (spec.type === "range") {
      const shown = document.createElement("span");
      shown.className = "value";
      const input = document.createElement("input");
      input.type = "range";
      input.dataset.key = spec.key;
      input.min = String(spec.min ?? 0);
      input.max = String(spec.max ?? 1);
      input.step = String(spec.step ?? 0.01);
      input.value = String(spec.value ?? spec.min ?? 0);
      values[spec.key] = Number(input.value);
      const show = () => {
        shown.textContent = spec.format
          ? spec.format(values[spec.key])
          : String(values[spec.key]);
      };
      show();
      input.addEventListener("input", () => {
        values[spec.key] = Number(input.value);
        show();
        fire();
      });
      label.append(text, shown);
      wrap.append(label, input);
    } else if (spec.type === "select") {
      const select = document.createElement("select");
      for (const option of spec.options ?? []) {
        const o = document.createElement("option");
        const value = typeof option === "string" ? option : option.value;
        o.value = String(value);
        o.textContent = typeof option === "string" ? option : option.label;
        select.appendChild(o);
      }
      select.value = String(spec.value ?? "");
      values[spec.key] = select.value;
      select.addEventListener("change", () => {
        values[spec.key] = select.value;
        fire();
      });
      label.append(text);
      wrap.append(label, select);
    } else {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(spec.value);
      values[spec.key] = input.checked;
      input.addEventListener("change", () => {
        values[spec.key] = input.checked;
        fire();
      });
      label.prepend(input);
      label.append(text);
      wrap.append(label);
    }

    if (spec.hint) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = spec.hint;
      wrap.appendChild(hint);
    }
    host.appendChild(wrap);
  }
  return values;
}

/**
 * Sets up the standard demo page: header, control column, output area.
 *
 * @param {object} meta
 * @param {string} meta.title
 * @param {string} meta.description
 * @returns {{ controls: HTMLElement, stage: HTMLElement }}
 */
export function page({ title, description }) {
  document.title = `${title} — flex-sankey demos`;

  const header = document.createElement("header");
  header.className = "demo";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  const p = document.createElement("p");
  p.textContent = description;
  const back = document.createElement("a");
  back.className = "back";
  back.href = "./index.html";
  back.textContent = "← all demos";
  header.append(h1, p, back);

  const main = document.createElement("main");
  main.className = "demo";
  const controlsEl = document.createElement("div");
  controlsEl.className = "controls";
  const stage = document.createElement("div");
  stage.className = "stage";
  main.append(controlsEl, stage);

  document.body.append(header, main);
  return { controls: controlsEl, stage };
}

/**
 * A readout strip of named measurements.
 *
 * @param {HTMLElement} host
 * @returns {(entries: Record<string, string|number>) => void}
 */
export function readout(host) {
  const el = document.createElement("div");
  el.className = "readout";
  host.appendChild(el);
  return (entries) => {
    el.replaceChildren();
    for (const [name, value] of Object.entries(entries)) {
      const span = document.createElement("span");
      span.className = "metric";
      span.append(`${name} `);
      const b = document.createElement("b");
      b.textContent = String(value);
      span.appendChild(b);
      el.appendChild(span);
    }
  };
}

/**
 * Adds an explanatory footnote beneath a demo.
 *
 * @param {HTMLElement} host
 * @param {string} html Trusted markup written by the demo itself.
 */
export function note(host, html) {
  const el = document.createElement("p");
  el.className = "note";
  el.innerHTML = html;
  host.appendChild(el);
  return el;
}

// --- sample data ----------------------------------------------------------

/** The colour scheme used by the energy example. */
export const energyColorScale = (() => {
  const palette = new Map(energyCategories.map((c, i) => [c, energyColors[i]]));
  return (/** @type {string} */ key) => palette.get(key) ?? "#8a8a8a";
})();

/**
 * The energy dataset, at a given seed.
 *
 * @param {object} [options]
 * @param {number} [options.seed=0.5]
 * @param {boolean} [options.totalizing=false]
 * @returns {any[]}
 */
export function energyData({ seed = 0.5, totalizing = false } = {}) {
  const links = makeSyntheticSankeyData(energySpec, {
    randomSeed: seed,
    regularity: 0.1,
    optionalProbability: 0.8
  });
  return totalizing ? addTotalizingNodes(links, energySumNodes) : links;
}

/**
 * A larger abstract dataset, for demonstrating behaviour at scale.
 *
 * @param {object} [options]
 * @param {number} [options.seed=0.5]
 * @param {number} [options.scale=1] 0 small, 1 medium, 2 large.
 * @returns {any[]}
 */
export function layeredData({ seed = 0.5, scale = 1 } = {}) {
  const shapes = [
    { layers: [3, 4, 4, 3], fanout: 2, maxSpan: 2 },
    { layers: [6, 7, 8, 7, 6], fanout: 3, maxSpan: 2 },
    { layers: [8, 10, 12, 10, 8, 6], fanout: 3, maxSpan: 3 }
  ];
  const spec = makeLayeredSpec({
    ...shapes[Math.min(2, Math.max(0, Math.round(scale)))],
    optionalSources: 0.5,
    seed: 1
  });
  return makeSyntheticSankeyData(spec, {
    randomSeed: seed,
    regularity: 0.1,
    optionalProbability: 0.8
  });
}

/** Keys the energy example treats as incidental, for the hidden-node demos. */
export const INCIDENTAL = ["Imp.", "Exp.", "Heat & Waste"];

/**
 * Replaces the contents of a node with a fresh element.
 * @param {HTMLElement} host
 * @param {Node} child
 */
export function show(host, child) {
  host.replaceChildren(child);
}
