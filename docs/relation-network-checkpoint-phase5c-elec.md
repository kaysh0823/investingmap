# Relation Network — Phase 5C Elec Checkpoint

**As of:** 2026-08-23  
**Branch:** `codex/relation-network-phase4-checkpoint`  
**Base HEAD:** `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b`  
**Scope:** Electronics component value chain (`elec`) — Phase 5C → 5C.1 → 5C.2 + shared readiness/browser fix  
**Deploy / push / PR:** not performed

---

## 1. Phase 5C 목적

전기·전자부품 섹터(`elec`)에 **가치사슬 중심 관계 네트워크**를 도입한다. KRX 상장 **24社**(`cp_list`)를 기준으로 lane·structural·peer·**cross-sector reference**만 반영한다. DART/KIND 1차 출처 없는 **business/supply edge는 0건** 유지.

---

## 2. 실제 sector ID·경로

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`elec`** |
| HTML | `elec/korea_elec_map.html` |
| `data-sector` | `elec` |
| build | `scripts/build_korea_elec_map.mjs` → `ELEC_CONFIG` |
| Network JSON | `data/networks/elec.json` |
| Profile | `lib/relation_network/profiles.mjs` → `elec` |
| Metrics | `lib/relation_network/elec_metrics.mjs` |
| Product canonical | `lib/relation_network/elec_product_canonical.mjs` |
| Browser layout | `js/relation_network.js` → `layoutElectronicsValueChain()` |
| 이전 | `networkPath: null`, **legacyFallback** |
| 이후 | `../data/networks/elec.json`, **legacyFallback: false** |

**생성하지 않음:** `electrical/`, `electronics/` — 해당 ID·HTML 없음.

---

## 3. 기존 legacy 구조

| 항목 | Phase 5C 이전 |
|------|---------------|
| HTML partners force graph | 25 legacy partner 문자열 (4 global peer) |
| structured JSON | 없음 |
| supply/customer 혼재 | evidence gate 없음 |
| orphan | peer-only, 분모 불일치 |

**Phase 5C 이후:** structured network, profile `electronicsValueChainEcosystem`.

---

## 4. Model / layout / lanes

| 항목 | 값 |
|------|-----|
| `model` | `electronics_component_value_chain` |
| `layout` | `electronicsValueChainEcosystem` |
| lanes | `home_appliance`, `display`, `camera_module`, `electronic_component`, `end_market` |

chain→lane: HTML `chain` (가전→home_appliance, 디스플레이→display, 카메라·모듈→camera_module, 전자부품→electronic_component).

---

## 5. cp_list 24

| 항목 | 값 |
|------|-----|
| `listedCompanyCount` | **24** |
| duplicate ticker | **0** |
| cp_list 변경 | **없음** |
| 신규 상장사 | **없음** |

chain: 전자부품 14, 가전 4, 카메라·모듈 4, 디스플레이 2.

---

## 6. Product canonical 정책 (Phase 5C.1)

| 문제 | 해결 |
|------|------|
| `slugToken()` 한글 semType → `product:item` / `component:item` | `ELEC_PRODUCT_BY_TICKER` (24 ticker 전수) |
| generic slug | **0** (`product:item`, `component:item` 등 forbidden) |
| product vs category vs market | product/component = 기업 semType; `business_category` = lane hub `group:*`; `end_market` = 수요 버킷 |

**공유 component 허용:** `component:electronic_module` — 043260, 065350 (감사: `data/elec_relation_phase5c2_node_audit.json`).

---

## 7. Node 56 → 86 증가 원인

| 단계 | nodes | edges |
|------|-------|-------|
| Phase 5C baseline | 56 | 105 |
| Phase 5C.1 canonical | 86 | 107 |

**+30 net:** ticker별 product/component 노드가 shared generic(`product:item` 등)을 대체.  
제거: generic orphan 2. 추가: 24 product + 23 component (1 shared component).

| type | count |
|------|-------|
| listed_company | 24 |
| product | 24 |
| component | 23 |
| global_company | 4 |
| business_category | 4 |
| cross_sector_anchor | 4 |
| end_market | 3 |

---

## 8. Generic slug 제거

Forbidden IDs (0 잔존): `product:item`, `product:product`, `component:item`, `technology:item`, `market:item` 등.  
`alias` 노드: **0**.

---

## 9. Cross-sector reference 4건

| ticker | target | owningSector |
|--------|--------|--------------|
| 077360 | sector:semiconductor | semiconductor |
| 011070 | sector:auto | auto |
| 192650 | sector:auto | auto |
| 049070 | sector:auto | auto |

- `status: reference` — business orphan·coverage 분모 **제외** (`excludesFromBusinessCoverage: true`)
- confirmed business **아님**
- duplicate business count **제외**

---

## 10. Business edge 0건 근거

| 유형 | 건수 | 이유 |
|------|------|------|
| supplies_* / manufactures_for | 0 | DART/KIND primary evidence 없음 |
| inferred supply | 0 | orphan padding 금지 |
| peer → business 승격 | 0 | peer는 defaultHidden, status `peer` |
| cross_sector → business | 0 | reference only |

**24 listed** 모두 structural edge(member_of, specializes_in, manufactures) 존재.  
`businessRelationOrphanCount`: 24 (intentional — classification-only until evidence).

---

## 11. Sparse graph 정책

- 86 nodes / 107 edges — 대부분 structural + hidden peer
- peer 25건 defaultHidden
- business direct-commercial: **0**
- 추정 공급관계 생성: **없음**
- orphan padding: **없음**

---

## 12. Orphan·coverage 정의

| metric | elec 값 |
|--------|---------|
| `classificationOnlyCompanyCount` | 24 |
| `businessRelationOrphanCount` | 24 |
| `peerOnlyCompanyCount` | 0 |
| 0분모 coverage | **N/A** (`applicable: false`, `displayValue: N/A`) |
| `crossSectorReferenceEvidenceCoverage` | 4/4 (reference edges only) |

cross_sector_reference는 business orphan 해소·supply coverage 분모에서 **제외**.

---

## 13. Zero-degree placeholder 정책

| node ID | type | zero-degree 이유 | UI | metrics | layout |
|---------|------|------------------|-----|---------|--------|
| `sector:powergrid` | cross_sector_anchor | powergrid 섹터 경계 placeholder, cross_sector edge 미연결 | anchor 노드 (edge 없음) | crossSectorReferenceNodeCount에 포함, business 분모 제외 | end_market lane |
| `sector:battery` | cross_sector_anchor | battery 섹터 경계 placeholder | 동일 | 동일 | 동일 |
| `end_market:industrial_electronics` | end_market | exposed_to 미연결 market bucket | end_market lane | marketNodeCount | sparse graph |

**검증 (역할 기반, ID 하드코딩 없음):**

- `entityRole === 'boundary_placeholder'`, 또는
- `type === 'cross_sector_anchor' && isMapConstituent === false`, 또는
- `type === 'end_market'` (unlinked market bucket)

**zeroDegreeNodeCount:** 3  
**허용 ID:** 위 3개 (역할 규칙으로 유도)

**향후 metal:** `entityRole=boundary_placeholder`, `defaultHidden`, `excludedFromCounts`, `excludedFromLayout` 노드 메타데이터 및 renderer 필터 권장. 이번 checkpoint는 가짜 edge 연결 **하지 않음**.

---

## 14. Readiness 계약 (공통)

`js/relation_network.js`:

| flag | 의미 |
|------|------|
| `dataLoaded` | fetch 완료 |
| `initialized` | nodes/edges 적용 |
| `urlStateApplied` | URL state 반영 |
| `firstRenderComplete` | 첫 renderGraph 완료 |
| `layoutReady` | initialized ∧ firstRenderComplete |

- `getReadiness()` API
- `whenReady()` → 20ms polling (waiter 큐 제거)
- `destroy()` 시 waiter reject 제거
- init 실패를 ready로 처리 **하지 않음**

`scripts/verify_relation_browser.mjs`:

- `waitForNetworkReady()` — layoutReady + whenReady
- timeout 무시 제거
- retry wrapper **없음** (`RN_TEST_RUNS` = suite 반복만)
- fixed sleep 증가 **없음**

**섹터별 hardcode 예외 없음** — 공통 계약.

---

## 15. Construction flake 원인·수정

| 원인 | 수정 |
|------|------|
| `waitForFunction` timeout `.catch(() => {})` 삼킴 | assertion 유지, waitForNetworkReady |
| `whenReady()` waiter race | polling whenReady |
| `initialized`만 확인 | firstRenderComplete + layoutReady |
| destroy waiter reject | sector 전환 안정화 |

---

## 16. Browser 반복 QA

| 실행 | failures |
|------|----------|
| construction `RN_TEST_ONLY=construction RN_TEST_RUNS=5` | **0** (5/5) |
| full matrix `RN_TEST_RUNS=3` | **0** (3/3) |

회귀 확인: construction, elec, auto, bigchip 000660, semiconductor 000660, bio mobile/en.

로그 `data/browser_stability_phase5c2.log` — **커밋 제외**.

---

## 17. Build / verify / idempotency

| 항목 | 결과 |
|------|------|
| `npm run build` ×2 | exit 0, 추가 diff 없음 |
| `elec.json` SHA256 | `FFD7980EE9E48409359C689C98A8C629CFAF4E89436B6FE00F8896DD3DFF27EE` |
| `verify:elec` | warnings **0** |
| `verify:construction` | warnings **0** |
| full `verify:relation-browser` | failures **0** |
| hub snapshot refresh | **미실행** |

---

## 18. Human review

1. DART primary source 기반 business edge — 0건 유지, defer
2. zero-degree placeholder 3 — 필요 시 cross_sector 또는 exposed_to 연결 (evidence 있을 때만)
3. `component:electronic_module` 공유 모니터링

---

## 19. Metal에서 재사용할 규칙

1. `migrate_*_network_phase*.mjs` + sector metrics module
2. cp_list → `krx:` only, mcap floor 3천억 (`MIN_MCAP_WON`)
3. `elec_product_canonical.mjs` 패턴 — ticker별 product map, generic slug 금지
4. structural vs business 분리, orphan padding 금지
5. cross_sector_reference — reference status, business 분모 제외
6. 0분모 coverage → N/A
7. readiness contract + full browser matrix before checkpoint
8. zero-degree — 역할 기반 verifier, placeholder 메타데이터
9. peer defaultHidden, business 승격 금지

---

## 20. 타 섹터 metrics-only 파생 (관계 의미 변경 없음)

| 파일 | 변경 |
|------|------|
| `data/networks/auto.json` | metrics.claimCoverage excludedRelationshipTypes 메타만 (+ elec edge types) |
| `data/networks/construction.json` | 동일 |
| `*_changelog.json` (auto, construction, finance, powergrid) | metrics snapshot rebuild |

nodes/edges/status/evidence/amount arrays — **edge 의미 diff 없음**.

---

## 21. 배포 전 체크리스트

- [ ] `npm run build` ×2 idempotent
- [ ] `verify:elec` + full `verify:relation-browser` failures 0
- [ ] elec.json hash stable
- [ ] cp_list 24 unchanged
- [ ] generic node 0
- [ ] no inferred supply edges
- [ ] hub snapshots intentional refresh only
- [ ] compliance review for investment content

---

## 22. 완료 보고서 참조

- [Phase 5C Elec completion](../reports/phase5c-electrical-completion.md)
- [Phase 5C.1 Elec curation](../reports/phase5c1-electrical-curation.md)
- [Phase 5C.2 Elec closure audit](../reports/phase5c2-electrical-closure-audit.md)

---

## 23. Checkpoint 커밋

**Message:** `feat: add electronics component relationship ecosystem`

**포함:** Phase 5C/5C.1/5C.2 elec 데이터, audit/changelog, migrate/curate/verify scripts, product canonical, elec metrics/profile/schema/validator, renderer/layout, rebuild wiring, readiness/browser QA, metrics-only 파생, 보고서·checkpoint 문서.

**제외:** hub snapshots, dist, node_modules, `.env`, `data/browser_stability_phase5c2.log`, 임시 probe, 사용자 변경.
