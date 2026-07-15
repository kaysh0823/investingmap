# Investing Map (static site)

웹에 올릴 때는 **`investingmap/` 폴더 전체**를 그대로 배포하면 됩니다. `index.html`이 허브이고, 각 산업 지도는 하위 폴더에 있습니다.

## 폴더 구조

| 경로 | 설명 |
|------|------|
| `index.html` | 산업 지도 허브 (언어·테마·`?lang=` 링크) |
| `data/` | KRX 시세 CSV: `data_4937_*`·`data_4848_*`(시총·시장), `data_5016_*`(PER·PBR), 선택 `data_3557_*`(영문 종목명 등). 동일 접두사는 **수정 시각 기준 최신 파일**을 스크립트가 고릅니다. `fx_usdkrw.json`(영문 시총 환산) |
| `data_network/` | 관계 네트워크 참고용 JSON·스펙 (`_schema.json`, 산업별 `*.json`, `demo.html`). 지도 HTML은 기업 `partners` 기반 그래프를 사용합니다. |
| `lib/` | 공통 유틸: `krx_per_pbr.mjs`, `krx_data_sources.mjs`, `naver_sise_quotes.mjs`, `naver_quote_mapping.md` |
| `js/` | `live_quotes.js` — 지도 테이블 현재가·52주 고저·1년 수익률 폴링 (기본 `/api/quotes`) |
| `functions/` | **Cloudflare Pages Functions**: `api/quotes.js` — 네이버 sise 캐시(정규장 1h) + 선택 KRX 1년 수익률 |
| `worker/quotes/` | (레거시) 네이버 m.stock + sise Worker — Pages Functions 미사용 시 선택 |
| `scripts/` | `dev_quotes_server.mjs` — 로컬 `/api/quotes`(KRX 없이 Naver); `update_fx_from_naver.mjs`; `verify_data_refs.mjs`; … |
| `semiconductor/` | 반도체 지도 `korea_semiconductor_map.html` (다른 지도 빌드의 템플릿 원본) |
| `bio/` | 바이오 지도 HTML + `korea_bio_map.inline.js`, JSON/번역, `gen_korea_bio_inline.mjs` 등 |
| `ship/` | 조선·해양 지도 |
| `defense/` | 방산·우주·항공 지도 |
| `robot/` | 로봇·피지컬AI 지도 |
| `energy/` | 에너지 산업 지도 |
| `kculture/` | K컬처 지도 |
| `build_korea_*.mjs` | 루트에서 실행하는 지도 HTML 생성 스크립트 |
| `update_semiconductor_from_krx.mjs` | 반도체·허브·바이오 등 시총·시장·PER·PBR·영문명·기준일 패치 (4937/4848/5016/3557, 최신 파일 자동) |

서브폴더에 있는 지도 페이지는 허브로 돌아갈 때 `../index.html`을 사용합니다.

## 빌드 예시 (이 `investingmap` 디렉터리에서)

```bash
node scripts/verify_data_refs.mjs
node update_semiconductor_from_krx.mjs
node build_korea_robot_map.mjs
node build_korea_ship_map.mjs
node build_korea_kculture_map.mjs
node build_korea_defense_map.mjs
node bio/gen_korea_bio_inline.mjs
node scripts/update_fx_from_naver.mjs
```

바이오 번역 JSON만 고칠 때: `node bio/write_bio_translations.mjs`

## 실시간 시세 (Cloudflare Pages)

1. `investingmap/` 폴더를 **Cloudflare Pages**에 배포합니다.
2. **Settings → Builds & deployments → Build configuration** (중요):
   - **Framework preset:** None
   - **Build command:** `npm run build` *(또는 비움 — repo에 no-op `package.json` 포함)*
   - **Build output directory:** `dist` *(또는 `/` — `dist`일 때 `npm run build`가 정적 파일을 복사함)*
   - **Root directory:** *(비움 — `index.html`이 repo 루트에 있어야 함)*
3. **루트에 `wrangler.toml`을 커밋하지 마세요.** Git 연동 시 V2 wrangler 배포로 바뀌며 **배포 실패**(No deployment available)가 날 수 있습니다. 로컬만 `wrangler.toml.example` 복사 후 사용.
4. **Settings → Variables and Secrets** (선택): **`KRX_AUTH_KEY`** — 1년 수익률(`warm=1`)만 사용. 없어도 현재가·52주·시총·PER·PBR은 네이버 캐시로 제공
5. 배포 후 `https://<사이트>/api/quotes?codes=005930` 확인 — `last`, `high52w`, `low52w`, `mcapWon`, `per`, `pbr` 포함

**주의:** HTML을 `file://`로 직접 열면 `/api/quotes`를 호출할 수 없습니다. Cloudflare Pages, `npx wrangler pages dev`, 또는 `npm run dev:quotes` + HTTP 서버로 열어야 합니다.

로컬: `functions/README.md` · 레거시 Worker: `worker/quotes/`

## Quotes sync (GitHub Actions + 외부 크론)

워크플로: `.github/workflows/sync-quotes.yml` → `scripts/sync_quotes_to_supabase.mjs`  
(네이버 시세 + KRX 기간수익률 → Supabase `stock_quotes_latest` / `sector_returns`)

GitHub `schedule` cron(`*/10`)은 **스로틀링**되어 실제로는 1~3시간 간격으로만 돌 수 있습니다. 워크플로의 schedule은 **백업용**으로 유지하고, 장중 10분 간격은 외부 크론 → `repository_dispatch`를 권장합니다.

### 1) GitHub fine-grained PAT

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Repository access: 이 저장소만
3. Permissions → Repository permissions → **Contents: Read and write**
4. 생성된 토큰을 cron-job.org 등에서만 보관 (repo secrets에 넣지 않아도 됨)

### 2) cron-job.org에서 10분마다 dispatch

- **URL:** `POST https://api.github.com/repos/kaysh0823/investingmap/dispatches`
- **Headers:**
  - `Authorization: Bearer <fine-grained PAT>`
  - `Accept: application/vnd.github+json`
  - `Content-Type: application/json` (권장)
- **Body:**

```json
{"event_type":"sync-quotes"}
```

`event_type`은 워크플로의 `repository_dispatch.types`와 같아야 합니다 (`sync-quotes`).

### 3) 장중만 호출하는 스케줄 예시 (KST)

정규장 **평일 09:00–15:40**에만 10분 간격으로 호출합니다. cron-job.org는 **Timezone = Asia/Seoul**을 쓰는 것을 권장합니다.

| 구간 (KST) | cron-job.org 표현 예시 | 비고 |
|------------|------------------------|------|
| 09:00–14:50 | `*/10 9-14 * * 1-5` | 매시 00,10,…,50분 |
| 15:00–15:40 | `0,10,20,30,40 15 * * 1-5` | 15:40까지 (장후 직후 여유) |

한 개의 잡으로 합치기 어렵다면 위처럼 **두 잡**을 만들고 URL·헤더·바디는 동일하게 둡니다.  
장후 최종 스냅샷은 GitHub schedule의 `0 7 * * 1-5`(KST 16:00) 백업이 커버합니다.

수동 실행: Actions → **Sync quotes to Supabase** → Run workflow, 또는 동일 `dispatches` POST.

## 서브경로 배포

사이트가 `https://example.com/maps/` 아래에만 올라가도, **`maps/` 폴더 안에 이 구조를 그대로 두면** 상대 경로가 유지됩니다. (루트 도메인 전체가 이 프로젝트인 경우도 동일합니다.)
