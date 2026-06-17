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
2. **Settings → Variables and Secrets** (Production):
   - Secret **`KRX_AUTH_KEY`** = KRX Data Marketplace 인증키  
     (또는 `AUTH_KEY` / `KRX_OPEN_API_KEY` — 코드에서 순서대로 읽음)
3. [openapi.krx.co.kr](https://openapi.krx.co.kr)에서 아래 API **이용 신청·승인** 필요:
   - 유가증권 일별매매정보 (`stk_bydd_trd`)
   - 코스닥 일별매매정보 (`ksq_bydd_trd`)

## Map pages

`<meta name="investingmap-quotes-api" content="/api/quotes">` (기본값).  
`live_quotes.js`는 meta가 비어 있어도 HTTP로 열면 같은 출처 `/api/quotes`를 호출합니다.

## Local test

```bash
cd investingmap
npx wrangler pages dev . --port 8788
# 다른 터미널에서 KRX_AUTH_KEY를 wrangler secret으로 넣거나 .dev.vars 사용
curl "http://localhost:8788/api/quotes?codes=005930"
```

`.dev.vars` (git 제외):

```
KRX_AUTH_KEY=your-key-here
```

## Notes

- KRX OPEN API는 **틱 실시간**이 아니라 **일별매매(종가·고저)** 기준입니다. 당일 데이터는 영업일·제공 시점에 따라 없을 수 있습니다.
- 52주 고저·1년 수익률은 최근 약 252영업일 일별 데이터를 모아 계산하며, 6시간 캐시합니다.
- 일 호출 한도(약 1만 회)를 고려해 최신 시세는 45초, 히스토리는 6시간마다 갱신합니다.

Legacy standalone Worker: `worker/quotes/` (네이버 프록시, 선택).
