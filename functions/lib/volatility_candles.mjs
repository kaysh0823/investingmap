import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';
import { applyPriceAdjustmentsToBars } from './price_adjustments.mjs';
import { regularQuotePair } from './regular_quote_pair.mjs';
import { kstYmdDash } from './krx_session.mjs';

export function candleCodes(raw) {
  const codes = [...new Set(String(raw || '').toUpperCase().split(',').map(s => s.trim()).filter(s => /^[0-9A-Z]{6}$/.test(s)))].sort();
  if (codes.length > 40) throw new Error('too_many_codes');
  return codes;
}

export async function loadVolatilityCandles(config, codes, query = fetchSupabaseJson, now = new Date()) {
  const calendar = await query(config, 'stock_price_history?ticker=eq.005930&select=trade_date&order=trade_date.desc&limit=21');
  const dates = [...new Set(calendar.map(row => String(row.trade_date).slice(0, 10)))].sort();
  if (!dates.length) throw new Error('history_unavailable');
  const filter = `ticker=in.(${codes.join(',')})`;
  // Read already collected regular-session OHLC only; never trigger collection.
  const quotes = await query(config, `stock_quotes_latest?${filter}&select=ticker,last,prev_close,as_of,regular_session,session_open,session_high,session_low,session_volume&limit=40`).catch(() => []);
  const today = kstYmdDash(now);
  const live = new Map();
  for (const row of quotes) {
    const pair = regularQuotePair({ last: row.last, prevClose: row.prev_close, asOf: row.as_of, regularSession: row.regular_session === true }, today, now, { maxAgeMs: Infinity });
    const o = numOrNull(row.session_open), h = numOrNull(row.session_high), l = numOrNull(row.session_low);
    if (!pair || ![o, h, l].every(v => v > 0) || h < Math.max(o, pair.last) || l > Math.min(o, pair.last)) continue;
    live.set(row.ticker, { t: today, o, h, l, c: pair.last, v: numOrNull(row.session_volume) });
  }
  if (live.size && today > dates.at(-1)) dates.push(today);
  while (dates.length > 21) dates.shift();
  // A maximum of 40 tickers × 21 unique sessions stays below PostgREST's row cap.
  const [history, adjustments] = await Promise.all([
    query(config, `stock_price_history?${filter}&trade_date=in.(${dates.join(',')})&select=ticker,trade_date,open,high,low,close,volume&order=ticker.asc,trade_date.asc&limit=1000`),
    query(config, `price_adjustments?${filter}&effective_date=gt.${dates[0]}&effective_date=lte.${dates[dates.length - 1]}&select=ticker,effective_date,ratio&order=effective_date.asc&limit=1000`),
  ]);
  if (adjustments.length >= 1000) throw new Error('adjustments_truncated');
  const tickers = Object.fromEntries(codes.map(code => [code, { bars: [] }]));
  for (const row of history) {
    const entry = tickers[row.ticker];
    if (!entry) continue;
    entry.bars.push({ t: String(row.trade_date).slice(0, 10), o: numOrNull(row.open), h: numOrNull(row.high), l: numOrNull(row.low), c: numOrNull(row.close), v: numOrNull(row.volume) });
  }
  for (const [code, entry] of Object.entries(tickers)) {
    entry.bars.sort((a, b) => a.t.localeCompare(b.t));
    applyPriceAdjustmentsToBars(entry.bars, adjustments.filter(row => row.ticker === code));
    if (live.has(code)) {
      entry.bars = entry.bars.filter(bar => bar.t !== today);
      entry.bars.push(live.get(code));
    }
    entry.asOf = entry.bars.at(-1)?.t || null;
    entry.status = !entry.bars.length ? 'no_history' : entry.asOf !== dates.at(-1) ? 'stale_history' : 'ok';
    const byDate = new Map(entry.bars.map(bar => [bar.t, bar]));
    // Keep missing market sessions in place; never silently turn 5D into 6D.
    entry.bars = dates.map(t => byDate.get(t) || { t, o: null, h: null, l: null, c: null, v: null });
  }
  return { asOf: dates.at(-1), sessions: dates.length, tickers };
}
