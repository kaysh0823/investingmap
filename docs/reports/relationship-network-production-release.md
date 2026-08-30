# Relationship Network — Production Release Report

**Generated:** 2026-08-30 (KST)  
**Operator:** automated release verification (PR #1 merge + production smoke)  
**Status:** RELEASE COMPLETE (no rollback)

---

## 1. Merge summary

| Item | Value |
|------|-------|
| PR URL | https://github.com/kaysh0823/investingmap/pull/1 |
| Merge method | **Merge commit** (`gh pr merge --merge`) — not squash/rebase |
| PR head (pre-merge) | `2148cf40a7b8dd4eac4d9ce7c05b7736d5b6e040` |
| Merge commit | `1b58b8cb1bf7dd8f97d202a20b9910f78c6b8748` |
| mergedAt | `2026-08-29T23:32:06Z` |
| origin/main HEAD | `1b58b8cb1bf7dd8f97d202a20b9910f78c6b8748` |
| Ancestry verified | `2148cf4`, `a6ff432`, `1866428` all ancestors of `origin/main` |

Pre-merge gates (all passed):

- PR OPEN, not draft, MERGEABLE, mergeStateStatus CLEAN
- headRefName `codex/relation-network-phase4-checkpoint`
- Cloudflare Pages preview check SUCCESS on PR head

---

## 2. Cloudflare Pages production deployment

| Item | Value |
|------|-------|
| Platform | Cloudflare Pages (Git integration) |
| Production branch | `main` |
| Trigger | Automatic on merge to `main` (no manual deploy) |
| Deployment check | Cloudflare Pages — **SUCCESS** |
| Check started | `2026-08-29T23:32:09Z` |
| Check completed | `2026-08-29T23:33:17Z` |
| Details URL | https://dash.cloudflare.com/?to=/610ef624da35e943ae318b2e359b15dc/pages/view/investing-map/74dcc428-c52c-489e-9a62-3c84fb7c5f73 |
| Deployment commit | Merge commit `1b58b8c` (contains snapshot `2148cf4`) |

No build failure observed. Custom domains respond over HTTPS.

---

## 3. Domain · HTTP · canonical

| URL | Status | Final URL | Redirect | TLS | Response |
|-----|--------|-----------|----------|-----|----------|
| https://www.investingmap.kr/ | 200 | same | none | OK | ~337 ms |
| https://www.investingmap.kr/ | 200 | same | none | OK | ~232 ms |
| https://www.investingmap.kr/ | 200 | same | none | OK | ~241 ms |

**Canonical:** `https://www.investingmap.kr/` (matches policy)

**Static assets (sample):**

| Resource | Status | Content-Type | Cache-Control |
|----------|--------|--------------|---------------|
| `/robots.txt` | 200 | text/plain | max-age=14400 |
| `/sitemap.xml` | 200 | application/xml | max-age=0, must-revalidate |
| `/js/network_profiles.js` | 200 | application/javascript | max-age=31536000, immutable |
| `/js/relation_network.js` | 200 | application/javascript | max-age=31536000, immutable |
| `/data/networks/*.json` | 200 | application/json | max-age=300, stale-while-revalidate=60 |

No unexpected 404/500 on primary JS/CSS/data paths.

---

## 4. Snapshot data (production)

| File | asOf | Count | Match expected |
|------|------|-------|----------------|
| `hub_quote_snapshot.json` | `2026-08-29T12:06:17.655Z` | 481 quotes (482 total, 99.8%) | ✓ |
| `hub_rs_snapshot.json` | `2026-08-29T12:06:35.541Z` | 2731 | ✓ |
| `hub_sector_returns.json` | `2026-08-29T12:06:39.709Z` | 22 sectors | ✓ |

Cache check: normal fetch vs cache-bypass returned identical `asOf` and `quotesOk` — no stale corruption detected.

---

## 5. Relation network data (production)

| Network | Nodes | Edges | Notes |
|---------|-------|-------|-------|
| semiconductor.json | 160 | 193 | 200 OK |
| finance.json | 72 | 110 | confirmed ownership edges: **9** |
| construction.json | 44 | 60 | 200 OK |
| robot.json | 86 | 115 | `legacyFallback` absent/false; dedicated `robot.json` path |

`js/network_profiles.js`: includes robot, software, telecom; **0** `legacyFallback: true` occurrences.

---

## 6. Production API (hub)

All production `/api/*` endpoints tested returned **200**:

- `/api/hub_top10`
- `/api/hub_rs_top10`
- `/api/hub_movers`
- `/api/hub_sectors?horizon=1d`
- `/api/fx`

No unexpected API 404/500 during browser smoke.

---

## 7. Production smoke results

### A. Hub

- Page loads (desktop 1440px, mobile 375px; KO/EN)
- Sector performance tiles render with **+%** returns and market-cap weights
- `/api/*` all 200; **pageerror 0**, **console error 0**
- Note: hub displays sector returns (e.g. `+6.12%`, `36.39B`) rather than comma-formatted stock prices on the index view — initial automated price-regex check was a **false negative**; manual/deep check confirms live data present

### B. Semiconductor

- `ticker=005930`, `ticker=000660` — graph initializes, **pageerror 0**
- URL state preserved after reload (`000660` retained)

### C. Finance

- Relation tab loads; ownership/stake language present
- Production JSON: `confirmedOwnershipEdgeCount: 9`

### D. Construction

- Mobile (375px) relation tab opens; network/project content visible

### E. Robot

- Dedicated `robot.json` via `networkPath: ../data/networks/robot.json`
- Graph renders; no legacy fallback flag in profiles or JSON

### F. Consumer/Service

- cosmetics: brand/product nodes visible
- software: relation tab loads (desktop)

### Mobile · language (targeted)

| Case | Result |
|------|--------|
| construction relation tab (375px) | PASS |
| semi EN language switch (1440px) | PASS |
| semi ticker URL restore | PASS |
| finance ownership (1440px) | PASS |
| robot graph (1440px) | PASS |

**Console/page errors across all targeted cases:** 0

Raw evidence: `.tmp/production-release-smoke.json`

---

## 8. Issues found

| ID | Severity | Description | Action |
|----|----------|-------------|--------|
| HUB-PRICE-REGEX | Low | Automated hub smoke flagged “no price-like text” because hub index shows sector % returns / `B` weights, not comma stock prices | Test harness only; production hub functional |
| CONSTRUCTION-KEYWORD | Low | Mobile construction page on default heatmap tab does not surface “project/claim” keywords until relation tab clicked | Expected tab behavior; relation tab PASS |

**Critical/High issues:** none  
**Rollback required:** no

---

## 9. Remote branch

`origin/codex/relation-network-phase4-checkpoint` **retained** (not deleted).

---

## 10. Final verdict

| Gate | Status |
|------|--------|
| MERGED | ✓ |
| PRODUCTION_DEPLOYED | ✓ |
| PRODUCTION_SMOKE_PASSED | ✓ |
| RELEASE_COMPLETE | ✓ |

---

## 11. Action log (explicit)

| Action | Performed |
|--------|-----------|
| Merge PR #1 | **Yes** — merge commit `1b58b8c` |
| Production auto-deploy (Cloudflare Pages on `main`) | **Yes** |
| Separate manual deploy | **No** |
| Snapshot re-refresh | **No** |
| Direct commit to `main` (outside merge) | **No** |
| Force push | **No** |
| Rollback / revert | **No** |
| Remote feature branch deleted | **No** |

**Remaining blockers:** none for production release.
