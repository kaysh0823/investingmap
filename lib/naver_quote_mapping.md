# Naver Finance → investingmap quotes

Server-side only (Pages Function / Worker fetches Naver; browsers call `/api/quotes`).

## Sources (priority)

| Source | When | `source` field |
|--------|------|----------------|
| KRX OPEN API | Secret configured, API approved | `krx-open-api` |
| KRX + Naver sise gap-fill | KRX ok but missing fields | `krx-open-api+naver-sise` |
| Naver PC sise only | No KRX key or KRX failure | `naver-sise` |

Implementation: `lib/naver_sise_quotes.mjs` · `functions/api/quotes.js`

---

## A. PC sise HTML (fallback / gap-fill)

| Step | URL | Purpose |
|------|-----|---------|
| S | `GET https://finance.naver.com/item/sise.naver?code={ticker}` | 현재가(`#_nowVal`), 52주 최고/최저(투자정보 표) |

- Page encoding: **EUC-KR** — decode before parsing Korean labels.
- ASCII fallback: last `<tr>` with two `<th class="title">` + `<span class="tah p11">` pairs in 주요시세 (after 상한가/하한가 rows).

| HTML | Maps to |
|------|---------|
| `#_nowVal` | `last` |
| `52주 최고` row → `.tah.p11` | `high52w` |
| `52주 최저` row → `.tah.p11` | `low52w` |

---

## B. m.stock JSON (legacy Worker primary)

| Step | URL | Purpose |
|------|-----|---------|
| A | `GET https://m.stock.naver.com/api/stock/{ticker}/integration` | 52주 최고/최저, 당일 종가(최근 거래일) |
| B | `GET https://m.stock.naver.com/api/stock/{ticker}/price?pageSize=60&page={1..5}` | 일봉 종가 시계열(최신→과거) |

`User-Agent: Mozilla/5.0` 권장. Worker falls back to **sise (A)** when integration fields are missing.

## Field mapping

### Integration `totalInfos[]`

| `code` | Maps to |
|--------|---------|
| `highPriceOf52Weeks` | `high52w` (parse `value` comma number) |
| `lowPriceOf52Weeks` | `low52w` |
| `lastClosePrice` | fallback last (전일 종가 라벨) |

### Integration `dealTrendInfos[0]`

| Field | Maps to |
|-------|---------|
| `closePrice` | `last` — 최근 영업일 종가(표의 “현재가”에 해당) |

### Price pages (merged arrays, newest first)

| Index | Use |
|-------|-----|
| `0` | Latest close (= should match `dealTrendInfos[0].closePrice` when aligned) |
| `251` | 약 252영업일 전 종가 → 1년 수익률 분모 |

### `yoyReturnPct`

\[
\text{yoyReturnPct} = \left(\frac{\text{close}_0}{\text{close}_{251}} - 1\right) \times 100
\]

- `close_*` = `closePrice` 문자열에서 콤마 제거 후 `parseFloat`.
- `merged.length < 252`이면 `yoyReturnPct: null`.

## Worker response shape

```json
{
  "asOf": "2026-06-15T12:00:00.000Z",
  "items": {
    "005930": {
      "last": 337000,
      "high52w": 377000,
      "low52w": 56900,
      "yoyReturnPct": 12.34
    }
  }
}
```

Ticker keys are **6자리 정규화**(`000660`, `0126Z0` 등).
