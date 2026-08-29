# Phase 5E.1 — Relation Browser Matrix Stability

**As of:** 2026-08-29  
**Branch:** `codex/relation-network-phase4-checkpoint`  
**Base HEAD (pre-checkpoint):** `c0221f46e7b8bbce952facfcf87b4a7022ffc688`  
**Scope:** Diagnose/fix relation-browser systemic flake; enable conditional Phase 5E cosmetics checkpoint  
**Deploy / push / PR:** not performed  
**refresh:hub-snapshots:** not run

---

## 1. Start state

| Item | Value |
|------|-------|
| Branch | `codex/relation-network-phase4-checkpoint` |
| HEAD | `c0221f46e7b8bbce952facfcf87b4a7022ffc688` (Phase 5D Metal) |
| Uncommitted | Phase 5E cosmetics + Phase 5E.1 harness/readiness fixes |
| Observed flake | Random `verify:relation-browser` timeouts across sectors/viewports/locales |

---

## 2. Phase 5E preservation

Phase 5E cosmetics data/scripts were preserved. No cosmetics / other-sector relationship JSON meaning changes were made during 5E.1 beyond existing Phase 5E work. `cp_list` remained 15. Hub snapshots were not refreshed.

**Do-not-modify (relationship data):** `data/networks/*.json` content for non-cosmetics sectors; cosmetics JSON left at Phase 5E hash (no further edits in 5E.1).

---

## A. Resolved application bugs

| Bug | Root cause | Fix |
|-----|------------|-----|
| Readiness forever false / whenReady timeout | `ensureInit` re-entered while load in flight → replaced `STATE` / ignored stale load callbacks | In-flight same-sector re-entry returns existing STATE; `LOAD_GEN` guards; init errors stored |
| `NotFoundError: insertBefore` pageerror | `map_editorial.js` `ensureCollapsible` inserted before `#map-editorial-title` after mobile UX moved that node out of section | Guard: skip if `#map-editorial-panel` exists or title/body not contained in section; safer DOM inserts in `map_mobile_ux.js` / toolbar prepend helper |
| Clarity / GTM `sequence` null pageerror in QA | Microsoft Clarity loaded via GTM threw under tab thrash | **Test harness only:** abort Clarity/GTM/analytics routes in Playwright context (`installTestIsolation`). Production pages still load GTM/Clarity |

---

## B. Targeted regression (passed)

| Sector | Runs | Result |
|--------|------|--------|
| bigchip | 3 × (desktop/tablet/mobile × ko/en) | failures **0** |
| defense | 3 × | failures **0** |
| holdings | 3 × | failures **0** |
| nuclear | 3 × | failures **0** |
| construction | 3 × | failures **0** |

These runs used the post-fix harness (per-case page isolation, stage timeouts, no silent whenReady recovery, no retry wrapper, no skip, no assertion weakening).

Cosmetics is **not** in `PILOT_PAGES` / browser matrix filter; no separate cosmetics browser suite was run (would require full matrix or matrix expansion). Full matrix was **not** re-run for this checkpoint.

---

## C. Unresolved test infrastructure issue

| Item | Detail |
|------|--------|
| Symptom | Intermittent `stage timeout: pageCreate` during full matrix |
| Stage | Playwright `browser.newPage` / context page creation — **before** navigation / RelationNetwork readiness / sector assertions |
| Environment | Windows + Playwright Chromium; ~10 minutes per full matrix run |
| Not attributed to | cosmetics data, sector relation JSON, readiness flags, or URL assertions |
| Full matrix ×3 consecutive | **Not completed** (time/cost + residual pageCreate hang) |
| Policy | No test skip; no assertion weakening; no retry wrapper |

See: `docs/known-issues/relation-browser-pagecreate-flake.md`

---

## D. Risk acceptance (conditional Phase 5E checkpoint)

| Gate | Status |
|------|--------|
| targeted regression | **passed** |
| full matrix stability | **pending** due to pageCreate infrastructure flake |
| cosmetics application verification | **passed** |
| deployment browser gate | **not yet satisfied** |

- Phase 5E cosmetics app + data verification passed under short verify suite.
- Full matrix stability remains a **known issue** for final integration QA.
- Conditional checkpoint ≠ deployment approval.
- Before final PR/deploy: at least one full matrix **or** a stabilized substitute suite must pass.

---

## 5. Harness / timeout / isolation changes (summary)

- Per-case page (anonymous context via `browser.newPage`)
- Bounded concurrency (`RN_BROWSER_CONCURRENCY`, default 1)
- Stage-named timeouts (no blanket matrix timeout increase as the sole “fix”)
- Browser recycle every N cases (`RN_BROWSER_RECYCLE_CASES`)
- Free port on `EADDRINUSE`
- Diagnostics under `.tmp/relation-browser-diagnostics/` (gitignored / cleaned after run)
- Removed silent `layoutReady` recovery after whenReady error

---

## 6. Short verify (checkpoint gate)

Executed 2026-08-29 (no full browser matrix):

- `npm run build` ×2 — exit 0; cosmetics hash stable  
- `verify:relation-network`, `verify:cosmetics` (warnings 0), metal/elec/auto/construction/finance/bigchip, semi-relations, nav-tab-preserve, data-sector-profile — exit 0  

---

## 7. Explicit non-claims

- Did **not** report full matrix as successful.
- Did **not** treat pageCreate hang as cosmetics/sector app failure.
- Did **not** add retry wrapper, skip, or weaken assertions.
- Did **not** change relationship data / cp_list / hub snapshots for this checkpoint documentation step.
