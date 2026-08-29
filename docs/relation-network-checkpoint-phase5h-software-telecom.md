# Relation Network — Phase 5H Software + Telecom Bundle Checkpoint

**As of:** 2026-08-29
**Branch:** `codex/relation-network-phase4-checkpoint`
**Base HEAD:** `25fca1eb4ec47dae9b5cce12eefde1a120d56642`
**Scope:** Software (`software`) + Telecom (`telecom`) — Phase 5H bundle
**Checkpoint status:** **approve for data/targeted QA** (full matrix gate still pending)
**Deploy / push / PR:** not performed

---

## 1. Phase 5H 묶음 목적

소프트웨어와 통신 섹터에 **제품·플랫폼·클라우드·망·장비** 구조 네트워크를 한 세션에서 도입하되, **JSON / metrics / validator / verifier는 완전히 분리**한다. 고객 로고·API 연동·호환 인증·주파수 할당으로 business edge를 채우지 않는다. DART/KIND 등 1차 출처 없는 confirmed/reported business는 **각각 0건**.

---

## 2. JSON·metrics·verifier 분리

| 산출물 | software | telecom |
|--------|----------|---------|
| Network | `data/networks/software.json` | `data/networks/telecom.json` |
| Audit / changelog | `data/software_relation_phase5h_*` | `data/telecom_relation_phase5h_*` |
| Migrate / verify | `scripts/*_software_*` | `scripts/*_telecom_*` |
| Metrics / canonical | `software_metrics.mjs`, `software_product_canonical.mjs` | `telecom_metrics.mjs`, `telecom_network_canonical.mjs` |
| npm | `verify:software` | `verify:telecom` |

---

## 3. 실제 경로·data-sector · cp_list

| | software | telecom |
|--|----------|---------|
| HTML | `software/korea_software_map.html` | `telecom/korea_telecom_map.html` |
| data-sector | `software` | `telecom` |
| networkPath | `../data/networks/software.json` | `../data/networks/telecom.json` |
| `_legacyFallback` | **false** | **false** |
| listed | **13** | **11** |
| cp_list 변경 | **없음** | **없음** |
| nodes / edges | **55 / 69** | **35 / 52** |

---

## 4. Model / layout / lane

| | software | telecom |
|--|----------|---------|
| model | `software_product_platform_ecosystem` | `telecommunications_network_service_ecosystem` |
| layout | `softwarePlatformEcosystem` | `telecomNetworkServiceEcosystem` |
| lanes | data_ai · managed_service · cloud_infrastructure · cybersecurity · enterprise_software · commerce_platform · industrial_software | network_operator · network_equipment · optical_wireless_component |

**위성통신** 빈 lane hub: **미생성**

---

## 5. Software — 제품·플랫폼·클라우드 · integration vs 계약

| 구분 | 구현 |
|------|------|
| 법인 | `krx:{ticker}` |
| 제품 / 플랫폼 / 클라우드 | `software_product:` · `platform:` · `cloud_service:` |
| 카테고리 / 산업 | `software_category:` · `industry:` |
| `integrates_with` / industry exposure | structural only — **not** partnership/business |
| 고객 로고 · marketplace listing | **active contract로 사용하지 않음** |
| AI API · 타사 LLM | 모델 소유·공동개발로 **사용하지 않음** |
| generic ID | **0** |

---

## 6. Telecom — 통신사·서비스·장비 · spectrum vs license

| 구분 | 구현 |
|------|------|
| 법인 | `krx:{ticker}` |
| 서비스 / 장비 / 부품 | `telecom_service:` · `network_equipment:` · `network_component:` |
| 망 세대 | `network_generation:` (회사·제품 node 아님) |
| license node | **0** — official identifier 없이 미생성 |
| 주파수 할당 | 기업 소유·business로 **사용하지 않음** |
| 호환 인증 | 장비 공급계약으로 **사용하지 않음** |
| MVNO 일반 망 사용 | exact contract로 **사용하지 않음** |
| generic ID | **0** |

**License node 0건 이유:** 과기정통부 등 공식 할당 identifier를 개봉·검증하지 않았으므로 `telecom_license:` / `license_or_allocation`을 만들지 않는다.

---

## 7. Legacy peer · business 0건

| | software | telecom |
|--|----------|---------|
| peer demoted | **19** | **15** |
| defaultHidden | yes | yes |
| confirmed / reported | **0 / 0** | **0 / 0** |

**이유:** 1차 출처 미검증. sparse graph 허용. orphan padding 없음.

---

## 8. Orphan · coverage

| | software | telecom |
|--|----------|---------|
| businessRelationOrphanCount | 13 | 11 |
| zeroDegreeNodeCount | 0 | 0 |
| evidenceFieldCoverage 0/0 | **N/A** | **N/A** |

peer / reference / cross-sector는 orphan을 **해소하지 않음**.

---

## 9. Cross-sector · 회귀 hashes

software↔telecom xref는 `excludesFromBusinessCoverage` / orphan resolution.
kcontent 플랫폼·finance/elec/semi 관계 자동 생성·중복 없음.

| sector | SHA-256 prefix (불변) |
|--------|----------------------|
| medtech | `E00DA65D5B4F152E…` |
| cosmetics | `AC259F2031170D3A…` |
| kconsume | `562DB444981296B4…` |
| kcontent | `64691FE93F9262B3…` |
| software | `162C804664CEAFC0…` |
| telecom | `7966E1790CA9C05A…` |

---

## 10. Browser QA (정확한 표현)

| gate | 결과 |
|------|------|
| **targeted browser QA** | **passed 13/13** |
| **full matrix stability** | **pending** |
| **deployment browser gate** | **not satisfied yet** |
| full matrix 재실행 | **하지 않음** |
| skip / assertion 약화 / retry-as-success | **없음** |

Known issue: `docs/known-issues/relation-browser-pagecreate-flake.md`
결과: `docs/reports/phase5h-targeted-browser-qa.json`

---

## 11. Build / verify / idempotency

단축 검증 (full relation-browser **미실행**): build ×2 + verify:software/telecom + prior sectors + nav/data-sector-profile.

| 항목 | 값 |
|------|-----|
| warnings | **0 / 0** |
| JSON hash idempotent | software · telecom 각각 동일 |
| `refresh:hub-snapshots` | **미실행** |

---

## 12. Robot 진입 · 배포 gate

| 조건 | 상태 |
|------|------|
| software+telecom 데이터·targeted QA | Yes |
| full matrix / deployment browser gate | **pending — robot과 독립 추적** |
| robot 이번 Phase 시작 | **No** |

**Robot 진입: 가능** (본 checkpoint가 full-matrix 통과를 의미하지 않음).

배포 전: full matrix 안정성 또는 flake 문서화 유지, deployment browser gate **satisfied**.
**“full browser 통과”라고 주장하지 않는다.**

---

## 13. 포함 보고서

- [phase5h-bundle-summary.md](./reports/phase5h-bundle-summary.md)
- [phase5h-software-completion.md](./reports/phase5h-software-completion.md)
- [phase5h-telecom-completion.md](./reports/phase5h-telecom-completion.md)

---

## 14. 최종 명시

| 항목 | 답 |
|------|----|
| 신규 상장사 | **없음** |
| cp_list 변경 | **없음** (13 / 11) |
| 추정 고객·파트너 | **없음** |
| integration/호환을 계약으로 | **하지 않음** |
| 주파수 할당을 소유·계약으로 | **하지 않음** |
| orphan padding | **없음** |
| full matrix | **미실행** |
| snapshot 갱신 | **없음** |
| push / PR / 배포 | **없음** |
