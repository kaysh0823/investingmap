# Relation Network — Phase 4 Checkpoint

**As of:** 2026-08-23  
**Scope:** Audit, verification, and documentation only (no new sector work in this checkpoint).  
**Deploy / push:** not performed.

---

## 1. Purpose

The sector relationship network lets investors see **how listed Korean companies connect** to customers, suppliers, projects, programs, ownership, and contracts—beyond a flat company list.

Goals:

- Evidence-backed edges (prefer primary / exact documents for `confirmed`)
- Sector-specific graph models and layouts (not one generic force graph)
- Stable entity IDs across sectors (`krx:`, `anchor:`, `global:`, `program:`, …)
- URL / mobile / accessibility parity with the rest of the map UI
- Repeatable `npm run build` + sector `verify:*` gates before expanding further

Financial content is YMYL: editorial status is intentionally strict; thin homepage citations must not become `confirmed`.

---

## 2. Common data schema

**Source of truth (Node):** `lib/relation_network/`

| Module | Role |
|--------|------|
| `schema.mjs` | Allowed edge types per sector, shared enums |
| `profiles.mjs` | Per-sector `model` / `layout` / UI defaults; `PILOT_NETWORK_SECTORS` |
| `validate.mjs` | Network-wide + sector-specific hard fails / warnings |
| `entity_normalize.mjs` | Canonical ID remaps (anchors, KEPCO, KR ticker on `global_company`) |
| `legacy_adapter.mjs` | Build legacy partner blobs into a temporary network shape |
| `orphan_metrics.mjs` | Listed-company orphan splits |
| Sector metrics | e.g. `powergrid_contract_metrics.mjs`, `nuclear_project_metrics.mjs`, `renewable_project_metrics.mjs` |

**Persisted networks:** `data/networks/{sector}.json`

Typical top-level fields:

- `model`, `layout` (optional if profile supplies layout)
- `nodes[]`, `edges[]`
- `_legacyFallback` (boolean when intentional legacy adapter path)
- Optional `metrics`, phase timestamps (`phase4c1CuratedAt`, …)

**Browser emit:** `js/network_profiles.js` (from `emit_network_profiles.mjs`), `js/relation_network.js`, `js/relation_network_legacy.js`.

---

## 3. Status vocabularies (do not conflate)

### `editorialStatus` / edge `status` (verification)

| Value | Meaning |
|-------|---------|
| `confirmed` | Passes **confirmed gate** (see §4) |
| `reported` | Credible disclosure / press; not fully gated |
| `reference` | Structural / classification / context only |
| `inferred` | Heuristic; never count as verified trade |
| `peer` | Competitor / peer; usually `defaultHidden` |
| `ended` | Historical |

### `projectStatus` (asset / plant / program stage)

Examples: `development`, `preferred_bidder`, `contract_signed`, `under_construction`, `operating`, `completed`, …  
Used on nuclear / renewable (and similar) **project nodes**—not a substitute for editorial status.

### `contractStatus` (contract lifecycle)

Examples: `announced`, `letter_of_award`, `effective`, `in_delivery`, `completed`, `cancelled`, `terminated`.  
Used heavily on **powergrid** contract nodes. Independent of `editorialStatus`.

**Rule of thumb:** editorial = “how sure are we?”; project/contract = “what lifecycle stage is the thing in?”

---

## 4. Confirmed gate

`confirmed` requires (sector validators may add more):

- Evidence that **directly** supports the relationship (`directEvidence: true`)
- Exact / primary document URL (not bare homepage / newsroom index alone)
- Parties identifiable in the evidence summary
- Relationship type matches the document
- Publication / disclosure date when available
- `lastVerifiedAt` (or evidence `reviewedAt`)
- `reviewStatus: "reviewed"`
- `reviewedAt` + `reviewedBy`
- For ownership: stake / as-of rules where sector policy requires them

If `directEvidence` is false or `reviewStatus` is `needs_human_review`, keep **`reported` / `reference`**. Do not promote to inflate metrics.

---

## 5. Canonical entity rules

| Pattern | Use |
|---------|-----|
| `krx:{6-digit}` | Listed Korean company on that sector map |
| `anchor:{ticker}` | Domestic IDM-style anchor on semiconductor (Samsung / SK hynix)—**not** in semi `cp_list`; graph-only |
| `global:{slug}` | Foreign / unlisted counterparty |
| `program:` / `project:` / `renewable-project:` / `nuclear-project:` | Named programs / plants |
| `spv:` / `offtaker:` / `org:` | Project vehicles, buyers, public owners |
| `technology:` / `equipment_category:` / `ecosystem:` | Structural classification nodes |

**Cross-sector:**

- Do not put a KR ticker on `type: global_company`.
- KEPCO: prefer `krx:015760` with `listed_reference_company` / `isMapConstituent: false` when not in that map’s company count (renewable / nuclear patterns).
- Never recreate `public:kepco` after normalization.

---

## 6. v2 pilot sectors (`PILOT_NETWORK_SECTORS`)

Structured JSON under `data/networks/` and active profile model:

| Sector | Model | Layout (profile) |
|--------|-------|------------------|
| semiconductor | `supply_chain` | `layeredSupplyChain` |
| bigchip | `dual_anchor_comparison` | `dualAnchor` |
| bio | `pipeline_licensing` | `assetLicensing` |
| holdings | `ownership_structure` | `ownershipTree` |
| defense | `program_ecosystem` | `projectEcosystem` |
| battery | `battery_circular_value_chain` | `layeredSupplyChain` |
| ship | `shipbuilding_project_ecosystem` | `projectEcosystem` |
| finance | `financial_group_ecosystem` | `ownershipTree` |
| powergrid | `grid_infrastructure_ecosystem` | `gridInfrastructureEcosystem` |
| nuclear | `nuclear_project_lifecycle_ecosystem` | `nuclearProjectEcosystem` |
| renewable | `renewable_project_value_chain` | `renewableProjectEcosystem` |

---

## 7. Legacy fallback sectors

Non-pilot maps still load `relation_network.js` + `relation_network_legacy.js`.

If no / failed `data/networks/{sector}.json` fetch, the runtime builds a **legacy fallback** network (`_legacyFallback: true`) from embedded partner data via `RelationNetworkLegacyAdapter`.

That is **not** dual rendering of two graphs. One renderer path; legacy adapter only when structured JSON is unavailable.

Maps patched for the shared shell (toolbar, URL, a11y) include e.g. auto, robot, elec, telecom, software, construction, cosmetics, kconsume, kcontent, medtech, metal—still legacy data until a future phase migrates them.

---

## 8. Verify commands

```bash
npm run build
npm run verify:relation-network
npm run verify:renewable
npm run verify:nuclear
npm run verify:powergrid
npm run verify:finance
npm run verify:ship
npm run verify:battery
npm run verify:bigchip
npm run verify:semi-relations
npm run verify:nav-tab-preserve
npm run verify:data-sector-profile
npm run verify:relation-browser
```

Optional related: `verify:dist` (runs inside `build`).

---

## 9. Adding a new sector (procedure)

1. Define profile in `lib/relation_network/profiles.mjs` (`model`, `layout`, `dataSector`).
2. Extend `SECTOR_EDGE_TYPES` in `schema.mjs` as needed.
3. Add migrate (+ optional curate) script(s); wire into `scripts/rebuild_site.mjs` **after** prior phases, **before** `emit_network_profiles` / `patch_relation_network`.
4. Write `scripts/verify_{sector}_relation_network.mjs` + `package.json` script.
5. Add sector to `PILOT_NETWORK_SECTORS`.
6. Ensure `cp_list` / map company count policy is explicit (listed vs reference).
7. Run `npm run build` twice (idempotency) and the verify suite including `verify:relation-browser`.
8. Do **not** invent edges to clear orphans; do **not** auto-`confirmed`.

---

## 10. Do not hand-edit generated artifacts

Prefer editing **sources**, then rebuild:

| Artifact | Generated by |
|----------|----------------|
| `data/networks/*.json` | migrate_* / curate_* / normalize / evidence apply |
| `js/network_profiles.js` | `emit_network_profiles.mjs` |
| Map HTML relation shell | `patch_relation_network.mjs` (+ sector builders) |
| `dist/` | `pages_build.mjs` (**gitignored**—source maps are canonical) |

Hand-editing only HTML without updating migrate/curate will be overwritten on the next `rebuild_site`.

---

## 11. Rebuild pipeline order (relation phases)

From `scripts/rebuild_site.mjs` (relation-relevant excerpt):

1. `migrate_network_data.mjs` (pilots base)
2. `apply_evidence_review_phase26.mjs`
3. `normalize_network_entities_phase27.mjs`
4. `apply_evidence_review_phase27.mjs`
5. `migrate_bigchip_network_phase3a.mjs`
6. `fix_bigchip_metrics_phase3b0.mjs`
7. `migrate_battery_network_phase3b.mjs`
8. `write_battery_phase3b_metrics.mjs`
9. `migrate_ship_network_phase3c.mjs`
10. `fix_ship_reported_phase3d0.mjs`
11. `migrate_finance_network_phase3d.mjs`
12. `curate_finance_ownership_phase3d1.mjs`
13. `migrate_powergrid_network_phase4a.mjs`
14. `curate_powergrid_contracts_phase4a1.mjs`
15. `curate_powergrid_contracts_phase4a2.mjs`
16. `migrate_nuclear_network_phase4b.mjs`
17. `curate_nuclear_phase4b1.mjs`
18. `migrate_renewable_network_phase4c.mjs`
19. `curate_renewable_phase4c1.mjs`
20. `emit_network_profiles.mjs`
21. `patch_relation_network.mjs`

One-shot audit helpers (`audit_*`, `classify_relation_warnings.mjs`) are **not** required on every rebuild.

**Idempotency (checkpoint):** SHA-256 of key `data/networks/*` and major changelogs was unchanged across two consecutive `npm run build` runs (2026-08-23).

---

## 12. Checkpoint audit notes (2026-08-23)

| Check | Result |
|-------|--------|
| HTML-only without generator | Sector maps are intentionally patched in place by `patch_relation_network`; robot strips semi curated artifacts in `build_korea_robot_map.mjs`. Acceptable if rebuild re-applies cleanly. |
| `dist/` vs source | `dist/` gitignored; `verify:dist` compares `js/` → `dist/js/`. |
| Network JSON vs migrate/curate | Rebuild regenerates JSON; second build left hashes stable. |
| Cross-sector status conflict | Shared entities (e.g. KEPCO) use explicit reference / constituent flags per sector—do not force one editorial status globally. |
| Legacy + v2 dual render | Single renderer; legacy adapter only on missing JSON / fetch fail. |
| Temporary stubs | `bigchipFilterState` injected on maps that still reference it after cloning semi template—intentional crash fix, not dead product UI. |
| Curation duplicate edges | Upsert-by-id patterns in curate scripts; verify suite + hash stability. |
| Changelog churn per build | No hash drift on sampled phase changelogs across double build. |

---

## 13. Remaining human review (selected)

- **Semiconductor / bigchip:** many `reported` / low directEvidence; anchors policy documented.
- **Powergrid:** active contracts curated; remaining business orphans among listed names.
- **Nuclear:** Dukovany / KHNP–KPS roles—keep confirmed gate; follow-up disclosures.
- **Renewable (4C.1):** Sinan Wi SPV legal name + DART stake for confirmed ownership; Uiseong stake %; Atlas post-sale owner / SCE PPA seller entity; Haenam EPC signing; SK Gas facility-level projects if disclosed.
- **Ship / battery:** largely structural + reported; avoid orphan-padding.
- **Bio / defense:** thin curated business edges relative to classification—expand only with evidence.

---

## 14. Pre-deploy checklist

- [ ] `npm run build` (twice if network scripts changed)
- [ ] Full verify list in §8 (including `verify:relation-browser`)
- [ ] No secrets / `.env` / `node_modules` / local `.tmp_*` in commit
- [ ] `cp_list` / listed counts unchanged unless intentionally scoped
- [ ] No new `confirmed` without reviewed primary evidence
- [ ] Changelog / metrics intentional
- [ ] Cloudflare / robots AI crawler policy still allows content pages
- [ ] Manual spot-check: one pilot URL (`?project=` / `?ticker=` / lang / theme / 375px)
- [ ] Push / PR / production deploy only after explicit approval

---

## 15. Next work

Phase 4 relation framework for the listed pilots is **checkpoint-ready**. New sectors (robot, auto, …) may start only after this checkpoint is committed and review accepts remaining human-review debt.
