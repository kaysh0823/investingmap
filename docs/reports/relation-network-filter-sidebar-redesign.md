# Relation Network Filter Sidebar Redesign

**Branch:** `feat/relation-network-filter-sidebar`  
**Base HEAD:** `1b58b8cb1bf7dd8f97d202a20b9910f78c6b8748` (main after PR #1)  
**Generated:** 2026-08-30 (KST)

---

## 1. Start state

| Item | Value |
|------|-------|
| Branch | `feat/relation-network-filter-sidebar` (created from synced `main`) |
| Working tree | clean except untracked prior release docs/tmp |
| origin/main | `1b58b8c` |

---

## 2. Problem

Desktop relation tab showed **duplicate UI**:

1. Fixed left **legacy legend panel** (chain colors, peer countries, node size, controls)
2. **Horizontal filter toolbar** above the graph (search, chips, depth, sector filters)

---

## 3. Solution summary

| Goal | Implementation |
|------|----------------|
| Remove fixed legacy legend | `.graph-sidebar` removed in patch; `display:none !important` fallback |
| Move filters to left | Single `.rn-toolbar` DOM moved into `#rn-filter-content` via `setupWorkspaceLayout()` |
| Remove top duplicate | Toolbar no longer in graph header; graph uses full right column |
| Full-height graph | CSS grid `.rn-workspace` + `.rn-graph-canvas` flex |
| 22 sectors common | `patch_relation_network.mjs` + `relation_network.js` |
| Mobile no fixed sidebar | ≤767px: drawer + `#rn-filter-drawer-toggle` |

---

## 4. DOM / layout structure

**Before**

```
.graph-container (flex)
  .graph-sidebar (legend)
  .graph-main
    rn-model-desc, rn-legend, rn-toolbar (horizontal)
    #graph-svg
```

**After**

```
.graph-container.rn-workspace (grid)
  aside#rn-filter-sidebar
    #rn-filter-content
      .rn-toolbar (single instance — search, chips, sector filters)
      details#rn-legend-help (collapsed)
        #rn-legend (line styles)
        #rn-legend-static (sector node types, controls)
  .graph-main.rn-graph-main
    .rn-graph-header (drawer toggle, sticky bar, model desc)
    .rn-graph-canvas (#graph-svg, detail panel, controls)
```

**DOM duplication prevention:** one `.rn-toolbar`, one `#rn-search`; `setupWorkspaceLayout()` moves nodes once (no clone).

---

## 5. Files modified

| File | Role |
|------|------|
| `scripts/patch_relation_network.mjs` | CSS, HTML restructure, sidebar removal, legend guard patches |
| `js/relation_network.js` | `setupWorkspaceLayout`, mobile drawer, static legend help, ResizeObserver target |
| `scripts/verify_relation_browser.mjs` | Layout assertions (sidebar, canvas, toolbar count, mobile drawer) |
| `bio/bio_inline_tail.js`, `bio/korea_bio_map.inline.js` | Sidebar legend guards (bio inline path) |
| 22 × `*/korea_*_map.html` | Patched output (generated via patch script) |

**Not modified:** `data/networks/*.json`, cp_list, evidence, metrics, hub snapshots.

---

## 6. Desktop layout (≥1024px)

- Grid: `minmax(240px, 280px) | minmax(0, 1fr)`
- Sidebar scroll: `#rn-filter-content { overflow-y: auto }`
- Filter chips: vertical stack with `flex-wrap` rows (no horizontal scroll default)
- Legend: `<details>` collapsed by default at sidebar bottom

---

## 7. Tablet (768–1023px)

- Narrow sidebar: 200–220px + graph (grid two-column)

---

## 8. Mobile (≤767px)

- No fixed left sidebar (off-canvas drawer)
- `#rn-filter-drawer-toggle` in graph header
- Backdrop + Escape closes drawer; opening drawer closes detail panel
- Graph full width

---

## 9. Sector dynamic filters

All existing `ensure*Toolbar()` builders preserved (nuclear, renewable, construction, powergrid, finance, ship, battery, bigchip). Inline styles replaced with `.rn-filter-row` / `.rn-filter-stack` classes.

---

## 10. URL state / regression

- No changes to `pushUrlState` / `applyUrlToState`
- Filter control IDs unchanged (`rn-search`, `rn-depth-1`, etc.)
- Popstate handler unchanged

---

## 11. Accessibility

- `#rn-filter-sidebar` `aria-label`
- `#rn-filter-drawer-toggle` `aria-expanded` / `aria-controls`
- `<details><summary>` for legend/help
- Search `aria-label` preserved

---

## 12. Verification

| Check | Result |
|-------|--------|
| `npm run build` ×2 | PASS |
| `verify:relation-network` | PASS (warnings only) |
| `verify:dist` | PASS |
| `verify:nav-tab-preserve` | PASS |
| `verify:data-sector-profile` | PASS (22 sectors) |
| Targeted browser (nuclear, finance, construction, bigchip, battery, cosmetics, kcontent, software, robot) | PASS |
| Browser shard A (42 cases) | PASS (after bio inline guard fix) |
| Browser shards B/C/D (prior full gate run) | PASS |
| Network JSON hash | unchanged |
| Hub snapshots | unchanged (restored after build churn) |

**Performance (shard A re-run):** median ~4.8s, max ~5.9s, p95 ~5.7s (comparable to Phase 6 baseline).

---

## 13. Known issues / follow-ups

- Full 132-case release gate should be re-run end-to-end after bio fix (shard A verified; B/C/D were green on prior run).
- Legacy `.graph-sidebar` CSS rules remain in map HTML but are overridden; could be cleaned in a future map CSS trim pass.

---

## 14. Explicit checklist

| Item | Status |
|------|--------|
| 22 sectors common apply | Yes |
| Legacy vertical legend panel removed | Yes |
| Top filters moved to desktop sidebar | Yes |
| Mobile fixed sidebar absent | Yes |
| Duplicate filter DOM | No |
| Relation data changed | No |
| cp_list changed | No |
| Snapshot refresh | No |
| main direct push | No |
| Deploy | No |

**Commit ready:** Yes (feature branch only)  
**PR ready:** Yes (after full 132-case gate re-run recommended)
