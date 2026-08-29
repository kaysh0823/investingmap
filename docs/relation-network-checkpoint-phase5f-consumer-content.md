# Relation Network — Phase 5F Kconsume + Kcontent Bundle Checkpoint

**As of:** 2026-08-29
**Branch:** `codex/relation-network-phase4-checkpoint`
**Base HEAD:** `3d13fb55661adcf1bf83c1781cab447aecfdc8d2`
**Scope:** Consumer (`kconsume`) + Content (`kcontent`) — Phase 5F bundle
**Checkpoint status:** **approve for data/targeted QA** (full matrix gate still pending)
**Deploy / push / PR:** not performed

---

## 1. Phase 5F 묶음 목적

소비재(`kconsume`)와 콘텐츠(`kcontent`)에 **브랜드·유통·IP 구조**를 한 세션에서 도입하되, **JSON / metrics / validator / verifier는 완전히 분리**한다. 한 섹터 실패를 다른 섹터 데이터로 보완하지 않는다. DART/KIND 등 1차 출처 없는 **confirmed/reported business edge는 각각 0건** 유지. 매장 입점·플랫폼 노출·팬덤 목록으로 관계를 채우지 않는다.

---

## 2. 두 섹터를 함께 처리한 이유

- 공통 패턴: 법인 vs 브랜드/아티스트/IP 분리, structural vs business, peer demotion, cross-sector reference
- 경계 공유: 굿즈·캐릭터 콜라보·뷰티 인접은 `cross_sector_reference`로만 연결
- 구현 효율: 스키마·renderer 확장을 한 번에 하되 migrate/verify는 독립 실행

---

## 3. JSON·metrics·verifier 분리 원칙

| 산출물 | kconsume | kcontent |
|--------|----------|----------|
| Network | `data/networks/kconsume.json` | `data/networks/kcontent.json` |
| Audit / changelog | `data/kconsume_relation_phase5f_*` | `data/kcontent_relation_phase5f_*` |
| Migrate / audit / verify | `scripts/*_kconsume_*` | `scripts/*_kcontent_*` |
| Metrics / canonical | `kconsume_metrics.mjs`, `kconsume_brand_canonical.mjs` | `kcontent_metrics.mjs`, `kcontent_ip_canonical.mjs` |
| npm | `verify:kconsume` | `verify:kcontent` |

공통 파일(`schema` / `profiles` / `validate` / `relation_network.js` / `rebuild_site` / `package.json`)은 **최소 수정**.

---

## 4. 실제 경로·data-sector

| | kconsume | kcontent |
|--|----------|----------|
| HTML | `kconsume/korea_kconsume_map.html` | `kcontent/korea_kcontent_map.html` |
| `data-sector` | `kconsume` | `kcontent` |
| networkPath | `../data/networks/kconsume.json` | `../data/networks/kcontent.json` |
| `_legacyFallback` | **false** | **false** |
| 이전 | `networkPath: null`, legacy inline | 동일 |

---

## 5. cp_list

| | kconsume | kcontent |
|--|----------|----------|
| listed (`koreanCompanies` / network) | **22** | **20** |
| cp_list 변경 | **없음** | **없음** |
| 신규 상장사 | **없음** | **없음** |
| duplicate ticker | **0** | **0** |

**kconsume chains:** 음식·라면·식품 9 · 쇼핑/유통 5 · 패션 5 · 여행·레저·항공 3
**kcontent chains:** 게임 12 · K-pop·엔터테인먼트 4 · 드라마·미디어·웹툰·컨텐츠 4

---

## 6. Model / layout / lane

| | kconsume | kcontent |
|--|----------|----------|
| model | `consumer_brand_distribution_ecosystem` | `content_ip_production_distribution_ecosystem` |
| layout | `consumerBrandDistributionEcosystem` | `contentIpDistributionEcosystem` |
| lanes | brand_owner · manufacturing · retail_channel · leisure_lifestyle | label_agency · production_studio · ip_rights · distributor · platform |

빈 lane(전용 franchise/ecommerce hub 등)은 생성하지 않음.

---

## 7. 브랜드·법인·제품 구분 (kconsume)

| 엔티티 | ID | type |
|--------|-----|------|
| 상장 법인 | `krx:{ticker}` | `listed_company` |
| 브랜드 | `brand:{slug}` | `brand` (19) |
| 제품군 | `consumer_category:{slug}` | `product_category` (14) |
| 글로벌 peer | `global:{name}` | `global_company` |

- `operates_brand` 구조만 (legal `owns_brand` confirmed **0**)
- 브랜드를 legal counterparty로 사용 **금지**
- generic ID (`brand:item` 등) **0**

---

## 8. 아티스트·IP·스튜디오·플랫폼 구분 (kcontent)

| 엔티티 | ID | type |
|--------|-----|------|
| 상장 법인 | `krx:{ticker}` | `listed_company` |
| 아티스트 | `artist:{slug}` | `artist_or_group` (11, 회사당 ≤3) |
| IP | `content_ip:{slug}` | `content_ip` (6, 대표만) |
| 카테고리 | `content_category:{slug}` | `product_category` |
| 글로벌 | `global:spotify` 등 | `global_company` |

- `represents_artist` = 소속 **구조** (전속기간 unknown → permanent active 계약 아님)
- `controls_ip` 구조만; 제작사→`owns_ip` 자동연결 **없음**
- 플랫폼 공개→exclusive `streams_on` **없음**
- generic artist/IP/platform ID **0**

---

## 9. Legacy peer 강등

| sector | count | 처리 |
|--------|-------|------|
| kconsume | **4** | Nestlé / PepsiCo / Costco / Marriott → `peer`, `defaultHidden`, `legacyMigrated` |
| kcontent | **7** | Spotify / UMG / Warner / Netflix×2 / Tencent → 동일 |

peer/group/reference는 **business orphan을 해소하지 않음**.

---

## 10. Business 0건의 근거 · sparse graph

| 항목 | kconsume | kcontent |
|------|----------|----------|
| nodes / edges | **65 / 69** | **56 / 67** |
| confirmed / reported business | **0 / 0** | **0 / 0** |
| 추정 제조·유통·입점·수출 계약 | **0** | — |
| 추정 아티스트·IP·플랫폼 계약 | — | **0** |
| 광고·브랜드 협업 business | — | **0** |

**근거:** 1차 출처(DART/KIND/공식 계약 발표) 미개봉·미검증. 숫자를 채울 의무 없음. sparse graph 허용.

---

## 11. Market / platform 노출과 계약 분리

- 시장·채널·스트리밍 **노출** ≠ exclusive distribution / license contract
- `cross_sector_reference` · `exposed_to_market` · peer는 business count에 **미포함**
- kconsume↔kcontent 사이 confirmed business edge **0**

---

## 12. Orphan · coverage

| metric | kconsume | kcontent |
|--------|----------|----------|
| businessRelationOrphanCount | 22 | 20 |
| zeroDegreeNodeCount | 0 | 0 |
| duplicateSemanticNodeCount | 0 | 0 |
| orphan padding | **없음** | **없음** |
| evidenceFieldCoverage (0/0) | **N/A** (`applicable: false`) | **N/A** |

---

## 13. Browser QA (정확한 표현)

| gate | 결과 |
|------|------|
| **targeted browser QA** | **passed 8/8** |
| cases | kconsume desktop/ko · kconsume mobile/en · kcontent desktop/ko · kcontent mobile/en · cosmetics desktop/ko · bigchip 000660 · construction mobile/ko · bio mobile/en |
| app failures | 0 |
| infrastructure (pageCreate) | 0 (이번 targeted run) |
| **full matrix stability** | **pending** |
| **deployment browser gate** | **not satisfied yet** |
| full matrix 재실행 | **하지 않음** |
| skip / assertion 약화 / retry-as-success | **없음** |

Known issue: `docs/known-issues/relation-browser-pagecreate-flake.md` (유지)

결과 기록: `docs/reports/phase5f-targeted-browser-qa.json`

---

## 14. Build / verify / idempotency

Checkpoint 단축 검증 (full relation-browser **미실행**):

- `npm run build` ×2
- `verify:relation-network`, `verify:kconsume`, `verify:kcontent`
- `verify:cosmetics`, `verify:metal`, `verify:elec`, `verify:auto`, `verify:construction`
- `verify:finance`, `verify:bigchip`, `verify:semi-relations`
- `verify:nav-tab-preserve`, `verify:data-sector-profile`

| 항목 | 값 |
|------|-----|
| kconsume/kcontent warnings | **0 / 0** |
| JSON hash (idempotent) | kconsume `562DB444…938EE` · kcontent `64691FE9…B2D9E2` |
| cosmetics hash (회귀) | `AC259F20…CAD2` (의미 변경 없음) |
| `refresh:hub-snapshots` | **미실행** |
| hub_index / sitemap | builtAt-only noise restore |

---

## 15. Human review

- Phase 5F는 structural classification + demoted peer + cross-sector reference만
- confirmed business 승격은 별도 evidence session 필요
- 팬덤 아티스트 확장·입점=유통 추정 금지 유지
- medtech / software / telecom / robot **미시작**

---

## 16. Medtech 진입 조건

| 조건 | 상태 |
|------|------|
| kconsume + kcontent 데이터·verify 완료 | Yes |
| targeted browser 8/8 | Yes |
| full matrix / deployment browser gate | **pending — medtech 작업과 독립적으로 추적** |
| medtech 이번 Phase에서 시작 | **No** |

**Medtech 진입: 가능** (별도 Phase; 본 checkpoint가 full-matrix 통과를 의미하지 않음).

---

## 17. 최종 배포 전 browser gate

배포 전 필수:

1. full relation-browser matrix 안정성 확인 (known pageCreate flake 해소 또는 재현 문서화)
2. deployment browser gate **satisfied**
3. hub snapshot 정책에 따른 명시적 refresh (이번 checkpoint에서는 수행하지 않음)

**“full browser 통과”라고 주장하지 않는다.**

---

## 18. 포함 보고서

- [phase5f-bundle-summary.md](./reports/phase5f-bundle-summary.md)
- [phase5f-kconsume-completion.md](./reports/phase5f-kconsume-completion.md)
- [phase5f-kcontent-completion.md](./reports/phase5f-kcontent-completion.md)
- [phase5f-targeted-browser-qa.json](./reports/phase5f-targeted-browser-qa.json)

---

## 19. 최종 명시

| 항목 | 답 |
|------|----|
| 신규 상장사 | **없음** |
| cp_list 변경 | **없음** (22 / 20) |
| 추정 제조·유통 관계 | **없음** |
| 추정 아티스트·IP 관계 | **없음** |
| 시장·플랫폼 노출을 계약으로 사용 | **하지 않음** |
| orphan padding | **없음** |
| full matrix 실행 | **미실행** |
| snapshot 갱신 | **없음** |
| push / PR / 배포 | **없음** |
