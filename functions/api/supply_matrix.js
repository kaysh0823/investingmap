import { getSupabaseConfig, fetchSupabaseJson, numOrNull } from '../lib/supabase_hub.mjs';
import { SUPPLY_INSTITUTION_CODE, SUPPLY_FOREIGN_CODE } from '../lib/supply_investor_codes.mjs';
import { fetchSupplySessions } from '../lib/supply_sessions.mjs';

const WINDOWS = [5, 10, 20, 50];
const TABLE = 'stock_investor_net';

export function aggregateSupply(rows, dates) {
  const byTicker = new Map();
  for (const row of rows) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, new Map());
    byTicker.get(row.ticker).set(row.trade_date + row.invst_tp_cd, numOrNull(row.net_val));
  }
  const totals = {};
  for (const [ticker, values] of byTicker) {
    const windows = {};
    let institution = 0;
    let foreign = 0;
    for (const [index, date] of dates.entries()) {
      const inst = values.get(date + SUPPLY_INSTITUTION_CODE);
      const frgn = values.get(date + SUPPLY_FOREIGN_CODE);
      if (inst == null || frgn == null) break;
      institution += inst;
      foreign += frgn;
      if (WINDOWS.includes(index + 1)) windows[index + 1] = { institution, foreign };
    }
    if (Object.keys(windows).length) totals[ticker] = windows;
  }
  return totals;
}

export async function onRequestGet({ request, env }) {
  const tickers = [...new Set((new URL(request.url).searchParams.get('codes') || '').split(','))];
  if (tickers.length > 50 || tickers.some((ticker) => !/^[A-Z0-9]{6}$/.test(ticker))) {
    return Response.json({ error: 'invalid_codes' }, { status: 400 });
  }
  const config = getSupabaseConfig(env);
  if (!config) return Response.json({ error: 'data_unavailable' }, { status: 503 });
  try {
    // Anchor every sector to the same 50 published KRX sessions.
    const dates = await fetchSupplySessions(config, 50);
    const batches = [];
    for (let i = 0; i < tickers.length; i += 10) batches.push(tickers.slice(i, i + 10));
    const rows = dates.length ? (await Promise.all(batches.map((batch) =>
      fetchSupabaseJson(config, `${TABLE}?select=ticker,trade_date,invst_tp_cd,net_val` +
        `&ticker=in.(${batch.join(',')})&trade_date=in.(${dates.join(',')})` +
        `&invst_tp_cd=in.(${SUPPLY_INSTITUTION_CODE},${SUPPLY_FOREIGN_CODE})` +
        '&order=ticker,trade_date,invst_tp_cd', { paginate: true, pageSize: 500 })
    ))).flat() : [];
    return Response.json({ asOf: dates[0] || null, totals: aggregateSupply(rows, dates) }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return Response.json({ error: 'data_unavailable' }, { status: 503 });
  }
}
