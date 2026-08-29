# Phase 5E — Cosmetics(화장품·미용기기) 관계 네트워크 감사·설계·구현 보고서

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**시작 HEAD:** `c0221f46e7b8bbce952facfcf87b4a7022ffc688`  
**작업자:** editorial_phase5e  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| 시작 HEAD | `c0221f46e7b8bbce952facfcf87b4a7022ffc688` |
| Phase 5D Metal checkpoint | 존재 |
| 시작 git status | clean |

---

## 2. cosmetics 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`cosmetics`** |
| HTML | `cosmetics/korea_cosmetics_map.html` |
| `data-sector` | `cosmetics` |
| build | `build_korea_cosmetics_map.mjs` → `scripts/split_kconsume_cosmetics.mjs` |
| Network JSON | `data/networks/cosmetics.json` |
| profile | `lib/relation_network/profiles.mjs` → `cosmetics` |
| 이전 | `networkPath: null`, `brand_odm` / `platformEcosystem`, **legacyFallback** |
| 이후 | `../data/networks/cosmetics.json`, `beauty_brand_manufacturing_distribution_ecosystem` / `beautyValueChainEcosystem`, **legacyFallback: false** |

---

## 3. 기존 구조 감사

| 항목 | Phase 5E 이전 |
|------|---------------|
| legacy partners force graph | Hugel 4건 (`glob_isrg`, `glob_mdt`, `glob_syk`, `glob_veev`) |
| structured JSON | 없음 |
| globalCompanies | kconsume 템플릿 잔여 (netflix, disney 등) — partners 미사용 |
| supply/customer/brand 혼재 | partners 문자열만 |
| evidence gate | 없음 |

감사 산출: `data/cosmetics_relation_phase5e_audit.json`, `scripts/audit_cosmetics_phase5e.mjs`

---

## 4. cp_list·ticker·chain

| 항목 | 값 |
|------|-----|
| HTML listed (cp_list) | **15** |
| cp_list 변경 | **없음** |
| duplicate ticker | **0** |

| chain | count |
|-------|-------|
| 브랜드 | 6 |
| 미용기기 | 5 |
| ODM·OEM | 3 |
| 유통·채널 | 1 |
| 원료 | 0 (빈 chain — lane hub 미생성) |
| 용기 | 0 (빈 chain — lane hub 미생성) |

---

## 5. legacy 관계 분류

| 분류 | count | 처리 |
|------|-------|------|
| medtech global peer (Hugel) | 4 | `peer`, defaultHidden, legacyMigrated |
| invalid/unknown partner | 0 | — |
| inferred ODM customer | 0 | 생성 안 함 |
| export/distribution contract | 0 | 생성 안 함 |

---

## 6. 제거·강등·숨김

- legacy `partners` 문자열 → `peer` (reference, defaultHidden)
- kconsume 템플릿 globalCompanies는 partners에 미연결 — 무시
- ODM 고객 추정 edge **0건**
- market exposure / distribution business edge **0건**
- 광고모델·endorsement edge **0건**

---

## 7. 인접 섹터 경계

| ticker | cross-sector | owningSector |
|--------|--------------|--------------|
| 145020 Hugel | sector:medtech | medtech |
| 214150 Classys | sector:medtech | medtech |
| 214450 Pharmaresearch | sector:medtech | medtech |
| 336570 Wontech | sector:medtech | medtech |
| 214370 Caregen | sector:bio | bio |

metadata: `crossSectorReference`, `referencedBySectors: ['cosmetics']`, `excludesFromBusinessCoverage`, `duplicateBusinessCountExcluded`, `excludesFromOrphanResolution`

kconsume / kcontent / elec: cosmetics JSON에 business edge 자동 생성 **없음**

---

## 8. canonical company·brand·product

| 유형 | count | 정책 |
|------|-------|------|
| listed_company | 15 | `krx:{ticker}` |
| brand | 10 | `brand:{slug}` — 법인과 분리 |
| product_category | 11 | `beauty_product:{slug}` |
| manufacturing_service | 1 | `manufacturing_service:cosmetics_odm` 공유 |
| retail_channel | 1 | `channel:cross_border_distribution` |
| global_company | 4 | Hugel legacy peer |
| group (lane hub) | 4 | populated lane만 |
| cross_sector_anchor | 2 | medtech, bio |

generic ID (`brand:item` 등): **0**

---

## 9. model/layout/lane

| 항목 | 값 |
|------|-----|
| model | `beauty_brand_manufacturing_distribution_ecosystem` |
| layout | `beautyValueChainEcosystem` |
| lanes (populated) | `brand_owner`, `odm_oem`, `beauty_device`, `distributor` |

빈 lane (ingredient, packaging, retail_channel, digital_commerce, export_market hub) **미생성**

---

## 10. 브랜드 소유·운영·라이선스

| type | count | status |
|------|-------|--------|
| operates_brand | 10 | reference (structural) |
| owns_brand | 0 | DART 미검증 — 미생성 |
| licenses_brand | 0 | — |

002790 Amorepacific Holdings: 브랜드 직접 운영 edge 없음 — `specializes_in` holding structure만

---

## 11. ODM/OEM 관계

| type | count | status |
|------|-------|--------|
| provides_odm (structural) | 3 | reference |
| provides_odm_for / manufactures_for (business) | 0 | evidence 없음 |

anonymous/exact ODM customer 추정 **0건**

---

## 12. 원료·패키징 공급

| 항목 | count |
|------|-------|
| ingredient nodes | 0 |
| packaging nodes | 0 |
| supplies_ingredient_to | 0 |
| supplies_packaging_to | 0 |

cp_list에 원료·용기 chain 상장사 없음 — 노드 미생성

---

## 13. 유통·채널·시장

| type | count | status |
|------|-------|--------|
| sold_through_channel | 0 | — |
| exposed_to_market | 0 | 수출 매출→계약 변환 안 함 |
| distributes_for (business) | 0 | — |

257720 Silicon2: `specializes_in` cross-border distribution (structural only)

---

## 14. 지분·M&A·JV

| type | count |
|------|-------|
| owns / owns_stake_in / acquired / divested | 0 |
| operates_joint_venture | 0 |

---

## 15. 광고모델 관계

| type | count |
|------|-------|
| endorses_brand | 0 |
| collaborates_with_brand | 0 |

---

## 16. cross-sector reference

**5건** (§7). business count·orphan 해소·supply 분모에서 **제외**.

---

## 17. status별 edge 수

| status | count |
|--------|-------|
| reference | 55 |
| peer | 4 |

---

## 18. business 관계 수

| metric | value |
|--------|-------|
| confirmedBusinessEdgeCount | 0 |
| reportedBusinessEdgeCount | 0 |
| inferredBusinessEdgeCount | 0 |
| distributionRelationshipCount | 0 |
| ownershipEdgeCount | 0 |

---

## 19. coverage와 분모

| metric | result |
|--------|--------|
| businessRelationship* | N/A (0분모) |
| odmDirectEvidenceCoverage | N/A |
| distributionDirectEvidenceCoverage | N/A |
| ownershipPrimarySourceCoverage | N/A |
| marketExposureEvidenceCoverage | N/A |
| brandOwnershipDirectEvidenceCoverage | 10/10 structural classification evidence |
| crossSectorReferenceEvidenceCoverage | 5/5 (100%) |

---

## 20. orphan·zero-degree

| metric | value |
|--------|-------|
| businessRelationOrphanCount | 15 (intentional — no invented business) |
| classificationOnlyCompanyCount | 0 |
| zeroDegreeNodeCount | 0 |
| orphan padding | 0 |

---

## 21. validator

Cosmetics 전용: `lib/relation_network/validate.mjs` (`sectorKey === 'cosmetics'`)  
`npm run verify:cosmetics`: **warnings 0**

---

## 22. UI·URL·모바일

- 기존 RN UI 재사용 (`relation_network.js`, `layoutBeautyValueChain`)
- profile `networkPath` → structured JSON 로드
- peer/inferred/ended 기본 숨김
- 신규 UI 기능 추가 없음

---

## 23. 수정·생성 파일

### 신규
- `data/networks/cosmetics.json`
- `data/cosmetics_relation_phase5e_audit.json`
- `data/cosmetics_relation_phase5e_changelog.json`
- `scripts/audit_cosmetics_phase5e.mjs`
- `scripts/migrate_cosmetics_network_phase5e.mjs`
- `scripts/verify_cosmetics_relation_network.mjs`
- `lib/relation_network/cosmetics_metrics.mjs`
- `lib/relation_network/cosmetics_brand_canonical.mjs`
- `docs/reports/phase5e-cosmetics-completion.md`

### 수정
- `lib/relation_network/profiles.mjs`
- `lib/relation_network/schema.mjs` (legacy duplicate cosmetics key 제거)
- `lib/relation_network/validate.mjs`
- `js/relation_network.js`
- `js/network_profiles.js` (emit)
- `scripts/rebuild_site.mjs`
- `scripts/verify_relation_network.mjs`
- `package.json`

---

## 24. build/verify

| 명령 | 결과 |
|------|------|
| `npm run build` ×2 | exit 0 |
| `verify:relation-network` | exit 0 |
| `verify:cosmetics` | exit 0, warnings 0 |
| `verify:metal` / `verify:elec` | exit 0, warnings 0 |
| `verify:auto` ~ `verify:data-sector-profile` | exit 0 |
| `verify:relation-browser` | exit 0, **failures=0** (~571s) |

---

## 25. idempotency

`cosmetics.json` SHA256 (build×2 후):  
`AC259F2031170D3A329EC19830EC0BD7C6EB5F9277052F200513BD637956CAD2`

nodes/edges: **54 / 59**

---

## 26. 타 섹터 회귀

- `data/networks/metal.json`, `elec.json`, `auto.json` 등 **미변경**
- metal/elec verify warnings **0**
- hub snapshot refresh **미실행** (`hub_index.json` builtAt-only diff restore)

---

## 27. 남은 human review

- 브랜드 `operates_brand` vs `owns_brand` — DART/상표권으로 법적 소유 검증
- Amorepacific Holdings(002790) ↔ Amorepacific(090430) 지분 구조 (evidence 있을 때만)
- ODM disclosed customer — DART 계약 공시 시 `manufactures_for` reported 큐레이션
- Pharmaresearch primary medtech — cosmetics 맵 cross-ref 유지 정책 재확인

---

## 28. Phase 5E 종료 가능 여부

**예** — 구조 네트워크·validator·verify 통과. business edge 0은 정책상 의도적.

---

## 29. checkpoint 가능 여부

구현·검증 완료. **별도 checkpoint 커밋은 미수행** (사용자 지시: commit/push/PR/배포 금지).

---

## 30. kconsume 진입 가능 여부

Phase 5E 범위 완료. **kconsume은 별도 Phase 지시 전 시작하지 않음.**

---

## 명시 확인

- **신규 상장사 추가:** 없음
- **cp_list 변경:** 없음
- **추정 ODM/OEM 관계 생성:** 없음
- **브랜드와 법인 혼동:** 없음 (brand node 분리)
- **시장 노출을 계약으로 사용:** 없음
- **orphan padding:** 없음
- **타 섹터 관계 의미 변경:** 없음
- **refresh:hub-snapshots:** 실행 안 함
- **배포/commit/push/PR:** 수행 안 함
