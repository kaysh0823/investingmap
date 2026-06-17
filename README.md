# Investing Map (static site)

웹에 올릴 때는 **`investingmap/` 폴더 전체**를 그대로 배포하면 됩니다. `index.html`이 허브이고, 각 산업 지도는 하위 폴더에 있습니다.

## 폴더 구조

| 경로 | 설명 |
|------|------|
| `index.html` | 산업 지도 허브 (언어·테마·`?lang=` 링크) |
| `data/` | KRX 시세 CSV: `data_4937_*`·`data_4848_*`(시총·시장), `data_5016_*`(PER·PBR), 선택 `data_3557_*`(영문 종목명 등). 동일 접두사는 **수정 시각 기준 최신 파일**을 스크립트가 고릅니다. `fx_usdkrw.json`(영문 시총 환산) |
| `data_network/` | 관계 네트워크 참고용 JSON·스펙 (`_schema.json`, 산업별 `*.json`, `demo.html`). 지도 HTML은 기업 `partners` 기반 그래프를 사용합니다. |
| `lib/` | 공통 유틸: `krx_per_pbr.mjs`(5016), `krx_data_sources.mjs`(4937/4848 병합·3557·기준일 문구), `naver_quote_mapping.md`(시세 Worker 필드 메모) |
| `js/` | `live_quotes.js` — 각 지도 HTML이 선택적으로 로드; `meta investingmap-quotes-api`에 둔 Worker URL로 현재가·52주 고저·1년 수익률 폴링 |
| `worker/quotes/` | Cloudflare Worker 소스: 네이버 `m.stock.naver.com` JSON을 서버에서 받아 CORS 허용 JSON으로 반환. 배포·환경 변수는 `worker/quotes/README.md` 참고 |
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

## 실시간 시세 (선택)

1. `worker/quotes`에서 Cloudflare Worker를 배포합니다 (`npx wrangler deploy`).
2. 운영 사이트 도메인을 `ALLOW_ORIGINS`(쉼표 구분)에 넣으면 해당 Origin만 CORS 허용합니다. 비우면 `*`(개발용).
3. 각 지도 HTML `<head>`의 `<meta name="investingmap-quotes-api" content="">`에 Worker 베이스 URL(예: `https://xxx.workers.dev`)을 넣습니다. 비우면 시세 열은 `—`만 표시되고 네트워크 요청은 하지 않습니다.
4. 기본 폴링 주기는 약 45초입니다 (`js/live_quotes.js`).

## 서브경로 배포

사이트가 `https://example.com/maps/` 아래에만 올라가도, **`maps/` 폴더 안에 이 구조를 그대로 두면** 상대 경로가 유지됩니다. (루트 도메인 전체가 이 프로젝트인 경우도 동일합니다.)
