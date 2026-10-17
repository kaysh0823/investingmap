/**
 * Sync per-ticker credit loan balance (KIS FHPST04760000) → Supabase stock_credit_balance.
 * credit_ratio (신용잔고율) = loan amount / same-day mcap_won from stock_price_history.
 *
 * Usage:
 *   npm run sync:credit-balance                       # latest 30 sessions, full universe
 *   npm run sync:credit-balance -- --pages=18         # backfill ~2Y (18 × 30 sessions)
 *   npm run sync:credit-balance -- --tickers=005930,247540 --dry-run
 *   --resume  skip tickers that already have a row at or before the backfill horizon
 *
 * KIS publishes balances on the settlement date (T+2), so the newest row lags
 * the latest price bar by two sessions.
 */
import { loadEnv, sleep } from './lib/foreign_ratio_supabase.mjs';
import {
  attachCreditRatio,
  fetchKisCreditHistory,
  issueKisToken,
} from '../functions/lib/kis_credit_balance.mjs';

const UPSERT_BATCH = 1000;
/** KIS real-account limit is 20 req/s; stay under it across workers. */
const MIN_REQUEST_GAP_MS = 70;
const DEFAULT_CONCURRENCY = 6;

function parseArgs(argv) {
  const out = { pages: 1, tickers: null, dryRun: false, resume: false, concurrency: DEFAULT_CONCURRENCY };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--resume') out.resume = true;
    else if (a.startsWith('--pages=')) out.pages = Math.max(1, parseInt(a.slice(8), 10) || 1);
    else if (a.startsWith('--concurrency=')) out.concurrency = Math.max(1, parseInt(a.slice(14), 10) || 1);
    else if (a.startsWith('--tickers=')) {
      out.tickers = a.slice(10).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    }
  }
  return out;
}

function headers(serviceKey, extra = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

async function restGet(supabaseUrl, serviceKey, q) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers: headers(serviceKey) });
  if (!res.ok) throw new Error(`GET ${q.slice(0, 80)} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/** Tickers present on the latest stock_price_history session. */
async function fetchUniverse(supabaseUrl, serviceKey) {
  const latest = await restGet(
    supabaseUrl,
    serviceKey,
    'stock_price_history?ticker=eq.005930&select=trade_date&order=trade_date.desc&limit=1',
  );
  const day = latest[0]?.trade_date;
  if (!day) throw new Error('no latest trade_date in stock_price_history');
  const tickers = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await restGet(
      supabaseUrl,
      serviceKey,
      `stock_price_history?trade_date=eq.${day}&select=ticker&order=ticker.asc&limit=1000&offset=${offset}`,
    );
    for (const r of page) tickers.push(String(r.ticker));
    if (page.length < 1000) break;
  }
  return { day, tickers };
}

async function fetchMcapByDate(supabaseUrl, serviceKey, ticker, fromDate) {
  const out = new Map();
  for (let offset = 0; ; offset += 1000) {
    const page = await restGet(
      supabaseUrl,
      serviceKey,
      `stock_price_history?ticker=eq.${encodeURIComponent(ticker)}&trade_date=gte.${fromDate}`
        + `&select=trade_date,mcap_won&order=trade_date.asc&limit=1000&offset=${offset}`,
    );
    for (const r of page) {
      const m = Number(r.mcap_won);
      if (Number.isFinite(m) && m > 0) out.set(String(r.trade_date).slice(0, 10), m);
    }
    if (page.length < 1000) break;
  }
  return out;
}

/** Tickers whose oldest stored row is already within ~1 page of the horizon. */
async function fetchDoneTickers(supabaseUrl, serviceKey, horizonDate) {
  const done = new Set();
  for (let offset = 0; ; offset += 1000) {
    const page = await restGet(
      supabaseUrl,
      serviceKey,
      `stock_credit_balance?trade_date=lte.${horizonDate}&select=ticker&limit=1000&offset=${offset}`,
    );
    for (const r of page) done.add(String(r.ticker));
    if (page.length < 1000) break;
  }
  return done;
}

async function upsertRows(rows, supabaseUrl, serviceKey) {
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    let ok = false;
    let body = '';
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const res = await fetch(`${supabaseUrl}/rest/v1/stock_credit_balance`, {
        method: 'POST',
        headers: headers(serviceKey, {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates, on_conflict=trade_date,ticker',
        }),
        body: JSON.stringify(batch),
      });
      ok = res.ok;
      if (!ok) {
        body = await res.text();
        await sleep(800);
      }
    }
    if (ok) upserted += batch.length;
    else {
      failed += batch.length;
      console.error(`  credit upsert failed: ${body.slice(0, 200)}`);
    }
  }
  return { upserted, failed };
}

function kstYmd(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
}

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  if (!env.KIS_APP_KEY || !env.KIS_APP_SECRET) throw new Error('KIS_APP_KEY and KIS_APP_SECRET are required');

  let tickers = args.tickers;
  if (!tickers) tickers = (await fetchUniverse(supabaseUrl, serviceKey)).tickers;

  // Settlement-date cursor: a few days ahead of today still returns the newest rows.
  const fromStlm = kstYmd(new Date(Date.now() + 3 * 86400e3));
  const horizon = new Date(Date.now() - Math.ceil(args.pages * 30 * 1.45) * 86400e3)
    .toISOString().slice(0, 10);
  // mcap lookup starts a little before the oldest session we can receive.
  const mcapFrom = new Date(Date.now() - Math.ceil(args.pages * 30 * 1.6 + 10) * 86400e3)
    .toISOString().slice(0, 10);

  if (args.resume && !args.dryRun) {
    const done = await fetchDoneTickers(supabaseUrl, serviceKey, horizon);
    const before = tickers.length;
    tickers = tickers.filter((t) => !done.has(t));
    console.log(`--resume: skip ${before - tickers.length} tickers already backfilled to ${horizon}`);
  }

  console.log(
    `Sync credit balance → Supabase: ${tickers.length} tickers × ${args.pages} page(s)`
      + `${args.dryRun ? ' (dry-run)' : ''}`,
  );
  const token = await issueKisToken(env);

  let lastStart = 0;
  const throttle = async () => {
    const wait = lastStart + MIN_REQUEST_GAP_MS - Date.now();
    lastStart = Math.max(Date.now(), lastStart + MIN_REQUEST_GAP_MS);
    if (wait > 0) await sleep(wait);
  };

  let pending = [];
  let upserted = 0;
  let failedRows = 0;
  let failedTickers = 0;
  let emptyTickers = 0;
  let done = 0;
  let next = 0;
  const flush = async (force = false) => {
    if (!pending.length || (!force && pending.length < UPSERT_BATCH)) return;
    const rows = pending;
    pending = [];
    if (args.dryRun) return;
    const r = await upsertRows(rows, supabaseUrl, serviceKey);
    upserted += r.upserted;
    failedRows += r.failed;
  };

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= tickers.length) return;
      const ticker = tickers[i];
      try {
        const records = await fetchKisCreditHistory(env, token, ticker, fromStlm, args.pages, {
          beforeRequest: throttle,
        });
        const byDate = new Map(records.map((r) => [r.trade_date, r]));
        const recs = [...byDate.values()];
        if (!recs.length) emptyTickers++;
        else {
          const mcap = await fetchMcapByDate(supabaseUrl, serviceKey, ticker, mcapFrom);
          attachCreditRatio(recs, mcap);
          pending.push(...recs);
          if (args.dryRun && (args.tickers || done < 2)) {
            const latest = recs.reduce((a, b) => (a.trade_date > b.trade_date ? a : b));
            console.log(
              `  ${ticker}: ${recs.length} rows ${recs.reduce((m, r) => (r.trade_date < m ? r.trade_date : m), latest.trade_date)}`
                + `..${latest.trade_date} latest credit_ratio=${latest.credit_ratio} loan_rate=${latest.loan_rate}`,
            );
          }
        }
      } catch (err) {
        failedTickers++;
        console.warn(`  ${ticker}: ${err.message || err}`);
      }
      done++;
      if (done % 200 === 0) {
        console.log(`  … ${done}/${tickers.length} tickers (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      }
      await flush();
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  await flush(true);

  console.log('\n=== sync_credit_balance summary ===');
  console.log(`tickers:        ${tickers.length} (empty ${emptyTickers}, failed ${failedTickers})`);
  console.log(`upserted rows:  ${args.dryRun ? '(dry-run)' : upserted}`);
  console.log(`failed rows:    ${failedRows}`);
  console.log(`elapsed:        ${((Date.now() - started) / 1000).toFixed(1)}s`);
  // A handful of KIS misses (ETNs, fresh listings) is normal; fail on systemic errors.
  if (failedRows || failedTickers > Math.max(20, tickers.length * 0.05)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
