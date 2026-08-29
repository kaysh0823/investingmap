# Phase 5F — kconsume + kcontent 묶음 요약

**작성일:** 2026-08-29
**브랜치:** `codex/relation-network-phase4-checkpoint`
**시작 HEAD:** `3d13fb55661adcf1bf83c1781cab447aecfdc8d2`
**정책:** 한 세션에서 공통 브랜드·유통·IP 패턴 재사용, JSON/metrics/validator/verifier는 **완전 분리**. **Commit하지 않음.**

개별 보고서: [kconsume](./phase5f-kconsume-completion.md) · [kcontent](./phase5f-kcontent-completion.md) · [targeted browser JSON](./phase5f-targeted-browser-qa.json)

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| HEAD | `3d13fb55661adcf1bf83c1781cab447aecfdc8d2` |
| status at start | clean |
| known issue | `docs/known-issues/relation-browser-pagecreate-flake.md` |
| deployment browser gate | **pending** |

---

## 2–3. 경로·data-sector

| sector | HTML | data-sector | networkPath |
|--------|------|-------------|-------------|
| kconsume | `kconsume/korea_kconsume_map.html` | `kconsume` | `../data/networks/kconsume.json` |
| kcontent | `kcontent/korea_kcontent_map.html` | `kcontent` | `../data/networks/kcontent.json` |

---

## 4. cp_list·ticker·chain

| | kconsume | kcontent |
|--|----------|----------|
| listed | **22** (불변) | **20** (불변) |
| chains | 식품9 · 유통5 · 패션5 · 레저3 | 게임12 · K-pop4 · 미디어4 |
| 신규 상장사 | 0 | 0 |

---

## 5–6. Legacy 감사 · 제거·강등·숨김

| | kconsume | kcontent |
|--|----------|----------|
| legacy peer demoted | 4 (Nestlé/PepsiCo/Costco/Marriott) | 7 (Spotify/UMG/Warner/Netflix/Tencent) |
| defaultHidden | yes | yes |
| unsupported removed | 0 | 0 |
| invented contracts | 0 | 0 |

---

## 7. Model / layout / lane

| | kconsume | kcontent |
|--|----------|----------|
| model | `consumer_brand_distribution_ecosystem` | `content_ip_production_distribution_ecosystem` |
| layout | `consumerBrandDistributionEcosystem` | `contentIpDistributionEcosystem` |
| lanes | brand_owner · manufacturing · retail_channel · leisure_lifestyle | label_agency · production_studio · ip_rights · distributor · platform |

---

## 8–9. Canonical

**Kconsume:** `krx:` / `brand:` / `consumer_category:` / `global:` / `sector:`
**Kcontent:** `krx:` / `artist:` / `content_ip:` / `content_category:` / `global:` / `sector:`

generic ID **0** · duplicate semantic **0** · 법적회사↔브랜드/아티스트/IP 분리.

---

## 10–13. 구조 vs business

| | kconsume | kcontent |
|--|----------|----------|
| structural | member_of 22, operates_brand 19, specializes_in 22, xref 2 | member_of 20, represents_artist 11, controls_ip 6, specializes_in 20, xref 3 |
| confirmed/reported business | **0 / 0** | **0 / 0** |
| nodes / edges | 65 / 69 | 56 / 67 |

---

## 14. 브랜드 소유·운영·라이선스

- Phase 5F는 **`operates_brand` 구조만** (legal `owns_brand` confirmed 없음).
- 브랜드 홈페이지로 소유 확정하지 않음.

---

## 15. 아티스트 소속·전속 lifecycle

- `represents_artist` = 공식 소속 **구조** (최대 회사당 3).
- 계약기간 불명 → permanent active exclusive **미표시**.
- ended 소속 기본표시 없음.

---

## 16. IP 소유·제작·유통

- `controls_ip` 구조만 (게임·드라마 슬레이트 대표 IP).
- 제작사→owns_ip 자동연결 **없음**.
- 플랫폼 공개→exclusive `streams_on` **없음**.

---

## 17. 유통·채널·시장

- 채널/시장 exposure를 business로 집계하지 않음.
- 입점·온라인 노출·수출지역 exact 고객화 **없음**.

---

## 18. Cross-sector reference

| from | to | 의미 |
|------|-----|------|
| CJ제일제당 | cosmetics | 뷰티 경계 탐색 링크 |
| 롯데웰푸드 | kcontent | IP 콜라보 경계 |
| HYBE | kconsume | 굿즈·브랜드 협업 경계 |
| CJ ENM | telecom | IPTV owning sector 가능 |
| 디어유 | software | 팬플랫폼 기술≠유통계약 |

Business count / orphan 해소에 **미포함**.

---

## 19. Status별 edge

| status | kconsume | kcontent |
|--------|----------|----------|
| reference | 65 | 60 |
| peer | 4 | 7 |
| confirmed/reported/ended | 0 | 0 |

---

## 20–21. Coverage · orphan · zero-degree

| | kconsume | kcontent |
|--|----------|----------|
| business coverage 0/0 | N/A | N/A |
| businessRelationOrphanCount | 22 | 20 |
| zeroDegreeNodeCount | 0 | 0 |
| orphan padding | **No** | **No** |

---

## 22. Validator

- 섹터별 verify 스크립트 분리 (`verify:kconsume`, `verify:kcontent`)
- 공통 validate.mjs에 섹터 규칙 추가
- 한 섹터 실패를 다른 섹터로 보완하지 않음
- warnings: **0 / 0**

---

## 23. UI·URL·모바일

- 공통 `js/relation_network.js` layouts만 추가
- 신규 전용 UI 기능 없음
- URL: tab/lang/ticker + reload/popstate
- 375px: 축약 레이아웃 + bottom sheet 패턴 재사용
- peer/inferred 기본 숨김

---

## 24. 수정·생성 파일 (요약)

**신규:**
`data/networks/kconsume.json`, `data/networks/kcontent.json`,
`data/*_relation_phase5f_{audit,changelog}.json`,
`lib/relation_network/kconsume_*.mjs`, `lib/relation_network/kcontent_*.mjs`,
`scripts/audit_*_phase5f.mjs`, `scripts/migrate_*_network_phase5f.mjs`,
`scripts/verify_*_relation_network.mjs`, `scripts/verify_phase5f_targeted_browser.mjs`,
`docs/reports/phase5f-*.md`, `docs/reports/phase5f-targeted-browser-qa.json`

**공통 최소 수정:**
`schema.mjs`, `profiles.mjs`, `validate.mjs`, `js/relation_network.js`, `js/network_profiles.js`,
`rebuild_site.mjs`, `verify_relation_network.mjs`, `verify_relation_browser.mjs` (PHASE5F_PAGES for RN_TEST_ONLY only), `package.json`

---

## 25. Build / verify

| step | result |
|------|--------|
| `npm run build` ×2 | exit 0 |
| JSON hash idempotent | kconsume `562DB444…938EE` · kcontent `64691FE9…B2D9E2` (동일) |
| hub_index / sitemap | builtAt noise restore (refresh:hub-snapshots **미실행**) |
| verify:relation-network | OK (기존 nuclear WARN만) |
| verify:kconsume / kcontent | OK, warnings 0 |
| verify:cosmetics · metal · elec · auto · construction · finance · bigchip · semi-relations | OK |
| verify:nav-tab-preserve · data-sector-profile | OK |

---

## 26. Targeted browser QA

스크립트: `scripts/verify_phase5f_targeted_browser.mjs` (full matrix **미실행**)

| case | result |
|------|--------|
| kconsume desktop/ko | OK |
| kconsume mobile/en | OK |
| kcontent desktop/ko | OK |
| kcontent mobile/en | OK |
| cosmetics desktop/ko | OK |
| bigchip 000660 | OK |
| construction mobile/ko | OK |
| bio mobile/en | OK |

app failures **0** · infra (pageCreate) **0** · retry-as-success **없음**

---

## 27. Known full-matrix gate

- Full relation-browser matrix **미실행**
- Stability gate **pending** (known pageCreate flake)
- Deployment browser gate **미충족** (의도적)

---

## 28. Idempotency

Build 2회 후 두 네트워크 JSON SHA-256 불변.

---

## 29. 타 섹터 회귀

선행 verify 전부 exit 0. cosmetics/metal/elec/auto/construction/finance/bigchip/semi 관계 의미 변경 없음. hub snapshot 미갱신.

---

## 30. Human review

- 구조 분류 + demoted peer만; confirmed business 0은 의도적(증거 게이트)
- 향후 DART/IR 확보 시에만 manufactures_for / distributes_for / owns_ip / exclusive streams 추가
- 광고·브랜드 협업은 orphan 해소용으로 쓰지 말 것

---

## 31–33. 종료·checkpoint·다음 섹터

| 항목 | 판정 |
|------|------|
| **31. 각 섹터 종료 가능** | **Yes** (데이터+targeted QA). full-matrix는 별도 gate |
| **32. 묶음 checkpoint 가능** | **Yes (구현 완료, commit은 사용자 지시 대기)** |
| **33. medtech 진입 가능** | **Yes** — 이번 Phase에서 medtech/software/telecom/robot **시작하지 않음** |

---

## 필수 명시 (최종)

| 항목 | 답 |
|------|----|
| 각 섹터 신규 상장사 추가 | **No** |
| cp_list 변경 | **No** (22 / 20 유지) |
| 추정 제조·유통 관계 | **No** |
| 추정 아티스트·IP 관계 | **No** |
| 시장·플랫폼 노출을 계약으로 사용 | **No** |
| orphan padding | **No** |
| 타 섹터 관계 의미 변경 | **No** |
| full browser matrix 실행 | **No** |
| refresh:hub-snapshots | **No** |
| commit / push / PR / 배포 | **No** |
