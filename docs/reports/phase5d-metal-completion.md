# Phase 5D — Metal(철강·금속·기계) 관계 네트워크 감사·설계·구현 보고서

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**시작 HEAD:** `1fb69f261e0d63c071c6a3109c1d3421b9845b21`  
**작업자:** editorial_phase5d  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| 시작 HEAD | `1fb69f261e0d63c071c6a3109c1d3421b9845b21` |
| Phase 5C checkpoint | 존재 |
| 시작 git status | clean (browser log 1건 untracked) |

---

## 2. untracked 로그 처리 결과

| 파일 | 처리 |
|------|------|
| `data/browser_stability_phase5c2.log` | **삭제** — Phase 5C.2 browser 반복 로그, source data 아님, checkpoint 문서·보고서에 기록됨 |

삭제 후 `git status --short`: **empty (clean)**

---

## 3. metal 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`metal`** |
| HTML | `metal/korea_metal_map.html` |
| `data-sector` | `metal` |
| build | `scripts/build_korea_metal_map.mjs` → `METAL_CONFIG` |
| Network JSON | `data/networks/metal.json` |
| profile | `lib/relation_network/profiles.mjs` → `metal` |
| 이전 | `networkPath: null`, `materials_demand` / `layeredSupplyChain`, **legacyFallback** |
| 이후 | `../data/networks/metal.json`, `metals_material_value_chain` / `metalsValueChainEcosystem`, **legacyFallback: false** |

---

## 4. 기존 구조 감사

| 항목 | Phase 5D 이전 |
|------|---------------|
| legacy partners force graph | 20 partner 문자열 (4 global peer) |
| structured JSON | 없음 |
| supply/customer/commodity 혼재 | partners + legacy layeredSupplyChain |
| evidence gate | 없음 |

감사 산출: `data/metal_relation_phase5d_audit.json`, `scripts/audit_metal_phase5d.mjs`

---

## 5. cp_list·ticker·chain

| 항목 | 값 |
|------|-----|
| HTML listed (cp_list) | **19** |
| METAL_CONFIG | 20 (009160 SIMPAC — mcap floor 미포함, HTML absent) |
| duplicate ticker | **0** |
| cp_list 변경 | **없음** |

| chain | count |
|-------|-------|
| 철강 | 11 |
| 비철 | 4 |
| 철강 트레이딩 | 1 |
| 산업기계 | 3 |

---

## 6. legacy 관계 분류

| 분류 | count | 설명 |
|------|-------|------|
| **peer** | 20 | nippon_steel, arcelormittal, glencore, caterpillar — 동종 글로벌 peer |
| structural | 0 (legacy) | map semType/products에서 Phase 5D 생성 |
| business | 0 | URL/DART 근거 없음 |
| inferred | 0 | 생성하지 않음 |

---

## 7. 제거·강등·숨김

| action | count |
|--------|-------|
| legacy partner → **peer** (defaultHidden) | 20 |
| invented supply | 0 |
| commodity exposure → business 승격 | 0 |
| confirmed business | 0 |

---

## 8. 인접 섹터 경계

| ticker | target | owningSector | 이유 |
|--------|--------|--------------|------|
| 006110 | sector:battery | battery | 배터리용 알루미늄 압연재 |
| 004020 | sector:auto | auto | 자동차강판·일관제철 |
| 306200 | sector:ship | ship | 에너지·구조용 강관 |
| 460860 | sector:construction | construction | 철근·형강 |
| 295310 | sector:semiconductor | semiconductor | 반도체용 고순도 특수금속 |

정책: `status: reference`, `excludesFromBusinessCoverage: true`, business orphan 미해소.

---

## 9. canonical entity·제품

| 유형 | ID 패턴 | count |
|------|---------|-------|
| listed_company | `krx:{ticker}` | 19 |
| global_company | `global:{id}` | 4 |
| metal_product | `metal_product:{slug}` | 38 |
| commodity | `commodity:{slug}` | 3 (zinc, iron_ore, aluminium) |
| end_market | `end_market:{slug}` | 3 |
| business_category | `group:{lane}` | 7 |
| cross_sector_anchor | `sector:{id}` | 6 |

**generic ID:** 0 (`metal_product:item`, `commodity:item` 등 forbidden)  
**canonical library:** `lib/relation_network/metal_product_canonical.mjs` (19 ticker 전수)

---

## 10. model/layout/lane

| 항목 | 값 |
|------|-----|
| model | `metals_material_value_chain` |
| layout | `metalsValueChainEcosystem` |
| lanes | raw_material, smelting_refining, steelmaking, nonferrous_metal, rolling_processing, specialty_alloy, metal_products, distribution_trading, end_market (+ recycling reserved) |

UI: `js/relation_network.js` — `layoutMetalsValueChain()`, `inferMetalLane()`, `excludedFromLayout` placeholder 제외.

---

## 11. 구조 관계

| type | count | status |
|------|-------|--------|
| member_of | 19 | reference |
| specializes_in | 19 | reference |
| produces | 19 | reference |
| exposed_to_commodity | 5 | reference (가격·원가 노출, **공급 아님**) |
| used_in_end_market | 5 | reference (수요 구조, **고객 공급 아님**) |
| cross_sector_reference | 5 | reference |

**structuralGeneratedEdgeCount:** 67

---

## 12. commodity 노출

| ticker | commodity | 의미 |
|--------|-----------|------|
| 010130, 000670 | zinc | 제련 원가·가격 노출 |
| 047050, 004020 | iron_ore | 원료·트레이딩 노출 |
| 006110 | aluminium | 비철 압연 원가 노출 |

**commodity 노출을 supplies_material_to로 표현하지 않음.** `excludesFromBusinessCoverage: true` on structural commodity edges.

---

## 13. 실제 공급·offtake

| type | confirmed | reported |
|------|-----------|----------|
| supplies_* / offtake / contract | 0 | 0 |

DART/KIND primary evidence 없이 생성하지 않음.

---

## 14. 지분·JV

| type | count |
|------|-------|
| owns / owns_stake_in / JV | 0 |

---

## 15. 시설·광산·capacity

| 항목 | count |
|------|-------|
| facility / mine nodes | 0 |
| owns_facility / operates_facility | 0 |

Phase 5D: 시설 노드 미생성 (evidence 없음). 향후 DART/사업보고서 근거 시 최대 6개 선별 큐레이션.

---

## 16. cross-sector reference

5건 (§8). business count·orphan 해소에서 **제외**.

---

## 17. status별 edge 수

| status | count |
|--------|-------|
| reference | 72 |
| peer | 20 |

---

## 18. business 관계 수

| metric | value |
|--------|-------|
| confirmedBusinessEdgeCount | 0 |
| reportedBusinessEdgeCount | 0 |
| supplyRelationshipCount | 0 |
| offtakeAgreementCount | 0 |

---

## 19. coverage와 분모

| metric | result |
|--------|--------|
| businessRelationship* | N/A (0분모) |
| supply* | N/A |
| ownership* | N/A |
| commodityExposureEvidenceCoverage | 5/5 (100%) |
| crossSectorReferenceEvidenceCoverage | 5/5 (100%) |

---

## 20. orphan·zero-degree 지표

| metric | value |
|--------|-------|
| businessRelationOrphanCount | 19 (intentional) |
| classificationOnlyCompanyCount | 9 |
| zeroDegreeNodeCount | 2 |
| zero-degree 허용 | `sector:powergrid`, `end_market:industrial_machinery` (boundary_placeholder, excludedFromLayout) |

---

## 21. validator

Metal 전용 검증: `lib/relation_network/validate.mjs` (sectorKey === 'metal')  
- generic ID fail  
- commodity exposure as business fail  
- peer defaultHidden fail  
- cross_sector business 승격 fail  
- 0/0 coverage fail  

`npm run verify:metal`: **warnings 0**

---

## 22. UI·URL·모바일

- 기존 RN UI 재사용 (`relation_network.js`, legacy fallback 제거)
- layout: lane column (`metalsValueChainEcosystem`)
- URL ticker: `krx:{ticker}` resolve (공통 `resolveNodeFromUrlTicker`)
- peer/inferred/ended 기본 숨김 (profile defaultViewFilters)
- 신규 UI 기능 추가 없음

---

## 23. 수정·생성 파일

### 신규
- `data/networks/metal.json`
- `data/metal_relation_phase5d_audit.json`
- `data/metal_relation_phase5d_changelog.json`
- `scripts/audit_metal_phase5d.mjs`
- `scripts/migrate_metal_network_phase5d.mjs`
- `scripts/verify_metal_relation_network.mjs`
- `lib/relation_network/metal_metrics.mjs`
- `lib/relation_network/metal_product_canonical.mjs`
- `docs/reports/phase5d-metal-completion.md`

### 수정 (metal 지원, elec/타 섹터 JSON 미변경)
- `lib/relation_network/profiles.mjs`
- `lib/relation_network/schema.mjs`
- `lib/relation_network/validate.mjs`
- `js/relation_network.js` (layoutMetalsValueChain, excludedFromLayout)
- `js/network_profiles.js` (rebuild emit)
- `scripts/rebuild_site.mjs`
- `scripts/verify_relation_network.mjs`
- `package.json`

---

## 24. build/verify

| command | exit |
|---------|------|
| npm run build ×2 | 0 |
| verify:relation-network | 0 |
| verify:metal | 0, warnings 0 |
| verify:elec | 0, warnings 0 |
| verify:construction | 0, warnings 0 |
| verify:auto … verify:data-sector-profile | 0 |
| verify:relation-browser | failures **0** (~544s) |

---

## 25. idempotency

`metal.json` SHA256 (build×2 동일):  
`D8823EC2044E975D831942584A4445AF3BC5C3BE30F6DD3D957AA408242F1A34`

**nodes/edges:** 80 / 92  
**listedCompanyCount:** 19 유지

---

## 26. 타 섹터 회귀

- `elec.json`, `auto.json`, `construction.json` — **diff 없음** (관계 의미 변경 없음)
- elec/construction/auto browser 회귀 — failures 0
- hub_index.json — build `builtAt` 갱신만; **커밋/restore 제외** (snapshot refresh 미실행)

---

## 27. 남은 human review

1. DART 단일판매·공급계약 기반 supplies/offtake 큐레이션 (0건 유지)
2. 시설·광산 노드 — evidence 확보 시 최대 6개
3. 009160 SIMPAC — mcap floor로 map 미포함; config-only tickers 정책 유지
4. `sector:powergrid` placeholder — 향후 copper/powergrid cross-sector 검토

---

## 28. Phase 5D 종료 가능 여부

**가능** — 19 listed, generic 0, business 0, commodity≠supply, browser stable, idempotent build.

---

## 29. checkpoint 가능 여부

**가능** (별도 checkpoint 지시 시) — verify 전수 통과, metal warnings 0.

---

## 30. 다음 섹터 진입 가능 여부

**가능** — metal Phase 5D 패턴·readiness·browser QA 재사용.

---

## 명시 사항

- **신규 상장사 추가:** 없음  
- **cp_list 변경:** 없음 (19 HTML listed 유지)  
- **추정 공급관계 생성:** 없음  
- **commodity 노출을 계약으로 사용:** 없음 (`exposed_to_commodity` only, reference status)  
- **orphan padding:** 없음  
- **타 섹터 관계 의미 변경:** 없음  
- **refresh:hub-snapshots:** 미실행  
- **배포/commit/push/PR:** 미실행  
