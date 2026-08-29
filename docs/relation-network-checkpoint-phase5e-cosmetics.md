# Relation Network — Phase 5E Cosmetics Checkpoint

**As of:** 2026-08-29  
**Branch:** `codex/relation-network-phase4-checkpoint`  
**Base HEAD:** `c0221f46e7b8bbce952facfcf87b4a7022ffc688`  
**Scope:** Cosmetics & aesthetic devices (`cosmetics`) — Phase 5E  
**Checkpoint status:** **conditional approve** (see §17 / §22)  
**Deploy / push / PR:** not performed

---

## 1. Phase 5E 목적

화장품·미용기기 섹터(`cosmetics`)에 **브랜드·ODM/OEM·유통·미용기기** 가치사슬 관계 네트워크를 도입한다. HTML cp_list **15社** 기준으로 structural·peer·**cross-sector reference**만 반영한다. DART/KIND 1차 출처 없는 **business/ODM customer/distribution edge는 0건** 유지. **브랜드와 법적 회사를 분리**하고, **ODM structural을 고객 계약으로 표현하지 않는다.**

---

## 2. 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`cosmetics`** |
| HTML | `cosmetics/korea_cosmetics_map.html` |
| `data-sector` | `cosmetics` |
| build | `build_korea_cosmetics_map.mjs` → `scripts/split_kconsume_cosmetics.mjs` |
| Network JSON | `data/networks/cosmetics.json` |
| Profile | `lib/relation_network/profiles.mjs` → `cosmetics` |
| Metrics | `lib/relation_network/cosmetics_metrics.mjs` |
| Brand canonical | `lib/relation_network/cosmetics_brand_canonical.mjs` |
| Browser layout | `js/relation_network.js` → `layoutBeautyValueChain()` |
| 이전 | `networkPath: null`, `brand_odm` / `platformEcosystem`, **legacyFallback** |
| 이후 | `../data/networks/cosmetics.json`, **legacyFallback: false** |

---

## 3. cp_list 15

| 항목 | 값 |
|------|-----|
| HTML listed (`extractCompaniesFromHtml`) | **15** |
| cp_list 변경 | **없음** |
| duplicate ticker | **0** |

**chain:** 브랜드 6 · 미용기기 5 · ODM·OEM 3 · 유통·채널 1 · 원료 0 · 용기 0

---

## 4. 기존 legacy 구조

| 항목 | Phase 5E 이전 |
|------|---------------|
| legacy partners | Hugel 4건 (`glob_isrg`, `glob_mdt`, `glob_syk`, `glob_veev`) |
| structured JSON | 없음 |
| brand/supply/customer 혼재 | partners 문자열 + kconsume 템플릿 globalCompanies |
| evidence gate | 없음 |

---

## 5. Model / layout / lanes

| 항목 | 값 |
|------|-----|
| `model` | `beauty_brand_manufacturing_distribution_ecosystem` |
| `layout` | `beautyValueChainEcosystem` |
| lanes (populated) | `brand_owner`, `odm_oem`, `beauty_device`, `distributor` |

lane hub: `group:brand_owner`, `group:odm_oem`, `group:beauty_device`, `group:distributor`

**미생성 lane:** ingredient, formulation_rnd, packaging, retail_channel, digital_commerce, export_market (cp_list 빈 chain)

---

## 6. 회사와 브랜드 분리 정책

| 규칙 | 구현 |
|------|------|
| 상장 법인 | `krx:{ticker}` — `type: listed_company` |
| 브랜드 | `brand:{slug}` — `type: brand` (별도 node) |
| 브랜드를 legal counterparty로 사용 | **금지** — validator fail |
| 브랜드 홈페이지만으로 소유권 확정 | **금지** — `operates_brand` reference only |

---

## 7. operates_brand vs owns_brand

| type | count | status | metrics |
|------|-------|--------|---------|
| `operates_brand` | 10 | reference (structural) | `operatedBrandRelationshipCount` |
| `owns_brand` | 0 | DART/상표권 미검증 — 미생성 | `ownedBrandRelationshipCount` |
| `licenses_brand` | 0 | — | `licensedBrandRelationshipCount` |

**집계 분리:** metrics에서 owned/operated/licensed 각각 카운트. operated를 owned로 합산하지 않음.

002790 Amorepacific Holdings: 브랜드 edge 없음 — holding structure `specializes_in` only.

---

## 8. 브랜드 canonical 정책

- ticker당 핵심 브랜드 **최대 3개**
- 한글·영문 alias는 단일 canonical ID
- generic ID (`brand:item` 등) **0건**
- ended/divested 브랜드 active 표시 **없음**
- checkpoint에서 신규 evidence 조사·승격 **없음**

---

## 9. 브랜드 10개 전수

| brand ID | label (KO/EN) | source company | relation | legal ownership | active |
|----------|---------------|----------------|----------|-----------------|--------|
| `brand:medicube` | 메디큐브 / Medicube | krx:278470 APR | operates_brand | 미확인 | active (structural) |
| `brand:apr` | APR / APR | krx:278470 | operates_brand | 미확인 | active |
| `brand:laneige` | 라네즈 / Laneige | krx:090430 | operates_brand | 미확인 | active |
| `brand:sulwhasoo` | 설화수 / Sulwhasoo | krx:090430 | operates_brand | 미확인 | active |
| `brand:innisfree` | 이니스프리 / innisfree | krx:090430 | operates_brand | 미확인 | active |
| `brand:whoo` | 후 / The History of Whoo | krx:051900 | operates_brand | 미확인 | active |
| `brand:ohui` | 오휘 / O HUI | krx:051900 | operates_brand | 미확인 | active |
| `brand:sum37` | 숨37 / su:m37° | krx:051900 | operates_brand | 미확인 | active |
| `brand:dalba` | 달바 / d'Alba | krx:483650 | operates_brand | 미확인 | active |
| `brand:vt` | VT / VT Cosmetics | krx:018290 | operates_brand | 미확인 | active |

provenance: `map_fields` / `editorial_structure` — `reviewStatus: needs_human_review`

---

## 10. ODM/OEM structural vs 실제 고객계약

| type | count | status | meaning |
|------|-------|--------|---------|
| `provides_odm` (structural) | 3 | reference | Kolmar, Cosmax, Cosmecca 서비스 역할 분류 |
| `provides_odm_for` / `manufactures_for` (business) | 0 | — | anonymous/exact 고객 추정 없음 |

shared node: `manufacturing_service:cosmetics_odm`

---

## 11. business edge 0건의 이유

Phase 5E는 DART/KIND/양 당사자 공식 발표 없이 다음을 생성하지 않는다.

- ODM/OEM 고객 (`manufactures_for`, `provides_odm_for`)
- 유통·독점 계약 (`distributes_for`, `exclusive_distributor_for`)
- 지분·M&A (`owns_stake_in`, `acquired`)
- 시장 노출→계약 (`exposed_to_market` as business)
- 광고모델 (`endorses_brand`)

---

## 12. cross-sector reference 5건

| ticker | company | target | owningSector | reason |
|--------|---------|--------|--------------|--------|
| 145020 | Hugel | sector:medtech | medtech | 보툴리눔·필러 에스테틱 의료 |
| 214150 | Classys | sector:medtech | medtech | HIFU·RF 의료기기 |
| 214450 | Pharmaresearch | sector:medtech | medtech | primary medtech sector |
| 336570 | Wontech | sector:medtech | medtech | 레이저·에스테틱 기기 |
| 214370 | Caregen | sector:bio | bio | 펩타이드·바이오 원료 |

metadata (all 5): `crossSectorReference: true`, `referencedBySectors: ['cosmetics']`, `duplicateBusinessCountExcluded: true`, `excludesFromBusinessCoverage: true`, `excludesFromOrphanResolution: true`, `status: reference`

medtech/bio JSON에 대응 edge 자동 추가 **없음**.

---

## 13. empty lane 미생성 정책

| 항목 | 값 |
|------|-----|
| ingredient lane hub | **미생성** |
| packaging lane hub | **미생성** |
| 빈 lane node | **0** |
| zero-degree 일반 node | **0** |
| placeholder | cross_sector_anchor 2건 (`entityRole: boundary_placeholder`, excludedFromLayout) |

---

## 14. orphan·coverage

| metric | value |
|--------|-------|
| businessRelationOrphanCount | 15 (intentional) |
| orphan padding | 0 |
| businessRelationship* coverage | N/A (0분모) |
| odmDirectEvidenceCoverage | N/A |
| brandOwnershipDirectEvidenceCoverage | 10/10 structural classification |
| crossSectorReferenceEvidenceCoverage | 5/5 |

---

## 15. schema duplicate key 교정

Phase 5E에서 `lib/relation_network/schema.mjs` **SECTOR_EDGE_TYPES** 내 legacy duplicate `cosmetics` key 제거.

| 검증 | 결과 |
|------|------|
| cosmetics sector 정의 | **1개** (`grep` line 348 only) |
| legacy key (`odm_for`, `brand_owner` …) | **제거됨** |
| 신규 edge types | `operates_brand`, `provides_odm`, `cross_sector_reference` 등 포함 |
| networkPath | `../data/networks/cosmetics.json` |
| legacyFallback | false |
| emit `network_profiles.js` | source profiles와 일치 |
| build 후 duplicate 재생성 | **없음** |

공통 verifier에 sector ID 중복 검사 **별도 추가 없음** (schema 단일 key + verify:data-sector-profile 22 maps).

---

## 16. UI·URL·모바일

- 기존 RN UI 재사용
- layout: `beautyValueChainEcosystem` (4 populated lanes)
- peer/inferred/ended 기본 숨김
- URL ticker: `krx:{ticker}` resolve (공통)
- 신규 UI 기능 **없음**

---

## 17. build / verify / browser

### Cosmetics application verification: **passed**

| 명령 | 결과 |
|------|------|
| `npm run build` ×2 | exit 0, cosmetics hash stable |
| `verify:relation-network` | exit 0 |
| `verify:cosmetics` | exit 0, **warnings 0** |
| `verify:metal` / `verify:elec` / `verify:auto` / `verify:construction` / `verify:finance` / `verify:bigchip` | exit 0 |
| `verify:semi-relations` / `verify:nav-tab-preserve` / `verify:data-sector-profile` | exit 0 |

### Targeted browser regression: **passed**

Phase 5E.1 post-fix harness — failure-history sectors, 3 runs each, failures **0**:

- bigchip · defense · holdings · nuclear · construction

### Full matrix stability: **pending** (pageCreate infrastructure flake)

| Item | Status |
|------|--------|
| full matrix ×3 consecutive | **not completed** (time/cost; intermittent Playwright/Windows `pageCreate` hang) |
| Attribution | Test infrastructure — **not** cosmetics data / sector readiness assertions |
| Policy | No skip / no assertion weakening / no retry wrapper |

Docs: `docs/reports/phase5e1-browser-matrix-stability.md`, `docs/known-issues/relation-browser-pagecreate-flake.md`

### Deployment browser gate: **not yet satisfied**

Conditional cosmetics checkpoint ≠ deploy approval. Final PR/deploy requires ≥1 full matrix **or** stabilized substitute suite with failures 0.

### App bugs fixed in Phase 5E.1 (bundled with this checkpoint)

1. `RelationNetwork.ensureInit` in-flight re-entry race  
2. `map_editorial.js` `insertBefore` pageerror (mobile editorial DOM race)  
3. Test-only Clarity/GTM route abort (production GTM unchanged)

---

## 18. idempotency

`cosmetics.json` SHA256: `AC259F2031170D3A329EC19830EC0BD7C6EB5F9277052F200513BD637956CAD2`

nodes/edges: **54 / 59** · listed **15** · business edges **0** · brand nodes **10** · brand/legal separation maintained

---

## 19. human review (post-checkpoint)

- `operates_brand` → `owns_brand` DART/상표권 검증
- Amorepacific Holdings ↔ Amorepacific 지분 (evidence 시만)
- ODM disclosed customer — DART 계약 공시 큐레이션
- Pharmaresearch medtech primary cross-ref 정책

---

## 20. kconsume에서 재사용할 정책

- 브랜드·법인 node 분리 (`brand:*` vs `krx:*`)
- `operates_brand` vs `owns_brand` metrics 분리
- ODM structural ≠ business customer
- 수출·채널 → `exposed_to_market` structural only (not contract)
- cross-sector reference metadata 체인
- empty chain lane hub 미생성

---

## 21. 배포 전 체크리스트

- [ ] cp_list 15 유지
- [ ] business edge evidence gate (DART/KIND)
- [ ] brand ownership DART review
- [ ] ODM customer anonymous policy
- [ ] medtech/bio cross-ref no duplicate business
- [ ] hub snapshot refresh (별도 지시)
- [ ] **deployment browser gate:** full `verify:relation-browser` matrix failures 0 **or** stabilized substitute suite (see known issue)

---

## 22. Conditional checkpoint approval

| Gate | Status |
|------|--------|
| targeted regression | **passed** |
| full matrix stability | **pending** due to pageCreate infrastructure flake |
| cosmetics application verification | **passed** |
| deployment browser gate | **not yet satisfied** |

**근거:** cosmetics 데이터·스키마·단축 verifier 통과 + 실패 이력 5섹터 ×3 browser 통과 + 앱 버그 2건·테스트 노이즈 차단. full matrix 3회 연속은 infrastructure flake로 미완료 — 성공으로 허위 보고하지 않음.

**kconsume / kcontent:** 조건부 cosmetics checkpoint 후 진입 가능. 최종 배포 전 browser gate는 별도.

---

## 포함 보고서

- `docs/reports/phase5e-cosmetics-completion.md`
- `docs/reports/phase5e1-browser-matrix-stability.md`
- `docs/known-issues/relation-browser-pagecreate-flake.md`
