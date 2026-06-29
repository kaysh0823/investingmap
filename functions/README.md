# Cloudflare Pages Functions — KRX quotes API

`GET /api/quotes?codes=005930,000660`

Returns JSON compatible with `js/live_quotes.js`:

```json
{
  "asOf": "ISO-8601",
  "basDd": "20260613",
  "source": "naver-sise-cache",
  "regularSession": true,
  "items": {
    "005930": {
      "last": 354000,
      "high52w": 374500,
      "low52w": 57600,
      "mcapWon": 2069582600000000,
      "per": 28.61,
      "pbr": null,
      "yoyReturnPct": null
    }
  }
}
```

## Cloudflare setup

1. Deploy the **`investingmap/`** folder as a Cloudflare Pages project (GitHub 연동 또는 Direct Upload).
2. **Build configuration** (Settings → Builds):
   - Framework preset: **None**
   - Build command: **empty** (or `exit 0`)
   - Build output directory: **`/`**
   - Do **not** commit `wrangler.toml` at repo root (use `wrangler.toml.example` for local dev only).
3. **Settings → Variables and Secrets** (Production):
   - Secret **`KRX OPEN API 인증키`** 또는 **`KRX_AUTH_KEY`** = KRX Data Marketplace 인증키
3. [openapi.krx.co.kr](https://openapi.krx.co.kr)에서 아래 API **이용 신청·승인** 필요:
   - 유가증권 일별매매정보 (`stk_bydd_trd`)
   - 코스닥 일별매매정보 (`ksq_bydd_trd`)

## Map pages

`<meta name="investingmap-quotes-api" content="/api/quotes">` (기본값).  
`live_quotes.js`는 meta가 비어 있어도 HTTP로 열면 같은 출처 `/api/quotes`를 호출합니다.

## Hub dashboard

`GET /api/hub_dashboard` — sector mcap-weighted 1Y return + top-10 price position (single JSON).  
Used by `js/hub_dashboard.js` on `index.html`. Reads `data/hub_index.json` server-side and aggregates Naver quotes (+ optional KRX 1Y).

## Local test

**Option A — full site + API (recommended)**

```bash
cd investingmap
copy wrangler.toml.example wrangler.toml
npx wrangler pages dev . --port 8788
# KRX key optional: without it, /api/quotes uses Naver sise (finance.naver.com/item/sise.naver)
curl "http://localhost:8788/api/quotes?codes=005930"
```

**Option B — quotes API only (no KRX key)**

```bash
node scripts/dev_quotes_server.mjs
curl "http://127.0.0.1:8788/api/quotes?codes=005930"
```

`.dev.vars` (git 제외, KRX 사용 시):

```
KRX_AUTH_KEY=your-key-here
```

## Notes

- **데이터 소스**: 현재가·52주 고저·시가총액·PER·PBR은 [네이버 PC 시세](https://finance.naver.com/item/sise.naver?code=005930)에서 가져옵니다.
- **캐시 정책** (KST 기준):
  - **정규장 09:00–15:30**(월–금): 종목당 최대 **1시간**에 한 번만 네이버 호출, 이후 캐시 응답
  - **정규장 외**: 네이버 **추가 호출 없음**, 마지막 저장 캐시만 표시
- Cloudflare Pages는 isolate 메모리 + Cache API에 캐시합니다. 로컬은 `data/.naver_quotes_cache.json`.
- 1년 수익률(`yoyReturnPct`)은 KRX Secret + `warm=1` 요청 시에만 보강(선택).
- Legacy Worker: `worker/quotes/` (m.stock + sise fallback).
