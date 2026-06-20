# Cloudflare Pages Functions — KRX quotes API

`GET /api/quotes?codes=005930,000660`

Returns JSON compatible with `js/live_quotes.js`:

```json
{
  "asOf": "ISO-8601",
  "basDd": "20260613",
  "source": "krx-open-api",
  "items": {
    "005930": { "last": 60100, "high52w": 89000, "low52w": 49900, "yoyReturnPct": 12.34 }
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

- **현재가·52주 고저**: KRX 키가 없거나 KRX 필드가 비어 있으면 [네이버 PC 시세](https://finance.naver.com/item/sise.naver?code=005930) 페이지를 크롤링해 보완합니다 (`source`: `naver-sise` 또는 `krx-open-api+naver-sise`).
- KRX OPEN API는 **틱 실시간**이 아니라 **일별매매(종가·고저)** 기준입니다. 네이버 sise **현재가**는 장중 시세에 가깝습니다.
- 52주 고저·1년 수익률(KRX)은 최근 약 252영업일 일별 데이터를 모아 계산하며, 6시간 캐시합니다.
- 일 호출 한도(약 1만 회)를 고려해 최신 시세는 45초, 히스토리는 6시간마다 갱신합니다.

Legacy standalone Worker: `worker/quotes/` (네이버 m.stock + sise fallback, 선택).
