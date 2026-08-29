# Phase 5G — Medtech(의료기기) 관계 네트워크 감사·설계·구현 보고서

**작성일:** 2026-08-29
**브랜치:** `codex/relation-network-phase4-checkpoint`
**시작 HEAD:** `c57422bd9f6a6730181a3dbc11c45d5133a9e92e`
**작업자:** editorial_phase5g
**Commit:** **하지 않음** (구현·검증만)

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| 시작 HEAD | `c57422bd9f6a6730181a3dbc11c45d5133a9e92e` (Phase 5F checkpoint) |
| 시작 git status | clean |
| deployment full-matrix gate | pending |
| targeted browser gate | 사용 |

---

## 2. medtech 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| HTML | `medtech/korea_medtech_map.html` |
| `data-sector` | `medtech` |
| Network JSON | `data/networks/medtech.json` |
| profile | `lib/relation_network/profiles.mjs` → `medtech` |
| 이전 | `networkPath: null`, `product_distribution` / `assetLicensing`, legacyFallback |
| 이후 | `../data/networks/medtech.json`, `medical_device_product_regulatory_ecosystem` / `medicalDeviceEcosystem`, **`_legacyFallback: false`** |

감사: `data/medtech_relation_phase5g_audit.json`

---

## 3. 기존 구조 감사

| 항목 | Phase 5G 이전 |
|------|---------------|
| structured JSON | 없음 |
| partners | 상장사별 글로벌 peer 문자열 (총 25건 partner 링크) |
| globalCompanies | Roche, Abbott, Siemens Healthineers 등 + Illumina(카탈로그 누락→마이그레이션에서 추가) |
| 미용기기 chain | 정의만 있고 **0社** (에스테틱은 cosmetics) |
| evidence gate | 없음 |

---

## 4. cp_list·ticker·chain

| 항목 | 값 |
|------|-----|
| listed (`koreanCompanies`) | **10** |
| cp_list 변경 | **없음** |
| 신규 상장사 | **없음** |
| duplicate ticker | **0** |

| chain | count |
|-------|-------|
| 진단·IVD | 7 |
| 의료장비·수술 | 2 |
| 임플란트·치과 | 1 |
| 미용기기 | 0 (lane hub 미생성) |

---

## 5–6. Legacy 관계 · 제거·강등·숨김

| 분류 | count | 처리 |
|------|-------|------|
| legacy partners → peer | **25** | `defaultHidden`, `legacyMigrated` |
| unknown partner drop | 0 | Illumina 글로벌 노드 보강 |
| invented supply/distribution/install | **0** | 생성 안 함 |
| clearance-as-contract | **0** | 생성 안 함 |

---

## 7. 인접 섹터 경계

| from | to | 의미 |
|------|-----|------|
| 루닛 | software | AI/SaMD 기술 교차; AI 발표≠인허가 |
| 큐렉소 | robot | 수술로봇 교차; 기술≠허가·공급 |
| 씨젠 | bio | 분자진단 ≠ 신약 파이프라인 |
| 덴티움 | cosmetics | 치과 임플란트 ≠ 일반 화장품 |

`excludesFromBusinessCoverage` · `excludesFromOrphanResolution` · `duplicateBusinessCountExcluded` 적용.

---

## 8. Canonical

- 상장사 `krx:{ticker}`
- 제품군 `device_category:{slug}` (10)
- 진료영역 `specialty:{slug}` (8)
- 글로벌 `global:{id}` (14)
- **인허가 clearance node 0** (검증된 identifier 없이 생성 금지)
- generic ID **0**

---

## 9. Model / layout / lane

| 항목 | 값 |
|------|-----|
| model | `medical_device_product_regulatory_ecosystem` |
| layout | `medicalDeviceEcosystem` |
| lanes | `in_vitro_diagnostics` · `digital_health_samd` · `patient_monitoring` · `surgical_device` · `dental_device` |

---

## 10–11. 제품·진료영역 · 규제

- 구조: `specializes_in` (제품군), `used_in_specialty` (진료영역)
- 인허가 node/edge **0** — MFDS/FDA identifier 없이 clearance 미생성
- 인허가를 매출·공급계약으로 집계하지 않음

---

## 12–15. 공급·설치 · 유통 · 지분 · 임상

| 유형 | confirmed/reported |
|------|-------------------|
| supplies / install / distribution / license | **0** |
| ownership / JV | **0** |
| clinical_evidence / collaboration as business | **0** |

병원 사용·제품 페이지·업계 통념으로 추정하지 않음.

---

## 16–18. Cross-sector · status · business

| status | count |
|--------|-------|
| reference | 35 |
| peer | 25 |
| confirmed/reported | **0** |

nodes **51** · edges **60** · confirmed business **0**

---

## 19–20. Coverage · orphan

| metric | value |
|--------|-------|
| business coverage 0/0 | **N/A** |
| businessRelationOrphanCount | 10 |
| zeroDegreeNodeCount | 0 |
| duplicateSemanticNodeCount | 0 |
| orphan padding | **없음** |

---

## 21. Validator

- `npm run verify:medtech` → exit **0**, warnings **0**
- peer defaultHidden, clearance≠business, clinical≠commercial, generic ID fail 규칙 적용

---

## 22. UI·URL·모바일

- 공통 renderer + `layoutMedicalDeviceEcosystem`
- hidePeer / hideInferred 기본
- 신규 전용 UI 없음
- targeted: desktop/ko · tablet/en · mobile/ko · mobile/en **OK**

---

## 23. 수정·생성 파일

**생성:** `data/networks/medtech.json`, audit/changelog, `scripts/audit|migrate|verify_medtech_*`, `verify_phase5g_targeted_browser.mjs`, `lib/relation_network/medtech_{device_canonical,metrics}.mjs`, reports

**공통 최소 수정:** schema, profiles, validate, relation_network.js, rebuild_site, package.json, verify_relation_*

---

## 24–28. Build / verify / browser / idempotency / 회귀

| 항목 | 결과 |
|------|------|
| build ×2 | exit 0 |
| medtech hash | `E00DA65D5B4F152E…827001` (동일) |
| kconsume/kcontent/cosmetics hashes | 불변 |
| short verify suite | 전부 exit 0 |
| **targeted browser QA** | **passed 9/9** |
| **full matrix stability** | **pending** |
| **deployment browser gate** | **not satisfied yet** |
| hub snapshot refresh | **미실행** |
| 타 섹터 관계 의미 변경 | **없음** |

---

## 29. Human review

- Phase 5G는 구조 분류 + peer 강등 + cross-sector만
- clearance/공급/설치 confirmed는 MFDS·FDA·DART 개봉 세션에서만 승격
- software/telecom/robot 섹터 구현 **미시작**

---

## 30–32. 종료·checkpoint·다음

| 항목 | 판정 |
|------|------|
| **30. Phase 5G 종료 가능** | **Yes** (데이터+targeted QA; full matrix는 별도 gate) |
| **31. checkpoint 가능** | **Yes** (commit은 사용자 지시 대기) |
| **32. software+telecom 진입** | **가능** (미시작; full-matrix 통과를 의미하지 않음) |

---

## 필수 명시

| 항목 | 답 |
|------|----|
| 신규 상장사 추가 | **No** |
| cp_list 변경 | **No** (10 유지) |
| 추정 병원·유통 관계 | **No** |
| 인허가를 계약으로 사용 | **No** |
| 임상 근거를 사업관계로 사용 | **No** |
| orphan padding | **No** |
| full matrix 실행 | **No** |
| refresh:hub-snapshots | **No** |
| commit / push / PR / 배포 | **No** |
