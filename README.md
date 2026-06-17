# Investing Map (static site)

웹에 올릴 때는 **`investingmap/` 폴더 전체**를 그대로 배포하면 됩니다. `index.html`이 허브이고, 각 산업 지도는 하위 폴더에 있습니다.

## 폴더 구조

| 경로 | 설명 |
|------|------|
| `index.html` | 산업 지도 허브 (언어·테마·`?lang=` 링크) |
| `data/` | KRX 시세 CSV: `data_4937_*`·`data_4848_*`(시총·시장), `data_5016_*`(PER·PBR), 선택 `data_3557_*`(영문 종목명 등). 동일 접두사는 **수정 시각 기준 최신 파일**을 스크립트가 고릅니다. `fx_usdkrw.json`(영문 시총 환산) |
| `data_network/` | 관계 네트워크 참고용 JSON·스펙 (`_schema.json`, 산업별 `*.json`, `demo.html`). 지도 HTML은 기업 `partners` 기반 그래프를 사용합니다. |
| `lib/` | 공통 유틸: `krx_per_pbr.mjs`(5016), `krx_data_sources.mjs`(4937/4848 병합·3557·기준일 문구), `naver_quote_mapping.md`(시세 Worker 필드 메모) |
| `js/` | `live_quotes.js` — 지도 테이블 현재가·52주 고저·1년 수익률 폴링 (기본 `/api/quotes`) |
| `functions/` | **Cloudflare Pages Functions**: `api/quotes.js` — KRX OPEN API 일별매매정보. Secret `KRX_AUTH_KEY` |
| `worker/quotes/` | (레거시) 네이버 프록시 Worker — Pages Functions 미사용 시 선택 |
| `scripts/` | `update_fx_from_naver.mjs` — 네이버 금융 고시 환율로 `data/fx_usdkrw.json` 갱신; `verify_data_refs.mjs` — 위 CSV·환율 로드 스모크 검증; `verify_quotes_worker.mjs` — 배포 후 Worker 스모크(선택, `QUOTES_WORKER_URL` 필요) |
| `semiconductor/` | 반도체 지도 `korea_semiconductor_map.html` (다른 지도 빌드의 템플릿 원본) |
| `bio/` | 바이오 지도 HTML + `korea_bio_map.inline.js`, JSON/번역, `gen_korea_bio_inline.mjs` 등 |
| `ship/` | 조선·해양 지도 |
| `defense/` | 방위·우주·항공 지도 |
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
2. Pages **Settings → Variables and Secrets**에 Secret **`KRX_AUTH_KEY`**(KRX OPEN API 인증키)를 넣습니다.
3. [openapi.krx.co.kr](https://openapi.krx.co.kr)에서 **유가증권·코스닥 일별매매정보** API 이용을 신청·승인받습니다.
4. 지도 페이지는 `/api/quotes?codes=...`를 약 45초마다 호출합니다 (`js/live_quotes.js`).
5. 로컬 테스트: `npx wrangler pages dev .` + `functions/README.md` 참고.

레거시: 별도 Worker(`worker/quotes`) + meta URL — `functions/README.md` 하단 참고.

## 서브경로 배포

사이트가 `https://example.com/maps/` 아래에만 올라가도, **`maps/` 폴더 안에 이 구조를 그대로 두면** 상대 경로가 유지됩니다. (루트 도메인 전체가 이 프로젝트인 경우도 동일합니다.)
