# Chart feature recovery — 2026-11-04

The November 3 candle and annual-comparison features were deployed from a local release bundle but never committed to GitHub main. Deploying main again removed their UI and endpoints. The preserved source is recovered onto ca4db6f, including 0e62f4d and ca4db6f without reverting their return calculations.

Restored features:

- Standalone volatility-candle tab with 1/3/5/10/20-session filters, common percentage axis, fit-to-width and readable rows that keep value chains together.
- Bounded batch OHLC endpoint, split/merge adjustments, retries and saved-data preservation.
- Original performance-calendar view plus annual overlays for one stock or all stocks, with lazy-loaded cards grouped under value-chain headings.

Persistence: all UI modules, API endpoints, build patches and regression checks are versioned together. `npm run build` regenerates the tabs and script references and runs the feature gates. Future releases must use a main commit containing this recovery; copying only generated HTML is insufficient.

Validation: full build and distribution checks; the restored feature tests; 51 corporate-action baseline/history tests. Workflows and collection schedules are unchanged. No collector or backfill was run, and no Supabase records were changed.

November 4 renewable intraday captures remain preserved. `sector_intraday_returns` stores aggregate sector percentages, not constituent prices at each timestamp, so these aggregates alone cannot reconstruct the corrected historical curve. No inferred replacement or historical overwrite is made by this recovery.
