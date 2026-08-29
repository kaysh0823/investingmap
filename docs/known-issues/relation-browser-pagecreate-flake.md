# Known issue: relation-browser `pageCreate` flake

**Status:** Open (test infrastructure)  
**Severity:** Blocks declaring full-matrix browser stability; does **not** invalidate Phase 5E cosmetics data/app verifiers  
**Related:** `docs/reports/phase5e1-browser-matrix-stability.md`  
**First tracked:** Phase 5E.1 (2026-08-29)

---

## Symptom

During `npm run verify:relation-browser` **full matrix** (15 sectors × 3 viewports × 2 locales + url-state suite), a case intermittently fails with:

```text
stage timeout: pageCreate (…ms)
```

Failure occurs at Playwright page creation. It is **not** a RelationNetwork readiness timeout, missing SVG assertion, or cosmetics/sector JSON validation failure.

Typical prior flake pattern (pre-app fixes) also included random sectors (`bigchip`, `defense`, `holdings`, `nuclear`, `construction`, later also `battery`/`elec`/`ship`/`finance`/`bio`) — targets changed across runs → systemic infrastructure flake, not one bad sector.

---

## Environment

- OS: Windows 10/11
- Runner: local Node + Playwright Chromium (headless)
- Approx. cost: ~10 minutes per full matrix
- Concurrency: default 1 (`RN_BROWSER_CONCURRENCY`)

---

## Failure stage

1. static server ready — OK  
2. browser launch — OK  
3. **pageCreate / newPage** — **hangs / times out**  
4. navigation / DOMContentLoaded — not reached for that case  
5. RelationNetwork whenReady / assertions — not reached  

Therefore this must **not** be recorded as cosmetics or sector application failure.

---

## Distinction from app errors (evidence)

| Signal | App bug (fixed in 5E.1) | pageCreate flake |
|--------|-------------------------|------------------|
| Stage | after navigation; readiness / pageerror | before navigation |
| Readiness | all false while RN present (race) or insertBefore stack | N/A — page never loads |
| Stack / source | `relation_network.js`, `map_editorial.js`, Clarity | Playwright timeout string only |
| Targeted sector ×3 | failed before fix; **0** after fix | still appears in long full matrix only |

---

## Fixes already attempted (not retries of the same case)

- Per-case page isolation (stop sharing one page across sectors)
- Bounded concurrency
- Browser recycle every N cases; recycle after pageCreate failure
- Stage-named timeouts; diagnostics JSON under `.tmp/`
- Block Clarity/GTM in **test** context only
- Application: ensureInit race; editorial insertBefore
- Port auto-advance on `EADDRINUSE`
- Chromium args: `--disable-dev-shm-usage`, `--disable-gpu`

**Not used:** retry wrapper on failed cases; skipping cases; weakening assertions; blaming cosmetics JSON.

---

## How to reproduce

```bash
# Full matrix (long)
npm run verify:relation-browser

# Optional: multiple runs (expensive)
# PowerShell: $env:RN_TEST_RUNS='3'; npm run verify:relation-browser
```

Targeted sectors (should pass after app fixes):

```bash
# PowerShell examples
$env:RN_TEST_ONLY='bigchip'; $env:RN_TEST_RUNS='3'; npm run verify:relation-browser
```

---

## Log policy

- Diagnostics: `.tmp/relation-browser-diagnostics/` (temporary; cleaned after harness exit; **do not commit**)
- Do not commit traces/screenshots/videos unless explicitly requested

---

## Follow-up candidates

1. Browser/context lifecycle hardening (ensure close completes before next newPage)
2. Bounded concurrency with measured CPU/memory evidence
3. Page recycling strategies that avoid hung CDP sessions
4. Matrix sharding (sector shards in CI)
5. Split url-state suite into a separate npm script
6. Run matrix on CI/Linux where Playwright is typically more stable

---

## Deployment gate

Before **final PR / production deploy** of relation-network work that relies on browser QA:

- [ ] At least **one** full `verify:relation-browser` matrix with failures **0**, **or**
- [ ] A documented stabilized substitute suite (e.g. sharded CI jobs) with failures **0**

Conditional Phase 5E cosmetics checkpoint does **not** satisfy this gate.
