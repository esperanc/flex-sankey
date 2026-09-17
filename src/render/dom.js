/**
 * DOM rendering and interaction — stage 6c, browser variant.
 *
 * Builds live SVG elements from a painted scene and, optionally, wires up
 * hover highlighting and node dragging. This is the only module in the
 * package that needs a DOM; everything else runs headless.
 *
 * Implemented against the standard DOM API rather than d3, so the package has
 * no runtime dependencies. Dragging uses pointer events, which gives touch
 * support for free.
 *
 * @module render/dom
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @typedef {import("./theme.js").PaintedScene} PaintedScene
 */

/**
 * @param {Document} doc
 * @param {string} name
 * @param {Record<string, string|number>} [attrs]
 * @returns {SVGElement}
 */
function el(doc, name, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * @param {Document} doc
 * @param {SVGElement} parent
 * @param {string} text
 */
function addTitle(doc, parent, text) {
  const t = doc.createElementNS(SVG_NS, "title");
  t.textContent = text;
  parent.appendChild(t);
}

/**
 * @param {Document} doc
 * @param {import("./scene.js").SceneLabel} label
 * @param {string} fill
 * @param {PaintedScene["style"]} style
 * @returns {SVGElement}
 */
function textEl(doc, label, fill, style) {
  const t = el(doc, "text", {
    transform:
      label.angle === 0
        ? `translate(${label.x},${label.y})`
        : `translate(${label.x},${label.y}) rotate(${label.angle})`,
    "text-anchor": label.anchor,
    "dominant-baseline": label.baseline,
    fill
  });
  t.style.font = style.labelFont;
  t.style.filter = style.labelFilter;
  t.style.userSelect = "none";
  t.textContent = label.text;
  return t;
}

/**
 * @typedef {object} DomOptions
 * @property {Document} [document] Document to create elements in. Defaults to
 *   the global one.
 * @property {SVGSVGElement} [svg] Render into this element instead of creating
 *   one.
 * @property {boolean} [interactive=true] Attach hover highlighting and node
 *   dragging.
 */

/**
 * Builds a live SVG element from a painted scene.
 *
 * @param {PaintedScene} scene
 * @param {DomOptions} [options]
 * @returns {SVGSVGElement}
 */
export function sceneToDOM(scene, { document: doc, svg, interactive = true } = {}) {
  doc = doc ?? globalThis.document;
  if (!doc) {
    throw new Error("sceneToDOM needs a DOM; use sceneToSVG for string output");
  }

  const { width, height, gradients, nodes, links, style } = scene;
  const root = /** @type {SVGSVGElement} */ (
    svg ?? el(doc, "svg", { width, height, viewBox: `0 0 ${width} ${height}` })
  );

  if (gradients.length) {
    const defs = el(doc, "defs");
    for (const g of gradients) {
      const grad = el(doc, "linearGradient", {
        id: g.id,
        x1: g.x1,
        y1: g.y1,
        x2: g.x2,
        y2: g.y2
      });
      grad.appendChild(el(doc, "stop", { offset: "0%", "stop-color": g.from }));
      grad.appendChild(el(doc, "stop", { offset: "100%", "stop-color": g.to }));
      defs.appendChild(grad);
    }
    root.appendChild(defs);
  }

  const linkGroup = el(doc, "g", { class: "links" });
  /** @type {{ element: SVGElement, sourceKey: string, targetKey: string }[]} */
  const linkEls = [];
  for (const link of links) {
    const path = el(doc, "path", {
      class: "link",
      d: link.geometry.d,
      fill: link.fill,
      "fill-opacity": link.fillOpacity,
      stroke: "none"
    });
    addTitle(doc, path, link.title);
    linkGroup.appendChild(path);
    linkEls.push({
      element: path,
      sourceKey: link.geometry.sourceKey,
      targetKey: link.geometry.targetKey
    });
  }
  root.appendChild(linkGroup);

  const nodeGroup = el(doc, "g", { class: "nodes" });
  const labelGroup = el(doc, "g", { class: "labels" });
  /** @type {{ group: SVGElement, key: string }[]} */
  const nodeEls = [];

  for (const node of nodes) {
    const g = node.geometry;
    if (g.dummy) continue;

    // One group per node, positioned by transform, so dragging only has to
    // update a single attribute.
    const group = el(doc, "g", {
      class: "node",
      transform: `translate(${g.x},${g.y})`
    });
    const rect = el(doc, "rect", {
      width: g.width,
      height: g.height,
      fill: node.fill,
      stroke: node.stroke,
      "stroke-width": node.strokeWidth,
      "stroke-opacity": node.strokeOpacity,
      "stroke-linejoin": node.strokeLinejoin
    });
    addTitle(doc, rect, node.title);
    group.appendChild(rect);

    for (const { mark, fill, title } of node.hiddenMarks) {
      for (const rule of mark.rules) {
        group.appendChild(
          el(doc, "polyline", {
            // Marks carry absolute coordinates, so undo the group transform.
            points: rule.map(([x, y]) => `${x - g.x},${y - g.y}`).join(" "),
            fill: "none",
            stroke: node.stroke,
            "stroke-dasharray": "2 2"
          })
        );
      }
      const tri = el(doc, "polygon", {
        points: mark.triangle.map(([x, y]) => `${x - g.x},${y - g.y}`).join(" "),
        fill,
        "fill-opacity": style.pathOpacity,
        stroke: node.stroke
      });
      addTitle(doc, tri, title);
      group.appendChild(tri);

      const markLabel = { ...mark.label, x: mark.label.x - g.x, y: mark.label.y - g.y };
      group.appendChild(textEl(doc, markLabel, style.labelColor, style));
    }

    nodeGroup.appendChild(group);
    nodeEls.push({ group, key: g.key });

    if (node.label) {
      labelGroup.appendChild(textEl(doc, node.label.label, node.label.fill, style));
    }
  }

  root.appendChild(nodeGroup);
  root.appendChild(labelGroup);

  if (interactive) attachInteraction(root, linkEls, nodeEls, style);
  return root;
}

/**
 * Adds hover highlighting and node dragging.
 *
 * Dragging moves a node's rectangle only; the ribbons are not re-routed, since
 * re-running the layout mid-drag would be both expensive and disorienting.
 * Highlighting on hover is what makes a dense diagram readable.
 *
 * @param {SVGSVGElement} root
 * @param {{ element: SVGElement, sourceKey: string, targetKey: string }[]} linkEls
 * @param {{ group: SVGElement, key: string }[]} nodeEls
 * @param {PaintedScene["style"]} style
 */
function attachInteraction(root, linkEls, nodeEls, style) {
  const base = style.pathOpacity;

  /** @param {string|null} key Highlight links touching `key`; null resets. */
  const highlight = (key) => {
    for (const { element, sourceKey, targetKey } of linkEls) {
      const on = key === null || sourceKey === key || targetKey === key;
      element.setAttribute("fill-opacity", String(key === null ? base : on ? 1 : 0.1));
    }
  };

  for (const { element } of linkEls) {
    element.addEventListener("mouseenter", () =>
      element.setAttribute("fill-opacity", "1")
    );
    element.addEventListener("mouseleave", () =>
      element.setAttribute("fill-opacity", String(base))
    );
  }

  for (const { group, key } of nodeEls) {
    group.style.cursor = "grab";
    group.addEventListener("mouseenter", () => highlight(key));
    group.addEventListener("mouseleave", () => highlight(null));

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    group.addEventListener("pointerdown", (evt) => {
      const e = /** @type {PointerEvent} */ (evt);
      dragging = true;
      const t = group.getAttribute("transform") ?? "";
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(t);
      originX = m ? parseFloat(m[1]) : 0;
      originY = m ? parseFloat(m[2]) : 0;
      startX = e.clientX;
      startY = e.clientY;
      group.style.cursor = "grabbing";
      group.setPointerCapture?.(e.pointerId);
      highlight(key);
      e.preventDefault();
    });

    group.addEventListener("pointermove", (evt) => {
      if (!dragging) return;
      const e = /** @type {PointerEvent} */ (evt);
      const x = originX + (e.clientX - startX);
      const y = originY + (e.clientY - startY);
      group.setAttribute("transform", `translate(${x},${y})`);
    });

    const end = (/** @type {Event} */ evt) => {
      if (!dragging) return;
      dragging = false;
      group.style.cursor = "grab";
      const e = /** @type {PointerEvent} */ (evt);
      group.releasePointerCapture?.(e.pointerId);
      highlight(null);
    };
    group.addEventListener("pointerup", end);
    group.addEventListener("pointercancel", end);
  }
}
