/**
 * Backfill stock_price_history: KRX trading days × full KOSPI/KOSDAQ universe → Supabase.
 * Reuses tradingDates + fetchMarketDay from functions/lib/krx_yoy.mjs.
 * Usage: node scripts/backfill_price_history.mjs [--days=2200] [--force] [--probe-only]
 * Default: ~9Y (2,200 sessions) so candle weekly 5Y has 260 display weeks +
 * 125w BBW/DISP norm + 50w MA50 (이격도) seed. Falls back to 5Y / 3Y when KRX
 * does not expose older windows.
 * --force with --days=N: re-upsert the newest N trading sessions (fills new columns).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tradingDates, fetchMarketDay, historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Weekly 5Y (260+125+50)w × ~5 ≈ 2,175 → round up for holidays/gaps. */
const HIST_TRADING_DAYS_8Y = 2200;
const HIST_TRADING_DAYS_5Y = 1250;
const HIST_TRADING_DAYS_3Y = 750;
const CANDIDATE_BUFFER = 1.12;
const PROBE_WINDOW = 8;
const ANCHOR_TICKER = '005930';
const KRX_DELAY_MS = 200;
const KRX_MAX_RETRIES = 2;
/** One KRX market day is currently ~2,700 rows; keep it to one REST upsert. */
const UPSERT_BATCH_SIZE = 3000;
const UPSERT_DELAY_MS = 0;
const UPSERT_MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function basDdToTradeDate(basDd) {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function rowsFromMarketDay(byCode, tradeDate) {
  const rows = [];
  for (const [ticker, row] of byCode) {
    const fields = historyFieldsFromKrxRow(row);
    if (!fields) continue;
    rows.push({
      ticker,
      trade_date: tradeDate,
      open: fields.open,
      high: fields.high,
      low: fields.low,
      close: fields.close,
      volume: fields.volume,
      mcap_won: fields.mcap_won,
      turnover_won: fields.turnover_won,
    });
  }
  return rows;
}

async function fetchMarketDayWithRetry(authKey, basDd) {
  let lastErr = null;
  for (let attempt = 0; attempt <= KRX_MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(KRX_DELAY_MS);
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (byCode && byCode.size > 0) return { ok: true, byCode };
      lastErr = new Error(`empty market day ${basDd}`);
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, error: lastErr };
}

async function upsertBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_price_history`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=ticker,trade_date',
    },
    body: JSON.stringify(rows),
  });

  if (res.ok) return { ok: true };

  const body = await res.text();
  if (attempt < UPSERT_MAX_RETRIES) {
    await sleep(KRX_DELAY_MS);
    return upsertBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body };
}

async function upsertDayRows(rows, supabaseUrl, serviceKey) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const result = await upsertBatch(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      return { ok: false, inserted, error: result.body };
    }
    inserted += batch.length;
    if (i + UPSERT_BATCH_SIZE < rows.length) await sleep(UPSERT_DELAY_MS);
  }
  return { ok: true, inserted };
}

async function fetchExistingAnchorDates(supabaseUrl, serviceKey) {
  const dates = [];
  const pageSize = 1000;
  for (let offset = 0; offset < HIST_TRADING_DAYS_5Y + 250; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?ticker=eq.${ANCHOR_TICKER}` +
      `&select=trade_date&order=trade_date.desc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(`existing_history_fetch_failed:${res.status}:${(await res.text()).slice(0, 160)}`);
    }
    const page = await res.json();
    for (const row of page) {
      if (row?.trade_date) dates.push(String(row.trade_date).slice(0, 10));
    }
    if (page.length < pageSize) break;
  }
  return dates;
}

async function probeHistoryDepth(authKey, targetDays) {
  const probeCandidates = tradingDates(Math.ceil(targetDays * 1.06) + PROBE_WINDOW);
  const start = Math.min(probeCandidates.length - PROBE_WINDOW, Math.ceil(targetDays * 1.04));
  const sample = probeCandidates.slice(Math.max(0, start), Math.max(0, start) + PROBE_WINDOW);
  for (const basDd of sample) {
    const fetched = await fetchMarketDayWithRetry(authKey, basDd);
    if (fetched.ok) {
      return { ok: true, basDd, rows: fetched.byCode.size, sample };
    }
  }
  return { ok: false, basDd: null, rows: 0, sample };
}

function historyTier(days) {
  if (days >= HIST_TRADING_DAYS_8Y) return '9Y';
  if (days >= HIST_TRADING_DAYS_5Y) return '5Y';
  if (days >= HIST_TRADING_DAYS_3Y) return '3Y';
  return '<3Y';
}

async function main() {
  const started = Date.now();
  const env = loadEnv();
  const authKey = env.KRX_AUTH_KEY || '';
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!authKey) {
    console.error('KRX_AUTH_KEY is required');
    process.exit(1);
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const explicitDays = daysArg ? Math.max(1, parseInt(daysArg.split('=')[1], 10) || 0) : 0;
  const probeOnly = process.argv.includes('--probe-only');
  const forceRecent = process.argv.includes('--force');
  let targetDays = explicitDays || HIST_TRADING_DAYS_8Y;

  if (!explicitDays) {
    console.log(`Probing KRX history for ~9Y (${HIST_TRADING_DAYS_8Y} sessions)...`);
    const probe8y = await probeHistoryDepth(authKey, HIST_TRADING_DAYS_8Y);
    if (probe8y.ok) {
      console.log(`  9Y probe OK: ${probe8y.basDd} (${probe8y.rows} rows)`);
    } else {
      console.warn(`  9Y probe unavailable: ${probe8y.sample.join(', ')}`);
      console.log(`Probing KRX history for ~5Y (${HIST_TRADING_DAYS_5Y} sessions)...`);
      const probe5y = await probeHistoryDepth(authKey, HIST_TRADING_DAYS_5Y);
      if (probe5y.ok) {
        targetDays = HIST_TRADING_DAYS_5Y;
        console.warn(`  Falling back to 5Y; probe OK: ${probe5y.basDd} (${probe5y.rows} rows)`);
      } else {
        console.warn(`  5Y probe unavailable: ${probe5y.sample.join(', ')}`);
        console.log(`Probing KRX history for ~3Y (${HIST_TRADING_DAYS_3Y} sessions)...`);
        const probe3y = await probeHistoryDepth(authKey, HIST_TRADING_DAYS_3Y);
        if (!probe3y.ok) {
          throw new Error(`KRX history unavailable at 9Y, 5Y, and 3Y probe windows`);
        }
        targetDays = HIST_TRADING_DAYS_3Y;
        console.warn(`  Falling back to 3Y; probe OK: ${probe3y.basDd} (${probe3y.rows} rows)`);
      }
    }
  }

  if (probeOnly) {
    console.log(`Probe result: target=${targetDays} sessions (${historyTier(targetDays)})`);
    return;
  }

  const existingDates = await fetchExistingAnchorDates(supabaseUrl, serviceKey);
  const acquired = new Set(existingDates);
  const candidateCount = Math.ceil(targetDays * CANDIDATE_BUFFER) + 30;
  const dates = tradingDates(candidateCount);

  // --force --days=N: refresh the newest N calendar candidates that KRX returns,
  // even when the anchor ticker already has those sessions (column backfill).
  const forceDates = forceRecent && explicitDays
    ? new Set(dates.slice(0, explicitDays).map(basDdToTradeDate))
    : null;

  console.log(
    `Backfill target=${targetDays} sessions (${historyTier(targetDays)}), ` +
      `existing ${ANCHOR_TICKER} sessions=${existingDates.length}, candidates=${dates.length}` +
      (forceDates ? `, force refresh newest ${forceDates.size}` : ''),
  );

  const failedDates = [];
  const emptyDates = [];
  let datesOk = 0;
  let totalRows = 0;

  for (let i = 0; i < dates.length; i++) {
    const basDd = dates[i];
    const tradeDate = basDdToTradeDate(basDd);
    const mustRefresh = forceDates && forceDates.has(tradeDate);
    if (acquired.has(tradeDate) && !mustRefresh) {
      if (acquired.size >= targetDays && !forceDates) break;
      if (forceDates && i >= explicitDays - 1 && datesOk >= forceDates.size) break;
      continue;
    }
    if (forceDates && !mustRefresh) {
      if (datesOk >= forceDates.size) break;
      continue;
    }

    if (i > 0) await sleep(KRX_DELAY_MS);

    const fetched = await fetchMarketDayWithRetry(authKey, basDd);
    if (!fetched.ok) {
      // Empty/holiday responses are expected; only hard-fail on upsert errors.
      emptyDates.push(basDd);
      if (emptyDates.length <= 5 || emptyDates.length % 25 === 0) {
        console.warn(`\n  KRX empty/skip ${basDd}: ${fetched.error?.message || fetched.error}`);
      }
      continue;
    }

    const rows = rowsFromMarketDay(fetched.byCode, tradeDate);
    if (!rows.length) {
      emptyDates.push(basDd);
      console.error(`\n  no rows for ${basDd}`);
      continue;
    }

    const upserted = await upsertDayRows(rows, supabaseUrl, serviceKey);
    if (!upserted.ok) {
      failedDates.push(basDd);
      console.error(`\n  Supabase upsert failed ${basDd}: ${(upserted.error || '').slice(0, 200)}`);
      continue;
    }

    datesOk += 1;
    totalRows += upserted.inserted;
    acquired.add(tradeDate);
    process.stdout.write(
      `\r  acquired ${acquired.size}/${targetDays} · candidate ${i + 1}/${dates.length} ` +
        `${tradeDate} — ${upserted.inserted} rows (upsert total ${totalRows})` +
        (mustRefresh ? ' [force]' : ''),
    );
    if (forceDates) {
      if (datesOk >= forceDates.size) break;
      continue;
    }
    if (acquired.size >= targetDays) break;
  }

  process.stdout.write('\n');
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log('\n=== backfill_price_history summary ===');
  console.log(`dates scheduled:   ${dates.length}`);
  console.log(`dates processed:   ${datesOk}`);
  console.log(`dates empty/skip:  ${emptyDates.length}`);
  console.log(`dates failed:      ${failedDates.length}`);
  console.log(`total rows upsert: ${totalRows}`);
  console.log(`actual sessions:   ${acquired.size} (${historyTier(acquired.size)})`);
  const sortedAcquired = [...acquired].sort();
  console.log(`history span:      ${sortedAcquired[0] || '—'} → ${sortedAcquired.at(-1) || '—'}`);
  console.log(`elapsed:           ${elapsedSec}s`);

  if (emptyDates.length) {
    console.log(
      `empty/skip sample: ${emptyDates.slice(0, 12).join(', ')}` +
        (emptyDates.length > 12 ? ` … +${emptyDates.length - 12}` : ''),
    );
  }
  if (failedDates.length) {
    console.log(`failed dates: ${failedDates.join(', ')}`);
    process.exit(1);
  }
  if (acquired.size < Math.min(targetDays, HIST_TRADING_DAYS_3Y)) {
    console.error(`Backfill did not reach the 3Y floor (${HIST_TRADING_DAYS_3Y} sessions)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
