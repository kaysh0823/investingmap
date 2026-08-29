# Phase 5C.2 — Elec Node 증가 감사 및 Construction Browser Flake 제거 보고서

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**base HEAD:** `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b`  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| HEAD | `4cfc5bacfac7abb398e1e5cd0d2577e4451f4a7b` (Phase 5C/5C.1/5C.2 미커밋) |
| verify:elec | OK, warnings 0 |
| elec nodes/edges | **86 / 107** |
| business edges | **0** |
| generic forbidden ID | **0** |

---

## 2. Phase 5C/5C.1 변경 범위

| 분류 | 내용 |
|------|------|
| Phase 5C | elec network JSON, migrate, layout, profile |
| Phase 5C.1 | canonical product map, curate, validator |
| Phase 5C.2 | node audit, readiness fix, browser stability (본 phase) |

---

## 3. nodes 56→86 정확한 원인

**순증가 +30** = Phase 5C.1에서 `product:item` / `component:item` **공유 generic 제거** 후 **ticker별 고유 product·component node** 생성.

| 구분 | Phase 5C (56) | Phase 5C.1 (86) |
|------|---------------|-----------------|
| listed + global + lane + sector + end_market | 39 | 39 |
| product | 9 (다수 공유 `product:item`) | **24** (기업별 1) |
| component | 8 (다수 공유 `component:item`) | **23** |
| **합계** | **56** | **86** |

감사 파일: `data/elec_relation_phase5c2_node_audit.json`  
스크립트: `scripts/audit_elec_nodes_phase5c2.mjs`

---

## 4. type별 before/after

| type | before | after |
|------|--------|-------|
| listed_company | 24 | 24 |
| global_company | 4 | 4 |
| business_category | 4 | 4 |
| cross_sector_anchor | 4 | 4 |
| end_market | 3 | 3 |
| product | 9 | 24 |
| component | 8 | 23 |
| **total** | **56** | **86** |

---

## 5. 추가 node 30개 전수 분류

**addedNodeIds 41 / removedNodeIds 11** (순 +30)

| 분류 | count | 설명 |
|------|-------|------|
| 신규 product (ticker별) | ~15 net | generic `product:item` 대체 |
| 신규 component (ticker별) | ~15 net | generic `component:item` 대체 |
| 제거 generic | -2 | `product:item`, `component:item` |
| rename superseded | -9 | `product:mlcc`→`product:mlcc_camera_substrate`, `product:tv`→`product:home_appliances_tv_auto` 등 |

**generic·구 node 잔존:** **없음** (alias node 0, forbidden ID 0)

---

## 6. 제거·통합한 node

| removed ID | 사유 |
|------------|------|
| `product:item` | 15+ label 공유 forbidden generic |
| `component:item` | 동일 |
| `product:mlcc`, `product:tv`, `product:oled`, `product:ems` 등 | canonical rename으로 supersede |

---

## 7. 유지한 기업별 product node와 이유

- **24 product + 23 component** — listed 24社 각각 `ELEC_PRODUCT_BY_TICKER` 기반
- **의미:** map `semType`/`products`와 ELEC_CONFIG 일치, generic slug(`item`) 방지
- **EMS 분리:** 248070 `power_module_esl_ems` vs 049070 `electronics_ems_intops` (동일 `product:ems` 공유 해소)

---

## 8. 공유 canonical product 정책

| 정책 | 적용 |
|------|------|
| ticker별 specializes_in product | 24社 각 1개 (label 충돌 방지) |
| **공유 허용** | `component:electronic_module` — 043260·065350 (동일 부품 범주) |
| end_market | `automotive_electronics`, `consumer_electronics` 공유 (exposed_to) |
| ticker suffix 가짜 고유 ID | **생성하지 않음** |

---

## 9. zero-degree/duplicate/alias 검사

| 검사 | 결과 |
|------|------|
| zero-degree | **3** (허용 사유 명시) |
| duplicate node ID | 0 |
| duplicate semantic label | 0 |
| alias-only graph node | 0 |
| forbidden generic | 0 |
| self-edge | 0 |
| duplicate edge | 0 |

**허용 zero-degree (3):**

| node | 사유 |
|------|------|
| `sector:powergrid` | boundary placeholder (cross_sector edge 미연결) |
| `sector:battery` | 동일 |
| `end_market:industrial_electronics` | end_market anchor, exposed_to 미사용 |

---

## 10. 최종 nodes/edges

| metric | value |
|--------|-------|
| nodes | 86 |
| edges | 107 |
| listed | 24 |
| business | 0 |
| cross_sector_reference | 4 |

---

## 11. generic ID 결과

**0** — validator + audit 통과

---

## 12. construction flake 원문

| 항목 | 값 |
|------|-----|
| 실패 (Phase 5C.1 세션 1회차) | `construction/desktop/ko: construction network not initialized` |
| URL | `/construction/korea_construction_map.html?tab=graph&lang=ko` |
| viewport | 1440×900 |
| locale | ko |
| 재실행 | 통과 (간헐) |

후속 full matrix에서 `url-state: 042700: network not ready (whenReady timeout; readiness=layoutReady true)` — **readiness는 ready인데 whenReady promise 미 resolve** 버그 확인.

---

## 13. flake 근본 원인

1. `testPage`가 `waitForFunction(initialized)` **timeout을 `.catch(() => {})`로 삼킴** → 레이스 후 false negative
2. `whenReady()` waiter 큐가 **init 완료 후 등록 시 resolve 누락** 가능
3. `destroy()`가 sector 전환 시 waiter **reject** → url-state 연속 navigation 간섭
4. **`initialized`만 확인** — `firstRenderComplete`/`layoutReady` 미검사

---

## 14. readiness 수정

`js/relation_network.js`:

| flag | 의미 |
|------|------|
| `dataLoaded` | fetch 완료 |
| `initialized` | nodes/edges 적용 |
| `urlStateApplied` | URL state 반영 |
| `firstRenderComplete` | 첫 renderGraph 완료 |
| `layoutReady` | initialized ∧ firstRenderComplete |

- `getReadiness()` API 추가
- `whenReady()` → **20ms polling** (waiter 큐 제거)
- `markFirstRenderComplete()` — container/d3 없을 때도 complete 처리

`scripts/verify_relation_browser.mjs`:

- `waitForNetworkReady()` — `getReadiness().layoutReady` 우선, `whenReady()` 보조
- `firstRenderComplete` assertion 추가
- `RN_TEST_ONLY` / `RN_TEST_RUNS` env (retry wrapper **아님**, 전체 suite 반복)
- `TEST_ONLY` 시 url-state 생략 (construction isolation)

---

## 15. construction 반복 QA 5회

```
RN_TEST_ONLY=construction RN_TEST_RUNS=5
run 1-5: failures=0
```

---

## 16. full browser 반복 QA 3회

```
RN_TEST_RUNS=3 (full matrix)
run 1/3: failures=0 duration=705907ms
run 2/3: failures=0 duration=706404ms
run 3/3: failures=0 duration=694961ms
```

로그: `data/browser_stability_phase5c2.log`

---

## 17. 전체 verify

| command | exit |
|---------|------|
| npm run build ×2 | 0, idempotent |
| verify:relation-network | 0 |
| verify:elec | 0, warnings 0 |
| verify:auto … verify:data-sector-profile | 0 |
| verify:relation-browser ×3 | 0 |

---

## 18. idempotency

`elec.json` SHA256: `FFD7980EE9E48409359C689C98A8C629CFAF4E89436B6FE00F8896DD3DFF27EE` (build×2 동일)

---

## 19. 수정·생성 파일

### 신규
- `scripts/audit_elec_nodes_phase5c2.mjs`
- `data/elec_relation_phase5c2_node_audit.json`
- `data/browser_stability_phase5c2.log`
- `docs/reports/phase5c2-electrical-closure-audit.md`

### 수정
- `js/relation_network.js` — readiness contract
- `scripts/verify_relation_browser.mjs` — waitForNetworkReady, RN_TEST_RUNS
- `scripts/verify_elec_relation_network.mjs` — nodeMetrics 보강

---

## 20. 타 섹터 회귀

auto, construction, bio, bigchip, semi URL state — full browser 3/3 통과. 다른 섹터 edge 의미 변경 없음.

---

## 21. 남은 human review

1. DART primary source 기반 business edge 큐레이션 (0건 유지)
2. zero-degree sector anchor 3개 — 필요 시 cross_sector reference 또는 exposed_to 연결 검토
3. `component:electronic_module` 공유 정책 유지 모니터링

---

## 22. elec 종료 가능 여부

**가능** — node 증가 정당성 확인, generic 0, graph integrity OK, browser stable.

---

## 23. checkpoint 가능 여부

**가능** — construction 5/5, full browser 3/3 failures 0, elec warnings 0, idempotent build.

---

## 24. metal 진입 가능 여부

**가능** — elec Phase 5C 계열 패턴·readiness·browser QA 확립 완료.

---

## 필수 명시

| 항목 | 값 |
|------|-----|
| 신규 business 관계 | **없음** |
| 신규 상장사 | **없음** |
| cp_list 변경 | **없음** |
| orphan padding | **없음** |
| 테스트 retry/skip/약화 | **없음** (assertion 유지, readiness 계약 강화) |
| refresh:hub-snapshots | **없음** |
| 배포/commit/push/PR | **없음** |
