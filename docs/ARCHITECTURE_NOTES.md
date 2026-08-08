# Investing Map — 아키텍처 & 작업 정리

> 최종 갱신: 2026-08-02
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
        ▼
Supabase (권위 있는 단일 소스)
        │  stock_quotes_latest / sector_returns / sector_mcap_daily
        │  sector_intraday_snapshots / stock_price_history / hub_rank_daily
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
- **로컬 실행**: `.dev.vars`에 키. 비거래일엔 조기 종료되므로 강제 실행은 `--force`

---

## 3. Supabase 테이블

| 테이블 | 내용 | 채우는 주체 |
|---|---|---|
| `stock_quotes_latest` | 종목별 최신 스냅샷(가격·시총·거래대금·수익률·RS 등) | sync 매 실행 upsert |
| `sector_returns` | 섹터별 기간 수익률(1D/20D/50D/120D/200D) | sync (과거 시총 가중) |
| `sector_mcap_daily` | 섹터 일별 합산 시총(스파크라인 20D+용) | backfill + sync 장마감 |
| `sector_intraday_snapshots` | 1D 스파크라인용 일중 섹터 시총 스냅샷 | sync 정규장에만 append |
| `stock_price_history` | 종목 일별 OHLC·거래량·시총(≥500거래일 권장, 캔들·지표 워밍업) | `backfill_price_history.mjs --days=500` + sync |
| `hub_rank_daily` | 6개 metric 일별 순위(순위 변동 계산용) | sync 장마감 |

마이그레이션: `supabase/migrations/0001~0011`. **적용은 Supabase SQL Editor에서 수동**.
새 컬럼/테이블은 반드시 **마이그레이션 먼저 적용 → 커밋·푸시** 순서
(안 하면 다음 sync가 400으로 전체 실패).

---

## 4. 섹터 구조 (16개)

`SECTOR_ORDER` 기준. `data/hub_index.json`이 섹터→종목 매핑의 소스.

반도체(semi) · 2차전지/배터리(battery, ESS 체인 포함) · 신재생(renewable) · 원전(nuclear) ·
전력설비(powergrid) · 조선(ship) · 방산(defense) · K-소비/유통(kconsume) ·
화장품/미용기기(cosmetics) · K-콘텐츠(kcontent) · 바이오(bio) · 로봇(robot) ·
자동차(auto) · 의료기기/헬스케어(medtech) · 금융(finance) · 건설(construction)

- `energy`는 배터리/신재생/원전으로 분할됐고, `/energy/`는 안내 랜딩 페이지로 유지(301 대신)
- `ess`는 별도 섹터가 아니라 battery의 밸류체인 체인으로 흡수
- 복수 섹터 소속: `SECTOR_CROSS`(휴젤·케어젠 = bio+cosmetics, 대주전자재료 = semi+battery).
  `crossIndex` 역인덱스로 지도에 `+섹터` 배지 표시. **일반 종목은 단일 섹터 원칙 유지**
- 섹터 개편/종목 이동은 항상 Cursor가 만든 분류표를 **사람이 검토 후 확정**

---

## 5. 섹터 퍼포먼스 계산 (중요)

- **정의**: `(Σ 현재 시총 / Σ 기준일 시총 − 1) × 100` (시총 합산 수익률)
- **구현**: `scripts/sync_quotes_to_supabase.mjs`의 `mcapWeightedReturn`
- **장마감**: 정확함(현재가=종가).
- **장중 미해결 이슈**: 과거 시총을 `mcap_won/(1+ret)`로 **역산**하기 때문에,
  장중(현재가≠최근종가)엔 분모가 왜곡돼 실제 "현재 합산시총/기준일 합산시총"과 다름.
  → 후속 개선안: 분모를 `stock_price_history`의 실제 과거 거래일 시총에서 조회.
  (프롬프트 초안은 세션 로그 참고. 아직 미적용)
- **프론트 라이브 오버레이 제거됨**: 과거엔 `hub_dashboard.js`가 낡은
  `hub_rs_snapshot.json`으로 1D를 재계산해 API값을 덮어써서 값이 깜빡였음.
  이제 `/api/hub_sectors` 단일 소스만 사용, 장중엔 5분마다 재fetch.

---

## 6. 휴장일 감지

- 하드코딩 캘린더 없음. **네이버 페이지의 "YYYY.MM.DD 기준(KRX 장마감)" 마커를 파싱**
  (`functions/lib/naver_sise_quotes.mjs`의 `parseNaverTradeMeta`)
- 시계상 장중이어도 네이버 tradeDate가 과거이거나 marketClosed면 → 휴장 판정,
  `regular_session=false` 저장, as_of는 tradeDate 기준
- 임시공휴일도 자동 감지됨(캘린더 유지보수 불필요)

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
  - 1D → `sector_intraday_snapshots`(장중 누적, 첫날은 점선 placeholder)
  - 정규화(%) 방식, 끝점이 카드 수익률과 일치
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

---

## 10. 운영 체크리스트 (정기)

- [ ] 매년 말: (휴장 감지는 자동이지만) KRX 특이 휴장 확인
- [ ] 토큰 만료: cron-job.org의 GitHub PAT (2027-07-13 만료) 갱신
- [ ] `hub_rank_daily` 테이블 비대 시: 오래된 행(7일 이전) 정리 로직 추가 검토
- [ ] `stock_price_history` 깊이: 캔들 MA120·BBW120 + 1Y 표시를 위해 ≥500거래일 유지 (`backfill_price_history.mjs --days=500`)
- [ ] 후속 개선: 장중 섹터 수익률 분모를 실제 과거 시총으로(5장 참고)

---

## 부록 — 주요 API 엔드포인트

| 엔드포인트 | 용도 |
|---|---|
| `/api/quotes?codes=...` | 종목 시세(지도 페이지 폴링, `spark20` 미니 스파크) |
| `/api/ticker_ohlc?code=&range=` | 종목 일봉 OHLC+거래량 (`3m`/`6m`/`1y`) |
| `/api/hub_sectors?horizon=1d` | 섹터 퍼포먼스 |
| `/api/hub_sector_trend?horizon=20d` | 섹터 스파크라인 시계열 |
| `/api/hub_movers` | 시총/거래대금/당일상승/5일상승 Top20 |
| `/api/hub_rs_top10` | RS Top20 |
| `/api/hub_top10` | 주가 위치 Top20 |
| `/api/fx` | USD/KRW 환율 |
