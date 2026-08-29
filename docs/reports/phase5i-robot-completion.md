# Phase 5I — Robot 관계 네트워크 완료 보고서

**작성일:** 2026-08-29
**브랜치:** `codex/relation-network-phase4-checkpoint`
**시작 HEAD:** `b5c07962fce639a06131f2e8d46baa0ef7b44b82`
**시작 status:** clean
**Commit / push / PR / 배포:** **하지 않음**

---

## 1. 시작 branch / HEAD / status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| HEAD | `b5c07962fce639a06131f2e8d46baa0ef7b44b82` |
| status | clean → Phase 5I 구현 후 uncommitted |

## 2. robot 실제 경로 · data-sector

| 항목 | 값 |
|------|-----|
| HTML | `robot/korea_robot_map.html` |
| data-sector | `robot` |
| networkPath | `../data/networks/robot.json` |
| build | `build_korea_robot_map.mjs` (SEED → mcap floor → HTML) |

## 3. 기존 legacy 구조 감사

| 항목 | 값 |
|------|-----|
| 이전 networkPath | `null` |
| 이전 model/layout | `tech_stack` / `technologyStack` |
| 이전 legacyFallback | **true** (partners adapter) |
| body data-sector | 이미 `robot` (semi body 잔존 없음) |
| semi footer 링크 | 관련 섹터 푸터에 semiconductor 링크 문구만 존재 (profile 오연결 아님) |
| inline partners graph | 테이블 partners + legacy fallback 경로 |

감사 산출: `data/robot_relation_phase5i_audit.json`

## 4. cp_list · ticker · chain

**listed = 17 (불변).** 신규 상장사 추가 없음. dormant seed(RS Automation·PIE)는 mcap floor로 미포함.

| chain | 수 |
|-------|---|
| 완성로봇·플랫폼 | 8 |
| 액추에이터·모터 | 2 |
| 감속기·동력전달 | 2 |
| 센서·비전·정밀부품 | 1 |
| 제어·모션·로봇SW | 1 |
| 자동화·SI·물류시스템 | 3 |

## 5. legacy partners 분류

partners 총 **19**건 → 전부 peer로 강등 (confirmed 자동 승격 없음).

| classification | 건수 | 예 |
|----------------|------|-----|
| peer | 15 | nvidia, fanuc, abb, siemens, intel, amazon, google, keyence, cognex |
| theme/reference | 3 | samsung_eco, doosan_grp, hyundai_mt |
| inferred customer/supplier | 1 | robostar→doosan_robot (모션·서보 라벨) |
| invalid / duplicate | 0 / 0 | — |
| cross-sector reference (별도) | 5 | auto×2, semiconductor×2, software×1 |

## 6. 제거 · 강등 · 숨김

- legacy partners → `type: peer`, `status: peer`, **defaultHidden=true**
- theme/backing 라벨 → business로 미승격
- 추정 공급 라벨(doosan_robot) → peer 강등 (supplies_* 미생성)
- 빈 medical_robot / defense_robot lane **미생성**

## 7. semi profile 잔여 감사

- `data-sector="robot"` 유지
- profile `networkPath` non-null, model/layout 로봇 전용
- `legacyFallback=false`
- semi curated 상수·profile을 robot에 재연결하지 않음
- verify:data-sector-profile failures 0

## 8. 인접 섹터 경계

| 경계 | 처리 |
|------|------|
| Auto | 레인보우·할라캐스트 xref; 현대차 투자≠납품 |
| Semiconductor | 티로보틱스·SFA fab 노출 xref; 특정 fab 계약 아님 |
| Software | 클로봇 관제 SW는 robot 구조; 일반 AI/클라우드≠로봇 계약 |
| Medtech / Defense | owning-sector anchor만 (빈 lane 없음, business 중복 0) |
| Elec | 부품 공급망 복제 없음 |

모든 xref: `excludesFromBusinessCoverage`, `duplicateBusinessCountExcluded`, `excludesFromOrphanResolution`

## 9. Canonical company / component / product

- 상장사 `krx:{ticker}`
- 부품 `reducer:` / `actuator:` / `robot_component:`
- 제품 `robot_product:` · 유형 `robot_category:` · 응용 `application:`
- 금지 generic ID 0
- 기업당 제품≤3 · category≤2 · application≤2

## 10. model / layout / lane

| 항목 | 값 |
|------|-----|
| model | `robotics_component_system_application_ecosystem` |
| layout | `roboticsValueChainEcosystem` |
| lanes (비어 있지 않은 것만) | precision_component · actuator_drive · robot_software · industrial_robot · collaborative_robot · logistics_robot · system_integration · end_market |

## 11. 구조 관계

`member_of`, `produces_component` / `produces_robot` / `develops`, `member_of_category`, `supports_application`, `cross_sector_reference`
→ status `reference`, business/orphan 해소 제외

## 12. 실제 부품 · 로봇 공급

**0건.** 부품 생산 사실·호환성·고객 로고로 특정 고객 연결하지 않음.

## 13. 투자 · 지분 · M&A

**0건 confirmed.** 그룹 백킹·삼성 역량 테마는 peer/theme 참고만.

## 14. 프로젝트 · 도입 · PoC

**0건.** MOU/PoC/시연을 commercial deployment로 사용하지 않음.

## 15. 의료 · 방산 cross-sector

의료·방산 로봇 상장사 없음 → lane 생략. medtech/defense anchor만 경계용.

## 16. status별 edge

| status | 역할 |
|--------|------|
| reference | 구조·분류·xref |
| peer | legacy partners (숨김) |
| confirmed / reported / inferred business | **0** |

## 17. business 관계

confirmed **0** · reported **0** · inferred business **0**

## 18. coverage · 분모

business 분모 0 → coverage **N/A** (`applicable: false`). 0/0=100% 없음.

## 19. orphan · zero-degree

| 지표 | 값 |
|------|-----|
| businessRelationOrphanCount | 17 (분류만, padding 없음) |
| zeroDegreeNodeCount | **0** |
| duplicateSemanticNodeCount | **0** |

## 20. Validator

robot 전용 규칙 추가 (`validate.mjs`): generic ID, peer hidden, structure≠confirmed business, ownership stakePct/asOf, legacyFallback false, coverage N/A 정책.

## 21. legacyFallback 제거

| 항목 | 값 |
|------|-----|
| `_legacyFallback` | **false** |
| networkPath | 전용 JSON |
| partners adapter | robot 경로에서 미사용 |
| browser | usingLegacy=false 확인 |

## 22. UI · URL · 모바일

공통 renderer `roboticsValueChainEcosystem` lane 배치. 신규 UI 기능 추가 없음. ticker/lang reload·popstate는 기존 RelationNetwork URL state 유지. targeted mobile 375px 통과.

## 23. 수정 · 생성 파일

**생성:** `data/networks/robot.json`, audit/changelog, `robot_metrics.mjs`, `robot_product_canonical.mjs`, migrate/audit/verify/targeted-browser scripts, 본 보고서·QA JSON

**수정:** `schema.mjs`, `profiles.mjs`, `validate.mjs`, `js/relation_network.js`, `js/network_profiles.js`(emit), `rebuild_site.mjs`, `verify_relation_network.mjs`, `verify_relation_browser.mjs`, `package.json`

## 24. build / verify

- `npm run build` ×2 exit 0
- `verify:relation-network` + robot/software/telecom/medtech/kconsume/kcontent/cosmetics/metal/elec/auto/construction/finance/bigchip/semi-relations/nav-tab-preserve/data-sector-profile → **전부 exit 0**
- robot warnings **0**

## 25. targeted browser QA

`docs/reports/phase5i-targeted-browser-qa.json` — **12/12 passed**, app failures 0, infrastructure failures 0.
(robot desktop/tablet/mobile×lang, ticker·lane URL, software/telecom/medtech/bigchip/construction/bio)

## 26. full matrix pending

**미실행.** deployment browser gate **pending** 유지.
known issue: `docs/known-issues/relation-browser-pagecreate-flake.md`

## 27. idempotency

build 2회 후 robot JSON SHA256 동일: `BC60B73DF0E268F4…0C3A`

## 28. 타 섹터 회귀

| sector | hash prefix (불변) |
|--------|-------------------|
| software | `162c804664ceafc0` |
| telecom | `7966e1790ca9c05a` |
| medtech | `e00da65d5b4f152e` |
| cosmetics | `ac259f2031170d3a` |
| kconsume | `562db444981296b4` |
| kcontent | `64691fe93f9262b3` |

타 섹터 관계 의미 변경 없음. hub snapshot 갱신 없음.

## 29. human review

confirmed business 0 — DART/1차 출처 기반 공급·도입·투자 큐레이션은 후속 Phase.

## 30. Phase 5I 종료 가능 여부

**구현·검증 기준 충족.** (commit은 사용자 지시 시에만)

## 31. checkpoint 가능 여부

**가능** (별도 checkpoint 문서·커밋은 요청 시).

## 32. 최종 통합 QA 진입 가능 여부

**조건부 가능** — robot legacyFallback 제거 완료. full browser matrix / deployment gate는 여전히 pending.

---

## 최종 지표

| 항목 | 값 |
|------|-----|
| listed / nodes / edges | **17 / 86 / 115** |
| confirmed business | **0** |
| legacy peer | **19** (defaultHidden) |
| products / categories / components(reducer+actuator+component) | 12 / 15 / 5 |
| xref | 5 |
| warnings / legacyFallback | **0** / **false** |
| JSON hash | `BC60B73DF0E268F4…` |

---

## 필수 명시

- 신규 상장사 추가: **없음**
- cp_list 변경: **없음** (17 유지)
- 추정 공급·도입 관계: **없음**
- MOU/PoC를 상용관계로 사용: **하지 않음**
- 투자관계를 공급관계로 사용: **하지 않음**
- orphan padding: **없음**
- legacyFallback: **false**
- full matrix 실행: **하지 않음**
- refresh:hub-snapshots: **하지 않음**
- commit / push / PR / 배포: **하지 않음**
