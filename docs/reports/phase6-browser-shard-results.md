# Phase 6 — Browser Shard Results

**HEAD:** `1866428ce0cd23ab363c40bdd667b16eeecba418`
**Gate:** `npm run verify:relation-browser:release`
**Result:** **PASS** — deploymentBrowserGate **true**

Monolithic full matrix was **not** executed in a 3× loop. Cases are the same matrix assertions split across shards with a fresh browser process per shard.

## Coverage

| Shard | Sectors | Cases (3×2) | Duration | App fail | Infra fail |
|-------|---------|-------------|----------|----------|------------|
| A | semiconductor, holdings, defense, bio, bigchip, battery, finance | 42 | ~411s | 0 | 0 |
| B | ship, powergrid, nuclear, renewable, construction, auto | 36 | ~384s | 0 | 0 |
| C | elec, metal, cosmetics, kconsume, kcontent | 30 | ~216s | 0 | 0 |
| D | medtech, software, telecom, robot | 24 | ~237s | 0 | 0 |
| **Total** | **22** | **132** | ~21m | **0** | **0** |

Viewports: desktop 1440 / tablet 768 / mobile 375
Locales: ko + en
Mobile: every sector included

URL-state suite runs with shard A (invalid ticker/relation depth caps, defense program deep-links).

## Classification policy

| Class | Stages / signals |
|-------|------------------|
| Infrastructure | browserLaunch, contextCreate, pageCreate timeout, browser crash, static server failure |
| App | navigation/JS errors, readiness, DOM/assertions, console/pageerror after load, wrong graph state |

Infrastructure failures **do not** count as passes. No retries.

## Artifacts

- `docs/reports/phase6-browser-shard-a.json` … `-d.json`
- `docs/reports/phase6-browser-shard-release.json`
- `data/relation_network_release_browser_gate.json`

## Harness notes

- `RN_BROWSER_SHARD=a|b|c|d` + `RN_BROWSER_RELEASE=1`
- Entry scripts clear `RN_TEST_ONLY` / `RN_TEST_QUICK` so polluted shells cannot shrink the matrix
- Existing `verify:relation-browser` monolithic path retained (not deleted)

## Known issue

`docs/known-issues/relation-browser-pagecreate-flake.md` remains open for long monolithic Windows runs. Sharding + process recycle is the release mitigation; it does not claim the flake is eliminated forever.
