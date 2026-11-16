# Changelog

## Unreleased

### Fixed

- `sankeyAddDummies` could not route a link spanning more than five layers: the
  dummy-key search was capped at suffix 5 and threw
  `dummy key heuristic exhausted` beyond it. The cap was unnecessary — the
  search is bounded by the node map being finite — and has been removed.
  Found by the new real-world benchmark dataset, whose longest link spans six
  layers; both synthetic suites cap spans at three and never reached it.

### Added

- `benchmarks/real/` — published, non-generated benchmark data, with
  provenance. First entry is a 2050 UK energy scenario (Department of Energy &
  Climate Change via Tom Counsell), taken unmodified from the `d3-sankey`
  example that uses it.
- A `real` suite in the benchmark manifest. Datasets may now be loaded from a
  CSV (`DatasetEntry.file`) instead of generated from a spec and seed.
- `benchmarks/compare-figure.js` — renders one dataset as drawn by all three
  libraries side by side, as vector PDF and SVG, from the same geometry the
  metrics measure.
- `benchmarks/ribbon-figure.js` — draws the annotated diagram of the ribbon
  construction used in the manuscript, with the curves produced by
  `outlinePathPoints` itself so the figure cannot drift from the code.
- Tests pinning down why parallel ribbons do not overlap, rather than only
  that adjacent ones share a boundary. Sharing a boundary does not by itself
  rule out two boundaries crossing in between, as a reviewer pointed out. The
  new tests assert the two facts that do: every boundary of a bundle has the
  same monotone `y` profile `g(t) = (1-t)^2 (1+2t)`, and with the reference
  line parallel to the flow direction (`maxAngle: 0`) no two boundaries of a
  bundle cross. Beyond that angle the `x` profile varies from boundary to
  boundary and the guarantee is empirical, not proved: over all 21 benchmark
  datasets every within-bundle crossing is an order inversion between ribbons
  that must cross anyway.

### Changed

- Benchmark charts label the x axis with the suite they belong to rather than
  a bare `dataset`.

## 0.1.0 — 2026-09-26

First release. Initial extraction from the Observable notebooks.

### Added

- `paths/outline` — the improved ribbon construction: paired cubic Béziers with
  a node-anchored reference line and an angle clamp.
- `paths/standard` — single-Bézier centre line, the `d3-sankey` baseline.
- `paths/arcs` — circular-arc construction, the `d3-sankey-diagram` baseline.
- `internal/vec2` — the nine vector helpers the geometry needs, replacing the
  `gl-matrix` dependency. Semantics match gl-matrix 3.x exactly, so geometry is
  numerically identical to the notebooks'.
- Test suite covering the vector helpers and the path construction, including
  an executable assertion of the non-overlap property that the improved
  construction rests on.
- `layout/*` — the full layout pipeline: layering (`sankeyLayers`,
  `sankeyOptimalLayers`), dummy-node routing (`sankeyAddDummies`),
  combinatorial optimisation (`sankeyOrderNodes`), geometric optimisation
  (`sankeyGeometricLayout` over `pSystem`), and render layout
  (`sankeyRenderLayout`, `combineRenderLayouts`). No DOM dependency, so the
  whole pipeline runs headless.
- `data/*` — the synthetic dataset generator and the energy-matrix
  specification. Verified byte-identical to the notebook generator across 96
  combinations of seed, regularity and optional probability.
- `internal/random` — seedable LCG matching `d3.randomLcg`, plus a matching
  Fisher-Yates shuffle.
- `render/*` — rendering split into independent stages: `buildScene` (pure
  geometry), `paintScene` (style), then `sceneToSVG` (markup, headless) or
  `sceneToDOM` (live elements, interactive). The notebook's `sankeyRender`
  combined all of this into one d3-dependent function that needed a DOM.
- `flexSankey`, `flexSankeySVG`, `flexSankeyScene` — the whole pipeline in one
  call, for the common case.
- `data/layered` — `makeLayeredSpec`, a parametric graph specification with no
  domain attached, so dataset difficulty becomes a parameter rather than a
  fixed property of the one worked example.
- `benchmarks/manifest.js` — every benchmark dataset declared in one place and
  regenerable exactly, replacing the interactive slider settings that produced
  the submission's ten datasets and were not recorded.
- `metrics/*` — crossings, total path length and overlap, each defined
  precisely and validated against shapes with analytically known answers.
  Overlap is measured by an exact scanline rasterizer with integer coverage
  counts, replacing the previous approach of rendering at 50% opacity and
  inferring coverage depth from the composited alpha channel.
- `metrics/svg-path` — a complete SVG path parser (`M L H V C S Q T A Z`,
  absolute and relative), so diagrams from other libraries are measured by the
  same code as this one's.

### Fixed

Defects carried over from the notebooks. Both change previously published
numbers, so results must be regenerated.

- **`paths/arcs`, `verticalCirclePath`: wrong axis in the straight-ribbon
  test.** The notebook tested `|y0 - y1| < 0.5`, copied from the horizontal
  case. In a vertical diagram y is the *along-flow* coordinate, so the test
  asked whether the two layers coincide rather than whether the ribbon is
  straight. Straight vertical ribbons therefore fell through to the arc branch
  and were drawn with a spurious pair of arcs. Now tested against the
  across-flow coordinate, `|x0 - x1|`. This affects the measured overlap and
  length of the arc baseline in vertical diagrams — which is the configuration
  used for the path comparison figures.
- **`paths/outline`: division by zero for zero-length tangents.** A tangent of
  length zero made the scale factor `0/0`, emitting `NaN` coordinates and an
  undrawable path. Reachable whenever two nodes coincide along the flow
  direction, and for any `bias` of 0. The control point now collapses onto its
  endpoint, making that end of the ribbon straight, which is the correct
  degenerate limit.
- **`paths/outline`: `Math.acos` domain.** Floating point could push the dot
  product of two unit vectors just outside `[-1, 1]`, yielding `NaN`. The input
  is now clamped; this is behaviour preserving.
- **`layout/geometry`: the packed-path gap budget ignored packing.** The
  notebook's `neighborDummies` predicate was an arrow function with a braced
  body and no `return`, so it always evaluated to `undefined`. Every node
  therefore counted as its own group when the minimum separation was derived,
  as though packing never happened — while the vertex-building code below it
  packed anyway, using a different and looser rule. Both now use one shared
  predicate, `packsWith`. This changes the computed `minSep`, and hence the
  layout, whenever `joinDummies` is on.
- **`layout/geometry`: zero-division in the automatic minimum separation.**
  A single-group layer made `maxGroupCount - 1` zero, yielding a non-finite
  separation.
- **`layout/geometry`: link offsets of exactly zero were rejected.** The
  lookup tested `if (!offset)`, which treats a legitimate offset of 0 as a
  missing link. Now tested against `undefined`.
- **`data/synthetic`: a stranded node was reported as a cycle.** When optional
  exclusions left a node with no inflow, it was skipped without releasing its
  targets, so they waited forever on a predecessor that never arrived and
  generation failed with "circular sankey" on a graph that was plainly acyclic.
  Its targets are now released. This only affects cases that previously threw;
  output is unchanged across all 96 seed/regularity/probability combinations
  checked against the notebook implementation.
- **`layout/optimal-layers`: mutation of the caller's options.** The notebook
  assigned `nodeAlign` into the caller's object on each trial, leaving it
  altered after the call. Options are now copied.

### Changed

- **Randomness is injectable.** `sankeyOrderNodes` took its randomness from
  `Math.random` and `d3.shuffle`, so the same input could yield a different
  number of crossings on every run, and published measurements could not be
  reproduced exactly. Every randomised entry point now accepts a `random`
  option; it still defaults to `Math.random`, so behaviour is unchanged unless
  a seeded source is supplied. The benchmark suite will supply one.

- **`layout/geometry`: the margin was ignored, then applied backwards.**
  `sankeyGeometricLayout` did not pass `margin` down to `layoutToPSystem`, so
  whitespace was budgeted as though there were no margin while `pSystem` then
  laid out with one. Compounding it, `layoutToPSystem` *subtracted* `2 * margin`
  from the whitespace budget, giving nodes more room the larger the margin —
  the reverse of what a margin means. Both had to change together: passing the
  margin down without correcting the sign would have pushed nodes straight
  through the margins.

  `whitespace` is now defined as the fraction of the layer left empty
  *including* the margins, and the automatic `minSep` divides only what remains
  after the nodes and both margins. Requested whitespace is now honoured
  exactly at any margin, and nodes stay inside it. This changes every layout
  that uses a non-zero margin, which is the default.

### Fixed (interaction)

- **Dragging a node left its ribbons behind.** The DOM backend moved only the
  node's own group, so the flows attached to it stayed where they were and the
  node detached from its own links. The scene now retains each ribbon's
  box-relative geometry, and `refreshLink` / `refreshNode` rebuild the drawn
  geometry from the current box positions, so dragging re-routes every ribbon
  touching the node. Its label and any hidden-flow markers move with it too.
- **Dragging tracked the pointer at the wrong rate.** Pointer deltas were
  applied as SVG user units, but they arrive in CSS pixels, and a responsive
  stylesheet usually displays the diagram at some other scale. At the demos'
  default width a node lagged the cursor by about a quarter of the distance
  dragged. Coordinates are now converted through the SVG's own screen matrix,
  so a node stays under the pointer at any scale or zoom.
- **A failed pointer capture aborted the drag.** `setPointerCapture` throws for
  a pointer the element never saw; the call is now guarded, since capture is a
  refinement rather than a requirement.

### Changed (rendering)

- **d3 is no longer a runtime dependency.** The layout used `d3-array`,
  `d3-random` and `d3-scale`; the renderer used `d3-selection` and `d3-drag`.
  All are replaced by small internal equivalents, so the package now has **no
  runtime dependencies at all**. Dragging uses pointer events, which also gains
  touch support.
- **Interaction is opt-in.** `sceneToDOM` takes `interactive: false` for a
  static diagram.

### Removed

- `outlineHorizontalPath_old` / `outlineVerticalPath_old` — superseded in the
  notebooks and unreferenced. The vertical variant also returned an array where
  its counterpart returned a string.
- The unused `maxSin` binding in the outline construction.
