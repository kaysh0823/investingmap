# Phase 5F — Kconsume(소비재) 관계 네트워크 감사·설계·구현 보고서

**작성일:** 2026-08-29
**브랜치:** `codex/relation-network-phase4-checkpoint`
**시작 HEAD:** `3d13fb55661adcf1bf83c1781cab447aecfdc8d2`
**작업자:** editorial_phase5f
**Commit:** **하지 않음** (구현·검증만)

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| 시작 HEAD | `3d13fb55661adcf1bf83c1781cab447aecfdc8d2` (Phase 5E cosmetics checkpoint) |
| 시작 git status | clean |
| deployment browser gate | pending (known pageCreate flake) |

---

## 2. kconsume 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`kconsume`** |
| HTML | `kconsume/korea_kconsume_map.html` |
| `data-sector` | `kconsume` |
| Network JSON | `data/networks/kconsume.json` |
| profile | `lib/relation_network/profiles.mjs` → `kconsume` |
| 이전 | `networkPath: null`, legacy inline |
| 이후 | `../data/networks/kconsume.json`, `consumer_brand_distribution_ecosystem` / `consumerBrandDistributionEcosystem`, **`_legacyFallback: false`** |

감사: `data/kconsume_relation_phase5f_audit.json` · `scripts/audit_kconsume_phase5f.mjs`

---

## 3. cp_list·ticker·chain

| 항목 | 값 |
|------|-----|
| HTML listed (cp_list) | **22** |
| cp_list 변경 | **없음** |
| duplicate ticker | **0** |
| 신규 상장사 추가 | **없음** |

| chain | count |
|-------|-------|
| 음식·라면·식품 | 9 |
| 쇼핑/유통 | 5 |
| 패션 | 5 |
| 여행·레저·항공 | 3 |

---

## 4. Model / layout / lane

| 항목 | 값 |
|------|-----|
| model | `consumer_brand_distribution_ecosystem` |
| layout | `consumerBrandDistributionEcosystem` |
| lanes (실재 기업만) | `brand_owner`, `manufacturing`, `retail_channel`, `leisure_lifestyle` |

빈 lane(franchise/ecommerce/export_market 전용 허브 등)은 생성하지 않음.

---

## 5. Canonical

- 상장사: `krx:{ticker}`
- 브랜드: `brand:{normalized}` (법적 회사와 분리)
- 제품군: `consumer_category:{normalized}`
- 글로벌 peer: `global:{legal_name}`
- 인접 섹터 앵커: `sector:cosmetics`, `sector:kcontent`
- 금지 generic ID (`brand:item` 등): **0**

대표 브랜드 예: `brand:buldak`, `brand:shin-ramen`, `brand:bibigo`, `brand:mlb` …

---

## 6. 구조 관계

| type | count | status |
|------|-------|--------|
| `member_of` | 22 | reference |
| `operates_brand` | 19 | reference |
| `specializes_in` | 22 | reference |
| `cross_sector_reference` | 2 | reference |

- `owns_brand` confirmed **0** (브랜드 홈페이지로 법적 소유 확정 금지)
- 상장사당 핵심 브랜드 ≤3, 제품군 ≤2 원칙 준수

---

## 7. 실제 business 관계

| 항목 | 값 |
|------|-----|
| confirmed / reported business | **0 / 0** |
| manufactures_for / distributes_for | **0** |
| 추정 제조·유통·입점·수출 계약 | **없음** |

정책: 매장 입점≠독점유통, 온라인 판매≠플랫폼 제휴, 수출지역≠exact 고객.

---

## 8. Legacy peer 강등

| edge | 처리 |
|------|------|
| 삼양식품→Nestlé | peer, defaultHidden, legacyMigrated |
| 오리온→PepsiCo | 동일 |
| 이마트→Costco | 동일 |
| 호텔신라→Marriott | 동일 |

**4**건 demoted; peer는 business orphan을 해소하지 않음 (`hasPeerButNoBusinessCompanyCount: 4`).

---

## 9. Metrics / coverage / orphan

| metric | value |
|--------|-------|
| listedCompanyCount | 22 |
| nodeCount / edgeCount | 65 / 69 |
| brandNodeCount | 19 |
| productCategoryCount | 14 |
| confirmedBusinessEdgeCount | 0 |
| peerEdgeCount | 4 |
| crossSectorReferenceCount | 2 |
| businessRelationOrphanCount | 22 |
| zeroDegreeNodeCount | 0 |
| duplicateSemanticNodeCount | 0 |
| evidenceFieldCoverage (0/0) | **N/A** (`applicable: false`) |

---

## 10. Validator / verify

- `npm run verify:kconsume` → exit **0**, warnings **0**
- generic ID / semantic dup / market-as-business / peer-as-business 해소: fail 규칙 적용

---

## 11. UI·URL·모바일

- 공통 renderer + `layoutConsumerBrandDistribution`
- defaultViewFilters: `hidePeer`, `hideInferred`
- targeted: desktop/ko + mobile/en **OK** (ticker restore, lang, reload, table↔graph)

---

## 12. 파일

**생성:** `data/networks/kconsume.json`, audit/changelog, `scripts/audit|migrate|verify_kconsume_*`, `lib/relation_network/kconsume_{brand_canonical,metrics}.mjs`
**공통 수정:** schema/profiles/validate, relation_network.js, rebuild_site, package.json, verify_relation_*

---

## 13. 종료 체크

| 질문 | 답 |
|------|----|
| 섹터 종료 가능? | **데이터·targeted browser 기준 Yes** (full matrix gate는 pending) |
| 신규 상장사 추가? | **No** |
| cp_list 변경? | **No** |
| 추정 제조·유통? | **No** |
| orphan padding? | **No** |
| commit/push/PR/배포? | **No** |
| refresh:hub-snapshots? | **No** |
| full browser matrix? | **No** |
