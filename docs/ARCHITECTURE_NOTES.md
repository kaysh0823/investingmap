# Investing Map — 아키텍처 & 작업 정리

> 최종 갱신: 2026-08-22
> 이 문서는 사이트의 데이터 파이프라인 구조와 그동안의 주요 변경/의사결정을 정리한 것입니다.
> Cursor로 수정할 때 맥락 파악용으로 참고하세요.

---

## 1. 전체 데이터 흐름

```
GitHub Actions / 외부 크론(cron-job.org)
        │  (평일 장중 10분마다 repository_dispatch)
        ▼
sync_quotes_to_supabase.mjs
        │  네이버 시세(현재가·시총·PER/PBR·거래대금·전일종가)
        │  + KRX OPEN API(기간수익률·RS)
        │  + 코스피·코스닥 지수(일별 KRX→Naver 폴백 / 장중 Naver)
        ▼
Supabase (권위 있는 단일 소스)
        │  stock_quotes_latest / sector_returns / sector_mcap_daily
        │  sector_intraday_snapshots / stock_price_history / hub_rank_daily
        │  market_index_daily / market_index_intraday
        ▼
Cloudflare Pages Functions (/api/*)  ── 엣지 캐시(거래일 앵커) ──▶ 프론트(정적 HTML + JS)
```

핵심 원칙: **Supabase가 권위 소스**이고, Pages Functions는 그걸 읽어 서빙만 한다.
프론트에서 별도로 재계산하지 않는다(과거 라이브 오버레이 방식은 제거됨 — 아래 5장).

---

## 2. 데이터 수집 (sync)

- **스크립트**: `scripts/sync_quotes_to_supabase.mjs`
- **트리거**: `.github/workflows/sync-quotes.yml`
  - `schedule` cron(백업용) + `repository_dispatch: [sync-quotes]`(주 트리거)
  - GitHub Actions cron이 심하게 지연돼서, **cron-job.org**가 평일 장중 10분마다
    `POST /repos/kaysh0823/investingmap/dispatches`로 트리거함
  - PAT(fine-grained, Contents read-write)는 cron-job.org에만 보관
- **수집 소스**
  - 현재가·52주·시총·PER/PBR·거래대금·전일종가 → 네이버 (`functions/lib/naver_sise_quotes.mjs`)
  - 5D/20D/50D/120D/200D 수익률·RS → KRX OPEN API (`functions/lib/krx_rs.mjs`, `krx_yoy.mjs`)
  - 코스피·코스닥 지수 → `functions/lib/krx_index.mjs` + Naver 폴백.
    일별은 `scripts/backfill_market_index.mjs` / sync 확장, 장중은 Naver.
    **주의**: 현재 KRX API 키에 지수(index) 권한이 없어 일별도 Naver 폴백이 주경로가 될 수 있다.
  - 휴장 감지는 기존 네이버 tradeDate 마커를 지수·시세 경로에서 재사용한다.
- **세션-클로즈 history**: KRX 일별이 아직 안 열린 시각에는 Naver **전체 OHLC+거래량**을
  기록한다(close-only가 아님). 이후 KRX가 준비되면 같은 거래일을 덮어쓴다.
  거래정지 등에서 KRX가 시·고·저를 `"0"`으로 주는 경우는 `historyFieldsFromKrxRow`가
  null로 정규화해 저장한다.
- **모멘텀 경계값**: sync가 history로 `high_50d`/`low_50d`/`high_120d`/`low_120d`/
  `bb_upper`/`bb_lower`를 계산해 `stock_quotes_latest`에 붙인다(모멘텀 매트릭스 y축).
- **로컬 실행**: `.dev.vars`에 키. 비거래일엔 조기 종료되므로 강제 실행은 `--force`

---

## 3. Supabase 테이블

| 테이블 | 내용 | 채우는 주체 |
|---|---|---|
| `stock_quotes_latest` | 종목별 최신 스냅샷(가격·시총·거래대금·수익률·RS 등). 모멘텀용 `high_120d`/`low_120d`/`high_50d`/`low_50d`/`bb_upper`/`bb_lower` (마이그레이션 0012) | sync 매 실행 upsert |
| `sector_returns` | 섹터별 기간 수익률(1D/20D/50D/120D/200D) — hub_trend와 동일 합산시총 | sync (trend 미러) |
| `sector_mcap_daily` | 섹터 일별 합산 시총(스파크라인·카드 20D+용) | backfill + sync 장마감 |
| `sector_intraday_snapshots` | 1D 스파크라인용 일중 섹터 시총 스냅샷 | sync 정규장에만 append |
| `stock_price_history` | 종목 일별 OHLC·거래량·시총. 깊이 **2017-08-25~**(약 2200 거래일≈8Y+). 주봉 BBW/이격도 워밍업(125주 정규화 + MA50 시드)을 위해 예전 5년에서 확장 | `backfill_price_history.mjs` + sync |
| `hub_rank_daily` | 6개 metric 일별 순위(순위 변동 계산용) | sync 장마감 |
| `market_index_daily` | 코스피·코스닥 일별 종가 (0013) | backfill_market_index + sync |
| `market_index_intraday` | 코스피·코스닥 장중 스냅샷 (0013) | sync 정규장 |

마이그레이션: `supabase/migrations/0001~0013`. **적용은 Supabase SQL Editor에서 수동**.
새 컬럼/테이블은 반드시 **마이그레이션 먼저 적용 → 커밋·푸시** 순서
(안 하면 다음 sync가 400으로 전체 실패).

---

## 4. 섹터 구조 (22개)

`SECTOR_ORDER` 기준. `data/hub_index.json`이 섹터→종목 매핑의 소스.

삼성전자/하이닉스(bigchip) · 반도체(semi) · 전기·전자(elec) · 2차전지/배터리(battery, ESS 체인 포함) · 신재생(renewable) ·
원전(nuclear) · 전력설비(powergrid) · 조선(ship) · 철강·금속·기계(metal) · 방산(defense) · K-소비/유통(kconsume) ·
화장품/미용기기(cosmetics) · K-콘텐츠(kcontent) · 바이오(bio) · 로봇(robot) ·
자동차(auto) · 의료기기/헬스케어(medtech) · 금융(finance) · 건설(construction) ·
IT·소프트웨어(software) · 지주회사(holdings) · 통신(telecom)

- `energy`는 배터리/신재생/원전으로 분할됐고, `/energy/`는 안내 랜딩 페이지로 유지(301 대신)
- `ess`는 별도 섹터가 아니라 battery의 밸류체인 체인으로 흡수
- 현재 `SECTOR_CROSS`는 비어 있으며 모든 종목에 **단일 섹터 원칙**을 적용한다.
  휴젤·케어젠(`145020`/`214370`)도 cosmetics 단독 소속이다.
  `hub_index.crossIndex`는 빈 객체여야 하며, 값이 생기면 잔재(오등록)로 보고 정리한다.
  단일 홈은 `lib/sector_exclusive.mjs`의 `SECTOR_EXCLUSIVE`로 고정한다.
- 섹터 개편/종목 이동은 항상 Cursor가 만든 분류표를 **사람이 검토 후 확정**

---

## 5. 섹터 퍼포먼스 계산 (중요)

- **정의**: `(Σ 현재 합산시총 / Σ 기준일 합산시총 − 1) × 100`
- **단일 소스**: 카드·변동추이·스파크가 모두 **`sector_mcap_daily` 실제 합산시총**을 쓴다.
  구현 진입점은 `buildAllHorizonReturnsBySector` (`functions/lib/hub_trend.mjs`).
  `/api/hub_sectors`는 한 응답에 **5개 horizon(1D/20D/50D/120D/200D)을 전부** 채운다.
- **horizon별 경로**
  - 1D → `sector_intraday_snapshots`(전일종가 시총 seed → 장중 합산)
  - 20D+ → `sector_mcap_daily` 일별 합산시총 시계열
  - 정규장 중 20D+ **끝점**은 `stock_quotes_latest` 실시간 합산시총으로 장중 반영,
    장마감 후에는 `sector_mcap_daily` 종가
- **구현**
  - 시리즈/앵커: `functions/lib/hub_trend.mjs`
  - 카드 API: `functions/api/hub_sectors.js`
  - 추이 API: `functions/api/hub_trend.js` (섹터 + 코스피·코스닥 100기준)
  - DB 미러: sync가 동일 빌더로 `sector_returns` upsert
- **§5 역산 왜곡**: **해소됨.** 과거 `mcapWeightedReturn` / `mcap_won/(1+ret)` 역산·
  pair-exclude 가중치는 폐기했다. 카드 % = 추이 끝점 − 100.
- **커버리지**: 기준일 `sector_mcap_daily`에 현재 구성종목 시총이 빠지면 분모가 작아져
  수익률이 부풀려진다 → `scripts/verify_sector_mcap_coverage.mjs` (+ `--fix`로 재upsert)
  및 `backfill_sector_mcap_daily.mjs`.
- **프론트**: `/api/hub_sectors` 단일 소스, 장중 5분 재fetch. 라이브 오버레이 없음.

---

## 6. 휴장일 감지

- 하드코딩 캘린더 없음. **네이버 페이지의 "YYYY.MM.DD 기준(KRX 장마감)" 마커를 파싱**
  (`functions/lib/naver_sise_quotes.mjs`의 `parseNaverTradeMeta`)
- 시계상 장중이어도 네이버 tradeDate가 과거이거나 marketClosed면 → 휴장 판정,
  `regular_session=false` 저장, as_of는 tradeDate 기준
- 임시공휴일도 자동 감지됨(캘린더 유지보수 불필요). 지수·시세 sync가 동일 판정을 재사용한다.

---

## 7. 엣지 캐시 정합성

- **문제였던 것**: 장마감 시 `max-age=86400`이라 새 거래일 데이터가 옛 캐시에 가려짐
- **해결**: `functions/lib/krx_session.mjs`
  - `edgeCacheMaxAgeSeconds`: 장중 짧게, 장마감 시 **다음 KRX 09:00까지 남은 초**만 캐시
  - `anchoredCachePath`: hub API 캐시 키에 `kstAnchorYmd`(거래일 앵커) 포함 →
    새 거래일엔 옛 캐시 자동 무효
- **주의**: `/api/*` 응답은 CDN 캐시됨. 디버깅 시 `nocache=1`만으론 CDN 캐시가 안 빠짐
  (같은 URL 키 재사용). **고유 파라미터**(`?rankcheck=zzz42` 등)를 붙여야 확실히 우회

---

## 8. 허브 대시보드 (index.html)

- **섹터 퍼포먼스**: `/api/hub_sectors` (horizon 탭). 스켈레톤 게이트로 초기 깜빡임 방지
  (`sectorsReady` / `sectorsAuthFetched`)
- **스파크라인**: 실제 추이. `/api/hub_sector_trend`
  - 20D+ → `sector_mcap_daily`(미리 계산). 무거운 실시간 집계는 Function 한도 초과로 금지
  - 1D → `sector_intraday_snapshots`(장중 누적)
  - 끝점 = 카드 수익률 = hub_trend 끝−100 (동일 합산시총 경로)
- **섹터 추이 차트**: 퍼포먼스 카드 아래 d3 다중라인 — §13
- **Top20 6개 패널** (순서: 시총 → RS → 주가위치 → 당일거래대금 → 당일상승률 → 5일상승률)
  - API: `/api/hub_movers`(mcap/turnover/gain1d/gain5d), `/api/hub_rs_top10`, `/api/hub_top10`(position)
  - 각 항목에 `rank`(리스트 순번 1~20) + `rankDelta`(전일 동일 리스트 순번 대비 ▲n/▼n/NEW/-). `hub_rank_daily` 전종목 순위는 내부 저장용이며 API `rank`에는 쓰지 않음.
  - 데스크탑: 6열 1행 / 모바일: 세로 스택
  - **주의**: rank 조회는 고정 캘린더 날짜가 아니라 **테이블의 max(trade_date)** 기준

---

## 9. 빌드 & 배포

- **빌드**: `npm run build` (rebuild_site → build_trust_pages → patch_* → pages_build → verify:dist → fix_canonical)
- **지도 페이지**: `build_korea_*_map.mjs` + `patch_*.mjs`가 생성. **생성된 HTML 직접 수정 금지**,
  빌드/패치 스크립트를 고치고 `npm run build`
- **dist 동기화**: `npm run verify:dist`가 `js/`↔`dist/js/` SHA 비교. 빌드 파이프라인에 포함
- **캐시버스팅**: JS 수정 시 참조하는 HTML의 `?v=` 반드시 bump (`_headers`가 `/js/*.js` 1년 immutable)
- **줄바꿈**: `.gitattributes`에 `* text=auto eol=lf` (CRLF diff 오염 방지)
- **배포**: Cloudflare Pages. 푸시 → 자동 배포(1~3분). `/functions`는 repo 루트에서 서빙됨
- **환경 차이 주의**: 빌드 검증 스크립트(`verify_*`, `npm run verify:reorg`)는 프로덕션 빌드 체인에서 분리하고 로컬/CI에서만 실행. `cp_list` 등 로컬 전용 데이터에 빌드가 의존하면 안 되며, 없을 때 커밋된 fallback(예: `bio/cp_list_bio_additions.json`)으로 동일 결과를 보장한다.
- **CSS 패치 정규식 주의**: `patch_*.mjs`에서 `마커 → 다음 앵커`까지 잘라내는 정규식은 앵커가 멀리 있으면 그 사이 CSS를 통째로 삭제한다(bigchip에서 히트맵·trust·spark CSS가 사라져 `#heatmap-root` 높이가 0이 된 사례). 마커는 최대한 구체적으로 지정하고, 지도별 추가 CSS는 기존 앵커 패턴(`@media(max-width:768px)` 등)과 겹치지 않게 작성한다. 공용 UI 모듈은 페이지 CSS가 없어도 동작하도록 자체 크기 보장을 둔다.

### 빌드 함정 (중요)

- **semi-template 파생 빌더**: `build_korea_robot/ship/defense/kculture_map.mjs`는
  `semiconductor/korea_semiconductor_map.html`을 복제·치환한다. 반도체 ANGLE/chains
  하드코딩 needle이 디자인하우스 등 밸류체인 변경과 어긋나면 CF fresh 빌드에서 throw.
  **해결**: `lib/semi_chain_ui.mjs`에 ANGLE/`CHIP_CHAINS`/`LEGEND_CHAINS`를 두고
  `apply_semi_chain_reclass.mjs`가 re-export. 파생 빌더는
  `retargetSemiCloneAngles`로 큐레이티드 그래프의 `CURATED_*_ANGLE`까지 재타겟팅한다.
- **로컬 skip vs CF fresh**: 일부 지도 HTML은 로컬에서 exists-skip되거나 캐시된 채로
  통과해도, Cloudflare는 fresh clone이라 동일 커밋에서 깨질 수 있다.
  **푸시 전** `dist/`(및 필요 시 재생성 지도) 삭제 후 `npm run build`로 CF 경로를 재현한다.
- **배포 검증**: `/js/<파일>` 응답이 실제 JS(수~수십 KB)인지 fallback HTML(~80KB 전후)인지
  Content-Type·크기·본문 시작으로 판별. `ticker_ohlc`처럼 대용량 JSON은 web_fetch가
  tail을 잘라 검증이 어렵다 → `X-OHLC-Sig` 응답 헤더(마지막 봉 t·c·v 시그니처)와
  라이브 차트 확인으로 대체한다.

---

## 10. 운영 체크리스트 (정기)

- [ ] 매년 말: (휴장 감지는 자동이지만) KRX 특이 휴장 확인
- [ ] 토큰 만료: cron-job.org의 GitHub PAT (2027-07-13 만료) 갱신
- [ ] `hub_rank_daily` 테이블 비대 시: 오래된 행(7일 이전) 정리 로직 추가 검토
- [ ] `stock_price_history` 깊이: **2017-08-25~ / ≥약 2200거래일** 유지
  (`backfill_price_history.mjs`). 주봉5Y + BBW%/이격도%(125주 정규화+MA50) 워밍업용
- [ ] 지수 backfill: `market_index_daily`/`market_index_intraday` 공백 시
  `backfill_market_index.mjs` (KRX 권한 없으면 Naver 경로)
- [ ] 섹터 합산시총 커버리지: `verify_sector_mcap_coverage.mjs` (기준일 구성종목 누락 시 `--fix`)
- [ ] 카드↔변동추이: `verify_hub_sectors_vs_trend.mjs` / `verify_hub_trend.mjs` (필요 시 `--live=`)
- [ ] 반도체 관계망: `verify:semi-relations` (9개 밸류체인 허브)
- [ ] 캔들/모멘텀: `verify:candle`, `verify:momentum`

---

## 11. 캔들 차트 (`js/candle_modal.js`)

- **라이브러리**: lightweight-charts **v5 네이티브 panes** — 단일 차트에 가격/거래량/MACD/
  BBW%·DISP%/ATR% 5패널. 시간축을 공유하므로 x축 정렬은 라이브러리가 보장한다
  (v4 다중차트 폭맞추기 폐기).
- **기본 구간**: 일봉 1Y / 주봉 5Y. `/api/ticker_ohlc`가 `3m`/`6m`/`1y`/`3y`/`5y` 등을 지원.
- **이동평균**: interval-aware `PRICE_MA_SPECS` — 일봉 5/20/50/120, 주봉 4/13/26/52.
  **이격도(DISP%)**는 봉 개수와 무관하게 **50봉 SMA** 고정.
- **closeOnly 폴백**: open/high/low가 null·0이면 종가만으로 그리고 플래그를 남긴다
  (세션-클로즈 Naver·거래정지 정규화와 맞물림).
- **기타**: 영숫자 티커 지원, 장후 “오늘 봉” 유지, OHLC 클라이언트 캐시 키에
  마지막 봉 시그니처(t·c·v)를 넣어 장마감 갱신을 반영.
- **패치**: `scripts/patch_candle_modal.mjs`, 검증 `npm run verify:candle`.

---

## 12. 모멘텀 매트릭스 (`js/map_momentum.js`)

- 섹터(지도)별 버블: **x = RS**, **y = 50D BOX 또는 50D %b**(토글),
  크기 = 거래대금, 색 = 등락률, 4분면 가이드.
- y축 데이터는 `/api/quotes`의 경계값(`high50d`/`low50d`/`bbUpper`/`bbLower` 등).
  값은 sync가 history에서 채워 `stock_quotes_latest`에 둔다(0012).
- 탭 주입: `scripts/patch_momentum_tab.mjs`. 검증 `npm run verify:momentum`.

---

## 13. 허브 추이 차트 (`js/hub_trend_chart.js` + `/api/hub_trend`)

- `index.html` 섹터 퍼포먼스 아래 **d3 다중라인**: 전 섹터 + 코스피·코스닥을
  **100 기준**으로 재지수소. 호버 시 해당 라인 강조, 장중 **5분 폴링**.
- API는 horizon별로 시리즈를 주고, 지수 시계열은 `market_index_*`를 읽는다.
- 검증: `npm run verify:hub-trend`, 카드↔추이 정합은 `verify:hub-sectors-trend`.

---

## 14. 큐레이티드 관계 네트워크

- **공유 렌더러**: `lib/curated_relation_network.mjs`
  - `ticker` 모드 — bigchip(삼성·하이닉스 2허브)
  - `chainGroup` 모드 — 반도체 **9개 밸류체인 그룹** 허브
- **반도체 데이터**: `data/semi_relations.json`
  - hub = 밸류체인 그룹, `members`는 맵 `chain`에서 **자동 채움**(하드코딩 금지)
  - `suppliers` / `customers` / `peers`는 출처·`evidence`(confirmed|reported) 손수 리서치
  - 적용: `scripts/apply_semi_relation_network.mjs` (rebuild_site에 포함)
- **bigchip**: `data/bigchip_relations.json` + `apply_bigchip_relation_network.mjs`가
  동일 공유 패치를 사용.
- **UI 규약**: 좌측 범례 3영역(밸류체인 / 역할 / 국가). 사이드바 국내상장 라벨은
  **「밸류체인」**. 전 노드 이름 라벨. chain 색 없으면 `#8b949e`. IDM 범례 칩 제외,
  허브는 `isHub`로 강조. 디자인하우스 체인(`data/chain_overrides.json` /
  `lib/semi_chain_ui.mjs`)도 관계망·히트맵 팔레트에 연동.
- 검증: `npm run verify:semi-relations`, `npm run verify:bigchip`.

---

## 15. 네비 탭 유지

- 섹터 지도 간 이동 시 **현재 탭**(표/그래프/히트맵/모멘텀 등)을 보존한다.
- `getTab` / `im_map_tab`을 `desktop_sidebar_nav` · `sector_nav` · `global_bottom_nav`가
  공유하고, `pointerdown`/`click` 시점에 다시 읽어 href에 붙인다
  (클릭 직전 탭 전환이 유실되지 않게).

---

## 부록 — 주요 API 엔드포인트

| 엔드포인트 | 용도 |
|---|---|
| `/api/quotes?codes=...` | 종목 시세(지도 폴링, `spark20`). 모멘텀용 `high50d`/`low50d`/`high120d`/`low120d`/`bbUpper`/`bbLower` |
| `/api/ticker_ohlc?code=&range=` | 종목 일봉 OHLC+거래량 (`3m`/`6m`/`1y`/`3y`/`5y`). 주봉 집계·워밍업은 클라이언트가 history 깊이로 처리. 응답 `X-OHLC-Sig` |
| `/api/hub_sectors` | 섹터 퍼포먼스(한 응답에 5 horizon) |
| `/api/hub_sector_trend?horizon=20d` | 섹터 스파크라인 시계열 |
| `/api/hub_trend?horizon=...` | 섹터+코스피·코스닥 100기준 시계열(허브 추이 차트) |
| `/api/hub_movers` | 시총/거래대금/당일상승/5일상승 Top20 |
| `/api/hub_rs_top10` | RS Top20 |
| `/api/hub_top10` | 주가 위치 Top20 |
| `/api/fx` | USD/KRW 환율 |

---

## 부록 — 검증 스크립트 (`package.json`)

| 스크립트 | 내용 |
|---|---|
| `verify:dist` | `js/` ↔ `dist/js/` SHA + 히트맵 exclude 칩 |
| `verify:bigchip` | bigchip 큐레이티드 관계망 |
| `verify:semi-relations` | 반도체 9개 밸류체인 허브·엣지·출처 |
| `verify:candle` | 캔들 모달(panes·MA·캐시버스팅) |
| `verify:momentum` | 모멘텀 매트릭스 탭/데이터 계약 |
| `verify:hub-trend` | hub_trend 시리즈·캐시 버전 |
| `verify:hub-sectors-trend` | hub_sectors % ≈ hub_trend 끝−100 |
| `verify:sector-mcap-coverage` | 섹터 합산시총 기준일 커버리지 |
| `verify:reorg` | powergrid/ship/sector chain 재분류 |
| `verify:tickers` | 지도 티커 정합 |
| `verify:heatmap-exclude` | 히트맵 exclude 칩 |
