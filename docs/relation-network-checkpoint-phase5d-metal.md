# Relation Network — Phase 5D Metal Checkpoint

**As of:** 2026-08-23  
**Branch:** `codex/relation-network-phase4-checkpoint`  
**Base HEAD:** `1fb69f261e0d63c071c6a3109c1d3421b9845b21`  
**Scope:** Metals & materials value chain (`metal`) — Phase 5D  
**Deploy / push / PR:** not performed

---

## 1. Phase 5D 목적

철강·비철·트레이딩·금속제품·기계 섹터(`metal`)에 **원자재→가공→제품→수요** 가치사슬 관계 네트워크를 도입한다. HTML cp_list **19社** 기준으로 structural·peer·**commodity exposure**·**cross-sector reference**만 반영한다. DART/KIND 1차 출처 없는 **business/supply edge는 0건** 유지. **원자재 가격 노출을 공급계약으로 표현하지 않는다.**

---

## 2. 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`metal`** |
| HTML | `metal/korea_metal_map.html` |
| `data-sector` | `metal` |
| build | `scripts/build_korea_metal_map.mjs` → `METAL_CONFIG` |
| Network JSON | `data/networks/metal.json` |
| Profile | `lib/relation_network/profiles.mjs` → `metal` |
| Metrics | `lib/relation_network/metal_metrics.mjs` |
| Product canonical | `lib/relation_network/metal_product_canonical.mjs` |
| Browser layout | `js/relation_network.js` → `layoutMetalsValueChain()` |
| 이전 | `networkPath: null`, `materials_demand` / `layeredSupplyChain`, **legacyFallback** |
| 이후 | `../data/networks/metal.json`, **legacyFallback: false** |

---

## 3. cp_list 19와 SIMPAC 제외

| 항목 | 값 |
|------|-----|
| HTML listed (`extractCompaniesFromHtml`) | **19** |
| `METAL_CONFIG.companies` | **20** |
| config-only ticker | **009160** (SIMPAC) |
| 제외 사유 | KRX 시가총액 **3천억원 미만** mcap floor — map HTML cp_list에 미포함 |
| cp_list 변경 | **없음** (임의 추가·삭제 없음) |
| duplicate ticker | **0** |

**chain:** 철강 11 · 비철 4 · 트레이딩 1 · 산업기계 3

---

## 4. 기존 legacy 구조

| 항목 | Phase 5D 이전 |
|------|---------------|
| legacy partners | 20 문자열 (4 global: nippon_steel, arcelormittal, glencore, caterpillar) |
| structured JSON | 없음 |
| commodity/supply/customer 혼재 | partners + `layeredSupplyChain` |
| evidence gate | 없음 |

---

## 5. Model / layout / lanes

| 항목 | 값 |
|------|-----|
| `model` | `metals_material_value_chain` |
| `layout` | `metalsValueChainEcosystem` |
| lanes | `raw_material`, `smelting_refining`, `steelmaking`, `nonferrous_metal`, `rolling_processing`, `specialty_alloy`, `metal_products`, `recycling`, `distribution_trading`, `end_market` |

lane hub: `group:steelmaking`, `group:smelting_refining`, `group:nonferrous_metal`, `group:rolling_processing`, `group:specialty_alloy`, `group:distribution_trading`, `group:metal_products`

---

## 6. Canonical commodity / product 정책

| 유형 | ID 패턴 | metal count |
|------|---------|-------------|
| listed_company | `krx:{ticker}` | 19 |
| global_company | `global:{id}` | 4 |
| metal_product | `metal_product:{slug}` | 38 |
| commodity | `commodity:{slug}` | 3 (zinc, iron_ore, aluminium) |
| end_market | `end_market:{slug}` | 3 |
| business_category | `group:{lane}` | 7 |
| cross_sector_anchor | `sector:{id}` | 6 |

**Forbidden generic ID:** 0 (`metal_product:item`, `commodity:item` 등)  
**Library:** `lib/relation_network/metal_product_canonical.mjs` — 19 ticker 전수, ticker별 제품 차이 반영  
**공유 표준 product:** 동일 slug 중복 label 없음; 불필요 기업별 복제 없음  
**commodity vs metal_product:** `exposed_to_commodity` → commodity node; `specializes_in`/`produces` → metal_product node

---

## 7. 원료→가공→제품→수요시장 구조

| structural type | count | status |
|-----------------|-------|--------|
| member_of | 19 | reference (lane hub) |
| specializes_in | 19 | reference |
| produces | 19 | reference |
| exposed_to_commodity | 5 | reference (**가격·원가 노출**) |
| used_in_end_market | 5 | reference (수요 구조) |
| cross_sector_reference | 5 | reference |
| peer | 20 | peer, **defaultHidden** |

**structuralGeneratedEdgeCount:** 67

---

## 8. Commodity exposure와 공급계약 분리

| 구분 | edge type | business count | supply count |
|------|-----------|----------------|--------------|
| 원자재 노출 | `exposed_to_commodity` | **제외** (`status: reference`, `excludesFromBusinessCoverage: true`) | **0** |
| 공급계약 | `supplies_material_to` 등 | **0** | **0** |

commodity exposure tickers: 010130/000670 (zinc), 047050/004020 (iron_ore), 006110 (aluminium)

**commodityExposureEvidenceCoverage:** 5/5 (classification evidence, not business)

---

## 9. Cross-sector reference 5건

| ticker | target | owningSector |
|--------|--------|--------------|
| 006110 | sector:battery | battery |
| 004020 | sector:auto | auto |
| 306200 | sector:ship | ship |
| 460860 | sector:construction | construction |
| 295310 | sector:semiconductor | semiconductor |

**Metadata (each edge):**
- `crossSectorReference: true`
- `referencedBySectors: ['metal']`
- `owningSector` (target sector id)
- `excludesFromBusinessCoverage: true`
- `duplicateBusinessCountExcluded: true`
- `status: reference` — confirmed/reported **아님**

**Note:** `excludesFromOrphanResolution`는 elec 5C.1 curate와 동일 필드로 향후 5D.1에서 추가 가능. 현재 `orphan_metrics.mjs`는 `cross_sector_reference`를 structural/DIRECT_RELATION 제외로 orphan 해소에 사용하지 않음.

타 섹터 business edge **자동 생성 없음**.

---

## 10. Business edge 0건 근거

| 유형 | 건수 | 이유 |
|------|------|------|
| supplies_* / offtake / contract | 0 | DART/KIND primary evidence 없음 |
| inferred supply | 0 | orphan padding 금지 |
| commodity → supply 승격 | 0 | 정책 금지 |
| peer → business | 0 | defaultHidden, status `peer` |

**businessRelationOrphanCount:** 19 (intentional until evidence)

---

## 11. Sparse graph 정책

- 80 nodes / 92 edges — structural + hidden peer
- business direct-commercial: **0**
- facility/mine nodes: **0** (evidence 없음, Phase 5D)
- 추정 공급관계: **없음**

---

## 12. Orphan·coverage

| metric | value |
|--------|-------|
| `classificationOnlyCompanyCount` | 9 |
| `businessRelationOrphanCount` | 19 |
| 0분모 business/supply/ownership coverage | **N/A** (`applicable: false`, `displayValue: N/A`, `percentage: null`) |
| `commodityExposureEvidenceCoverage` | 5/5 |
| `crossSectorReferenceEvidenceCoverage` | 5/5 |

cross_sector_reference·exposed_to_commodity는 business/supply coverage 분모 **제외**.

---

## 13. Zero-degree placeholder 정책

| node ID | type | metadata |
|---------|------|----------|
| `sector:powergrid` | cross_sector_anchor | `entityRole=boundary_placeholder`, `defaultHidden=true`, `excludedFromCounts=true`, `excludedFromLayout=true` |
| `end_market:industrial_machinery` | end_market | 동일 |

**zeroDegreeNodeCount:** 2  
**검증:** 역할 기반 (`verify_metal_relation_network.mjs`) — ID 하드코딩 없음  
**renderer:** `excludedFromLayout === true` → `layoutMetalsValueChain` 제외

가짜 edge 연결 **없음**.

---

## 14. UI·URL·모바일

- 기존 RN UI 재사용, 신규 UI 기능 **없음**
- URL ticker → `krx:{ticker}` resolve (공통 contract)
- peer/inferred/ended 기본 숨김 (`defaultViewFilters`)
- readiness: `dataLoaded` → `initialized` → `urlStateApplied` → `firstRenderComplete` → `layoutReady` (Phase 5C 계약 유지)

---

## 15. Build / verify / browser (checkpoint 시점)

| 항목 | 결과 |
|------|------|
| `npm run build` ×2 | exit 0, metal hash idempotent |
| `verify:metal` | warnings **0** |
| `verify:elec` / `verify:construction` | warnings **0** |
| full `verify:relation-browser` | failures **0** |
| hub snapshot refresh | **미실행** |

---

## 16. Idempotency

`metal.json` SHA256: `D8823EC2044E975D831942584A4445AF3BC5C3BE30F6DD3D957AA408242F1A34`

**nodes/edges:** 80 / 92 · **listedCompanyCount:** 19

---

## 17. Human review

1. DART 단일판매·공급계약 기반 supply/offtake (0건 유지)
2. 시설·광산 — evidence 확보 시 최대 6개
3. `excludesFromOrphanResolution` on cross-sector (5D.1 curate 후보)
4. 009160 SIMPAC — mcap floor 정책 유지

---

## 18. 다음 섹터에서 재사용할 규칙

1. `migrate_*_network_phase*.mjs` + sector metrics + product canonical
2. cp_list = HTML extract; config-only tickers 문서화
3. `exposed_to_commodity` ≠ `supplies_material_to`
4. cross_sector_reference — reference only, business 분모 제외
5. peer defaultHidden; orphan padding 금지
6. zero-degree — `entityRole=boundary_placeholder` + role-based verifier
7. 0분모 coverage → N/A
8. full browser matrix before checkpoint

---

## 19. 타 섹터 metrics-only / 관계 변경

**nodes/edges/status/evidence/amount:** elec, auto, construction 등 **변경 없음** (metal 전용 + 공통 schema/profile/validator/renderer만)

---

## 20. 배포 전 체크리스트

- [ ] `npm run build` ×2 idempotent
- [ ] `verify:metal` + full browser failures 0
- [ ] metal.json hash stable
- [ ] cp_list 19 unchanged
- [ ] generic ID 0
- [ ] commodity exposure ∉ business count
- [ ] hub snapshots intentional refresh only

---

## 21. 완료 보고서 참조

- [Phase 5D Metal completion](../reports/phase5d-metal-completion.md)

---

## 22. Checkpoint 커밋

**Message:** `feat: add metals material relationship ecosystem`

**포함:** metal network, audit/changelog, scripts, metrics, canonical, schema/profile/validator, layout, rebuild wiring, reports, checkpoint doc.

**제외:** hub_index/sitemap builtAt-only, dist, browser logs, 타 섹터 network JSON.
