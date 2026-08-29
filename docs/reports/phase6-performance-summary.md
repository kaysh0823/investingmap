# Phase 6 — Performance Summary

**Source:** sharded browser release case timings + network JSON sizes
**Cases:** 132

## Browser case totalMs

| Stat | ms |
|------|-----|
| min | 3948 |
| median | 6094 |
| p90 | 9458 |
| p95 | 9876 |
| max | 15028 |

These are wall times for pageCreate→assertions→tab churn→cleanup per case, not isolated layout-only probes. They are **not** hard build fail thresholds.

## Slowest sectors (by median case ms)

1. ship (~9840)
2. semiconductor (~9315)
3. elec (~8730)
4. kcontent (~8031)
5. holdings (~7946)

## Largest network JSON

1. semiconductor (~183 KB, 160/193)
2. elec (~183 KB, 86/107)
3. auto (~170 KB, 78/117)
4. robot (~165 KB, 86/115)
5. metal (~164 KB, 80/92)

## Observations

- defaultHidden peer/inferred/ended keep initial graph load manageable
- No Phase 6 renderer redesign; no data thinning
- Machine-readable detail: `docs/reports/phase6-performance-summary.json`
