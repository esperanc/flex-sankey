# Benchmarks

Every dataset used for measurement is declared in [`manifest.js`](manifest.js)
and nowhere else. A dataset is fully determined by a graph specification plus
three numbers — seed, regularity, optional probability — so the suite
regenerates exactly:

```bash
npm run bench:data
```

The generated link lists are written to `datasets/` and committed, so results
can be audited without regenerating anything. `datasets/summary.md` reports the
shape of each dataset.

## The two suites

| Suite | Datasets | Nodes | Links | Layers | Distinct topologies |
| --- | --- | --- | --- | --- | --- |
| `energy` | 10 | 16–18 | 34–45 | 4–5 | 5 of 10 |
| `layered` | 10 | 52–54 | 133–140 | 6 | 5 of 10 |

**`energy`** is a synthetic national energy balance — the family behind the
figures in the paper.

**`layered`** is an abstract flow graph with no domain attached, generated to a
requested shape by `makeLayeredSpec`. It is about three times the size of the
energy suite, so the comparison spans two scales rather than ten variants of
one. Size is a parameter, not a fixed accident: widen `LAYERED_SHAPE` in the
manifest for larger graphs. Measured cost of a full layout is roughly 0.1 s at
33 nodes, 0.4 s at 54, and 1.9 s at 88.

## Why the optional probability is 0.8

`optionalProbability` is the chance of *keeping* each optional node and link,
and the test is `random() >= optionalProbability`. Since `random()` returns a
value in `[0, 1)`, **a value of exactly 1 keeps everything**: every seed then
yields the same topology and the datasets differ only in flow magnitudes.

At 0.8 each suite yields five distinct node sets across its ten seeds, with the
remainder varying in link count and magnitudes — enough structural variation
for the datasets to be genuinely different graphs, without so much that they
stop being a family.

## Running the comparison

```bash
npm run bench:all      # regenerate datasets, run all libraries, draw charts
```

or individually:

```bash
npm run bench:data     # regenerate datasets from the manifest
npm run bench          # run every library over every dataset
npm run bench:charts   # draw the comparison charts
npm run bench:verify   # confirm the adapters measure what the libraries draw
```

Results land in `out/` as `results.csv`, `results.json` and six SVG charts —
one per metric per suite, with one group of bars per dataset, coloured by each
library's rank on that dataset.

### How the comparison libraries are driven

`d3-sankey` and `d3-sankey-diagram` are driven through their own published path
generators — `sankeyLinkHorizontal` and `sankeyLink` respectively — so no part
of their geometry is reconstructed here. `npm run bench:verify` renders
`d3-sankey-diagram` properly into a jsdom document and checks that every path
the generator emits is one the library actually draws.

`d3-sankey` strokes its links rather than filling them, so a stroked centre
line encloses no area to measure. It is widened to its own `stroke-width` with
butt caps, matching SVG's default `stroke-linecap`. The reconstruction is exact:
a straight stroked line measures precisely length x width, and a curved one
matches its arc length x width to within a rounding error.

## Reproducibility

Two independent sources of randomness are both pinned:

- **dataset generation** is deterministic given the specification and options;
- **the ordering stage** takes an injectable `random`, seeded here. Left to its
  default it uses `Math.random`, and two runs on the same graph can disagree on
  the crossing count.

Crossing counts in `summary.md` come from 40 ordering passes at a fixed seed
and are reported only as an indication of each dataset's difficulty — they are
not the benchmark result.

## What is measured

Three figures per diagram, each defined precisely enough to reimplement from
this description alone.

**Crossings.** The number of proper intersections between the centre lines of
two *different* links. A proper intersection is one interior to both segments:
links that merely touch at a shared endpoint do not count, and neither does a
link meeting itself where it passes through a dummy node. Centre lines come
from flattening each ribbon's boundary curves and averaging the two sides.

**Total length.** The summed length of every link's centre line, in pixels,
after flattening curves to a tolerance of 0.25 px.

**Overlap.** Ribbons are filled into an integer coverage buffer by scanline
rasterization under the nonzero winding rule, sampling at sample centres with
no anti-aliasing. Each sample records how many *links* cover it — counting
links, not drawn pieces, so that the several pieces of one link routed through
dummy nodes do not register as overlapping each other where they abut. Two
ratios are reported:

- `overlapRatio` = samples covered by more than one link ÷ samples covered by
  at least one. *What fraction of the inked area is ambiguous?*
- `excessRatio` = Σ(coverage − 1) over covered samples ÷ samples covered.
  *How much ink is piled up?*

They agree when overlaps are shallow and diverge when they are deep. The
default sampling is 2×2 per pixel.

Every diagram is measured by the same code, whether built here or parsed from
another library's SVG, and both go through identical curve flattening — so the
comparison differs only in where the geometry came from, never in how finely
it was sampled.

### Validation

The metrics are checked against shapes whose answers are known analytically:
rectangle areas to the unit at three sample scales, a half-overlapping pair
(union 15000, intersection 5000, ratio exactly 1/3), a nonzero-winding square
with a hole (7500), a semicircle's arc length (157.08, against the chord's
100), and crossing counts for an X, parallel lines, a shared endpoint and a
self-crossing polyline. See `test/metrics.test.js`.
