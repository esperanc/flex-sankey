# Real-world benchmark data

## `uk-energy-2050.csv`

A scenario for United Kingdom energy production and consumption in 2050.

- **Original source:** Department of Energy & Climate Change (UK), via Tom Counsell.
- **Obtained from:** the `d3-sankey` example, <https://observablehq.com/@d3/sankey-component>,
  which publishes it as `energy.csv`. The same data appears in the `d3-sankey`
  documentation as that project's canonical example.
- **Format:** `source,target,value` — 68 links over 48 nodes.
- **Modifications:** none. The file is byte-for-byte as published.

This dataset is included because it is the example `d3-sankey` itself uses to
demonstrate its output. Measuring all three libraries on it removes any
suggestion that the comparison was made on data chosen to favour this one.

### Shape

| | value |
| --- | --- |
| nodes | 48 |
| links | 68 |
| layers (longest path) | 8 |
| links spanning more than one layer | 27 |
| maximum span | 5 |
| flow conservation on interior nodes | within 0.15% |

The routing burden is the notable part: 27 of 68 links skip at least one layer,
so a layered drawing must route them through dummy nodes. That is a heavier
proportion than either synthetic suite, which makes this a genuine stress case
rather than a decorative one.

The 0.15% conservation gap at `Electricity grid` (917.27 in, 918.61 out) is in
the published data and is left uncorrected.
