# Phase 5C.1 — Elec 제품 Canonical 교정 및 공식 사업 관계 최소 큐레이션 보고서

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**base HEAD:** `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b`  
**작업자:** editorial_phase5c1  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| HEAD | `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b` (미커밋 Phase 5C+5C.1 누적) |
| 시작 verify:elec | OK (Phase 5C baseline) |
| Phase 5C 미커밋 | 보존·확장 |

---

## 2. Phase 5C 미커밋 변경 분류

| 분류 | 파일 |
|------|------|
| **Phase 5C/5C.1 elec 전용** | `data/networks/elec.json`, migrate/curate/verify/audit scripts, `elec_metrics.mjs`, `elec_product_canonical.mjs`, changelogs, audit JSON |
| **elec 지원 공통** | `profiles.mjs`, `schema.mjs`, `validate.mjs`, `orphan_metrics.mjs`, `relation_network.js`, `rebuild_site.mjs`, `package.json` |
| **metrics-only rebuild** | `data/networks/auto.json`, `data/networks/construction.json`, `*_changelog.json` (orphan metric meta만) |
| **elec 무관** | 수정하지 않음 (edge 의미 변경 없음) |

---

## 3. 24개 기업·제품 감사

전수 감사표: `data/elec_product_audit_phase5c1.json`

| chain | count | canonical product 예 |
|-------|-------|---------------------|
| 전자부품 | 14 | `product:mlcc_camera_substrate`, `product:fpcb`, `product:solder_packaging_materials` … |
| 가전 | 4 | `product:home_appliances_tv_auto`, `product:environmental_appliances_rental` … |
| 카메라·모듈 | 4 | `product:camera_module_auto_electronics`, `product:camera_cover_glass` … |
| 디스플레이 | 2 | `product:oled_display_panel`, `product:oled_deposition_equipment` |

- cp_list/ticker: **24 유지**
- generic ID 잔존: **0**
- duplicate product node: **0**

---

## 4. generic product ID 목록 (Phase 5C 이전)

| forbidden ID | 문제 |
|--------------|------|
| `product:item` | 15+ 기업이 서로 다른 semType label 공유 |
| `component:item` | 동일 |
| `product:tv` | LG전자 semType slug 오류 |
| `product:oled` / `component:tv` | LG디스플레이 component label 불일치 |
| `product:ems` | 솔루엠·인탑스 중복 generic |
| `component:oled` | 선익시스템 — 증착**기** vs 패널 혼동 |

원인: `slugToken()`이 한글 semType에서 빈 문자열 → `item` fallback.

---

## 5. canonical 교정 목록 (요약)

| ticker | before (product) | after (product) | after (component) |
|--------|------------------|-----------------|-------------------|
| 009150 | product:mlcc | product:mlcc_camera_substrate | component:mlcc |
| 066570 | product:tv | product:home_appliances_tv_auto | component:home_appliances |
| 011070 | product:item | product:camera_module_auto_electronics | component:smartphone_camera_module |
| 034220 | product:oled | product:oled_display_panel | component:oled_panel |
| 248070 | product:ems | product:power_module_esl_ems | component:power_module |
| 049070 | product:ems | product:electronics_ems_intops | component:ems_assembly |
| 171090 | product:oled (장비) | product:oled_deposition_equipment | component:oled_evaporator |
| … | (전 24 ticker) | `lib/relation_network/elec_product_canonical.mjs` 참조 | |

---

## 6. 제거·강등 제품

| action | count |
|--------|-------|
| `product:item` / `component:item` 제거 | 2 orphan node |
| generic → 구체 ID 교체 | 24 ticker 전수 |
| business_category 강등 | 0 (lane hub `group:*` 유지) |
| defaultHidden reference | 0 |

---

## 7. cross-sector reference 4건 감사

| ticker | target | primary role (elec) | owningSector | duplicateBusinessCountExcluded |
|--------|--------|---------------------|--------------|--------------------------------|
| 077360 | sector:semiconductor | 패키징 솔더·소재 | semiconductor | yes |
| 011070 | sector:auto | 카메라모듈·차량 전장 | auto | yes |
| 192650 | sector:auto | 카메라·생체인증 모듈 | auto | yes |
| 049070 | sector:auto | EMS·자동차 모듈 | auto | yes |

정책 적용:
- `status: reference` (business 아님)
- `excludesFromBusinessCoverage: true`
- `excludesFromOrphanResolution: true`
- `duplicateBusinessCountExcluded: true`
- sector anchor (`sector:*`)만 target — 특정 기업 node 아님
- **승격 없음** (cross_sector → supplies_* 변환 0)

---

## 8. 조사한 business 후보

| candidateId | source | target | decision | reason |
|-------------|--------|--------|----------|--------|
| supply-semco-anonymous-oem | 009150 | anonymous | **deferred** | DART 단일판매·공급계약 exact counterparty 미개봉 |
| supply-lginnotek-oem | 011070 | anonymous | **deferred** | auto overlap; OEM DART contract 미개봉 |
| supply-duksan-semi-packaging | 077360 | semiconductor | **rejected** | semi 섹터 공급망 중복 |

---

## 9–12. 수락한 관계

| 유형 | count |
|------|-------|
| 공급·제조 | **0** |
| 지분 | **0** |
| JV/공동개발 | **0** |
| 제품·기기 채택 | **0** |

추정 공급 생성: **없음**. 0건 유지가 정상.

---

## 13. rejected/deferred 후보

- deferred 2: anonymous OEM — DART primary source 필요
- rejected 1: 077360 → semi packaging supply (cross-sector duplicate)

---

## 14. status별 edge 수

| status | count |
|--------|-------|
| reference | 82 |
| peer | 25 |
| confirmed | 0 |
| reported | 0 |

---

## 15. business edge 수

| metric | Phase 5C | Phase 5C.1 |
|--------|----------|------------|
| nodes/edges | 56/105 | **86/107** |
| confirmedBusiness | 0 | 0 |
| cross_sector_reference | 4 | 4 |
| product nodes | ~17 generic | **24 unique** |

---

## 16. coverage와 분모

| metric | numerator | denominator | display |
|--------|-----------|-------------|---------|
| businessRelationshipDirectEvidence | 0 | 0 | N/A |
| supplyDirectEvidence | 0 | 0 | N/A |
| ownershipDirectEvidence | 0 | 0 | N/A |
| deviceAdoptionDirectEvidence | 0 | 0 | N/A |
| **crossSectorReferenceEvidence** | **4** | **4** | **100%** |

0분모 → N/A (100% 오표시 없음).

---

## 17. orphan 지표

| metric | value | company IDs |
|--------|-------|-------------|
| listedCompanyCount | 24 | — |
| businessRelationOrphanCount | 24 | 전체 (의도적) |
| directCommercialRelationshipOrphanCount | 24 | 전체 |
| classificationOnlyCompanyCount | 24 | 전체 |
| hasPeerButNoBusinessCompanyCount | 24 | 전체 |
| **crossSectorReferenceOnlyCompanyCount** | **4** | 077360, 011070, 192650, 049070 |
| peerOnlyCompanyCount | 0 | — |

cross_sector_reference는 orphan 해소 **하지 않음**.

---

## 18. validator 변경

- `product:item` 등 forbidden ID → **fail**
- 동일 generic ID + 상이 label → **fail**
- cross_sector_reference `excludesFromBusinessCoverage` 미설정 → **warn** (curate 후 0)
- supplies_* claimSupport 누락 → **fail**
- cross_sector confirmed 승격 → **fail**

---

## 19. UI·URL·모바일 QA

| 항목 | 결과 |
|------|------|
| generic label → 구체 제품명 | graph 노드 label 갱신 |
| product/category/end_market 구분 | layout lanes 유지 |
| cross-sector ≠ 공급관계 | reference 스타일 |
| `verify:relation-browser` | **failures: 0** (2회차; 1회차 construction flake) |
| auto / bigchip 000660 / semi 000660 / bio / construction / finance / powergrid | 회귀 없음 |

---

## 20. 수정·생성 파일

### 신규 (5C.1)
- `lib/relation_network/elec_product_canonical.mjs`
- `scripts/curate_elec_relationships_phase5c1.mjs`
- `data/elec_relation_phase5c1_changelog.json`
- `data/elec_product_audit_phase5c1.json`
- `docs/reports/phase5c1-electrical-curation.md`

### 수정 (5C.1)
- `scripts/migrate_elec_network_phase5c.mjs` — canonical map 사용
- `lib/relation_network/validate.mjs` — generic ID validator
- `lib/relation_network/elec_metrics.mjs` — crossSector metrics
- `scripts/rebuild_site.mjs` — curate 5C.1 연결

---

## 21. build/verify 결과

| command | exit |
|---------|------|
| `npm run build` ×2 | 0 |
| `npm run verify:elec` | 0, warnings 0 |
| `npm run verify:relation-network` | 0 |
| `npm run verify:relation-browser` | 0 |
| auto, construction, renewable, nuclear, powergrid, finance, ship, battery, bigchip, semi, nav-tab, data-sector | 0 |

---

## 22. idempotency

| item | value |
|------|-------|
| elec.json SHA256 (build×2) | `FFD7980EE9E48409359C689C98A8C629CFAF4E89436B6FE00F8896DD3DFF27EE` |
| 결과 | **IDEMPOTENT OK** |

---

## 23. 다른 섹터 회귀

- Auto Phase 5B checkpoint: OK
- bio pipeline: OK
- 다른 섹터 edge 의미: 변경 없음

---

## 24. 남은 human review

1. DART 단일판매·공급계약 개봉 후 anonymous → exact counterparty 승격 (009150 MLCC, 011070 camera module 등)
2. 077360 semi packaging — semi 섹터와 역할 분담 유지
3. company IR URL을 product node provenance.url에 연결 (현재 ELEC_CONFIG title only)

---

## 25. elec 종료 가능 여부

**가능** — generic product 0, cross-sector metadata 완료, validator/coverage/idempotency 충족. Business edge 0은 evidence 정책상 정상.

---

## 26. checkpoint 가능 여부

**가능** — full browser failures 0, elec warnings 0.

---

## 27. metal 진입 가능 여부

**가능** — elec canonical/curation 패턴 확립. metal은 `networkPath: null` legacy fallback 상태.

---

## 필수 명시

| 항목 | 값 |
|------|-----|
| 신규 상장사 | **없음** |
| cp_list 변경 | **없음** |
| 추정 공급관계 | **없음** |
| orphan padding | **없음** |
| cross-sector 중복 집계 | **없음** |
| refresh:hub-snapshots | **없음** |
| 배포/commit/push/PR | **없음** |
