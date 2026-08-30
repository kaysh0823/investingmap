# Relation Network Graph Readability

**Date:** 2026-08-30  
**Branch:** `feat/relation-network-graph-readability`  
**Base HEAD:** `5c3471e3a928f7d45393efad06e3889fc053edcf`

## Problem

Across all 22 relation-network sectors, company labels were too small (8–10px), overlapped heavily, and dense maps (especially semiconductor) compressed too many nodes into the viewport. Global/reference nodes stacked centrally with equal visual weight to KRX listed names. Hidden peer/reference edges still left orphan global nodes on screen.

## Solution (renderer-only)

All changes are in shared `js/relation_network.js` + CSS in `scripts/patch_relation_network.mjs`. **No network JSON, cp_list, or snapshot edits.**

### Visible graph

- `computeVisibleGraph()` centralizes edge/status/depth filtering.
- Map constituents (`isMapConstituent` listed companies) always included in the visible set.
- `pruneOrphanVisibleNodes()` removes zero-degree global/reference nodes while keeping constituents, anchors, and selected nodes.
- Mobile overview limits to top constituents by mcap when no selection.

### Label priority & collision

- Priority 1: selected / hover / focus / URL focus / 1-hop neighbors.
- Priority 2: map constituents & key business/project nodes.
- Priority 3: structural categories.
- Priority 4: global peer / reference (hidden by default when dense).
- Separate `.rn-labels` layer with stroke halo, listed ≥12–13px, selected 15px.
- Collision-aware label selection via bounding-box occupancy (stable after layout, not per simulation tick).

### Zoom / fit policy

- Default view uses **minimum zoom floor** (desktop 0.78, tablet 0.82, mobile 0.92) — no forced shrink-to-fit.
- `RelationNetwork.fitAll()` / ⟳ control = explicit full fit (may shrink).
- Selection and filter changes re-center; resize preserves user pan/zoom when filters unchanged.

### Layout

- `layoutLayered()` uses mcap/name sort and 34px+ lane spacing; global nodes spread horizontally.
- Virtual graph height expands for dense lanes (`computeExpandedGraphHeight`).

### Legend

- KO/EN help text explains label hiding, hover/select reveal, zoom levels, and fit-all behavior.

### Asset cache

- `RELATION_NETWORK_ASSET_VERSION = '3'` — all 22 sector HTML reference `relation_network.js?v=3`.

## Baseline (post-change)

Sample — semiconductor desktop 1440:

| Metric | Value |
|--------|-------|
| visibleNodes | 136 |
| listedVisible | 83 |
| orphanGlobalZeroDegree | 0 |
| minListedLabelFont | 13px |
| zoomScale | 1.0 |

Full matrix: `data/relation_network_readability_baseline.json` (10 sectors × 4 viewports).

## Validation

| Check | Result |
|-------|--------|
| `npm run build` ×2 | PASS (idempotent) |
| `verify:relation-network-asset-version` | PASS (22× v3) |
| `verify:relation-network-readability` | PASS (7 cases) |
| `verify:relation-network` + dist + nav + data-sector | PASS |
| Phase 6 browser release gate | **132/132 PASS** |
| network JSON / cp_list / snapshot diff | **0** |

## Files changed

- `js/relation_network.js` — readability engine
- `lib/relation_network/asset_version.mjs` — v3
- `scripts/patch_relation_network.mjs` — label CSS, `resetZoom` → `fitAll`
- `scripts/verify_relation_network_readability.mjs` — new
- `scripts/measure_relation_readability_baseline.mjs` — new
- 22 sector HTML (v3 script + CSS)
- `data/relation_network_readability_baseline.json` — metrics only

## Explicit confirmations

| Item | Status |
|------|--------|
| 22 sectors common renderer | YES |
| Listed names prioritized | YES |
| Hidden peer/reference orphans removed by default | YES |
| Select/hover/focus labels always shown | YES |
| Default minimum zoom (no forced shrink) | YES |
| Relation data changed | NO |
| cp_list changed | NO |
| Asset version v3 | YES |
| Snapshot refresh | NO |
| main push / deploy | NO |

## Commit / PR

Ready for commit on `feat/relation-network-graph-readability`. PR not opened (per instructions).
