# flex-sankey

A flexible, modular Sankey diagram layout library for JavaScript, with an
improved ribbon geometry that avoids the overlap and distortion common to
Bézier-dilated Sankey paths.

Unlike most Sankey libraries, `flex-sankey` does not hide the layout behind a
single entry point. Each stage of the pipeline is a separate function that can
be tuned, inspected, or replaced between steps — which is what makes it
possible to do things like merge a horizontal and a vertical layout into one
hybrid diagram.

> **Status: port in progress.** This package is being extracted from the
> Observable notebooks listed under [Provenance](#provenance). The layout
> pipeline, path geometry, renderer and dataset generator are complete and
> tested; the benchmark harness is still to come.

## Why the ribbon geometry differs

A Sankey link is a ribbon of constant breadth. The usual approach takes a single
cubic Bézier centre line and dilates it. But the offset curve of a cubic Bézier
is not itself a Bézier, which causes two visible problems:

- ribbons distort badly when their endpoints are close along the flow direction
  but far apart across it;
- parallel ribbons between the same pair of nodes overlap one another.

`flex-sankey` builds each ribbon from **two independent cubic Béziers**, one per
side, whose interior control points are derived from a *reference line* joining
the two nodes. Anchoring that reference line at the node centres makes adjacent
parallel ribbons share their boundary curve *exactly* — so they tile the node's
extent with neither gap nor overlap. That property is asserted directly in
[`test/outline.test.js`](test/outline.test.js) rather than left as a claim.

## Install

Not published to a registry. Clone it, or add it as a git dependency:

```bash
npm install github:esperanc/flex-sankey
```

Then install its development dependencies to run the checks:

```bash
npm install
```

## Usage

```js
import { outlineHorizontalPath } from "flex-sankey/paths";

// One ribbon of a left-to-right diagram. Passing trueSourceY/trueTargetY —
// the centres of the source and target nodes — is what prevents this ribbon
// from overlapping its neighbours on the same nodes.
const d = outlineHorizontalPath({
  source: [0, 120],      // where the ribbon leaves the source node
  target: [400, 260],    // where it meets the target node
  trueSourceY: 150,      // centre of the source node
  trueTargetY: 240,      // centre of the target node
  size: 18,              // ribbon breadth
  bias: 1,               // curviness; below 1 straightens the ribbon
  maxAngle: 30           // reference-line angle limit, in degrees
});

// `d` is a closed, fillable SVG outline — set `fill`, not `stroke`.
element.setAttribute("d", d);
```

The two baseline geometries used for comparison in the paper are also exported,
so results can be reproduced without a second library:

```js
import { standardHorizontalPath, horizontalCirclePath } from "flex-sankey/paths";
```

These return **centre lines**, to be stroked with `stroke-width` equal to the
ribbon breadth — unlike the outline construction, which returns a filled shape.

## The layout pipeline

| Stage | Function | Purpose |
| --- | --- | --- |
| 1. Layering | `sankeyLayers` | Assign nodes to layers |
| 2. Dummy nodes | `sankeyAddDummies` | Route multi-layer links through intermediate nodes |
| 3. Ordering | `sankeyOrderNodes` | Combinatorial optimisation: minimise link crossings |
| 4. Geometry | `sankeyGeometricLayout` | Geometric optimisation: assign coordinates |
| 5. Render layout | `sankeyRenderLayout` | Resolve node boxes and path geometry |
| 6a. Scene | `buildScene` | Resolve shapes and positions — geometry only |
| 6b. Paint | `paintScene` | Apply colours, fonts and opacities |
| 6c. Output | `sceneToSVG` / `sceneToDOM` | Emit markup, or live elements |

Quality metrics — crossings, path length and overlap — are available
separately from `flex-sankey/metrics`, and work on diagrams from other
libraries too. See [`benchmarks/README.md`](benchmarks/README.md) for the
definitions.

Every stage but `sceneToDOM` runs headless under Node.

### Rendering

Rendering is split so that geometry, style and output medium are independent:

```
renderLayout --buildScene--> Scene --paintScene--> PaintedScene --+--> sceneToSVG  (string)
             (geometry)            (style)                        \--> sceneToDOM  (interactive)
```

That means a diagram can be restyled without relaying it out, measured without
styling it at all, and emitted either as a string under Node or as live
elements in a browser. `Scene` carries each ribbon's Bézier control points
alongside its path string, so geometry can be measured directly rather than by
parsing SVG back.

```js
import { flexSankeySVG } from "flex-sankey";

const svg = flexSankeySVG({ links }, {
  width: 800, height: 500, size: 500, length: 800,
  colorScale: (key) => myColors[key],
  pathColor: "source-target"
});
```

```js
import {
  sankeyLayers, sankeyAddDummies, sankeyOrderNodes,
  sankeyGeometricLayout, sankeyRenderLayout
} from "flex-sankey/layout";
import { makeSyntheticSankeyData, energySpec } from "flex-sankey/data";
import { randomLcg } from "flex-sankey";

const links = makeSyntheticSankeyData(energySpec, {
  randomSeed: 0.5,
  regularity: 0.1,
  optionalProbability: 0.7   // below 1, or the topology never varies
});

const ordered = sankeyOrderNodes(
  sankeyAddDummies(sankeyLayers({ links }, { nodeAlign: "center" })),
  { nsteps: 40, random: randomLcg(1) }   // seeded: reproducible
);
const geometry = sankeyGeometricLayout(ordered, { size: 500, whitespace: 0.3 });
const renderLayout = sankeyRenderLayout(geometry, { length: 800 });

console.log(ordered.crossings);
```

### Reproducibility

The ordering stage is randomised. It defaults to `Math.random`, which means two
runs on the same input can disagree. Pass `random: randomLcg(seed)` to make a
run repeatable — required for any measurement you intend to publish.

The dataset generator is fully deterministic given its specification and
options. Note one trap: `optionalProbability` is the probability of *keeping*
each optional node, and the test is `random() >= optionalProbability`. At
exactly `1` — the default — nothing is ever dropped, so varying only the seed
produces datasets that share a single topology and differ only in magnitudes.
Set it below 1 to vary structure.

## Demos

Nine interactive demos covering the geometry, each pipeline stage, the design
features, styling, and a live comparison against the two D3 implementations:

```bash
npm run demos       # then open http://localhost:8080/
```

They run the library's real source modules straight from the server — no build
step, no bundle. Each is one HTML file and one ES module, so they double as
worked examples.

| Demo | What it shows |
| --- | --- |
| Ribbon geometry | The three constructions, with overlap measured live. Try the *hard case* preset. |
| Library comparison | The same dataset under all three libraries, one measurement routine |
| The pipeline, stage by stage | What each of the six stages adds |
| Design features | Packed paths, totalizing nodes, hidden nodes |
| Combinatorial optimisation | Crossing-reduction heuristics, with a convergence trace |
| Geometric optimisation | The spring system, drawn over the diagram |
| Styling and configuration | Palettes, labels, orientation, PDF export |
| Measuring overlap | The coverage buffer the overlap figure comes from |
| Hybrid horizontal and vertical | Two orientations merged into one figure |

## Development

```bash
npm run check       # typecheck, then tests
npm test            # tests only
npm run test:watch  # tests in watch mode
npm run typecheck   # type checking only
npm run types       # emit .d.ts files to types/
npm run coverage    # tests with a coverage report
npm run demos       # serve the interactive demos
npm run bench:all   # regenerate datasets, run the comparison, draw charts
```

The source is plain JavaScript annotated with JSDoc, type-checked by TypeScript
via `checkJs`. There is no build step: `src/` is what ships, and the package has
**no runtime dependencies**. Running
`npm run types` generates `.d.ts` files so that TypeScript consumers get full
type information and editor autocomplete.

## Provenance

This package is a port of six Observable notebooks, indexed at
[Enhanced Sankey Diagram Layouts](https://observablehq.com/@esperanc/enhanced-sankey-diagram-layouts):

- [Improved Sankey Paths](https://observablehq.com/@esperanc/improved-paths)
- [Synthetic Sankey Data](https://observablehq.com/@esperanc/synthetic-sankey-data)
- [Flexible Sankey Layouts](https://observablehq.com/@esperanc/flexible-sankey-layouts)
- [Sankey Diagram Statistics](https://observablehq.com/@esperanc/sankey-diagram-statistics)
- [D3-Sankey-Diagram](https://observablehq.com/@esperanc/d3-sankey-diagram)
- [Horizontal-Vertical Diagram](https://observablehq.com/@esperanc/horizontal-vertical-sankey)

The port is not a straight transcription. Where the notebooks contained defects
that affected published results, they are fixed and the change is documented at
the site of the fix. See `CHANGELOG.md`.

## Citation

See [`CITATION.cff`](CITATION.cff).

## License

[MIT](LICENSE). The licence requires that the copyright notice be retained in
copies and substantial portions of the software, so derived works must credit
the authors.
