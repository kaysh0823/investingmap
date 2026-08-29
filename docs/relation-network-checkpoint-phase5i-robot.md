# Relation Network — Phase 5I Robot Checkpoint

**As of:** 2026-08-29
**Branch:** `codex/relation-network-phase4-checkpoint`
**Base HEAD:** `b5c07962fce639a06131f2e8d46baa0ef7b44b82`
**Scope:** Robot (`robot`) — Phase 5I
**Checkpoint status:** **approve for data/targeted QA** (full matrix / deployment gate still pending)
**Deploy / push / PR:** not performed
**최종 통합 QA:** 아직 시작하지 않음

상세 완료 보고서: [`docs/reports/phase5i-robot-completion.md`](reports/phase5i-robot-completion.md)

---

## 1. Phase 5I 목적

로봇 섹터의 **legacyFallback(partners adapter)** 를 제거하고, 핵심부품·제어·SW·로봇 유형·SI·적용산업으로 구조화된 전용 관계 네트워크로 전환한다. 로봇 테마·MOU·PoC·투자를 공급·도입 계약으로 과장하지 않으며, confirmed business를 숫자로 채우지 않는다.

---

## 2. 기존 legacy 구조

| 항목 | 이전 | Phase 5I |
|------|------|----------|
| networkPath | `null` | `../data/networks/robot.json` |
| model / layout | `tech_stack` / `technologyStack` | `robotics_component_system_application_ecosystem` / `roboticsValueChainEcosystem` |
| `_legacyFallback` | **true** | **false** |
| graph | partners → legacy adapter | 전용 JSON + `roboticsValueChainEcosystem` |
| data-sector | `robot` (유지) | `robot` |

공통 legacy adapter는 다른 미전환 섹터용으로 **삭제하지 않음**. robot만 fallback 경로를 끊음.

---

## 3. cp_list · 경로

| 항목 | 값 |
|------|-----|
| HTML | `robot/korea_robot_map.html` |
| data-sector | `robot` |
| listed / cp_list | **17** (변경 없음) |
| nodes / edges | **86 / 115** |
| 신규 상장사 | **없음** |

---

## 4. Model / layout / lanes

**model:** `robotics_component_system_application_ecosystem`
**layout:** `roboticsValueChainEcosystem`

**Populated lanes only:**

1. precision_component
2. actuator_drive
3. robot_software
4. industrial_robot
5. collaborative_robot
6. logistics_robot
7. system_integration
8. end_market

빈 lane(medical_robot, defense_robot, sensor_vision hub, controller hub, service_robot hub) **미생성**.

---

## 5. Canonical component / product 정책

| 엔티티 | ID |
|--------|-----|
| 상장사 | `krx:{ticker}` |
| 부품 | `robot_component:` · `reducer:` · `actuator:` |
| 제품 / 유형 | `robot_product:` · `robot_category:` |
| SW / 응용 | `robot_software:` · `application:` |

- 법인·부품·제품·제품군·응용 분리
- shared category/component 우선, 기업별 제품은 실제 제품명 중심
- 기업당 제품≤3 · category≤2 · application≤2
- generic ID **0** · duplicate semantic **0** · zero-degree **0**

---

## 6. Legacy partners 분류

partners **19**건 → 전부 peer 강등 (`defaultHidden=true`). confirmed 자동 승격 **없음**.

| classification | 건수 |
|----------------|------|
| peer | 15 |
| theme/reference | 3 (`samsung_eco`, `doosan_grp`, `hyundai_mt`) |
| inferred customer/supplier | 1 (robostar→doosan_robot 모션·서보 라벨) |

**inferred supply 1건:** peer로 강등·기본 숨김·`excludesFromBusinessCoverage` / `excludesFromOrphanResolution`. business count에 포함하지 않음.

---

## 7. Confirmed business 0건의 이유

DART/KIND·양 당사자 공식 발표 등 1차 출처로 개봉·검토한 공급·도입·투자·프로젝트가 없다. sparse graph를 허용하며 orphan padding을 하지 않는다.

---

## 8. Cross-sector 경계

| 경계 | 처리 |
|------|------|
| Auto | 투자·전장 노출 xref — 납품 아님 |
| Semiconductor | fab 물류·이송 노출 xref — 특정 fab 계약 아님 |
| Software | 관제 SW는 robot 구조; 일반 AI/클라우드≠로봇 계약 |
| Medtech / Defense | owning-sector anchor만 (빈 lane 없음) |

xref는 business count·orphan 해소에서 제외.

---

## 9. MOU / PoC / 투자 / 공급 구분

| 금지 | 상태 |
|------|------|
| MOU → 상용 공급·배치 | 사용하지 않음 |
| PoC/실증 → commercial deployment | 사용하지 않음 |
| 투자/테마 → 고객·납품 | 사용하지 않음 |
| 부품 생산 → 특정 OEM 공급 | 사용하지 않음 |
| 고객 로고 → active contract | 사용하지 않음 |

추정 공급·도입 관계: **0**

---

## 10. networkPath 전환 · legacyFallback 제거

- profile `networkPath`: `../data/networks/robot.json`
- `_legacyFallback`: **false**
- HTML: RelationNetwork v2 `onTabVisible` 단일 초기화
- partners adapter / 구 force-simulation graph 잔존 없음
- table / heatmap / momentum 유지
- URL ticker/lang state: 기존 RelationNetwork 유지

---

## 11. robot data-sector · semi 누수 방지

- `body data-sector="robot"`
- profile key = `robot` (semi curated 상수·networkPath 미연결)
- semiconductor 푸터 관련 링크는 사이트 내비용이며 robot profile 오연결이 아님
- verify:data-sector-profile failures **0**

---

## 12. Orphan · coverage

| 지표 | 값 |
|------|-----|
| businessRelationOrphanCount | 17 (분류만; padding 없음) |
| zeroDegreeNodeCount | 0 |
| business coverage (0분모) | **N/A** |
| 0/0 = 100% | 없음 |

---

## 13. Targeted browser · full matrix

| 항목 | 상태 |
|------|------|
| targeted browser | **12/12 passed** (`docs/reports/phase5i-targeted-browser-qa.json`) |
| full relation-browser matrix | **미실행** |
| deployment browser gate | **pending** |
| known issue | `docs/known-issues/relation-browser-pagecreate-flake.md` |

“full browser 통과”라고 기록하지 않는다.

---

## 14. Build / verify / idempotency

- `npm run build` ×2
- sector verifiers + `verify:relation-network` + nav/data-sector
- robot warnings **0**
- build 2회 후 robot JSON hash 동일
- hub snapshots / refresh:hub-snapshots **미실행**

---

## 15. Human review

confirmed business 큐레이션(공급·도입·투자·프로젝트)은 1차 출처 검토 후 후속 Phase.

---

## 16. 최종 통합 QA 항목 (아직 시작하지 않음)

1. 전 섹터 full browser matrix
2. deployment browser gate
3. pageCreate flake 재현·격리
4. hub snapshot freshness (별도 refresh 워크플로)
5. confirmed business 큐레이션 우선순위

---

## 17. 배포 전 체크리스트

- [ ] full browser matrix 통과
- [ ] deployment browser gate 통과
- [ ] hub snapshots 정책에 따른 갱신(필요 시)
- [ ] push / PR / 배포 승인
- [ ] YMYL 면책·편집 정책 페이지 유지 확인

---

## 필수 명시

- 신규 상장사 없음 · cp_list 변경 없음
- 추정 공급·도입 관계 없음
- MOU/PoC를 상용관계로 사용하지 않음
- 투자관계를 공급관계로 사용하지 않음
- orphan padding 없음 · legacyFallback=false
- full matrix 미실행 · snapshot 갱신 없음 · push/PR/배포 없음
