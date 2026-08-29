# Relation Network — Phase 5G Medtech Checkpoint

**As of:** 2026-08-29
**Branch:** `codex/relation-network-phase4-checkpoint`
**Base HEAD:** `c57422bd9f6a6730181a3dbc11c45d5133a9e92e`
**Scope:** Medical devices (`medtech`) — Phase 5G
**Checkpoint status:** **approve for data/targeted QA** (full matrix gate still pending)
**Deploy / push / PR:** not performed

---

## 1. Phase 5G 목적

의료기기 섹터(`medtech`)에 **제품군·진료영역·제조·유통·인허가** 가치사슬 관계 네트워크를 도입한다. HTML `koreanCompanies` **10社** 기준으로 structural·peer·**cross-sector reference**만 반영한다. MFDS/FDA identifier 또는 DART/KIND 1차 출처 없는 **confirmed/reported business edge와 clearance node는 0건** 유지. 병원 사용·유통 통념·임상 근거로 관계를 채우지 않는다.

---

## 2. 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`medtech`** |
| HTML | `medtech/korea_medtech_map.html` |
| `data-sector` | `medtech` |
| Network JSON | `data/networks/medtech.json` |
| Profile | `lib/relation_network/profiles.mjs` → `medtech` |
| Metrics | `lib/relation_network/medtech_metrics.mjs` |
| Device canonical | `lib/relation_network/medtech_device_canonical.mjs` |
| Browser layout | `js/relation_network.js` → `layoutMedicalDeviceEcosystem()` |
| 이전 | `networkPath: null`, `product_distribution` / `assetLicensing`, **legacyFallback** |
| 이후 | `../data/networks/medtech.json`, **`_legacyFallback: false`** |

---

## 3. cp_list 10

| 항목 | 값 |
|------|-----|
| HTML listed | **10** |
| cp_list 변경 | **없음** |
| 신규 상장사 | **없음** |
| duplicate ticker | **0** |

| chain | count | lane |
|-------|-------|------|
| 진단·IVD | 7 | `in_vitro_diagnostics` (+ Lunit→SaMD, InBody→monitoring) |
| 의료장비·수술 | 2 | `surgical_device` |
| 임플란트·치과 | 1 | `dental_device` |
| 미용기기 | **0** | hub **미생성** (에스테틱은 cosmetics) |

---

## 4. 기존 legacy 구조

| 항목 | Phase 5G 이전 |
|------|---------------|
| partners 문자열 | 상장사별 글로벌 peer (총 25 링크) |
| structured JSON | 없음 |
| Illumina | partner 참조만 있고 globalCompanies 누락 → migrate 시 `global:illumina` 보강 |
| evidence gate | 없음 |

---

## 5. Model / layout / lanes

| 항목 | 값 |
|------|-----|
| `model` | `medical_device_product_regulatory_ecosystem` |
| `layout` | `medicalDeviceEcosystem` |
| lanes | `in_vitro_diagnostics`, `digital_health_samd`, `patient_monitoring`, `surgical_device`, `dental_device` |

빈 aesthetic / beauty-device lane hub: **0**

---

## 6. 의료기기·제품군·진료영역 구분

| 엔티티 | ID | type |
|--------|-----|------|
| 상장 법인 | `krx:{ticker}` | `listed_company` |
| 제품군 | `device_category:{slug}` | `device_category` (10) |
| 진료영역 | `specialty:{slug}` | `clinical_specialty` (8) |
| 글로벌 peer | `global:{id}` | `global_company` (14) |

구조 관계: `member_of`, `specializes_in`, `used_in_specialty` — **business count / orphan 해소 제외**.

generic ID (`device:item`, `clearance:item` 등): **0**

---

## 7. 인허가 모델과 identifier gate

| 규칙 | 구현 |
|------|------|
| clearance node | `authority` + `identifier` 필수 |
| identifier 없으면 | clearance node **미생성**; 제품·specialty structural만 유지 |
| FDA clearance vs approval | 스키마/정책상 구분 (이번 Phase 데이터 없음) |
| CE ≠ FDA approval | 정책 문서화 |
| submitted ≠ cleared/approved | validator fail |
| 규제 DB ≠ 공급계약 evidence | 정책 + metrics 분리 |
| activeClearanceCount = 0 | identifier된 MFDS/FDA identifier 미확보 — **의도적** |
| regulatory coverage 0/0 | **N/A** (`applicable: false`) — 100% 아님 |

**이번 checkpoint에서 인허가 신규 조사·추가 없음.**

---

## 8. Clearance node 0건의 이유

1차 규제 식별자(식약처 허가번호, FDA 510(k)/PMA 등)를 개봉·검증하지 않았으므로 clearance node를 만들지 않는다. 제품군·진료영역 구조만으로 투자 지형을 설명한다.

---

## 9. 병원 설치·공급·임상 구분

| 관계 | Phase 5G |
|------|----------|
| `installed_at_provider` / `supplies_device_to` | **0** (추정 금지) |
| `distributes_for` / exclusive | **0** |
| `clinical_evidence_for` as confirmed business | **0** |

병원 홈페이지·논문 사용·통념 유통 연결로 commercial edge를 만들지 않음.

---

## 10. Peer 25건 강등 · business 0건

| 항목 | 값 |
|------|-----|
| legacy peer demoted | **25**, 전부 `defaultHidden` |
| confirmed / reported business | **0 / 0** |
| nodes / edges | **51 / 60** |

**이유:** DART/KIND/공식 계약·납품 발표 미검증. sparse graph 허용. orphan padding 없음.

---

## 11. Orphan · coverage

| metric | value |
|--------|-------|
| businessRelationOrphanCount | 10 |
| hasPeerButNoBusinessCompanyCount | 10 |
| zeroDegreeNodeCount | 0 |
| duplicateSemanticNodeCount | 0 |
| evidenceFieldCoverage (0/0) | **N/A** |
| regulatoryEvidenceCoverage (0/0) | **N/A** |

peer / reference / cross-sector는 orphan을 **해소하지 않음**.

---

## 12. Cross-sector · 회귀

| from | to |
|------|-----|
| 루닛 | software (SaMD≠일반 SW 계약 복제) |
| 큐렉소 | robot |
| 씨젠 | bio (IVD≠의약품) |
| 덴티움 | cosmetics (임플란트≠화장품) |

회귀 hashes (불변):

| sector | SHA-256 prefix |
|--------|----------------|
| cosmetics | `AC259F2031170D3A…` |
| kconsume | `562DB444981296B4…` |
| kcontent | `64691FE93F9262B3…` |
| medtech | `E00DA65D5B4F152E…` |

bio/elec/robot 네트워크 자동 생성 **없음**. 타 섹터 JSON 관계 의미 변경 **없음**.

---

## 13. Browser QA (정확한 표현)

| gate | 결과 |
|------|------|
| **targeted browser QA** | **passed 9/9** |
| cases | medtech desktop/ko · tablet/en · mobile/ko · mobile/en · cosmetics desktop/ko · kcontent mobile/en · bigchip 000660 · construction mobile/ko · bio mobile/en |
| **full matrix stability** | **pending** |
| **deployment browser gate** | **not satisfied yet** |
| full matrix 재실행 | **하지 않음** |
| skip / assertion 약화 / retry-as-success | **없음** |

Known issue: `docs/known-issues/relation-browser-pagecreate-flake.md`
결과: `docs/reports/phase5g-targeted-browser-qa.json`

---

## 14. Build / verify / idempotency

Checkpoint 단축 검증 (full relation-browser **미실행**):

- `npm run build` ×2
- `verify:relation-network`, `verify:medtech`
- prior sectors: kconsume, kcontent, cosmetics, metal, elec, auto, construction, finance, bigchip, semi-relations
- `verify:nav-tab-preserve`, `verify:data-sector-profile`

| 항목 | 값 |
|------|-----|
| medtech warnings | **0** |
| JSON hash idempotent | `E00DA65D5B4F152E…` |
| `refresh:hub-snapshots` | **미실행** |

---

## 15. Human review

- Phase 5G = structural + demoted peer + cross-sector only
- clearance/공급/설치 confirmed는 별도 evidence session
- software / telecom 섹터 구현 **미시작**

---

## 16. Software + telecom 진입 조건

| 조건 | 상태 |
|------|------|
| medtech 데이터·verify 완료 | Yes |
| targeted browser 9/9 | Yes |
| full matrix / deployment browser gate | **pending — 다음 섹터와 독립 추적** |
| software+telecom 이번 Phase 시작 | **No** |

**Software+telecom 진입: 가능** (본 checkpoint가 full-matrix 통과를 의미하지 않음).

---

## 17. 최종 배포 전 browser gate

배포 전 필수: full matrix 안정성 확인 또는 flake 문서화 유지, deployment browser gate **satisfied**.
**“full browser 통과”라고 주장하지 않는다.**

---

## 18. 포함 보고서

- [phase5g-medtech-completion.md](./reports/phase5g-medtech-completion.md)
- [phase5g-targeted-browser-qa.json](./reports/phase5g-targeted-browser-qa.json)

---

## 19. 최종 명시

| 항목 | 답 |
|------|----|
| 신규 상장사 | **없음** |
| cp_list 변경 | **없음** (10) |
| 추정 병원·유통 관계 | **없음** |
| 인허가를 계약으로 사용 | **하지 않음** |
| 임상 근거를 사업관계로 사용 | **하지 않음** |
| orphan padding | **없음** |
| full matrix 실행 | **미실행** |
| snapshot 갱신 | **없음** |
| push / PR / 배포 | **없음** |
