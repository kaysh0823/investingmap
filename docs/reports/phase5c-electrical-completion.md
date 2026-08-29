# Phase 5C — Elec(전기·전자) 관계 네트워크 감사·설계·구현 보고서

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**시작 HEAD:** `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b`  
**작업자:** editorial_phase5c  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| 시작 HEAD | `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b` |
| 시작 git status | clean (Phase 5B Auto checkpoint 보존) |
| 종료 git status | Phase 5C elec 전용 + 공통 파이프라인 변경 (미커밋) |

---

## 2. 발견한 실제 sector ID·경로

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`elec`** |
| HTML | `elec/korea_elec_map.html` |
| `data-sector` | `elec` |
| build source | `scripts/build_korea_elec_map.mjs` → `ELEC_CONFIG` (`lib/curated_sector_configs.mjs`) |
| cp_list/SEED | 전용 elec cp_list 섹션 없음 — `ELEC_CONFIG` + `lib/sector_exclusive.mjs` (24 tickers) |
| profile ID | `elec` (`lib/relation_network/profiles.mjs`) |
| 이전 networkPath | `null` (legacy graph fallback) |
| 이후 networkPath | `../data/networks/elec.json` |
| legacyFallback | **false** (`_legacyFallback: false`) |

**존재하지 않는 경로 (생성하지 않음):** `electrical/`, `electronics/`, `electric/` — 해당 ID·HTML 없음.

**유사 섹터와 혼동 금지:** `semiconductor`(semi), `powergrid`, `battery`, `auto`, `bigchip`, `telecom` — 별도 섹터.

---

## 3. 기존 구조 감사

| 항목 | 결과 |
|------|------|
| HTML·생성 스크립트 | `elec/korea_elec_map.html`, `build_korea_elec_map.mjs` |
| data-sector | `elec` |
| 상장사 수 | **24** (중복 ticker 0) |
| HTML ↔ config 일치 | 24 tickers = `ELEC_CONFIG` universe |
| chain/category | 가전 4, 디스플레이 2, 카메라·모듈 4, 전자부품 14 |
| legacy partners | **25** 문자열 참조 (4 unique global: murata, panasonic, sony, bosch) |
| URL evidence 관계 | **0** |
| 글로벌 기업 | 4 (ELEC_CONFIG.globals) |
| legacy graph | `component_supply` / `layeredSupplyChain`, networkPath null |
| legacyFallback | true → Phase 5C 후 false |
| 타 섹터 유입 노드 | 없음 |

감사 스크립트: `scripts/audit_elec_phase5c.mjs` → `data/elec_relation_phase5c_audit.json`

---

## 4. cp_list·ticker·chain

| chain | count | tickers (요약) |
|-------|-------|----------------|
| 전자부품 | 14 | 009150, 043260, 001820, 417200, 248070, 090460, 046890, 033240, 077360, 017900, 004710, 052710, 065680, 049070 |
| 가전 | 4 | 066570, 021240, 065350, 284740 |
| 카메라·모듈 | 4 | 011070, 489790, 204270, 192650 |
| 디스플레이 | 2 | 034220, 171090 |

- cp_list 변경: **없음**
- 신규 상장사 추가: **없음**
- ticker 중복: **0**

---

## 5. legacy 관계 분류

| 분류 | count | 설명 |
|------|-------|------|
| **peer** | 25 | murata×10, panasonic×7, sony×5, bosch×3 — 동종 글로벌 peer 문자열 |
| structural product/technology | 0 (legacy) | map `products`/`semType`에서 Phase 5C 구조 edge 생성 |
| group affiliation | 0 | legacy partners에 그룹 명부 없음 |
| reported business relationship | 0 | URL/DART 근거 없음 |
| inferred relationship | 0 | 생성하지 않음 |
| invalid/out-of-sector | 0 | 4 global ID 모두 ELEC_CONFIG.globals에 존재 |
| duplicate | 0 | 동일 ticker-global 쌍 중복 없음 |

---

## 6. 제거·강등·숨김

| action | count |
|--------|-------|
| legacy partner → **peer** (defaultHidden) | 25 |
| invented supply 제거 | 0 (애초에 없음) |
| confirmed 승격 | 0 |
| business edge defer | 전체 (근거 없음) |

---

## 7. 인접 섹터 경계

| 인접 섹터 | elec 역할 | 중복 방지 |
|-----------|-----------|-----------|
| **semiconductor** | 077360 패키징 소재 — elec map constituent이나 semi 공급망은 semi 소유 | `cross_sector_reference` → `sector:semiconductor` |
| **powergrid** | 변압기·송배전 수주는 powergrid | anchor만 배치, business edge 없음 |
| **battery** | 셀·소재·리사이클은 battery | 배터리 적용 공급 관계 미생성 |
| **auto** | 011070, 192650, 049070 차량 전장 겹침 | `cross_sector_reference` → `sector:auto`; confirmed OEM 공급은 auto에서만 |
| **bigchip** | 삼성전자·SK하이닉스 생태계 미복제 | map non-constituent 상장사는 `listed_reference_company` 정책 (현재 0건) |

**cross-sector reference (4건):**

| ticker | target | owningSector | duplicateBusinessCountExcluded |
|--------|--------|--------------|----------------------------------|
| 077360 | sector:semiconductor | semiconductor | semi supply chain |
| 011070 | sector:auto | auto | OEM supply |
| 192650 | sector:auto | auto | OEM supply |
| 049070 | sector:auto | auto | EMS/automotive modules |

---

## 8. canonical entity

| 유형 | ID 패턴 | elec count |
|------|---------|------------|
| listed_company | `krx:{ticker}` | 24 |
| global_company | `global:{id}` | 4 |
| product | `product:{slug}` | ~24 |
| component | `component:{slug}` | ~24 |
| end_market | `end_market:{slug}` | 2 |
| business_category | `group:{lane}` | 4 |
| cross_sector_anchor | `sector:{id}` | 4 |

- 삼성전기(009150) ≠ LG전자(066570) ≠ LG디스플레이(034220) — **별도 노드**
- 그룹 소속 → 공급관계 변환 **없음**
- KRX ticker → global_company 변환 **없음**

---

## 9. model/layout/lane

| 항목 | 값 |
|------|-----|
| model | `electronics_component_value_chain` |
| layout | `electronicsValueChainEcosystem` |
| lanes | `home_appliance`, `display`, `camera_module`, `electronic_component`, `end_market` |

chain→lane 매핑: HTML `chain` 필드 기준 (가전→home_appliance 등). 빈 lane 없음.

UI: `js/relation_network.js` — `layoutElectronicsValueChain()`, `inferElecLane()`

---

## 10. 구조 관계

| type | count | status |
|------|-------|--------|
| member_of | 24 | reference |
| specializes_in | 24 | reference |
| manufactures | 24 | reference |
| exposed_to | 4 | reference (automotive_electronics, consumer_electronics) |
| cross_sector_reference | 4 | reference |

**structuralGeneratedEdgeCount:** 76  
제품·부품: map `products`/`semType`에서 기업당 1~3개 (MLCC, OLED, FPCB, EMS 등).

---

## 11. 실제 공급·제조 관계

| type | confirmed | reported | inferred |
|------|-----------|----------|----------|
| supplies_* | 0 | 0 | 0 |
| manufactures_for | 0 | 0 | 0 |
| develops_with | 0 | 0 | 0 |

**Phase 5C 정책:** DART/KIND/primary evidence 없이 공급 관계 **생성하지 않음**.  
추정 공급관계 생성: **없음**

---

## 12. 지분·그룹·JV

| type | count |
|------|-------|
| owns / owns_stake_in | 0 |
| group_member | 0 |
| participates_in / develops_with | 0 |

---

## 13. 제품·기기 채택 관계

| type | count |
|------|-------|
| used_in_device | 0 |
| used_in_product_family | 0 |
| designed_for / certified_for | 0 |

분해 보고서·업계 통념 기반 채택 관계 **미생성**.

---

## 14. cross-sector reference

- **4건** (위 §7 표)
- business edge로 집계하지 않음
- `crossSectorReferenceCount`: 4

---

## 15. status별 edge 수

| status | count |
|--------|-------|
| reference | 80 |
| peer | 25 |
| confirmed | 0 |
| reported | 0 |
| inferred | 0 |
| ended | 0 |

---

## 16. 사업 관계 수

| metric | value |
|--------|-------|
| confirmedBusinessEdgeCount | 0 |
| reportedBusinessEdgeCount | 0 |
| supplyRelationshipCount | 0 |
| ownershipEdgeCount | 0 |
| jointDevelopmentCount | 0 |
| deviceAdoptionRelationshipCount | 0 |
| manuallyCuratedEdgeCount | 4 (cross_sector_reference) |

---

## 17. coverage와 분모

| metric | numerator | denominator | display |
|--------|-----------|-------------|---------|
| evidenceFieldCoverage | 0 | 0 | N/A |
| businessRelationshipDirectEvidenceCoverage | 0 | 0 | N/A |
| supplyDirectEvidenceCoverage | 0 | 0 | N/A |
| ownershipDirectEvidenceCoverage | 0 | 0 | N/A |
| deviceAdoptionDirectEvidenceCoverage | 0 | 0 | N/A |
| groupMembershipPrimarySourceCoverage | 0 | 0 | N/A |

분모 0 → `percentage=null`, `applicable=false` (100% 오표시 없음).

---

## 18. orphan 지표

| metric | value |
|--------|-------|
| listedCompanyCount | 24 |
| businessRelationOrphanCount | 24 |
| directCommercialRelationshipOrphanCount | 24 |
| classificationOnlyCompanyCount | 24 |
| hasPeerButNoBusinessCompanyCount | 24 |
| peerOnlyCompanyCount | 0 |
| weakRelationOnlyCompanyCount | 24 |
| groupMembershipOnlyCompanyCount | 0 |

**의도:** business orphan 24 = evidence 없는 공급 미발명. orphan padding **없음**.

---

## 19. validator

- `lib/relation_network/validate.mjs` — `sectorKey === 'elec'` 전용 블록
- `scripts/verify_elec_relation_network.mjs`
- migrate 시 validate: **failures 0, warnings 0**
- verify:elec: **OK**

---

## 20. UI·URL·모바일 QA

| 항목 | 결과 |
|------|------|
| URL | `elec/korea_elec_map.html?tab=graph` |
| ticker URL | 유효 ticker (예: 066570) |
| lane/product filter | layoutElectronicsValueChain lanes |
| reload / popstate / KO·EN | verify:relation-browser 통과 |
| 1440 / 768 / 375 | full matrix 통과 |
| table↔graph / bottom sheet | 기존 RN UI 재사용 |
| console/page errors | **0** |

`verify:relation-browser`: **failures: 0** (Phase 5B checkpoint 보존)

---

## 21. 수정·생성 파일

### 신규
- `data/networks/elec.json`
- `data/elec_relation_phase5c_changelog.json`
- `data/elec_relation_phase5c_audit.json`
- `lib/relation_network/elec_metrics.mjs`
- `scripts/migrate_elec_network_phase5c.mjs`
- `scripts/verify_elec_relation_network.mjs`
- `scripts/audit_elec_phase5c.mjs`
- `docs/reports/phase5c-electrical-completion.md`

### 수정 (elec + 공통 파이프라인)
- `lib/relation_network/profiles.mjs` — elec profile, PILOT_NETWORK_SECTORS
- `lib/relation_network/schema.mjs` — elec edge types
- `lib/relation_network/orphan_metrics.mjs` — structural types 확장
- `lib/relation_network/validate.mjs` — elec validator
- `js/relation_network.js` — electronics layout
- `js/network_profiles.js` — build 생성
- `scripts/rebuild_site.mjs` — migrate_elec 연결
- `scripts/verify_relation_network.mjs` — elec HTML
- `scripts/verify_relation_browser.mjs` — elec pilot page
- `package.json` — `verify:elec`

### rebuild 파생 (edge 의미 변경 없음)
- `data/networks/auto.json`, `data/networks/construction.json` — orphan metric 정의에 structural type 추가만
- `data/*_changelog.json` — rebuild 시 metrics 메타 갱신

**다른 섹터 관계 edge 의미 변경:** 없음

---

## 22. build/verify

| command | exit |
|---------|------|
| `npm run build` (×2) | 0 |
| `npm run verify:relation-network` | 0 |
| `npm run verify:elec` | 0 |
| `npm run verify:auto` | 0 |
| `npm run verify:construction` | 0 |
| `npm run verify:renewable` | 0 |
| `npm run verify:nuclear` | 0 |
| `npm run verify:powergrid` | 0 |
| `npm run verify:finance` | 0 |
| `npm run verify:ship` | 0 |
| `npm run verify:battery` | 0 |
| `npm run verify:bigchip` | 0 |
| `npm run verify:semi-relations` | 0 |
| `npm run verify:nav-tab-preserve` | 0 |
| `npm run verify:data-sector-profile` | 0 |
| `npm run verify:relation-browser` | 0 |

---

## 23. idempotency

| 항목 | 값 |
|------|-----|
| `elec.json` SHA256 (build×3) | `50636C4E9F91972CC606E7879AFAD0E04D1A1E7B58AE0A339A5EEE5D8EDC4DC9` |
| 결과 | **IDEMPOTENT OK** |

---

## 24. 다른 섹터 회귀

| 섹터 | 회귀 |
|------|------|
| auto | verify:auto OK, browser OK |
| bigchip 000660 | browser OK |
| semi 000660 | browser OK |
| bio mobile/en | browser OK |
| construction graph | OK |
| finance ownership | OK |
| powergrid contracts | OK |

---

## 25. 남은 human review

1. **Business relationships (0건):** DART/KIND/양사 IR로 확인 가능한 공급·지분 후보 큐레이션 (기업당 ≤2, 전체 ≤12)
2. **077360:** semi 패키징 소재 — semi 섹터와 역할 분담 재확인
3. **011070/192650/049070:** auto cross-sector — auto confirmed OEM 공급과 중복 여부 주기 검토
4. **Product node 품질:** `product:item` 등 generic slug — 사업보고서 기반 구체화
5. **Group membership:** LG·삼성 계열 group_member (DART 기업집단 명부) 추가 검토 — business orphan 해소용 아님

---

## 26. Phase 5C 종료 가능 여부

**가능** — elec 전용 network JSON, profile, layout, validator, metrics, verify, browser QA, idempotency 모두 충족. Business edge 0은 evidence 정책상 의도적.

---

## 27. checkpoint 가능 여부

**가능** — Auto Phase 5B checkpoint + full browser failures 0 보존. elec `legacyFallback=false`, warnings 0.

---

## 28. metal 진입 가능 여부

**가능** — elec Phase 5C가 pilot 패턴(profiles, migrate, metrics, verify, layout)을 확립했으며 metal은 현재 `networkPath: null` / legacy fallback 상태로 Phase 5D 후보.

---

## 필수 명시 사항

| 항목 | 값 |
|------|-----|
| **실제 사용 sector ID** | **`elec`** |
| 신규 상장사 추가 | **없음** |
| cp_list 변경 | **없음** |
| 추정 공급관계 생성 | **없음** |
| orphan padding | **없음** |
| 다른 섹터 관계 의미 변경 | **없음** (rebuild orphan metric meta만) |
| refresh:hub-snapshots | **실행하지 않음** |
| 배포/commit/push/PR | **하지 않음** |
