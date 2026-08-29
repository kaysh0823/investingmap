# Phase 5F — Kcontent(콘텐츠·엔터) 관계 네트워크 감사·설계·구현 보고서

**작성일:** 2026-08-29
**브랜치:** `codex/relation-network-phase4-checkpoint`
**시작 HEAD:** `3d13fb55661adcf1bf83c1781cab447aecfdc8d2`
**작업자:** editorial_phase5f
**Commit:** **하지 않음** (구현·검증만)

---

## 1. 시작 branch/HEAD/status

| 항목 | 값 |
|------|-----|
| branch | `codex/relation-network-phase4-checkpoint` |
| 시작 HEAD | `3d13fb55661adcf1bf83c1781cab447aecfdc8d2` |
| 시작 git status | clean |
| deployment browser gate | pending |

---

## 2. kcontent 실제 경로·data-sector

| 항목 | 값 |
|------|-----|
| **canonical sector ID** | **`kcontent`** |
| HTML | `kcontent/korea_kcontent_map.html` |
| `data-sector` | `kcontent` |
| Network JSON | `data/networks/kcontent.json` |
| profile | `lib/relation_network/profiles.mjs` → `kcontent` |
| 이전 | `networkPath: null`, legacy inline |
| 이후 | `../data/networks/kcontent.json`, `content_ip_production_distribution_ecosystem` / `contentIpDistributionEcosystem`, **`_legacyFallback: false`** |

감사: `data/kcontent_relation_phase5f_audit.json` · `scripts/audit_kcontent_phase5f.mjs`

---

## 3. cp_list·ticker·chain

| 항목 | 값 |
|------|-----|
| HTML listed (cp_list) | **20** |
| cp_list 변경 | **없음** |
| duplicate ticker | **0** |
| 신규 상장사 추가 | **없음** |

| chain | count |
|-------|-------|
| 게임 | 12 |
| K-pop·엔터테인먼트 | 4 |
| 드라마·미디어·웹툰·컨텐츠 | 4 |

---

## 4. Model / layout / lane

| 항목 | 값 |
|------|-----|
| model | `content_ip_production_distribution_ecosystem` |
| layout | `contentIpDistributionEcosystem` |
| lanes | `label_agency`, `production_studio`, `ip_rights`, `distributor`, `platform` |

---

## 5. Canonical

- 상장사: `krx:{ticker}`
- 아티스트: `artist:{normalized}` (회사당 핵심 ≤3)
- IP: `content_ip:{normalized}` (대표 ≤3, 시즌/스핀오프 남발 금지)
- 카테고리: `content_category:{normalized}`
- 글로벌: `global:spotify|netflix|tencent|universal-music|warner-music`
- 인접 앵커: `sector:kconsume`, `sector:telecom`, `sector:software`
- generic ID **0**

아티스트 11 · content IP 6 (팬덤 목록화 금지).

---

## 6. 구조 관계

| type | count | status |
|------|-------|--------|
| `member_of` | 20 | reference |
| `represents_artist` | 11 | reference (소속 구조; 전속기간 unknown → permanent active 계약 아님) |
| `controls_ip` | 6 | reference (제작≠자동 owns_ip) |
| `specializes_in` | 20 | reference |
| `cross_sector_reference` | 3 | reference |

- `owns_ip` confirmed **0**
- 광고·브랜드 협업 business edge **0** (default 제외)

---

## 7. 실제 business 관계

| 항목 | 값 |
|------|-----|
| confirmed / reported | **0 / 0** |
| distributes_to / streams_on exclusive | **0** |
| 추정 아티스트·IP·플랫폼 계약 | **없음** |

정책: 플랫폼 공개≠독점 유통; 제작사≠IP 소유자; 아티스트 소속≠음원 저작권.

---

## 8. Legacy peer 강등

| 예 | 처리 |
|----|------|
| HYBE/JYP→Spotify | peer, defaultHidden, legacyMigrated |
| SM→UMG, YG→Warner | 동일 |
| CJ ENM / Studio Dragon→Netflix | 동일 |
| Krafton→Tencent | 동일 |

**7**건 demoted; `hasPeerButNoBusinessCompanyCount: 7`.

---

## 9. Metrics / coverage / orphan

| metric | value |
|--------|-------|
| listedCompanyCount | 20 |
| nodeCount / edgeCount | 56 / 67 |
| artistNodeCount | 11 |
| contentIpNodeCount | 6 |
| confirmedBusinessEdgeCount | 0 |
| peerEdgeCount | 7 |
| crossSectorReferenceCount | 3 |
| businessRelationOrphanCount | 20 |
| endedRelationshipCount | 0 |
| zeroDegreeNodeCount | 0 |
| duplicateSemanticNodeCount | 0 |
| evidenceFieldCoverage (0/0) | **N/A** |

---

## 10. Validator / verify

- `npm run verify:kcontent` → exit **0**, warnings **0**
- artist/IP legal-company 혼동, platform exclusivity 오인, collaboration orphan 해소: fail

---

## 11. UI·URL·모바일

- 공통 renderer + `layoutContentIpDistribution`
- hidePeer / hideInferred 기본
- targeted: desktop/ko + mobile/en **OK**

---

## 12. 파일

**생성:** `data/networks/kcontent.json`, audit/changelog, `scripts/audit|migrate|verify_kcontent_*`, `lib/relation_network/kcontent_{ip_canonical,metrics}.mjs`
**공통:** schema/profiles/validate, relation_network.js, rebuild, package.json (kconsume와 공유 최소 수정)

---

## 13. 종료 체크

| 질문 | 답 |
|------|----|
| 섹터 종료 가능? | **데이터·targeted browser 기준 Yes** |
| 신규 상장사 / cp_list 변경? | **No / No** |
| 추정 아티스트·IP 관계? | **No** |
| 시장·플랫폼 노출을 계약으로? | **No** |
| orphan padding? | **No** |
| commit/push/PR/배포 / hub refresh / full matrix? | **모두 No** |
