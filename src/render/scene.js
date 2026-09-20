/**
 * Scene construction — stage 6a.
 *
 * Turns a render layout into a flat, serializable description of *what shapes
 * to draw and where*, saying nothing about how they should look. Colours,
 * fonts and opacities are applied afterwards by `paintScene`; emitting a
 * string or DOM nodes happens later still.
 *
 * Keeping these apart means the benchmark can measure geometry straight from
 * the scene — every ribbon's Bézier control points are right here — instead of
 * rendering to SVG and parsing the path strings back. That removes a whole
 * class of measurement error, notably the chord approximation of circular arcs
 * that the original analysis relied on.
 *
 * @module render/scene
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { outlinePath, outlinePathPoints } from "../paths/outline.js";
import { labelAlignment, resolveLabelPos } from "./labels.js";

/**
 * @typedef {import("../layout/render-layout.js").RenderLayout} RenderLayout
 * @typedef {import("./labels.js").LabelPos} LabelPos
 */

/**
 * @typedef {object} SceneLabel
 * @property {string} text
 * @property {number} x Absolute position.
 * @property {number} y
 * @property {string} anchor SVG `text-anchor`.
 * @property {string} baseline SVG `dominant-baseline`.
 * @property {number} angle Rotation in degrees.
 */

/**
 * A dashed line across a node marking the magnitude of a hidden flow, plus the
 * triangle that points to where it goes.
 *
 * @typedef {object} SceneHiddenMark
 * @property {string} sourceKey
 * @property {string} targetKey
 * @property {"input" | "output"} use Whether the flow enters or leaves.
 * @property {number} value
 * @property {[number, number][][]} rules Dashed lines, in absolute coordinates.
 * @property {[number, number][]} triangle Marker polygon, absolute.
 * @property {SceneLabel} label
 */

/**
 * @typedef {object} SceneNode
 * @property {string} key
 * @property {any} [box] The layout box this node was drawn from. Moving it and
 *   calling `refreshNode` repositions the node; the links attached to the same
 *   box follow once `refreshLink` is called for them. Non-enumerable, so it
 *   does not appear when the scene is serialized.
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} dummy True for routing waypoints, which are not drawn.
 * @property {number} value Total flow through the node.
 * @property {SceneLabel|null} label
 * @property {SceneHiddenMark[]} hiddenMarks
 */

/**
 * @typedef {object} SceneLink
 * @property {any[]} segments Box-relative geometry, one entry per hop, kept so
 *   the ribbon can be re-routed when a box moves. Non-enumerable, so it does
 *   not appear when the scene is serialized.
 * @property {string} sourceKey
 * @property {string} targetKey
 * @property {number} value
 * @property {string} d SVG path data: a closed, fillable outline covering
 *   every hop of the link.
 * @property {import("../paths/outline.js").CubicBezier[][]} curves The same
 *   geometry as control points, one pair of boundary curves per hop. Measure
 *   from this rather than re-parsing `d`.
 * @property {[number, number]} tangent Flow direction at the source, used to
 *   orient a gradient.
 */

/**
 * @typedef {object} Scene
 * @property {number} width
 * @property {number} height
 * @property {SceneNode[]} nodes
 * @property {SceneLink[]} links
 * @property {{bias: number, maxAngle: number, nodeLabel: (node: any) => string,
 *   nodeLabelPos: any, nodeLabelAngle: number, nodeLabelPadding: number,
 *   hiddenSymbolSize: number}} options The settings the scene was built with,
 *   needed to rebuild geometry after a node moves.
 */

/**
 * @typedef {object} SceneOptions
 * @property {number} [width=800] Diagram width in pixels.
 * @property {number} [height=500] Diagram height in pixels.
 * @property {number} [bias=1] Ribbon curviness. Below 1 straightens.
 * @property {number} [maxAngle=20] Reference-line angle limit, in degrees.
 * @property {(node: any) => string} [nodeLabel] Label text for a node.
 *   Defaults to its key.
 * @property {LabelPos | ((box: any, node: any) => LabelPos)} [nodeLabelPos="left-right"]
 *   Where labels sit.
 * @property {number} [nodeLabelAngle=0] Label rotation in degrees.
 * @property {number} [nodeLabelPadding=6] Gap between node and label.
 * @property {number} [hiddenSymbolSize=10] Size of the hidden-flow marker.
 */

/**
 * Builds the geometric scene for a render layout.
 *
 * @param {RenderLayout} renderLayout From `sankeyRenderLayout`.
 * @param {SceneOptions} [options]
 * @returns {Scene}
 */
export function buildScene(
  renderLayout,
  {
    width = 800,
    height = 500,
    bias = 1,
    maxAngle = 20,
    nodeLabel = (node) => node.key,
    nodeLabelPos = "left-right",
    nodeLabelAngle = 0,
    nodeLabelPadding = 6,
    hiddenSymbolSize = 10
  } = {}
) {
  const { boxes, pathGroups } = renderLayout;

  /** @type {SceneNode[]} */
  const nodes = [];
  for (const box of boxes) {
    const node = box.vertex.nodes[0];
    const dummy = Boolean(box.vertex.dummy);

    /** @type {SceneLabel|null} */
    let label = null;
    if (!dummy) {
      const pos = resolveLabelPos(nodeLabelPos, box, node, width, height);
      const { anchor, baseline, dx, dy } = labelAlignment(
        pos,
        nodeLabelAngle,
        box.width,
        box.height,
        nodeLabelPadding
      );
      label = {
        text: nodeLabel(node),
        x: box.x + dx,
        y: box.y + dy,
        anchor,
        baseline,
        angle: nodeLabelAngle
      };
    }

    /** @type {SceneNode} */
    const sceneNode = {
      key: node.key,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      dummy,
      value: node.total ?? 0,
      label,
      hiddenMarks: box.hiddenPaths
        ? box.hiddenPaths.map((hp) =>
            buildHiddenMark(hp, box, {
              hiddenSymbolSize,
              nodeLabel,
              nodeLabelAngle,
              nodeLabelPadding
            })
          )
        : []
    };
    // The layout box is plumbing, not scene data: it is held so geometry can be
    // rebuilt when a node moves, but it links back into the layout graph and
    // would make the scene unserializable. Keeping it non-enumerable preserves
    // the promise that a scene is a flat, serializable description.
    Object.defineProperty(sceneNode, "box", {
      value: box, enumerable: false, writable: true
    });
    nodes.push(sceneNode);
  }

  /** @type {SceneLink[]} */
  const links = [];
  for (const group of pathGroups) {
    // Hold on to each hop's box-relative geometry. The boxes are the same
    // objects the layout produced, so moving one and calling `refreshLink`
    // re-routes every ribbon attached to it — which is what makes dragging a
    // node drag its flows along with it.
    const segments = group.paths.map((path) => ({
      srcBox: path.srcBox,
      dstBox: path.dstBox,
      dx0: path.dx0, dy0: path.dy0, dx1: path.dx1, dy1: path.dy1,
      tx0: path.tx0, ty0: path.ty0, tx1: path.tx1, ty1: path.ty1,
      px0: path.px0, py0: path.py0, px1: path.px1, py1: path.py1,
      size: Math.max(path.link.size, 1)
    }));

    /** @type {SceneLink} */
    const sceneLink = /** @type {any} */ ({
      sourceKey: group.sourceNode.key,
      targetKey: group.targetNode.key,
      value: group.link.value,
      d: "",
      curves: [],
      tangent: segments.length ? [segments[0].tx0, segments[0].ty0] : [1, 0]
    });
    // Non-enumerable for the same reason as `box` above.
    Object.defineProperty(sceneLink, "segments", {
      value: segments, enumerable: false, writable: true
    });
    links.push(sceneLink);
  }

  const scene = {
    width,
    height,
    nodes,
    links,
    options: {
      bias,
      maxAngle,
      nodeLabel,
      nodeLabelPos,
      nodeLabelAngle,
      nodeLabelPadding,
      hiddenSymbolSize
    }
  };
  for (const link of links) refreshLink(link, scene.options);
  return scene;
}

/**
 * Recomputes a link's drawn geometry from the current position of the boxes it
 * connects.
 *
 * Called once when the scene is built, and again whenever a node moves.
 *
 * @param {SceneLink} link
 * @param {Scene["options"]} options
 */
export function refreshLink(link, options) {
  let d = "";
  /** @type {import("../paths/outline.js").CubicBezier[][]} */
  const curves = [];
  for (const seg of link.segments) {
    const { srcBox, dstBox } = seg;
    const a = /** @type {[number, number]} */ ([srcBox.x + seg.dx0, srcBox.y + seg.dy0]);
    const b = /** @type {[number, number]} */ ([dstBox.x + seg.dx1, dstBox.y + seg.dy1]);
    // Tangent length is half the gap between the boxes, along whichever axis
    // the flow runs, scaled by the curviness bias.
    const tsize = ((seg.tx0 > seg.ty0 ? b[0] - a[0] : b[1] - a[1]) / 2) * options.bias;
    const at = /** @type {[number, number]} */ ([seg.tx0 * tsize, seg.ty0 * tsize]);
    const bt = /** @type {[number, number]} */ ([seg.tx1 * tsize, seg.ty1 * tsize]);
    const ap = /** @type {[number, number]} */ ([srcBox.x + seg.px0, srcBox.y + seg.py0]);
    const bp = /** @type {[number, number]} */ ([dstBox.x + seg.px1, dstBox.y + seg.py1]);
    const spec = { a, b, at, bt, ap, bp, size: seg.size, maxAngle: options.maxAngle };
    d += outlinePath(spec);
    curves.push(outlinePathPoints(spec));
  }
  link.d = d;
  link.curves = curves;
}

/**
 * Recomputes a node's drawn geometry from the current position of its box,
 * including its label and any hidden-flow markers.
 *
 * @param {SceneNode} node
 * @param {Scene} scene
 */
export function refreshNode(node, scene) {
  const box = node.box;
  if (!box) return;
  node.x = box.x;
  node.y = box.y;

  const o = scene.options;
  if (node.label) {
    const source = box.vertex.nodes[0];
    const pos = resolveLabelPos(o.nodeLabelPos, box, source, scene.width, scene.height);
    const { anchor, baseline, dx, dy } = labelAlignment(
      pos, o.nodeLabelAngle, box.width, box.height, o.nodeLabelPadding
    );
    Object.assign(node.label, {
      x: box.x + dx, y: box.y + dy, anchor, baseline, angle: o.nodeLabelAngle
    });
  }

  if (box.hiddenPaths) {
    node.hiddenMarks = box.hiddenPaths.map((/** @type {any} */ hp) =>
      buildHiddenMark(hp, box, {
        hiddenSymbolSize: o.hiddenSymbolSize,
        nodeLabel: o.nodeLabel,
        nodeLabelAngle: o.nodeLabelAngle,
        nodeLabelPadding: o.nodeLabelPadding
      })
    );
  }
}

/**
 * Builds the marker geometry for a flow to or from a hidden node.
 *
 * A hidden node is not drawn. Instead its flow is shown by a pair of dashed
 * rules across the visible node, spanning the flow's magnitude, and a small
 * triangle pointing out of the node towards where the flow goes.
 *
 * @param {any} hiddenPath
 * @param {any} nodeBox
 * @param {{hiddenSymbolSize: number, nodeLabel: (node: any) => string, nodeLabelAngle: number, nodeLabelPadding: number}} opts
 * @returns {SceneHiddenMark}
 */
function buildHiddenMark(hiddenPath, nodeBox, opts) {
  const { sourceNode, targetNode, horizontal, use, box, link } = hiddenPath;
  const { hiddenSymbolSize: sz, nodeLabel, nodeLabelAngle, nodeLabelPadding } = opts;
  const input = use === "input";
  const { x, y, width: w, height: h } = box;

  // Box coordinates are relative to the node, so lift them into the diagram.
  const ox = nodeBox.x;
  const oy = nodeBox.y;

  /** @type {[number, number][][]} */
  const rules = horizontal
    ? [
        [[ox + x, oy + y], [ox + x + w, oy + y]],
        [[ox + x, oy + y + h], [ox + x + w, oy + y + h]]
      ]
    : [
        [[ox + x, oy + y], [ox + x, oy + y + h]],
        [[ox + x + w, oy + y], [ox + x + w, oy + y + h]]
      ];

  // An equilateral triangle pointing away from the node.
  const a = sz / 2;
  const b = (sz * Math.sqrt(3)) / 2;
  const [tx, ty] = horizontal
    ? input
      ? [ox - b, oy + y + h / 2]
      : [ox + w, oy + y + h / 2]
    : input
      ? [ox + x + w / 2, oy - b]
      : [ox + x + w / 2, oy + h];

  /** @type {[number, number][]} */
  const triangle = horizontal
    ? [
        [tx, ty - a],
        [tx + b, ty],
        [tx, ty + a]
      ]
    : [
        [tx + a, ty],
        [tx, ty + b],
        [tx - a, ty]
      ];

  const pos = /** @type {LabelPos} */ (
    input && horizontal
      ? "left"
      : !input && horizontal
        ? "right"
        : input
          ? "top"
          : "bottom"
  );
  const { anchor, baseline, dx, dy } = labelAlignment(
    pos,
    nodeLabelAngle,
    pos === "right" ? b : 0,
    pos === "bottom" ? b : 0,
    nodeLabelPadding
  );

  return {
    sourceKey: sourceNode.key,
    targetKey: targetNode.key,
    use: input ? "input" : "output",
    value: link.value,
    rules,
    triangle,
    label: {
      text: nodeLabel(input ? sourceNode : targetNode),
      x: tx + dx,
      y: ty + dy,
      anchor,
      baseline,
      angle: nodeLabelAngle
    }
  };
}
