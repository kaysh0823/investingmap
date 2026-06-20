# investingmap quotes Worker

Proxies Naver **m.stock JSON** and, when needed, [PC sise HTML](https://finance.naver.com/item/sise.naver) so static map pages can refresh **현재가**, **52주 최고/최저**, **1년 수익률** without browser CORS issues.

## Deploy (Cloudflare)

```bash
cd worker/quotes
npx wrangler deploy
```

Set a **secret or var** `ALLOW_ORIGINS` to your site origins (comma-separated), e.g. `https://yourname.github.io,http://127.0.0.1:5500`. If unset, the Worker sends `Access-Control-Allow-Origin: *` (dev only).

## API

`GET https://<your-worker>/?codes=005930,000660,373220`

Response: `{ "asOf": "ISO-8601", "items": { "005930": { "last", "high52w", "low52w", "yoyReturnPct" } } }`

## Map pages

Set in each map HTML `<head>`:

```html
<meta name="investingmap-quotes-api" content="https://your-worker.workers.dev/" />
```

and load `../js/live_quotes.js` before the inline map script.

See [lib/naver_quote_mapping.md](../../lib/naver_quote_mapping.md) for upstream field notes.
