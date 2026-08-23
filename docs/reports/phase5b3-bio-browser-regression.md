# Phase 5B.3 — Bio mobile/en Browser 회귀 수정 및 Checkpoint 사전 검증

**작성일:** 2026-08-23  
**브랜치:** `codex/relation-network-phase4-checkpoint`  
**HEAD:** `edd5e8b0a7612336db7b031846944055df636203` (base) — Phase 5B/5B.1/5B.2/5B.3 전부 미커밋  

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| rev-parse HEAD | `edd5e8b0a7612336db7b031846944055df636203` |
| 커밋 | 없음 (Phase 5B 전체 working tree) |

**Phase 5B.3 신규 수정 (본 작업):**

| 파일 | 변경 |
|------|------|
| `scripts/enrich_company_fields.mjs` | bio inline 중복 삽입 버그 제거 |
| `scripts/patch_relation_network.mjs` | legacy graph orphan strip (idempotent) |
| `bio/bio_inline_tail.js` | legacy D3 graph 잔여 함수 제거 |
| `bio/korea_bio_map.inline.js` | gen 재생성 (tail 동기화) |

---

## 2. full browser 실패 원문 (Phase 5B.2 관찰)

```
bio/mobile/en: bio network not initialized; console: SyntaxError: Identifier 'koreanCompanies' has already been declared | ReferenceError: switchTab is not defined
```

**테스트 조건 (verify_relation_browser.mjs):**

| 항목 | 값 |
|------|-----|
| URL | `http://127.0.0.1:8766/bio/korea_bio_map.html?tab=graph&lang=en` |
| viewport | mobile 375×812 |
| locale | `lang=en` (query string) |

---

## 3. 최초 JavaScript 오류

**1차 오류:** `SyntaxError: Identifier 'koreanCompanies' has already been declared`

- 동일 `<script>` lexical scope에 `const koreanCompanies`가 **두 번** 선언되면 inline.js 전체 파싱이 중단됨.
- 파싱 중단 → `switchTab` 등 후속 함수 정의 미실행 → `RelationNetwork` init 미호출.

**재현 경로:** `node scripts/enrich_company_fields.mjs` 단독 실행 시 (수정 전)

- `head = inline.slice(0, indexOf('const CHAIN_COLORS'))` → 헤더 주석만 포함, `koreanCompanies` 없음
- `dataStart = head.indexOf('const koreanCompanies')` → **-1**
- `prefix = inline.slice(0, -1)` → 파일 거의 전체(첫 `koreanCompanies` 포함) 복제
- `mid`에 두 번째 `const koreanCompanies` 삽입 → **syntax error**

`rebuild_site.mjs`는 `enrich`(54행) 후 `gen_korea_bio_inline`(90행)을 실행하므로, **정상 full build 후**에는 gen이 inline을 덮어써 즉시 증상이 사라질 수 있음. enrich만 실행되거나 rebuild 중 gen 이전에 verify가 돌면 blocker 재현.

---

## 4. koreanCompanies 중복 원인

| 분류 | 해당 | 설명 |
|------|------|------|
| A. 동일 scope 중복 const | **예** | `enrich_company_fields.mjs` slice 버그 |
| B. inline + 외부 script 중복 | 아니오 | HTML에 inline data 없음, script tag 1개 |
| C. patch marker 실패 이중 삽입 | 아니오 | cross-sector marker 1회 |
| D. tail vs inline data 중복 | 아니오 | data는 gen dataBlock만, tail에는 선언 없음 |
| E. build 누적 idempotency | **잠재** | enrich 단독 실행 시 E에 해당 |

**canonical source:** `bio/gen_korea_bio_inline.mjs` dataBlock + `bio/bio_inline_tail.js` (UI only)

---

## 5. switchTab undefined의 직접 원인

| 항목 | 결과 |
|------|------|
| 정의 위치 | `bio/bio_inline_tail.js` → gen → `korea_bio_map.inline.js` |
| 전역 노출 | `<script src>` top-level `function switchTab` → global (onclick 호환) |
| 직접 원인 | **1차 syntax error로 script 전체 미실행** (cascade) |
| mobile/en 전용 | 아니오 — enrich corruption 시 모든 viewport/lang 동일 실패 |
| map_tab_state 충돌 | 없음 (`applyInitialTab(switchTab)` 인자로만 사용) |

수정 후 isolated Playwright (375×812, `lang=en`): `typeof switchTab === 'function'`, `RelationNetwork.getState().initialized === true`.

---

## 6. 수정한 source-of-truth

1. **`scripts/enrich_company_fields.mjs`**
   - bio inline 수동 patch **삭제**
   - `gen_korea_bio_inline.mjs`만 호출 (내부 `enrichBioCompanies` 이미 수행)
   - enrich 단독 실행 후에도 `koreanCompanies` 선언 **1회** 유지 확인

2. **`bio/bio_inline_tail.js`**
   - RelationNetwork v2 이후 남은 legacy `showTooltip(e,d)` / `zoomBehavior` 참조 블록 제거 (~51 lines)

3. **`scripts/patch_relation_network.mjs`**
   - `stripBioLegacyGraphOrphans()` 추가 — `function showTooltip(e, d)` ~ `resetTableFilters` 전 idempotent strip

---

## 7. 최종 HTML 선언 및 script include 수

| 항목 | bio/korea_bio_map.html |
|------|------------------------|
| `const koreanCompanies` (inline.js) | **1** |
| `function switchTab` | **1** |
| `korea_bio_map.inline.js` script tag | **1** |
| RN module scripts | network_profiles, relation_network_legacy, relation_network 각 1 |

**inline.js MD5 (build×2 동일):** `14da373ea4c5e06b378b3138ab46a5ad`

---

## 8. bio 데이터 전후 비교

| 항목 | 값 | 변경 |
|------|-----|------|
| listed companies (inline) | 59 | 없음 |
| tickers (sample) | 207940, 068270, 196170 | 없음 |
| `data/networks/bio.json` nodes | 60 | 없음 |
| edges | 1 | 없음 |
| bio.json MD5 | `4c9e7929077ba3ed1e9cb09ba8fa6a27` | UI-only rebuild, 관계 의미 변경 없음 |
| SK바이오사이언스–GSK (krx:302440) | confirmed edge 유지 | 없음 |
| legacyFallback | structured JSON 사용 | 없음 |

---

## 9. bio KO/EN·viewport별 QA

full `verify:relation-browser` matrix (desktop/tablet/mobile × ko/en, robot 포함):

| 결과 | failures |
|------|----------|
| **0** | bio/mobile/en 포함 전 viewport/lang 통과 |

수동 Playwright spot-check (bio mobile/en):

- console/page error (koreanCompanies/switchTab): **0**
- `initialized`: **true**
- `switchTab`: **function**

---

## 10. bigchip/semi 000660 회귀 결과

| URL state | 결과 |
|-----------|------|
| bigchip `?tab=graph&ticker=000660` | verify url-state 통과 |
| semi `?tab=graph&ticker=000660` | verify url-state 통과 |
| bigchip `?tab=graph&ticker=005930` | 통과 |
| bigchip `?tab=graph&anchor=shared` | 통과 |

Phase 5B.2 `whenReady()` / URL 재적용 — bio listener 중복·init 지연 **관찰 없음**.

---

## 11. auto QA 결과

| 항목 | 값 |
|------|-----|
| `verify:auto` | exit 0 |
| nodes / edges | 78 / 117 |
| auto.json MD5 | `8cbc83e8259ff16857cf4e856c782f2c` (build×2 stable) |
| confirmed owns_stake_in | 000240→161390 31.15% 유지 |
| warnings | 0 |

---

## 12. build 1/2 idempotency

| build | bio inline MD5 | koreanCompanies count | git bio diff after 2nd build |
|-------|----------------|----------------------|------------------------------|
| 1 | `14da373ea4c5e06b378b3138ab46a5ad` | 1 | — |
| 2 | `14da373ea4c5e06b378b3138ab46a5ad` | 1 | 추가 drift 없음 (동일 hash) |

`enrich_company_fields.mjs` 단독 실행 후: koreanCompanies **1** (회귀 수정 확인).

---

## 13. 전체 verify 결과

| 명령 | exit |
|------|------|
| `npm run build` ×2 | 0 |
| `npm run verify:relation-network` | 0 |
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
| `npm run verify:relation-browser` (full) | 0 |

---

## 14. full relation-browser failures 수

**0**

---

## 15. 수정·생성 파일

**Phase 5B.3 본 작업:**

- `scripts/enrich_company_fields.mjs` (modified)
- `scripts/patch_relation_network.mjs` (modified)
- `bio/bio_inline_tail.js` (modified)
- `bio/korea_bio_map.inline.js` (regenerated)
- `docs/reports/phase5b3-bio-browser-regression.md` (created)

**Phase 5B/5B.1/5B.2 누적 (checkpoint 후보, 변경 없음):** auto network, metrics, browser fixes, verifiers, phase5b2 report 등 (git status 참조).

---

## 16. auto 외 의미 변경 여부

| 영역 | 변경 |
|------|------|
| bio 관계 JSON nodes/edges/status | **없음** |
| auto 관계 데이터 | **없음** (5B.2 이후 추가 변경 없음) |
| construction/finance network | metrics/metadata rebuild drift only (5B.2와 동일) |
| cp_list | **없음** |

finance `owns` confirmed edges: **9건** 유지.

---

## 17. 남은 uncommitted 파일

`git status --short` 기준: Phase 5B 전체 + bio 5B.3 4파일 + `docs/reports/` (phase5b2, phase5b3).

hub snapshot: **refresh:hub-snapshots 미실행** — snapshot 전용 drift 없음 (rebuild gate만).

---

## 18. Phase 5B checkpoint 가능 여부

**가능** — strict 기준 충족:

- full `verify:relation-browser` failures **0**
- auto JSON hash stable
- bio browser blocker 해소
- build×2 idempotent

---

## 19. checkpoint 포함/제외 파일

**포함 (권장):**

- Phase 5B/5B.1/5B.2 auto data·scripts·metrics·validators·reports
- Phase 5B.2 browser race fix (`js/relation_network.js`, `scripts/verify_relation_browser.mjs`)
- Phase 5B.3 bio pipeline fix (`enrich_company_fields.mjs`, `patch_relation_network.mjs`, `bio/bio_inline_tail.js`, `bio/korea_bio_map.inline.js`)
- `docs/reports/phase5b2-auto-completion.md`, `phase5b3-bio-browser-regression.md`
- rebuild-derived metrics-only JSON/changelog (construction/finance/powergrid/battery)

**제외:**

- `dist/` browser artifacts
- Playwright 로그·screenshot (없음)
- hub snapshot refresh 산출물 (미실행)
- 임시 audit 스크립트 (`scripts/_audit_*.mjs` 등, 존재 시)

---

## 20. electrical 진입 가능 여부

**가능** — Phase 5B checkpoint 사전 검증 통과. `elec` sector는 data-sector profile 22 maps 검증 포함, browser matrix blocker 없음.

---

## 제약 준수 확인

- 테스트 skip/예외 추가 **없음**
- cp_list 변경 **없음**
- 신규 관계 추가 **없음**
- bio 관계 데이터 변경 **없음**
- auto 관계 데이터 추가 변경 **없음**
- refresh:hub-snapshots 실행 **없음**
- 배포/commit/push/PR **없음**
