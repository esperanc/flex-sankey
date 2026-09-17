/**
 * Painting — stage 6b.
 *
 * Applies a theme to a geometric scene, resolving every colour, font and
 * opacity. The result is still medium-independent: it can be serialized to a
 * string or built into DOM nodes without further decisions.
 *
 * Nothing here touches geometry, and nothing in `scene.js` touches style. To
 * restyle a diagram, repaint the same scene; to relayout it, rebuild the scene
 * and repaint with the same theme.
 *
 * @module render/theme
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

/**
 * @typedef {import("./scene.js").Scene} Scene
 * @typedef {import("./scene.js").SceneLabel} SceneLabel
 */

/** A ten-colour categorical scheme, matching `d3.schemeCategory10`. */
export const schemeCategory10 = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
];

/**
 * Builds a colour lookup that assigns scheme colours in order of first use.
 *
 * @param {string[]} [range=schemeCategory10]
 * @returns {(key: string) => string}
 */
export function ordinalColorScale(range = schemeCategory10) {
  /** @type {Map<string, string>} */
  const assigned = new Map();
  return (key) => {
    let color = assigned.get(key);
    if (color === undefined) {
      color = range[assigned.size % range.length];
      assigned.set(key, color);
    }
    return color;
  };
}

/**
 * @typedef {object} Theme
 * @property {(key: string) => string} [colorScale] Maps a node key to a
 *   colour. Defaults to an ordinal scale over `schemeCategory10`.
 * @property {"source" | "target" | "source-target" | string} [pathColor="source"]
 *   How ribbons are coloured: by their source node, their target node, a
 *   gradient between the two, or any literal CSS colour.
 * @property {number} [pathOpacity=0.5]
 * @property {string} [nodeStroke="black"]
 * @property {number} [nodeStrokeWidth=1]
 * @property {number} [nodeStrokeOpacity=1]
 * @property {string} [nodeStrokeLinejoin="miter"]
 * @property {string} [labelFont="10px sans-serif"]
 * @property {string} [labelColor="black"]
 * @property {string} [labelFilter="drop-shadow( 0px 0px 2px white )"] Applied
 *   to label text, to keep it legible over ribbons.
 * @property {(value: number) => string} [valueFormat] Formats flow magnitudes
 *   in tooltips. Defaults to two decimal places.
 * @property {(sourceKey: string, targetKey: string, value: number) => string} [pathTitle]
 *   Tooltip for a ribbon.
 * @property {(key: string, value: number) => string} [nodeTitle] Tooltip for a
 *   node.
 */

/**
 * A gradient referenced by painted shapes.
 * @typedef {object} SceneGradient
 * @property {string} id
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {string} from
 * @property {string} to
 */

/**
 * @typedef {object} PaintedNode
 * @property {import("./scene.js").SceneNode} geometry
 * @property {string} fill
 * @property {string} stroke
 * @property {number} strokeWidth
 * @property {number} strokeOpacity
 * @property {string} strokeLinejoin
 * @property {string} title
 * @property {{ label: SceneLabel, fill: string } | null} label
 * @property {{ mark: import("./scene.js").SceneHiddenMark, fill: string, title: string }[]} hiddenMarks
 */

/**
 * @typedef {object} PaintedLink
 * @property {import("./scene.js").SceneLink} geometry
 * @property {string} fill Either a colour or a `url(#id)` gradient reference.
 * @property {number} fillOpacity
 * @property {string} title
 */

/**
 * @typedef {object} PaintedScene
 * @property {number} width
 * @property {number} height
 * @property {SceneGradient[]} gradients
 * @property {PaintedNode[]} nodes
 * @property {PaintedLink[]} links
 * @property {Required<Pick<Theme, "labelFont" | "labelColor" | "labelFilter" | "pathOpacity" | "nodeStroke">>} style
 *   Values needed again at draw time, for hover states and shared attributes.
 */

/** Formats a number to two decimal places. */
const defaultValueFormat = (/** @type {number} */ v) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Applies a theme to a scene.
 *
 * @param {Scene} scene
 * @param {Theme} [theme]
 * @returns {PaintedScene}
 */
export function paintScene(scene, theme = {}) {
  const {
    colorScale = ordinalColorScale(),
    pathColor = "source",
    pathOpacity = 0.5,
    nodeStroke = "black",
    nodeStrokeWidth = 1,
    nodeStrokeOpacity = 1,
    nodeStrokeLinejoin = "miter",
    labelFont = "10px sans-serif",
    labelColor = "black",
    labelFilter = "drop-shadow( 0px 0px 2px white )",
    valueFormat = defaultValueFormat,
    pathTitle = (s, t, v) => `${s} -> ${t} : ${valueFormat(v)}`,
    nodeTitle = (k, v) => `${k}: ${valueFormat(v)}`
  } = theme;

  /** @type {SceneGradient[]} */
  const gradients = [];

  /**
   * Resolves a ribbon's fill, registering a gradient when one is needed.
   * @param {import("./scene.js").SceneLink} link
   * @returns {string}
   */
  const linkFill = (link) => {
    if (pathColor === "source") return colorScale(link.sourceKey);
    if (pathColor === "target") return colorScale(link.targetKey);
    if (pathColor === "source-target") {
      const id = `fsGrad${gradients.length}`;
      gradients.push({
        id,
        x1: 0,
        y1: 0,
        x2: link.tangent[0],
        y2: link.tangent[1],
        from: colorScale(link.sourceKey),
        to: colorScale(link.targetKey)
      });
      return `url(#${id})`;
    }
    return pathColor;
  };

  /** @type {PaintedNode[]} */
  const nodes = scene.nodes.map((geometry) => ({
    geometry,
    fill: colorScale(geometry.key),
    stroke: nodeStroke,
    strokeWidth: nodeStrokeWidth,
    strokeOpacity: nodeStrokeOpacity,
    strokeLinejoin: nodeStrokeLinejoin,
    title: nodeTitle(geometry.key, geometry.value),
    label: geometry.label ? { label: geometry.label, fill: labelColor } : null,
    hiddenMarks: geometry.hiddenMarks.map((mark) => ({
      mark,
      // Colour the marker after the hidden node's counterpart, so the flow
      // reads as belonging to whatever it connects to.
      fill: colorScale(mark.use === "input" ? mark.targetKey : mark.sourceKey),
      title: pathTitle(mark.sourceKey, mark.targetKey, mark.value)
    }))
  }));

  /** @type {PaintedLink[]} */
  const links = scene.links.map((geometry) => ({
    geometry,
    fill: linkFill(geometry),
    fillOpacity: pathOpacity,
    title: pathTitle(geometry.sourceKey, geometry.targetKey, geometry.value)
  }));

  return {
    width: scene.width,
    height: scene.height,
    gradients,
    nodes,
    links,
    style: { labelFont, labelColor, labelFilter, pathOpacity, nodeStroke }
  };
}
