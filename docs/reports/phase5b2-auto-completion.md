# Phase 5B.2 — Auto 사업 관계 최소 큐레이션 및 종결 감사 보고서

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**HEAD:** `edd5e8b0a7612336db7b031846944055df636203` (base) — Phase 5B/5B.1/5B.2 미커밋  
**작업자:** editorial_manual_review_phase5b2  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| rev-parse HEAD | `edd5e8b0a7612336db7b031846944055df636203` |
| 커밋 상태 | Phase 5B + 5B.1 + 5B.2 전부 working tree (미커밋) |

---

## 2. Phase 5B/5B.1 미커밋 변경 (분류)

| 분류 | 주요 파일 |
|------|-----------|
| Phase 5B auto 전용 | `data/networks/auto.json`, `scripts/migrate_auto_network_phase5b.mjs`, `lib/relation_network/auto_metrics.mjs`, `scripts/verify_auto_relation_network.mjs` |
| Phase 5B.1 공통 orphan/coverage | `lib/relation_network/orphan_metrics.mjs`, `lib/relation_network/coverage_metrics.mjs`, `scripts/curate_auto_relationships_phase5b1.mjs` |
| Phase 5B.2 auto 큐레이션 | `scripts/curate_auto_business_relationships_phase5b2.mjs`, `data/auto_relation_phase5b2_changelog.json` |
| browser 회귀 수정 | `js/relation_network.js` (`resolveNodeFromUrlTicker`, init 재적용, `whenReady`), `scripts/verify_relation_browser.mjs` (initialized 대기) |
| rebuild 파생 (metrics 메타만) | `data/networks/finance.json`, `data/networks/construction.json` orphan metric 정의 갱신 |
| auto UI (layout only) | `js/relation_network.js` (`layoutAutomotiveValueChain`), `js/network_profiles.js` auto profile |

**수정하지 않음:** construction/finance/기타 섹터 관계 edge 데이터, cp_list, hub snapshots.

---

## 3. bigchip 000660 실패 상세 (Phase 5B.1 당시)

| 항목 | 내용 |
|------|------|
| 실패 테스트 | `url-state` — `checkSemiTicker('000660')` |
| 메시지 | `000660: ticker not restored: null`, `000660: no selectedId` |
| URL | `/semiconductor/korea_semiconductor_map.html?tab=graph&ticker=000660` |
| viewport | 1440×900 (url-state 섹션) |
| locale | ko (url-state 전용 context) |
| 기대 | `selectedTicker=000660`, `selectedId=anchor:000660` |
| 실제 | `selectedTicker` 빈값/null, `selectedId` null |
| 원인 분류 | **타이밍 레이스** — `ensureInit()` 비동기 `loadNetwork()` 완료 전 `getState()` 조회 |
| bigchip 해당 여부 | 동일 패턴이 bigchip `krx:000660`에도 적용 가능하나, 실패 로그 label은 semi `000660` |

**참고:** semi canonical ID = `anchor:000660`, bigchip = `krx:000660` (정책 유지).

---

## 4. browser 회귀 원인

1. `RelationNetwork.ensureInit()`이 `initialized: false` 상태로 즉시 반환.
2. `applyUrlToState()`는 `initNetworkData()` 이후에만 ticker→node 매칭 가능.
3. browser QA가 고정 `waitForTimeout(1200~1500ms)`만 사용 → full matrix(3 viewport × 2 lang × 13+ pages)에서 간헐/구조적 실패.
4. `applyUrlToState`의 ticker lookup이 `x.ticker === url.ticker` 단일 경로만 사용 (profile-aware fallback 없음).

---

## 5. 수정 내용

### `js/relation_network.js`
- `resolveNodeFromUrlTicker(nodes, ticker, profileKey)` — semi `anchor:`, bigchip `krx:` fallback.
- `loadNetwork().then()` 후 `applyUrlToState` 재호출.
- `RelationNetwork.whenReady()` Promise API 추가.

### `scripts/verify_relation_browser.mjs`
- `waitForTickerSelection()` — `initialized && selectedTicker && selectedId`까지 대기 (assertion 약화 없음).
- `testPage()` — `initialized` 대기 후 metrics 평가; robot/bio 레이스 완화.

---

## 6. browser QA 결과

| 실행 | 결과 |
|------|------|
| `RN_TEST_QUICK=1 verify:relation-browser` | **failures: 0** |
| full `verify:relation-browser` (3 viewport × 2 lang) | **failures: 1** — `bio/mobile/en`: page JS error (`koreanCompanies` duplicate, `switchTab` undefined) → network 미초기화 |
| url-state (000660 포함) | QUICK/full 모두 **000660 실패 없음** (수정 후) |

**필수 URL spot-check (url-state 통과):**
- bigchip `?tab=graph&ticker=000660` → `krx:000660`
- bigchip `?tab=graph&ticker=005930` → `krx:005930`
- bigchip `?tab=graph&anchor=shared` → `bigchipScope=shared`
- semi `?tab=graph&ticker=000660` → `anchor:000660`
- auto `?tab=graph&ticker=005380` (유효 ticker) — pilot page 목록 포함

**blocker:** full browser matrix의 `bio/mobile/en` JS 오류는 bio 페이지 레거시 이슈로, Phase 5B.2 범위 밖. checkpoint 전 bio 페이지 수정 또는 해당 locale smoke 분리 필요.

---

## 7. peer/orphan 지표 의미 교정

### 문제
- 기존 `peerOnlyCompanyCount=22`는 **모든 edge가 peer+structural(classification)일 때** 카운트 → 이름과 불일치 (22社 모두 `member_of`/`manufactures` 등 보유).

### 교정 (`lib/relation_network/orphan_metrics.mjs`)

| 지표 | 분모 | 의미 |
|------|------|------|
| `hasPeerButNoBusinessCompanyCount` | 22 listed | peer ≥1, confirmed/reported business counterparty 0 |
| `peerOnlyCompanyCount` (strict) | 22 listed | **incident edge 전부 `peer` 타입만** |
| `structuralOnlyCompanyCount` | 22 listed | structural만 (peer/group/business 없음) |
| `classificationOnlyCompanyCount` | 22 listed | CLASSIFICATION_OR_PEER만, business 0 |
| `groupMembershipOnlyCompanyCount` | 22 listed | group_member 있으나 direct commercial·business 없음 |

### auto Phase 5B.2 결과

| 지표 | 값 |
|------|-----|
| `hasPeerButNoBusinessCompanyCount` | **20** |
| `peerOnlyCompanyCount` (strict) | **0** |
| `structuralOnlyCompanyCount` | **0** |
| `classificationOnlyCompanyCount` | **20** |
| `groupMembershipOnlyCompanyCount` | **5** |

validator: `peerOnly`/`hasPeerButNoBusiness` 독립 재검산 추가 (`validate.mjs`).

---

## 8. finance classificationOnly 13→25 감사

| 항목 | 값 |
|------|-----|
| `listedCompanyCount` | 31 |
| confirmed `owns` source (unique) | 6 (`105560`, `055550`, `086790`, `316140`, `138040`, `071050`) |
| `owns` edge count | 9 (confirmed) |
| `classificationOnlyCompanyCount` | **25** |
| owns holder ∈ classificationOnly | **0건** ✓ |

**25 = 31 listed − 6 owns holders.**  
Phase 5B.1에서 `group_member`를 DIRECT_RELATION에서 제외·CLASSIFICATION_OR_PEER에 포함하면서, **group_member+member_of만 있는 12社**가 classification-only로 재분류됨 (13→25).

**classificationOnly 25社 ID:**  
`032830`, `006800`, `000810`, `024110`, `005940`, `016360`, `005830`, `039490`, `029780`, `138930`, `175330`, `088350`, `001450`, `139130`, `100790`, `003540`, `003530`, `027360`, `003470`, `000370`, `001500`, `094800`, `041190`, `001200`, `078020`

metrics 계산 수정 불필요 — 정책 변경에 따른 정확한 결과.

---

## 9. 조사한 지분 후보

| source | target | 조사 문서 | 결과 |
|--------|--------|-----------|------|
| `krx:000240` 한국앤컴퍼니 | `krx:161390` 한국타이어앤테크놀로지 | DART rcpNo `20250318000944` (2025.03.18 사업보고서) | **accepted** |
| 기타 cp_list 내부 | — | — | human review 불필요 (그래프 필수 直接관계 없음) |

**DART 인용:** 관계기업 현황 — 한국타이어앤테크놀로지㈜ 유효지분율 당기말 **31.15%** (관계기업, 종속 아님).

---

## 10. 수락한 지분관계

| edge ID | type | source | target | stakePct | asOf | status |
|---------|------|--------|--------|----------|------|--------|
| `owns-stake-000240-161390` | `owns_stake_in` | `krx:000240` | `krx:161390` | 31.15 | 2024-12-31 | confirmed |

- evidence: DART primary, `sourceOpened=true`, `directEvidence=true`, `reviewStatus=reviewed`
- `owns`(지배) 아님 — 관계기업 지분법 대상

---

## 11. 조사한 공급 후보

| source | 후보 유형 | 판정 |
|--------|-----------|------|
| `012330` 현대모비스 | supplies_system | deferred — 사업보고서 고객 집계만 |
| `005850` 에스엘 | supplies_lighting | deferred — DART 단일판매·공급계약 원문 미개봉 |
| `161390` 한국타이어 | supplies_tire | deferred — 익명/집계 매출처 |
| `018880` 한온시스템 | supplies_system | deferred — 양산 공급 DART/KIND 미개봉 |

---

## 12. 수락한 공급관계

**0건** — 추정·스니펫 기반 생성 금지 정책 준수.

---

## 13. 조사한 차종 탑재 후보

공식 완성차·부품사 원문에서 product+vehicle+production 동시 확인 가능 건 **없음**.

---

## 14. 수락한 차종 관계

**0건**

---

## 15. 공동개발/JV 결과

**0건** — MOU/JV DART/KIND 직접 근거 없음.

---

## 16. rejected/deferred 관계와 이유

| candidate ID | 판정 | 사유 |
|--------------|------|------|
| supply-012330-deferred | deferred | DART 개별 공급계약 미개봉 |
| supply-005850-deferred | deferred | 계약 본문(상대방·상태) 미확인 |
| supply-161390-deferred | deferred | exact OEM 추정 금지 |
| supply-018880-deferred | deferred | 양산 공급 primary source 없음 |
| fitment_audit | deferred | used_in_vehicle 0 유지 |
| jv_audit | deferred | develops_with/JV 0 유지 |

---

## 17. status별 edge 수 (auto)

| status | count (approx) |
|--------|----------------|
| reference | structural generated 다수 |
| reported | 5 (group_member) + 0 supply |
| confirmed | 1 (owns_stake_in) |
| peer | 52 (defaultHidden) |

**total edges:** 117

---

## 18. 사업 관계 수

| 유형 | count |
|------|-------|
| confirmed/reported business (denominator) | 1 |
| supply (actual) | 0 |
| ownership (`owns`/`owns_stake_in`) | 1 |
| vehicle fitment | 0 |
| joint development / JV | 0 |
| group_member | 5 |

---

## 19. coverage 분자·분모

| metric | numerator | denominator | display |
|--------|-----------|-------------|---------|
| businessRelationshipDirectEvidence | 1 | 1 | 100% |
| businessRelationshipPrimarySource | 1 | 1 | 100% |
| supplyDirectEvidence | 0 | 0 | N/A |
| supplyPrimarySource | 0 | 0 | N/A |
| fitmentDirectEvidence | 0 | 0 | N/A |
| fitmentPrimarySource | 0 | 0 | N/A |
| ownershipDirectEvidence | 1 | 1 | 100% |
| ownershipPrimarySource | 1 | 1 | 100% |
| groupMembershipPrimarySource | 5 | 5 | 100% |

---

## 20. orphan 지표와 기업 ID

| 지표 | count | 비고 |
|------|-------|------|
| `businessRelationOrphanCount` | 20 | 000240·161390 해소 |
| `directCommercialRelationshipOrphanCount` | 20 | |
| `classificationOnlyCompanyCount` | 20 | |
| `hasPeerButNoBusinessCompanyCount` | 20 | |
| `peerOnlyCompanyCount` | 0 | strict |
| `groupMembershipOnlyCompanyCount` | 5 | HMG member |
| `weakRelationOnlyCompanyCount` | 17 | |

**business orphan 20社:**  
`005380`, `000270`, `012330`, `307950`, `018880`, `005850`, `204320`, `007340`, `011210`, `073240`, `064960`, `025540`, `002350`, `003620`, `015750`, `009900`, `097520`, `010690`, `200880`, `000430`

---

## 21. validator 변경

- auto: `peerOnly` / `hasPeerButNoBusiness` 재검산
- auto: confirmed `owns_stake_in` stakePct/asOf gate (기존)
- finance verify: owns source ∉ classificationOnly assert 추가

---

## 22. 수정·생성 파일

**생성**
- `scripts/curate_auto_business_relationships_phase5b2.mjs`
- `data/auto_relation_phase5b2_changelog.json`
- `docs/reports/phase5b2-auto-completion.md`

**수정 (Phase 5B.2 범위)**
- `js/relation_network.js`
- `scripts/verify_relation_browser.mjs`
- `lib/relation_network/orphan_metrics.mjs`
- `lib/relation_network/auto_metrics.mjs`
- `lib/relation_network/validate.mjs`
- `scripts/verify_auto_relation_network.mjs`
- `scripts/verify_finance_relation_network.mjs`
- `scripts/rebuild_site.mjs`
- `data/networks/auto.json`

---

## 23. build/verify 결과

| command | exit |
|---------|------|
| `npm run build` ×2 | 0 |
| `auto.json` MD5 (build×2) | `8CBC83E8259FF16857CF4E856C782F2C` (동일) |
| `verify:auto` | 0, warnings 0 |
| `verify:relation-network` | 0 |
| `verify:finance` | 0, owns 9건 유지 |
| `verify:construction` | 0 |
| `verify:renewable` | 0 |
| `verify:nuclear` | 0 |
| `verify:powergrid` | 0 |
| `verify:ship` | 0 |
| `verify:battery` | 0 |
| `verify:bigchip` | 0 |
| `verify:semi-relations` | 0 |
| `verify:nav-tab-preserve` | 0 |
| `verify:data-sector-profile` | 0 |
| `RN_TEST_QUICK=1 verify:relation-browser` | **failures: 0** |
| full `verify:relation-browser` | **failures: 1** (bio/mobile/en — 범위外) |

---

## 24. idempotency

- `curate_auto_business_relationships_phase5b2.mjs` 재실행 → ownership edge idempotent skip, validate failures 0
- build×2 → auto.json hash 동일

---

## 25. 타 섹터 회귀

- finance owns 9건·stakePct·confirmedOwnershipEdgeCount=9 **유지**
- construction claimSupport / edge semantics **변경 없음** (metrics 메타만)
- cp_list 22 tickers **유지**
- auto 외 sector nodes/edges/status **의도 변경 없음**

---

## 26. 남은 human review

1. 공급·수주: DART 단일판매·공급계약 원문 개봉 후 개별 `supplies_*` 추가 (최대 6건 상한)
2. 차종 탑재: OEM+부품사 공식 press/DART 동시 확인 시 `used_in_vehicle` 체인
3. bio `/mobile/en` page JS (`koreanCompanies` duplicate) — full browser QA blocker
4. structural over-cap (005380/000270 EV+수소 3건) — Phase 5B.1 감사 메모 유지

---

## 27. auto 종료 가능 여부

**조건부 가능.**  
auto 네트워크·metrics·validator·confirmed ownership 1건·orphan 정책·QUICK browser QA는 Phase 5B.2 목표 충족.  
공급/탑재/JV는 evidence 없이 0건 유지가 정책상 올바른 상태.

---

## 28. checkpoint commit 가능 여부

**조건부 가능 (권장: bio mobile/en 수정 또는 browser matrix 예외 문서화 후).**

- Phase 5B+5B.1+5B.2를 **단일 checkpoint commit**으로 묶을 수 있음
- full `verify:relation-browser` failures 0 미달 (`bio/mobile/en` 1건)
- commit/push/PR/배포는 **본 작업에서 수행하지 않음**

---

## 29. electrical 진입 가능 여부

**가능.** auto sector relation-network 파이프라인(migrate→curate5b1→curate5b2→emit) 패턴 확립.  
electrical은 별도 Phase로 cp_list·legacy HTML·profile 등록 후 동일 orphan/coverage 정책 적용 권장.

---

## 필수 선언

| 항목 | 결과 |
|------|------|
| 신규 상장사 추가 | **없음** |
| cp_list 변경 | **없음** (22 유지) |
| 추정 공급관계 생성 | **없음** |
| orphan padding | **없음** |
| auto 외 관계 데이터 변경 | **없음** |
| `refresh:hub-snapshots` 실행 | **없음** |
| 배포/commit/push/PR | **없음** |
