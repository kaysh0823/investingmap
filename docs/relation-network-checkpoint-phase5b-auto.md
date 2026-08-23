# Relation Network — Phase 5B Auto Checkpoint

**As of:** 2026-08-23  
**Branch:** `codex/relation-network-phase4-checkpoint`  
**Base HEAD:** `edd5e8b0a7612336db7b031846944055df636203`  
**Scope:** Automotive sector value-chain relationship ecosystem (5B → 5B.1 → 5B.2 → 5B.3 bio pipeline fix)  
**Deploy / push / PR:** not performed

---

## 1. Phase 5B 목적

자동차·자동차부품 섹터(`auto`)에 **가치사슬 중심 관계 네트워크**를 도입한다. KRX 상장 22社(`cp_list`)를 기준으로 structural lane·peer·FTC group roster·**1차 출처 확인 business edge**만 그래프에 반영한다. 공급·차종 탑재·JV는 DART/KIND 1차 출처 없이 **0건** 유지.

---

## 2. 기존 legacy 구조 감사

| 항목 | Phase 5B 이전 |
|------|---------------|
| `auto/korea_auto_map.html` | legacy partners force graph, `networkPath: null`, **legacyFallback** |
| structured JSON | 없음 |
| peer/supply/customer 혼재 | HTML partners 기반, evidence gate 없음 |
| orphan 지표 | peer-only 이름·분모 불일치 |

**Phase 5B 이후:** `data/networks/auto.json` structured network, `legacyFallback` 없음, profile `automotiveValueChainEcosystem`.

---

## 3. Auto model / layout / lane

| 항목 | 값 |
|------|-----|
| `model` | `automotive_value_chain_ecosystem` |
| `layout` | `automotiveValueChainEcosystem` |
| Network JSON | `data/networks/auto.json` |
| Profile | `lib/relation_network/profiles.mjs` → `auto` |
| Metrics | `lib/relation_network/auto_metrics.mjs` |
| Coverage | `lib/relation_network/coverage_metrics.mjs` |
| Browser layout | `js/relation_network.js` → `layoutAutomotiveValueChain()` |
| Emit | `js/network_profiles.js` (rebuild) |

**Lane order (profile.lanes):** vehicle_oem → powertrain → electrification → thermal_management → chassis_braking_steering → body_exterior → interior → lighting → electronics_adas → tire → materials → aftermarket → end_market

---

## 4. cp_list 22

`metrics.listedCompanyCount`: **22**  
duplicate ticker: **0**  
canonical entity 중복: **0**

---

## 5. Canonical entity 정책

| 패턴 | 용도 |
|------|------|
| `krx:{6-digit}` | auto 맵 상장사 |
| `global:` | 해외 OEM·Tier1 peer |
| `product:` | 제품·부품 분류 노드 |
| `group:` | FTC 공시대상기업집단 |
| `market:` | end_market 노드 |

---

## 6. Structural / peer / group / business 구분

| 유형 | Phase 5B 처리 |
|------|---------------|
| **Structural** | `member_of`, `manufactures`, `specializes_in`, `exposed_to` 등 lane 분류 — evidence gate 없음, orphan padding **금지** |
| **Peer** | `peer` — status `peer`, global 비교용, business orphan **미해소** |
| **group_member** | FTC 2025-05-01 roster — **5건**, owns/supplies **아님** |
| **Business** | `owns_stake_in` confirmed/reported만 orphan·coverage 분모 |

`group_member`는 `DIRECT_RELATION_EDGE_TYPES`에서 **제외** — business/direct-commercial orphan을 해소하지 않음.

---

## 7. FTC group_member 5건

현대자동차 그룹 (`group:hyundai_motor_group`):

| ticker | 회사 |
|--------|------|
| 005380 | 현대자동차 |
| 000270 | 기아 |
| 012330 | 현대모비스 |
| 011210 | 현대위아 |
| 307950 | 현대오토에버 |

status: `reported` · evidence: FTC 2025-05-01 공시대상기업집단 명부

---

## 8. Confirmed ownership 1건

| source | target | type | stake | asOf | evidence |
|--------|--------|------|-------|------|----------|
| `krx:000240` 한국앤컴퍼니 | `krx:161390` 한국타이어앤테크놀로지 | `owns_stake_in` | **31.15%** | **2024-12-31** | DART rcpNo **20250318000944** (2025.03.18 사업보고서) |

- `ownershipKind`: direct associate (not controlling `owns`)
- `edgeOrigin`: manuallyCurated (Phase 5B.2)

---

## 9. 공급 / 차종 / JV 관계 0건인 이유

| 관계 유형 | 건수 | 이유 |
|-----------|------|------|
| supply (`supplies_*`) | **0** | DART/KIND 1차 출처 미확인 — Phase 5B.2 defer |
| vehicle fitment (`used_in_vehicle`) | **0** | 동일 |
| JV / joint development | **0** | 동일 |
| inferred / reference business | **0** | evidence gate — orphan padding 금지 |

---

## 10. Sparse graph 정책

- 22 listed vs 117 edges — 대부분 structural + peer
- `businessRelationOrphanCount`: **20** (의도적 sparse)
- UI: `rn-sparse-notice`, confirmed-only filter 기본
- 추정 관계·padding edge 추가 **금지**

---

## 11. 0분모 N/A 정책

`coverage_metrics.mjs` — denominator=0:

- `percentage`: **null**
- `displayValue`: **N/A**
- `applicable`: **false**
- `reason`: `no_eligible_*_edges`

auto verify: supply/fitment coverage 전부 N/A (0/0).

---

## 12. Orphan / peer 지표 정의 (Phase 5B.1 교정)

| 지표 | auto 값 | 의미 |
|------|---------|------|
| `hasPeerButNoBusinessCompanyCount` | 20 | peer ≥1, business counterparty 0 |
| `peerOnlyCompanyCount` (strict) | **0** | incident edge 전부 peer만 |
| `classificationOnlyCompanyCount` | 20 | classification/peer only |
| `groupMembershipOnlyCompanyCount` | 5 | group_member only |
| `businessRelationOrphanCount` | 20 | direct commercial + confirmed/reported business 0 |
| `directRelationshipOrphanCount` | 20 | 동일 alias chain |

**교정 전 오류:** `peerOnlyCompanyCount=22` (member_of/manufactures 보유 社 포함) — 이름·의미 불일치.

---

## 13. claimSupport · evidence gate

- Business/ownership: DART rcpNo 또는 FTC primary required for confirmed
- Structural/peer: editorial classification, orphan padding 없음
- `validate.mjs`: peerOnly vs hasPeerButNoBusiness 독립 재검산

---

## 14. URL initialization race 수정 (Phase 5B.2)

**원인:** `ensureInit()` async `loadNetwork()` 완료 전 `getState()` → ticker URL 미복원.

**수정 (`js/relation_network.js`):**

- `resolveNodeFromUrlTicker()` — profile-aware: semi `anchor:`, bigchip/auto `krx:`
- init 완료 후 `applyUrlToState()` 재호출
- `RelationNetwork.whenReady()` Promise API

**검증 (`scripts/verify_relation_browser.mjs`):**

- `waitForTickerSelection()` — `initialized && selectedTicker && selectedId`
- 000660 전용 hardcode **없음** — generic resolver

**필수 URL (full browser + url-state 통과):**

- bigchip `?tab=graph&ticker=000660`
- bigchip `?tab=graph&ticker=005930`
- bigchip `?tab=graph&anchor=shared`
- semi `?tab=graph&ticker=000660`
- auto `?tab=graph&ticker=005380`

---

## 15. Bio build pipeline 회귀 수정 (Phase 5B.3)

**원인:** `enrich_company_fields.mjs` bio inline patch — `dataStart=-1` → `koreanCompanies` duplicate syntax error → `switchTab` undefined cascade.

**수정:**

- enrich: gen만 호출, inline 수동 patch 제거
- `bio_inline_tail.js`: legacy D3 graph orphan 제거
- `patch_relation_network.mjs`: `stripBioLegacyGraphOrphans()` idempotent

**확인:** `koreanCompanies` 선언 1 · enrich 단독 실행 후 1 · bio network 의미 변경 없음 (nodes 60, edges 1).

---

## 16. Mobile / URL / a11y QA

| 실행 | 결과 |
|------|------|
| full `verify:relation-browser` (desktop/tablet/mobile × ko/en) | **failures: 0** |
| bio mobile/en | console/page error 0 |
| RN a11y list `#rn-a11y-list` | profile별 유지 |

---

## 17. Build / verify / idempotency (checkpoint 시점)

| 항목 | 결과 |
|------|------|
| `npm run build` ×2 | exit 0, 추가 diff 없음 |
| auto.json MD5 | `8cbc83e8259ff16857cf4e856c782f2c` |
| bio inline MD5 | `14da373ea4c5e06b378b3138ab46a5ad` |
| `verify:auto` | warnings 0 |
| `verify:construction` | warnings 0 |
| `verify:finance` | owns confirmed **9** 유지 |
| full relation-browser | failures **0** |
| hub snapshot refresh | **미실행** |

---

## 18. 타 섹터 metrics-only 파생 (관계 의미 변경 없음)

| 파일 | before → after | 이유 |
|------|----------------|------|
| `finance.json` `classificationOnlyCompanyCount` | 13 → 25 | orphan 정의 교정 (31 listed − 6 owns sources) |
| `construction.json` metrics block | orphan/coverage 메타 추가 | 공통 `orphan_metrics.mjs` 재계산 |
| `battery_relation_phase3b_metrics.json` | hasPeerButNoBusiness 등 추가 | 동일 |
| powergrid/construction changelogs | metrics snapshot | rebuild deterministic |

nodes/edges/status/evidence/amount **변경 없음** (construction/finance edge arrays diff 0).

---

## 19. 남은 human review

- auto supply/fitment/JV: DART/KIND 1차 출처 확보 시 Phase 5B+ 큐레이션
- 20 business orphans: intentional until primary evidence
- FTC group_member: reported only, not ownership

---

## 20. Electrical 작업 시 재사용 규칙

1. `migrate_*_network_phase*.mjs` + sector metrics module 패턴
2. cp_list → canonical `krx:` only, mcap floor 3천억
3. structural vs business edge 분리, orphan padding 금지
4. 0분모 coverage → N/A (`coverage_metrics.mjs`)
5. `group_member` ≠ business orphan resolution
6. URL ticker: `resolveNodeFromUrlTicker()` profile extension
7. enrich → gen 순서; bio inline 수동 patch 금지
8. full browser matrix before checkpoint

---

## 21. 배포 전 체크리스트

- [ ] `npm run build` ×2 idempotent
- [ ] `verify:auto` + full `verify:relation-browser` failures 0
- [ ] auto.json hash stable
- [ ] cp_list unchanged
- [ ] no inferred supply edges
- [ ] hub snapshots intentional refresh only
- [ ] compliance review for investment content

---

## 22. 완료 보고서 참조

- [Phase 5B.2 Auto completion](../reports/phase5b2-auto-completion.md)
- [Phase 5B.3 Bio browser regression](../reports/phase5b3-bio-browser-regression.md)

---

## Rebuild pipeline (auto 구간)

`migrate_auto_network_phase5b.mjs` → `curate_auto_relationships_phase5b1.mjs` → `curate_auto_business_relationships_phase5b2.mjs` → `emit_network_profiles.mjs` → `patch_relation_network.mjs` → `bio/gen_korea_bio_inline.mjs`
