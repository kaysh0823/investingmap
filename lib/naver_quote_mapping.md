# Naver Finance → investingmap quotes (Worker adapter)

Server-side only (Worker fetches Naver; browsers call the Worker).

## Endpoints

| Step | URL | Purpose |
|------|-----|---------|
| A | `GET https://m.stock.naver.com/api/stock/{ticker}/integration` | 52주 최고/최저, 당일 종가(최근 거래일) |
| B | `GET https://m.stock.naver.com/api/stock/{ticker}/price?pageSize=60&page={1..5}` | 일봉 종가 시계열(최신→과거) |

`User-Agent: Mozilla/5.0` 권장.

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
