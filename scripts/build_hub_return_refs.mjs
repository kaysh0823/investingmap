/**
 * Build data/hub_return_refs.json — shared adjusted-close history for live returns.
 * Does not alter existing hub APIs; foundation for a single return math path.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildAdjustedCloseRefsFromHistory,
  RETURN_REF_CLOSES,
  RETURN_REF_TRADING_DATES,
} from '../functions/lib/krx_rs_from_history.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';
import {
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';
import { fetchKrxDailyOhlc } from '../functions/lib/krx_daily_ohlc.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'data', 'hub_return_refs.json');
const SAMPLE_TICKER = '005930';

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[k]) env[k] = v;
  }
  return env;
}

function collectUniverseTickers() {
  const set = new Set();
  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  if (fs.existsSync(hubPath)) {
    const hub = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
    for (const c of listHubCompanies(hub)) {
      const t = normalizeTicker(c.ticker);
      if (t) set.add(t);
    }
  }
  const rsPath = path.join(ROOT, 'data', 'hub_rs_snapshot.json');
  if (fs.existsSync(rsPath)) {
    try {
      const snap = JSON.parse(fs.readFileSync(rsPath, 'utf8'));
      const quotes = snap?.quotes || {};
      for (const key of Object.keys(quotes)) {
        const t = normalizeTicker(key);
        if (t) set.add(t);
      }
    } catch (e) {
      console.warn('hub_rs_snapshot.json parse failed:', e.message || e);
    }
  }
  return [...set].sort();
}

function sharesFromMcapClose(mcap, close) {
  if (mcap == null || !(mcap > 0) || close == null || !(close > 0)) return null;
  const sh = Math.round(mcap / close);
  return sh > 0 ? sh : null;
}

async function main() {
  const env = loadEnv();
  const supabase = getSupabaseConfig(env, { preferServiceRole: true });
  if (!supabase) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }

  const tickers = collectUniverseTickers();
  if (!tickers.length) {
    console.error('No tickers from hub_index / hub_rs_snapshot');
    process.exit(1);
  }
  console.log(
    `Universe: hub+rs = ${tickers.length} tickers `
    + `(closes=${RETURN_REF_CLOSES}, tradingDates=${RETURN_REF_TRADING_DATES})`,
  );

  const refs = await buildAdjustedCloseRefsFromHistory(supabase, tickers, {
    tradingDatesCount: RETURN_REF_TRADING_DATES,
    closesCount: RETURN_REF_CLOSES,
  });
  if (!refs || !refs.quotes?.size) {
    console.error('buildAdjustedCloseRefsFromHistory failed');
    process.exit(1);
  }

  const { recentDd, tradingDates, quotes: seriesMap } = refs;
  let ohlcByTicker = new Map();
  try {
    ohlcByTicker = await fetchKrxDailyOhlc(recentDd, env);
    console.log(`MDCSTAT01501 list_shrs rows for ${recentDd}: ${ohlcByTicker.size}`);
  } catch (e) {
    console.warn('fetchKrxDailyOhlc failed (will use mcap/close):', e.message || e);
  }

  const quotes = {};
  let withShares = 0;
  for (const [ticker, row] of seriesMap) {
    const last = row.closes[row.closes.length - 1];
    const ohlc = ohlcByTicker.get(ticker);
    let shares = ohlc?.list_shrs != null && ohlc.list_shrs > 0
      ? ohlc.list_shrs
      : null;
    if (shares == null) {
      const mcap = ohlc?.mcap_won ?? row.mcap;
      const close = ohlc?.close ?? last;
      shares = sharesFromMcapClose(mcap, close);
    }
    if (shares != null) withShares += 1;
    quotes[ticker] = {
      closes: row.closes,
      shares,
    };
  }

  const sample = quotes[SAMPLE_TICKER];
  if (sample?.closes?.length) {
    const last = sample.closes[sample.closes.length - 1];
    const okLast = last != null && last > 0;
    console.log(
      `verify ${SAMPLE_TICKER}: recentDd=${recentDd} closesLen=${sample.closes.length} `
      + `lastClose=${last} lastIsRecentDd=${okLast ? 'yes' : 'NO'} shares=${sample.shares}`,
    );
    if (!okLast) {
      console.error(`FATAL: ${SAMPLE_TICKER} last close missing — recentDd alignment broken`);
      process.exit(1);
    }
  } else {
    console.warn(`WARN: ${SAMPLE_TICKER} missing from return refs`);
  }

  const out = {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'supabase-history-adj',
    recentDd,
    tradingDates,
    quotesOk: Object.keys(quotes).length,
    sharesOk: withShares,
    quotes,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`, 'utf8');
  console.log(
    `OK ${OUT_PATH} — quotes=${out.quotesOk} shares=${withShares} `
    + `recentDd=${recentDd} tradingDates=${tradingDates.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
