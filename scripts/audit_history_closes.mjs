/**
 * Diagnostic only. Last N trading sessions × hub universe:
 * stock_price_history OHLC vs apihub daily (T+1 confirmed).
 * Does not write stock_price_history, refs, or snapshots.
 *
 *   node scripts/audit_history_closes.mjs [--sessions=60]
 *
 * Writes docs/reports/history_close_audit.json
 * Overwrite of mismatched rows is a separate step after this report is reviewed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMarketDay, getAuthKey, historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_SIZE = 1000;
const ANCHOR_TICKER = '005930';
const OHLC = ['open', 'high', 'low', 'close'];
const SAMPLES_PER_DATE = 8;
const DEFAULT_SESSIONS = 60;

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!env[key]) env[key] = value;
  }
  return env;
}

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function price(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function samePrice(stored, expected) {
  const a = price(stored);
  const b = price(expected);
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

async function supabaseSelect(url, key, query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = `${url}/rest/v1/stock_price_history?${query}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`history fetch ${res.status}: ${(await res.text()).slice(0, 180)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function hubTickers() {
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const tickers = [];
  const seen = new Set();
  for (const company of listHubCompanies(hub)) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
  }
  return tickers;
}

async function recentAnchorDates(url, key, sessions) {
  const endpoint =
    `${url}/rest/v1/stock_price_history?ticker=eq.${ANCHOR_TICKER}`
    + `&select=trade_date&order=trade_date.desc&limit=${sessions}`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`anchor dates ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const rows = await res.json();
  return rows
    .map((row) => String(row.trade_date).slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .reverse();
}

async function fetchDbRowsForDate(url, key, date) {
  const rows = await supabaseSelect(
    url,
    key,
    `trade_date=eq.${date}&select=ticker,open,high,low,close,source&order=ticker.asc`,
  );
  const byTicker = new Map();
  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    if (ticker) byTicker.set(ticker, row);
  }
  return byTicker;
}

async function main() {
  const sessions = Math.max(1, Number(argValue('sessions')) || DEFAULT_SESSIONS);
  const env = loadEnv();
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '';
  const authKey = getAuthKey(env);
  if (!url || !key || !authKey) {
    throw new Error('SUPABASE_URL, a Supabase key, and KRX_AUTH_KEY are required');
  }

  const tickers = hubTickers();
  const dates = await recentAnchorDates(url, key, sessions);
  if (!dates.length) throw new Error(`no ${ANCHOR_TICKER} trade dates in stock_price_history`);

  const byDate = [];
  const apihubEmptyDates = [];
  let firstMismatchDate = null;
  let mismatchRows = 0;

  for (const date of dates) {
    const basDd = date.replaceAll('-', '');
    const [dbByTicker, market] = await Promise.all([
      fetchDbRowsForDate(url, key, date),
      fetchMarketDay(authKey, basDd),
    ]);
    if (!market || market.size === 0) {
      apihubEmptyDates.push(date);
      byDate.push({
        date,
        source: null,
        compared: 0,
        mismatch: 0,
        missingInDb: 0,
        missingInApihub: 0,
        samples: [],
        note: 'apihub empty — later overwrite may use MDCSTAT',
      });
      console.log(`  ${date}: apihub empty`);
      await sleep(200);
      continue;
    }

    let compared = 0;
    let mismatch = 0;
    let missingInDb = 0;
    let missingInApihub = 0;
    const samples = [];
    for (const ticker of tickers) {
      const krx = historyFieldsFromKrxRow(market.get(ticker));
      const db = dbByTicker.get(ticker) || null;
      if (!krx) {
        missingInApihub += 1;
        continue;
      }
      if (!db) {
        missingInDb += 1;
        if (samples.length < SAMPLES_PER_DATE) {
          samples.push({ ticker, kind: 'missingInDb', apihubClose: krx.close });
        }
        continue;
      }
      compared += 1;
      const fields = [];
      for (const field of OHLC) {
        if (samePrice(db[field], krx[field])) continue;
        fields.push({ field, db: price(db[field]), apihub: price(krx[field]) });
      }
      if (!fields.length) continue;
      mismatch += 1;
      if (samples.length < SAMPLES_PER_DATE) {
        samples.push({ ticker, source: db.source || null, fields });
      }
    }
    mismatchRows += mismatch;
    if (mismatch > 0 && !firstMismatchDate) firstMismatchDate = date;
    byDate.push({
      date,
      source: 'apihub',
      compared,
      mismatch,
      missingInDb,
      missingInApihub,
      samples,
    });
    console.log(`  ${date}: mismatch ${mismatch}/${compared}`);
    await sleep(200);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    sessionsRequested: sessions,
    sessionsCompared: dates.length,
    hubTickers: tickers.length,
    anchorTicker: ANCHOR_TICKER,
    firstMismatchDate,
    mismatchRows,
    datesWithMismatch: byDate.filter((row) => row.mismatch > 0).length,
    apihubEmptyDates,
    byDate,
    note: 'Read-only. Mismatched rows are not overwritten. apihub-empty dates are listed for a later MDCSTAT fallback.',
  };
  const outPath = path.join(ROOT, 'docs', 'reports', 'history_close_audit.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `history close audit: first=${firstMismatchDate || 'none'} `
    + `mismatchRows=${mismatchRows} dates=${report.datesWithMismatch}/${dates.length} `
    + `apihubEmpty=${apihubEmptyDates.length} → ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
