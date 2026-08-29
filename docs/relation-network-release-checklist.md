# Relation Network — Release Checklist

**Phase 6 · 2026-08-29**
**Branch:** `codex/relation-network-phase4-checkpoint`

Use before opening a PR or deploying. Checkboxes reflect Phase 6 run status.

## Data

- [x] All active map sectors have non-null `networkPath`
- [x] All network JSON `_legacyFallback === false`
- [x] Inventory generated (`data/relation_network_release_inventory.json`)
- [x] Integrity audit failures = 0
- [x] Cross-sector confirmed business duplicates = 0
- [x] No new companies / invented relationships in this Phase
- [x] No human-review → confirmed promotions

## Build

- [x] `npm run build` ×2 idempotent (network hash diff 0)
- [x] hub snapshot refresh **not** run via `refresh:hub-snapshots`
- [x] hub_index/sitemap builtAt-only churn restored when needed

## Verifiers

- [x] `npm run verify:relation-release-suite` (or equivalent list) exit 0
- [x] `verify:relation-network` + all sector `verify:*` + nav + data-sector + dist

## Browser

- [x] Sharded release gate A→B→C→D
- [x] 132 cases (22 sectors × 3 viewports × 2 locales)
- [x] appFailures = 0
- [x] infrastructureFailures = 0
- [x] no skip / retry / assertion weakening
- [x] RN_TEST_ONLY cleared in release harness
- [ ] Optional: CI/Linux re-run if Windows flake resurfaces (known issue doc)

## Docs

- [x] Final integration report
- [x] Browser shard results
- [x] Performance summary
- [x] Known issue pageCreate flake still documented

## Release actions (not done in Phase 6)

- [ ] Push branch
- [ ] Open PR
- [ ] Deploy production
- [ ] Post-deploy AI crawler / sitemap smoke

## Commands

```bash
npm run audit:relation-release
npm run build
npm run build
npm run verify:relation-release-suite
npm run verify:relation-browser:release
```
