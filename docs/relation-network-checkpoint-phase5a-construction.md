# Relation Network — Phase 5A Construction Checkpoint

**As of:** 2026-08-23  
**Branch:** `codex/relation-network-phase4-checkpoint`  
**Base HEAD:** `94f50281a1693360ce9d7f424a7128e54a481c5d`  
**Scope:** Construction sector project relationship ecosystem (5A → 5A.1 → 5A.2 → 5A.3)  
**Deploy / push / PR:** not performed

---

## 1. Phase 5A 목적

건설·토목·해외 EPC 섹터에 **프로젝트 중심 관계 네트워크**를 도입한다. 상장 건설사 10개(`cp_list`)를 기준으로, 실제 공시·보도가 확인된 **5개 actual project**만 그래프에 포함한다. 총사업비·도급액·기업 지분·PF·법적 당사자·브랜드를 분리하고, evidence별 `claimSupport`로 주장 범위를 명시한다.

---

## 2. Architecture / model / layout

| 항목 | 값 |
|------|-----|
| `model` | `construction_development_project_ecosystem` |
| `layout` | `constructionProjectEcosystem` |
| Network JSON | `data/networks/construction.json` |
| Profile | `lib/relation_network/profiles.mjs` → `construction` |
| Pilot set | `PILOT_NETWORK_SECTORS`에 `construction` 추가 |
| Metrics | `lib/relation_network/construction_project_metrics.mjs` |
| Claim coverage | `lib/relation_network/construction_claim_support.mjs` |
| Browser | `js/relation_network.js` — construction toolbar / detail / layout |
| Emit | `js/network_profiles.js` (rebuild) |

**그래프 규모 (2026-08-23 빌드 기준):**

| 항목 | 수치 |
|------|------|
| nodes | 44 |
| edges | 60 |
| uniqueActualProjectCount | 5 |
| domesticProjectCount | 3 |
| overseasProjectCount | 2 |
| brandNodeCount | 1 |

**Rebuild pipeline (construction 구간):**

`migrate_construction_network_phase5a.mjs` → `curate_construction_phase5a1.mjs` → `curate_construction_phase5a2.mjs` → `curate_construction_phase5a3.mjs` → `emit_network_profiles.mjs` → `patch_relation_network.mjs`

---

## 3. 상장사 10개 (`cp_list`)

| ID | 종목명 | ticker |
|----|--------|--------|
| `krx:028260` | 삼성물산 | 028260 |
| `krx:000720` | 현대건설 | 000720 |
| `krx:047040` | 대우건설 | 047040 |
| `krx:267270` | HD건설기계 | 267270 |
| `krx:375500` | DL이앤씨 | 375500 |
| `krx:006360` | GS건설 | 006360 |
| `krx:294870` | IPARK현대산업개발 | 294870 |
| `krx:035890` | 서희건설 | 035890 |
| `krx:009410` | 태영건설 | 009410 |
| `krx:034830` | 한국토지신탁 | 034830 |

`metrics.listedCompanyCount`: **10**

---

## 4. Actual project 5개

| Project ID | 유형 | projectStatus | contractStatus | contractValue (원) | companyShareValue (원) | companyShareDisclosureStatus |
|------------|------|---------------|----------------|-------------------|------------------------|------------------------------|
| `epc-project:qatar-dukhan-solar` | overseas_epc | contract_signed | effective | 1,540,071,611,480 | 1,540,071,611,480 | disclosed |
| `construction-project:wirye-bokjeong-mixed` | construction | contract_signed | effective | 3,039,406,100,000 | 2,936,423,570,000 | disclosed |
| `construction-project:busan-sajik3-redev` | construction | contract_signed | effective | 408,232,163,334 | null | unknown |
| `construction-project:yongsan-jeongbichang-zone1` | construction | contract_signed | effective | 924,430,915,470 | null | unknown |
| `epc-project:mozambique-rovuma-lng-phase1` | overseas_epc | preferred_bidder | pre_contract | null | null | not_applicable |

- `projectTotalValue`: 5개 모두 **null** (별도 총사업비 필드 미확정)
- Wirye: `aggregationReview=needs_review` (2BL·3BL 통합 노드)
- 신규 프로젝트 추가: **0** (checkpoint 시점 `uniqueActualProjectCount=5` 유지)

---

## 5. Canonical entity 정책

| 패턴 | 용도 |
|------|------|
| `krx:{6-digit}` | 건설 맵 상장사 |
| `construction-project:` | 국내 개발·재개발·주택 등 |
| `epc-project:` | 해외 EPC / 플랜트 |
| `global:` | 해외 발주처·상대방 |
| `org:` | 공공·지자체·신탁 등 |
| `brand:` | 브랜드 (법적 당사자와 분리) |
| `consortium:` | 컨소시엄 (provisional 가능) |
| `pfv:` / `spv:` | PFV·SPC 등 프로젝트 법인 |

브랜드명 ≠ 법적 당사자. 공시 제출인(filer)과 프로젝트 브랜드·운영명을 혼동하지 않는다 (용산 Z1: IPARK 브랜드 vs filer).

---

## 6. 역할과 lifecycle 정책

**projectStatus:** `development`, `preferred_bidder`, `contract_signed`, `under_construction`, `presale`, `completed`, …  
**contractStatus:** `pre_contract`, `announced`, `letter_of_award`, `effective`, `in_delivery`, `completed`, `cancelled`, `terminated`

- editorial `status` (confirmed/reported/reference)와 lifecycle 필드는 **분리**
- LOI·LOA 단계는 `pre_contract` / `preferred_bidder`로 표기; 서명·시행 전 단계를 `effective`로 승격하지 않음
- lifecycle primary coverage: **4/5** (Dukhan LOA만 secondary direct로 금액·상태 보조)

**프로젝트별 역할 edge (요약):**

| Edge type | count |
|-----------|-------|
| project_owner | 5 |
| main_contractor | 3 |
| epc_for | 1 |
| project_developer | 1 |
| consortium_member | 1 |
| preferred_bidder_for | 1 |
| pfv_shareholder | 1 |

---

## 7. PFV / SPV / 브랜드 / 법적 당사자 분리

- **PFV/SPV:** `pfv_shareholder`, `spv_shareholder` 등 지분 관계는 별도 노드·edge로 표현
- **브랜드:** `operates_brand` (1 edge), brand 노드 1개 — 법적 계약 당사자 edge와 분리
- **provisional consortium:** `consortium:smdc-jv` → `type=provisional_consortium`, `entityStatus=provisional`, `defaultHidden=true` (로부마 JV 공식 명칭 미확정)

---

## 8. projectTotalValue / contractValue / companyShareValue 분리

| 필드 | 의미 | 현재 상태 |
|------|------|-----------|
| `projectTotalValue` | 사업 전체 규모 | 5/5 null |
| `contractValue` | 해당 기업·프로젝트 도급/계약 금액 | 4/5 값 있음 (Rovuma 제외) |
| `companyShareValue` | 기업 지분·부담 금액 | 2/5 disclosed (Dukhan, Wirye) |

Wirye `contractValue=3,039,406,100,000`은 `aggregatedComponents` 합산; `companyShareValue=2,936,423,570,000`은 2BL 100% + 3BL 70% DART 근거.

---

## 9. claimSupport 구조

evidence 행마다 12개 claim 지원 여부:

`relationship`, `legalEntity`, `counterparty`, `role`, `projectStatus`, `contractStatus`, `contractSigned`, `contractValue`, `companyShareValue`, `validFrom`, `validTo`, `stakePct`

주장별 coverage는 `metrics.claimCoverage` 및 `verify:construction` 출력과 동일.

---

## 10. Direct / primary coverage 분모

| Claim | Direct | Primary |
|-------|--------|---------|
| relationship | 5/5 (100%) | 5/5 (100%) |
| contractStatus | 5/5 (100%) | 4/5 (80%) |
| contractValue | 4/4 (100%)* | 3/4 (75%)* |
| companyShareValue | 2/2 (100%)** | 1/2 (50%)** |
| lifecycle (projectStatus+contractStatus+contractSigned) | 5/5 (100%) | 4/5 (80%) |

\* Rovuma: `contractValue` null → 분모에서 제외 (`exclusionReason: undisclosed`)  
\*\* Sajik3·Yongsan: `companyShareDisclosureStatus=unknown` → 분모 제외; Rovuma: `not_applicable`

**anyClaim project coverage:** `projectAnyDirectEvidenceCoverage=1`, `projectAnyPrimarySourceCoverage=1`

---

## 11. Orphan 지표

| 지표 | 값 |
|------|-----|
| listedCompanyCount | 10 |
| businessRelationOrphanCount | 5 |
| directRelationshipOrphanCount | 5 |
| classificationOnlyCompanyCount | 5 |
| weakRelationOnlyCompanyCount | 5 |

**Orphan 5社:** `krx:267270`, `krx:375500`, `krx:035890`, `krx:009410`, `krx:034830`  
(HD건설기계, DL이앤씨, 서희건설, 태영건설, 한국토지신탁 — 분류·peer만, confirmed/reported business edge 없음)

의도적으로 orphan padding 하지 않음.

---

## 12. Provisional consortium 정책

- 공식 JV 명칭·등기 전: `provisional_consortium` + `entityStatus=provisional`
- `defaultHidden=true` — UI 기본 숨김
- SMDC/SNDC 등 미확정 약칭을 정식명에 넣지 않음
- LOI 단계 LOE는 `counterpartyScope=letter_of_intent`, `valueDisclosureStatus=not_disclosed`

---

## 13. 검증 결과 (2026-08-23)

| Command | Exit | Notes |
|---------|------|-------|
| `npm run build` (×2) | 0 | construction JSON hash 동일 |
| `npm run verify:relation-network` | 0 | construction warnings **0**, failures 0 |
| `npm run verify:construction` | 0 | warnings **0** |
| `npm run verify:renewable` | 0 | |
| `npm run verify:nuclear` | 0 | |
| `npm run verify:powergrid` | 0 | |
| `npm run verify:finance` | 0 | |
| `npm run verify:ship` | 0 | |
| `npm run verify:battery` | 0 | |
| `npm run verify:bigchip` | 0 | |
| `npm run verify:semi-relations` | 0 | |
| `npm run verify:nav-tab-preserve` | 0 | |
| `npm run verify:data-sector-profile` | 0 | |
| `npm run verify:relation-browser` | 0 | |

**Idempotency:** SHA-256(`data/networks/construction.json`) =  
`B16DBB1D4FCDEC48A31DCE407EF678D2367767F013D390E60FA2EF3C75FF6397` (build 1 = build 2)

**git diff --check:** whitespace 오류 없음 (CRLF→LF 경고만)

---

## 14. Unresolved human review

| 항목 | 상태 |
|------|------|
| Dukhan EPIC signed/correction DART `rcpNo` | 미해결 — LOA DART만 primary (relationship); 금액·상태는 secondary direct |
| Wirye 2BL·3BL 노드 분리 | `aggregationReview=needs_review` |
| Sajik3 / Yongsan `companyShareValue` | `companyShareDisclosureStatus=unknown` — 100% 가정 금지 |
| Rovuma LOI 현재 유효성 | `currentValidity=unverified` |
| Rovuma JV 공식 명칭 | `consortium:smdc-jv` provisional |

---

## 15. 다음 auto 섹터에 재사용할 규칙

1. **migrate → curate (다단계) → emit → patch → verify** 파이프라인 순서 유지
2. **claimSupport** per evidence — 주장별 direct/primary coverage 분모 분리
3. **금액 3분리:** projectTotalValue / contractValue / companyShareValue; null은 분모에서 claim별 제외
4. **브랜드·법인·PFV 분리** — filer ≠ brand ≠ legal counterparty
5. **provisional entity** — 미확정 JV/SPV는 `provisional` + `defaultHidden`
6. **orphan padding 금지** — evidence 없는 edge·프로젝트 invent 금지
7. **cp_list 고정** — listed count 변경은 명시적 scope만
8. **build ×2 idempotency** + sector `verify:*` 전체 통과 후 checkpoint
9. **타 섹터 network JSON** — 관계·상태·금액 변경 없이 metrics-only drift는 commit에서 제외·별도 보고

---

## 16. 배포 전 체크리스트

- [ ] `npm run build` 두 번 (network script 변경 시)
- [ ] §13 verify 전체 (construction warnings 0)
- [ ] construction JSON hash idempotent
- [ ] `cp_list` 10 / actual project 5 / orphan 5 유지
- [ ] secrets / `.env` / `node_modules` / `dist` 미포함
- [ ] §14 human review 항목 팀 인지
- [ ] Push / PR / production deploy — **별도 승인 후**

---

## 17. Checkpoint commit scope (제외 요약)

**커밋 포함:** construction JSON·changelog·scripts·lib·js·construction map HTML·rebuild/verify wiring·본 문서

**커밋 제외 (rebuild 부수 산출물):**

- 타 섹터 `*/korea_*_map.html` (patch blank-line only)
- `data/hub_*_snapshot.json` (시세 asOf 갱신)
- `data/networks/finance.json`, `data/networks/powergrid.json` — **nodes/edges 불변**, `classificationOnlyCompanyCount` metrics-only 재계산
- `data/battery_relation_phase3b_metrics.json`, `data/finance_relation_phase3d*.json`, `data/powergrid_relation_phase4a*.json`, `data/ship_relation_phase3c_changelog.json` — changelog/metrics drift

타 섹터 **관계·상태·금액** 의미 변경: **없음** (commit 진행 가능)
