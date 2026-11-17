Second release of flex-sankey, and the one the accompanying SoftwareX
submission is measured against. The v0.1.0 archive predates the real-world
benchmark dataset and the layout bug that loading it exposed, so the figures
and tables in the paper cannot be regenerated from it; they can from this one.

This archive contains the library, its test suite, nine interactive demos, and
the complete reproduction material for the paper: the benchmark dataset
manifest, the generated datasets, the published dataset with its provenance,
the measurement module, the cross-library comparison harness, and the scripts
that produce every figure and table.

### Fixed

- `sankeyAddDummies` could not route a link spanning more than five layers: the
  dummy-key search was capped at suffix 5 and threw `dummy key heuristic
  exhausted` beyond it. The cap was unnecessary and has been removed. Found by
  the new real-world benchmark dataset, whose longest link spans six layers.

### Added

- `benchmarks/real/` — published, non-generated benchmark data with
  provenance, and a `real` suite in the manifest that loads it. First entry is
  a 2050 UK energy scenario, taken unmodified from the `d3-sankey` example
  that uses it.
- `benchmarks/compare-figure.js` and `benchmarks/ribbon-figure.js` — the
  figure scripts for the manuscript, drawing from the same geometry the
  metrics measure so that a figure cannot drift from the code.
- Tests pinning down *why* parallel ribbons do not overlap, rather than only
  that adjacent ones share a boundary, and `docs/findings.md` recording the
  limits of that guarantee.

The full list of changes is in `CHANGELOG.md`.
