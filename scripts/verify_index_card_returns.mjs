import assert from 'node:assert/strict';
import { fetchIndexIntradayRebased } from '../functions/lib/sector_trend_core.mjs';

const originalFetch = globalThis.fetch;
let captures = true;
let previousDaily = true;
globalThis.fetch = async (url) => {
  const path = String(url);
  const rows = path.includes('market_index_intraday?')
    ? captures ? [
      { index_code: 'KOSPI', captured_at: '2026-10-21T09:05:00+09:00', value: 105, prev_close: 100 },
      { index_code: 'KOSPI', captured_at: '2026-10-21T15:33:00+09:00', value: 110, prev_close: 100 },
    ] : []
    : path.includes('trade_date=lt.')
      ? previousDaily ? [{ index_code: 'KOSPI', trade_date: '2026-10-20', close: 100 }] : []
      : [{ index_code: 'KOSPI', close: 112 }];
  return new Response(JSON.stringify(rows), { status: 200 });
};
const config = { url: 'https://example.invalid', anonKey: 'test' };
try {
  for (const mode of ['live', 'close']) {
    const result = await fetchIndexIntradayRebased(config, '2026-10-21', mode);
    const series = result.find((entry) => entry.code === 'KOSPI').series;
    assert.equal(series[0].v, 100);
    assert.equal(series.at(-1).v - 100, mode === 'live' ? 10 : 12,
      'opening gap is included; closed session uses official daily close');
    assert.deepEqual(result.find((entry) => entry.code === 'KOSDAQ').series, []);
  }
  previousDaily = false;
  const fallback = await fetchIndexIntradayRebased(config, '2026-10-21', 'live');
  assert.equal(fallback[0].series.at(-1).v, 110, 'capture prev_close is a valid fallback');
  previousDaily = true;
  captures = false;
  const closed = await fetchIndexIntradayRebased(config, '2026-10-21', 'close');
  assert.equal(closed[0].series.at(-1).v, 112, 'daily closes work without intraday captures');
  console.log('index card returns: previous close, opening gap, official close and missing captures OK');
} finally {
  globalThis.fetch = originalFetch;
}
