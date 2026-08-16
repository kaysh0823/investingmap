/**
 * Sync hub-listed tickers: Naver quotes + KRX returns/RS → Supabase stock_quotes_latest,
 * then past-mcap-weighted sector returns → sector_returns.
 * Reuses functions/lib collectors; safe to run locally or in GitHub Actions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchNaverQuote, resolveNaverSession } from '../functions/lib/naver_sise_quotes.mjs';
import { buildKrxRsSnapshot, getAuthKey } from '../functions/lib/krx_rs.mjs';
import { isKrxClockRegularSession, kstWeekday, kstYmd, kstYmdDash } from '../functions/lib/krx_session.mjs';
import {
  tradingDates,
  pastDatesFromAnchor,
  fetchMarketDay,
  historyFieldsFromKrxRow,
} from '../functions/lib/krx_yoy.mjs';
import {
  SECTOR_ORDER,
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';
import {
  buildSectorMcapDailyRows,
  upsertSectorMcapDaily,
} from './lib/sector_mcap_daily.mjs';
import { computeMomentumBounds } from './lib/momentum_bounds.mjs';
import { buildHubRankDailyRows } from '../functions/lib/hub_rank_daily.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAVER_CONCURRENCY = 4;
const NAVER_DELAY_MS = 80;
const UPSERT_BATCH_SIZE = 40;
const HISTORY_UPSERT_BATCH = 500;
const SUPABASE_MAX_RETRIES = 1;
const PAST_DATE_FALLBACK_WINDOW = 12;
/** Minimum paired share of members-with-now-mcap before falling back to inverse. */
const HISTORY_COVERAGE_MIN = 0.5;

/**
 * Sector horizon columns ↔ KRX return lookback days (same as krx_rs RETURN_PERIODS)
 * and inverse-method fallback source fields on quote rows.
 */
const SECTOR_HORIZONS = [
  { out: 'ret_1d_pct', days: 1, fallbackSrc: 'chg_1d_pct' },
  { out: 'ret_20d_pct', days: 20, fallbackSrc: 'ret_20d_pct' },
  { out: 'ret_50d_pct', days: 50, fallbackSrc: 'ret_50d_pct' },
  { out: 'ret_120d_pct', days: 120, fallbackSrc: 'ret_120d_pct' },
  { out: 'ret_200d_pct', days: 200, fallbackSrc: 'ret_200d_pct' },
];

/** @deprecated kept for inverse fallback alias */
const SECTOR_RET_FIELDS = SECTOR_HORIZONS.map((h) => ({ out: h.out, src: h.fallbackSrc }));

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

function loadHubTickers(hubIndex) {
  const seen = new Set();
  const codes = [];
  for (const c of listHubCompanies(hubIndex)) {
    const code = normalizeTicker(c.ticker);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes.sort();
}

async function fetchNaverQuotes(codes) {
  const quotes = {};
  const failed = [];
  let ok = 0;

  for (let i = 0; i < codes.length; i += NAVER_CONCURRENCY) {
    const batch = codes.slice(i, i + NAVER_CONCURRENCY);
    const rows = await Promise.all(
      batch.map(async (code) => {
        try {
          const q = await fetchNaverQuote(code);
          return { code, q, err: null };
        } catch (e1) {
          try {
            await sleep(NAVER_DELAY_MS);
            const q = await fetchNaverQuote(code);
            return { code, q, err: null };
          } catch (e2) {
            return { code, q: null, err: e2 };
          }
        }
      }),
    );

    for (const row of rows) {
      if (row.q) {
        quotes[row.code] = row.q;
        ok += 1;
      } else {
        failed.push(row.code);
      }
    }

    const done = Math.min(i + NAVER_CONCURRENCY, codes.length);
    process.stdout.write(`\r  Naver ${done}/${codes.length} (ok ${ok})`);
    if (i + NAVER_CONCURRENCY < codes.length) await sleep(NAVER_DELAY_MS);
  }

  process.stdout.write('\n');
  return { quotes, ok, failed };
}

async function loadKrxQuotes(authKey) {
  if (!authKey) {
    console.warn('KRX_AUTH_KEY missing — skipping KRX returns/RS');
    return { quotes: {}, ok: 0 };
  }
  console.log('Building KRX returns/RS snapshot…');
  const snapshot = await buildKrxRsSnapshot(authKey);
  if (!snapshot || !snapshot.quotes) {
    throw new Error('KRX RS snapshot build failed');
  }
  console.log(`  KRX universe ${snapshot.quotesOk}/${snapshot.universe} tickers`);
  return { quotes: snapshot.quotes, ok: snapshot.quotesOk || 0 };
}

function toSupabaseRow(ticker, naver, krx, asOf, regularSession, _marketClosed) {
  // last is always Naver (live or last session). Pair prev_close from the same
  // quote when possible so chg_1d_pct cannot drift to a different source/day.
  const last = naver?.last != null && Number.isFinite(naver.last) ? naver.last : null;

  let prevClose = null;
  if (naver?.prevClose != null && Number.isFinite(naver.prevClose) && naver.prevClose > 0) {
    prevClose = naver.prevClose;
  } else if (krx?.refClose != null && Number.isFinite(krx.refClose) && krx.refClose > 0) {
    // Only when Naver prev is missing — still derive chg from this same pair.
    prevClose = krx.refClose;
  }

  // Always recompute from the persisted last/prev_close pair. Do not mix
  // KRX close-to-close chg1dPct with Naver last/prevClose (that caused 1-session lag).
  let chg1d = null;
  if (last != null && prevClose != null && prevClose > 0) {
    chg1d = Math.round(((last / prevClose) - 1) * 10000) / 100;
  }

  return {
    ticker,
    last,
    prev_close: prevClose,
    high_52w: naver?.high52w ?? null,
    low_52w: naver?.low52w ?? null,
    mcap_won: naver?.mcapWon ?? null,
    turnover_won: naver?.turnoverWon ?? null,
    per: naver?.per ?? null,
    pbr: naver?.pbr ?? null,
    chg_1d_pct: chg1d,
    ret_5d_pct: krx?.ret5dPct ?? null,
    ret_20d_pct: krx?.ret20dPct ?? null,
    ret_50d_pct: krx?.ret50dPct ?? null,
    ret_120d_pct: krx?.ret120dPct ?? null,
    ret_200d_pct: krx?.ret200dPct ?? null,
    rs: krx?.rs ?? null,
    as_of: asOf,
    regular_session: regularSession,
  };
}

async function upsertBatch(table, rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (res.ok) return { ok: true, status: res.status };

  const body = await res.text();
  if (attempt < SUPABASE_MAX_RETRIES) {
    await sleep(1000);
    return upsertBatch(table, rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, status: res.status, body };
}

async function upsertToSupabase(rows, supabaseUrl, serviceKey) {
  const upserted = [];
  const failed = [];

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const result = await upsertBatch('stock_quotes_latest', batch, supabaseUrl, serviceKey);
    if (result.ok) {
      upserted.push(...batch.map((r) => r.ticker));
    } else {
      failed.push(...batch.map((r) => r.ticker));
      console.error(
        `\n  Supabase batch failed (${result.status}): tickers ${batch.map((r) => r.ticker).join(', ')}`,
      );
      if (result.body) console.error(`  ${result.body.slice(0, 300)}`);
    }
    const done = Math.min(i + UPSERT_BATCH_SIZE, rows.length);
    process.stdout.write(`\r  Supabase upsert ${done}/${rows.length}`);
  }

  process.stdout.write('\n');
  return { upserted, failed };
}

async function verifyMomentumSchema(supabaseUrl, serviceKey) {
  const columns = 'high_120d,low_120d,high_50d,low_50d,bb_upper,bb_lower';
  const url =
    `${supabaseUrl}/rest/v1/stock_quotes_latest?select=${columns}&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new Error(
    `Supabase momentum schema unavailable (${res.status}). ` +
      `Apply supabase/migrations/0012_stock_quotes_momentum_bounds.sql first. ` +
      body.slice(0, 180),
  );
}

/**
 * Inverse past-mcap estimate (legacy). Used only when history coverage is too thin.
 * mcapPast ≈ mcap_won / (1 + ret/100); return = (Σ mcap_now / Σ mcapPast − 1) × 100.
 */
function mcapWeightedReturnInverse(members, retKey) {
  let sumNow = 0;
  let sumPast = 0;
  for (const m of members) {
    const ret = m[retKey];
    const mcap = m.mcap_won;
    if (ret == null || !Number.isFinite(ret)) continue;
    if (mcap == null || !Number.isFinite(mcap) || mcap <= 0) continue;
    const growth = 1 + ret / 100;
    if (!(growth > 0)) continue;
    sumNow += mcap;
    sumPast += mcap / growth;
  }
  if (sumPast <= 0) return null;
  return Math.round((sumNow / sumPast - 1) * 100 * 100) / 100;
}

/**
 * Actual past-mcap weighted return: sumNow / sumPast − 1.
 * Pair-exclude: ticker needs both current and past mcap or it drops from both sides.
 */
function mcapWeightedReturnFromHistory(members, pastMcapByTicker) {
  let sumNow = 0;
  let sumPast = 0;
  let paired = 0;
  let withNow = 0;
  for (const m of members) {
    const now = m.mcap_won;
    if (now == null || !Number.isFinite(now) || now <= 0) continue;
    withNow += 1;
    const past = pastMcapByTicker.get(m.ticker);
    if (past == null || !Number.isFinite(past) || past <= 0) continue;
    sumNow += now;
    sumPast += past;
    paired += 1;
  }
  if (sumPast <= 0 || paired === 0) {
    return { ret: null, paired, withNow, sumNow: 0, sumPast: 0 };
  }
  return {
    ret: Math.round((sumNow / sumPast - 1) * 10000) / 100,
    paired,
    withNow,
    sumNow,
    sumPast,
  };
}

function basDdToDash(basDd) {
  if (!basDd || basDd.length !== 8) return basDd || '';
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function dashToBasDd(dash) {
  return String(dash || '').replace(/-/g, '');
}

/**
 * Anchor for sector past dates: include today when it is a weekday so 1d past
 * is the previous session even before today's KRX close is published.
 */
function sectorReturnAnchorDd(now = new Date()) {
  const dates = tradingDates(10, now);
  const today = kstYmd(now);
  if (dates[0] === today) return today;
  return dates[0] || today;
}

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function mcapFromKrxRow(row) {
  const cl = parseNum(row && row.TDD_CLSPRC);
  const shrs = parseNum(row && row.LIST_SHRS);
  if (cl != null && shrs != null && cl > 0 && shrs > 0) return cl * shrs;
  const direct = parseNum(row && row.MKTCAP);
  if (direct != null && direct > 0) return direct;
  return null;
}

async function upsertHistoryBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
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
  if (attempt < SUPABASE_MAX_RETRIES) {
    await sleep(800);
    return upsertHistoryBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body };
}

async function upsertHistoryRows(rows, supabaseUrl, serviceKey) {
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += HISTORY_UPSERT_BATCH) {
    const batch = rows.slice(i, i + HISTORY_UPSERT_BATCH);
    const result = await upsertHistoryBatch(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      console.error(`  history upsert failed: ${(result.body || '').slice(0, 200)}`);
      failed += batch.length;
      continue;
    }
    upserted += batch.length;
  }
  return { upserted, failed };
}

function historyRowFromKrx(ticker, tradeDate, krxRow) {
  const fields = historyFieldsFromKrxRow(krxRow);
  if (!fields) return null;
  return {
    ticker,
    trade_date: tradeDate,
    open: fields.open,
    high: fields.high,
    low: fields.low,
    close: fields.close,
    volume: fields.volume,
    mcap_won: fields.mcap_won,
  };
}

async function fetchHistoryTickerSetForDate(supabaseUrl, serviceKey, tradeDate) {
  const found = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?trade_date=eq.${tradeDate}` +
      `&select=ticker&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      throw new Error(`history coverage fetch ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    const page = await res.json();
    for (const row of page) {
      const ticker = normalizeTicker(row?.ticker);
      if (ticker) found.add(ticker);
    }
    if (page.length < pageSize) break;
  }
  return found;
}

/**
 * Verify every hub ticker that has a KRX row exists for the session. A suspended
 * or not-yet-listed security has no KRX row and must not receive a synthetic bar.
 */
async function repairHistoryCoverageForDate(
  expectedTickers,
  tradeDate,
  byCode,
  supabaseUrl,
  serviceKey,
) {
  if (!byCode || !byCode.size) return { expected: 0, repaired: 0, missing: [] };
  const expectedRows = new Map();
  for (const ticker of expectedTickers) {
    const row = historyRowFromKrx(ticker, tradeDate, byCode.get(ticker));
    if (row) expectedRows.set(ticker, row);
  }
  const existing = await fetchHistoryTickerSetForDate(supabaseUrl, serviceKey, tradeDate);
  let missing = [...expectedRows.keys()].filter((ticker) => !existing.has(ticker));
  let repaired = 0;
  if (missing.length) {
    console.warn(`  history coverage ${tradeDate}: repairing ${missing.length} hub ticker(s)`);
    const result = await upsertHistoryRows(
      missing.map((ticker) => expectedRows.get(ticker)),
      supabaseUrl,
      serviceKey,
    );
    repaired = result.upserted;
    const after = await fetchHistoryTickerSetForDate(supabaseUrl, serviceKey, tradeDate);
    missing = [...expectedRows.keys()].filter((ticker) => !after.has(ticker));
  }
  console.log(
    `  history coverage ${tradeDate}: ${expectedRows.size - missing.length}/${expectedRows.size}` +
      (repaired ? ` (repaired ${repaired})` : ''),
  );
  if (missing.length) {
    throw new Error(`history coverage incomplete ${tradeDate}: ${missing.join(',')}`);
  }
  return { expected: expectedRows.size, repaired, missing };
}

/** Persist session close OHLC into history when the market is closed (prefer KRX day). */
async function upsertSessionCloseHistory(quoteRows, tradeDateDash, marketClosed, supabaseUrl, serviceKey, authKey) {
  if (!marketClosed || !tradeDateDash) return { upserted: 0, skipped: true };

  let byCode = null;
  if (authKey) {
    try {
      byCode = await fetchMarketDay(authKey, dashToBasDd(tradeDateDash));
      if (!byCode || byCode.size === 0) {
        console.log(`  history session close skip ${tradeDateDash}: empty KRX day`);
        return { upserted: 0, skipped: true };
      }
    } catch (e) {
      console.warn(`  history session close KRX check failed: ${e.message || e}`);
    }
  }

  const rows = [];
  for (const q of quoteRows) {
    if (!q || !q.ticker) continue;
    const krx = byCode ? byCode.get(q.ticker) : null;
    const fields = krx ? historyFieldsFromKrxRow(krx) : null;
    if (fields) {
      rows.push({
        ticker: q.ticker,
        trade_date: tradeDateDash,
        open: fields.open,
        high: fields.high,
        low: fields.low,
        close: fields.close,
        volume: fields.volume,
        mcap_won: fields.mcap_won ?? q.mcap_won ?? null,
      });
      continue;
    }
    // A successful KRX day intentionally omits suspended/not-yet-listed names.
    // Do not invent a candle for the consensus date from a stale Naver quote.
    if (byCode) continue;
    // Fallback: Naver last + mcap only (OHLC null until next KRX catch-up).
    if (q.last == null || !Number.isFinite(q.last) || q.last <= 0) continue;
    if (q.mcap_won == null || !Number.isFinite(q.mcap_won) || q.mcap_won <= 0) continue;
    rows.push({
      ticker: q.ticker,
      trade_date: tradeDateDash,
      open: null,
      high: null,
      low: null,
      close: q.last,
      volume: null,
      mcap_won: q.mcap_won,
    });
  }
  if (!rows.length) return { upserted: 0, skipped: false };
  const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey);
  console.log(`  history session close ${tradeDateDash}: upserted ${result.upserted}`);
  const coverage = await repairHistoryCoverageForDate(
    quoteRows.map((row) => row.ticker),
    tradeDateDash,
    byCode,
    supabaseUrl,
    serviceKey,
  );
  return { ...result, coverage };
}

async function fetchHistoryMaxTradeDate(supabaseUrl, serviceKey, sampleTicker = '005930') {
  const url =
    `${supabaseUrl}/rest/v1/stock_price_history?ticker=eq.${sampleTicker}` +
    `&select=trade_date&order=trade_date.desc&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0].trade_date : null;
}

/**
 * Fill KRX calendar gaps between last history date and the session trade date
 * so sector past-mcaps stay current without a full backfill.
 */
async function fillMissingHistoryDays(
  authKey,
  supabaseUrl,
  serviceKey,
  throughTradeDateDash,
  expectedTickers,
) {
  if (!authKey || !throughTradeDateDash) return { filled: 0 };
  const maxDash = await fetchHistoryMaxTradeDate(supabaseUrl, serviceKey);
  const throughBas = dashToBasDd(throughTradeDateDash);
  const dates = tradingDates(40).filter((d) => d <= throughBas);
  const missing = maxDash
    ? dates.filter((d) => d > dashToBasDd(maxDash))
    : dates.slice(0, 15);
  // Oldest first for nicer logs
  missing.reverse();
  if (!missing.length) {
    console.log(`  history catch-up: already current through ${maxDash || 'n/a'}`);
    return { filled: 0 };
  }
  console.log(`  history catch-up: ${missing.length} day(s) ${basDdToDash(missing[0])}…${basDdToDash(missing[missing.length - 1])}`);
  let filled = 0;
  for (const basDd of missing) {
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      const tradeDate = basDdToDash(basDd);
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
        });
      }
      if (!rows.length) continue;
      const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey);
      if (result.failed) continue;
      await repairHistoryCoverageForDate(
        expectedTickers,
        tradeDate,
        byCode,
        supabaseUrl,
        serviceKey,
      );
      filled += 1;
      process.stdout.write(`\r  history catch-up ${filled}/${missing.length} ${tradeDate}`);
      await sleep(150);
    } catch (e) {
      console.error(`\n  history catch-up failed ${basDd}: ${e.message || e}`);
    }
  }
  if (filled) process.stdout.write('\n');
  return { filled };
}

/**
 * Load recent OHLC history per ticker (oldest→newest).
 * One paginated pass feeds both spark20 and momentum boundaries.
 */
async function loadRecentHistoryBarsByTicker(tickers, supabaseUrl, serviceKey, n = 120) {
  const out = new Map();
  if (!tickers.length) return out;

  // Newest-first calendar trading days; need ≥n sessions after weekends/holidays.
  const lookback = Math.max(n + 30, 150);
  const dates = tradingDates(lookback);
  const oldestBas = dates[dates.length - 1];
  const sinceDash = basDdToDash(oldestBas);

  const byTicker = new Map();
  const chunk = 80;
  for (let i = 0; i < tickers.length; i += chunk) {
    const part = tickers.slice(i, i + chunk);
    let offset = 0;
    const pageSize = 1000;
    for (;;) {
      const url =
        `${supabaseUrl}/rest/v1/stock_price_history` +
        `?ticker=in.(${part.join(',')})` +
        `&trade_date=gte.${sinceDash}` +
        `&select=ticker,trade_date,high,low,close&order=ticker.asc,trade_date.asc` +
        `&limit=${pageSize}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`  momentum history fetch failed: ${res.status} ${body.slice(0, 160)}`);
        break;
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) break;
      for (const row of rows) {
        const t = normalizeTicker(row.ticker);
        const c = Number(row.close);
        if (!t || !Number.isFinite(c) || c <= 0) continue;
        if (!byTicker.has(t)) byTicker.set(t, []);
        const high = Number(row.high);
        const low = Number(row.low);
        byTicker.get(t).push({
          d: String(row.trade_date).slice(0, 10),
          close: c,
          high: Number.isFinite(high) && high > 0 ? high : null,
          low: Number.isFinite(low) && low > 0 ? low : null,
        });
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }

  for (const [t, pts] of byTicker) {
    // Dedup by date ascending (keep the final row if duplicates).
    pts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const dedup = [];
    for (const p of pts) {
      if (dedup.length && dedup[dedup.length - 1].d === p.d) {
        dedup[dedup.length - 1] = p;
      } else {
        dedup.push(p);
      }
    }
    if (dedup.length >= 2) out.set(t, dedup.slice(-n));
  }
  return out;
}

/** Attach spark20 plus rolling range/Bollinger boundaries, then upsert once. */
async function upsertHistoryIndicatorsForTickers(tickers, rows, supabaseUrl, serviceKey) {
  const historyMap = await loadRecentHistoryBarsByTicker(
    tickers,
    supabaseUrl,
    serviceKey,
    120,
  );
  let sparkAttached = 0;
  let range120Attached = 0;
  let range50Attached = 0;
  let bbAttached = 0;
  for (const row of rows) {
    const bars = historyMap.get(row.ticker) || [];
    const completeBars = bars.filter(
      (bar) =>
        Number.isFinite(bar.high) &&
        bar.high > 0 &&
        Number.isFinite(bar.low) &&
        bar.low > 0 &&
        Number.isFinite(bar.close) &&
        bar.close > 0 &&
        bar.high >= bar.low,
    );
    const closes = completeBars.map((bar) => bar.close);
    row.spark20 = closes.length >= 2 ? closes.slice(-20) : null;
    const bounds = computeMomentumBounds(completeBars);
    row.high_120d = bounds.high_120d;
    row.low_120d = bounds.low_120d;
    row.high_50d = bounds.high_50d;
    row.low_50d = bounds.low_50d;
    row.bb_upper = bounds.bb_upper;
    row.bb_lower = bounds.bb_lower;
    if (row.spark20) sparkAttached += 1;
    if (bounds.high_120d != null) range120Attached += 1;
    if (bounds.high_50d != null) range50Attached += 1;
    if (bounds.bb_upper != null) bbAttached += 1;
  }
  if (!historyMap.size) {
    console.log('  history indicators: no series to upsert');
    return { upserted: 0, sparkAttached, range120Attached, range50Attached, bbAttached };
  }
  const result = await upsertToSupabase(rows, supabaseUrl, serviceKey);
  console.log(
    `  history indicators: spark20=${sparkAttached} range120=${range120Attached} ` +
      `range50=${range50Attached} bb20=${bbAttached}, upserted=${result.upserted.length}`,
  );
  return {
    upserted: result.upserted.length,
    sparkAttached,
    range120Attached,
    range50Attached,
    bbAttached,
  };
}

/**
 * Load mcap_won maps for the given trade dates (YYYY-MM-DD) from stock_price_history.
 * @returns {Map<string, Map<string, number>>} tradeDate → ticker → mcap
 */
async function loadHistoryMcapByDates(supabaseUrl, serviceKey, tradeDatesDash) {
  const out = new Map();
  for (const d of tradeDatesDash) out.set(d, new Map());
  if (!tradeDatesDash.length) return out;

  for (const d of tradeDatesDash) {
    let offset = 0;
    const pageSize = 1000;
    for (;;) {
      const url =
        `${supabaseUrl}/rest/v1/stock_price_history?trade_date=eq.${d}` +
        `&select=ticker,mcap_won&mcap_won=gt.0&limit=${pageSize}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!res.ok) {
        const body = await res.text();
        console.warn(`  history fetch ${d} failed: ${res.status} ${body.slice(0, 120)}`);
        break;
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) break;
      const map = out.get(d);
      for (const row of rows) {
        const t = normalizeTicker(row.ticker);
        const m = Number(row.mcap_won);
        if (t && Number.isFinite(m) && m > 0) map.set(t, m);
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }
  return out;
}

function pickPastMcap(ticker, candidateDatesDash, historyByDate) {
  for (const d of candidateDatesDash) {
    const map = historyByDate.get(d);
    if (!map) continue;
    const m = map.get(ticker);
    if (m != null && m > 0) return m;
  }
  return null;
}

/**
 * Build sector_returns using actual past mcaps from stock_price_history.
 * Falls back to inverse method per-horizon when history coverage is thin.
 */
async function buildSectorReturnRows(hubIndex, quoteRowsByTicker, updatedAt, historyCtx) {
  const {
    historyByDate,
    horizonCandidates,
    supabaseUrl,
    serviceKey,
  } = historyCtx;

  const rows = [];
  const stats = [];

  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const members = [];
    for (const c of block.companies || []) {
      const key = normalizeTicker(c.ticker);
      if (!key) continue;
      const q = quoteRowsByTicker.get(key);
      if (!q) continue;
      members.push(q);
    }
    const row = { sector_id: sid, updated_at: updatedAt };
    for (const h of SECTOR_HORIZONS) {
      const candidates = horizonCandidates[h.out] || [];
      const pastByTicker = new Map();
      for (const m of members) {
        const past = pickPastMcap(m.ticker, candidates, historyByDate);
        if (past != null) pastByTicker.set(m.ticker, past);
      }
      const hist = mcapWeightedReturnFromHistory(members, pastByTicker);
      const coverage = hist.withNow > 0 ? hist.paired / hist.withNow : 0;
      if (hist.ret != null && coverage >= HISTORY_COVERAGE_MIN) {
        row[h.out] = hist.ret;
        stats.push({ sid, horizon: h.out, method: 'history', paired: hist.paired, coverage });
      } else {
        const fb = mcapWeightedReturnInverse(members, h.fallbackSrc);
        row[h.out] = fb;
        stats.push({
          sid,
          horizon: h.out,
          method: 'inverse-fallback',
          paired: hist.paired,
          coverage,
          reason: hist.ret == null ? 'empty-past' : 'low-coverage',
        });
      }
    }
    rows.push(row);
  }

  const fallbacks = stats.filter((s) => s.method === 'inverse-fallback');
  if (fallbacks.length) {
    console.warn(
      `  sector history fallback on ${fallbacks.length} cell(s), e.g. ` +
      fallbacks.slice(0, 5).map((s) => `${s.sid}/${s.horizon}(${s.reason},cov=${(s.coverage * 100).toFixed(0)}%)`).join(', '),
    );
  } else {
    console.log(`  sector returns: history mcap for all ${SECTOR_ORDER.length}×${SECTOR_HORIZONS.length} cells`);
  }

  // unused but keep signature flexible for tests
  void supabaseUrl;
  void serviceKey;

  return { rows, stats };
}

async function prepareSectorHistoryContext(supabaseUrl, serviceKey, now = new Date()) {
  const dates = tradingDates(260, now);
  const anchorDd = sectorReturnAnchorDd(now);
  const horizonCandidates = {};
  const allDash = new Set();
  for (const h of SECTOR_HORIZONS) {
    const basList = pastDatesFromAnchor(anchorDd, dates, h.days, PAST_DATE_FALLBACK_WINDOW);
    const dashList = basList.map(basDdToDash);
    horizonCandidates[h.out] = dashList;
    for (const d of dashList) allDash.add(d);
  }
  console.log(
    `  sector past anchors: anchor=${anchorDd} dates=${[...allDash].sort().join(',')}`,
  );
  const historyByDate = await loadHistoryMcapByDates(supabaseUrl, serviceKey, [...allDash]);
  for (const d of allDash) {
    const n = historyByDate.get(d)?.size || 0;
    if (n < 50) console.warn(`  history thin for ${d}: ${n} mcap rows`);
  }
  return { historyByDate, horizonCandidates, anchorDd, supabaseUrl, serviceKey };
}

/**
 * Upsert sector_returns rows (PK = sector_id).
 */
async function upsertHubRankDaily(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return { ok: true, upserted: 0 };
  let upserted = 0;
  for (let i = 0; i < rows.length; i += HISTORY_UPSERT_BATCH) {
    const batch = rows.slice(i, i + HISTORY_UPSERT_BATCH);
    const res = await fetch(`${supabaseUrl}/rest/v1/hub_rank_daily`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates, on_conflict=metric,ticker,trade_date',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, upserted, status: res.status, body };
    }
    upserted += batch.length;
  }
  return { ok: true, upserted };
}

async function upsertSectorReturns(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return { upserted: 0, failed: 0, body: null };
  const result = await upsertBatch('sector_returns', rows, supabaseUrl, serviceKey);
  if (result.ok) return { upserted: rows.length, failed: 0, body: null };
  console.error(`\n  sector_returns upsert failed (${result.status})`);
  if (result.body) console.error(`  ${result.body.slice(0, 300)}`);
  return { upserted: 0, failed: rows.length, body: result.body };
}

function sectorSumNow(hubIndex, sectorId, quoteByTicker) {
  const block = hubIndex.sectors && hubIndex.sectors[sectorId];
  if (!block) return null;
  let sum = 0;
  let n = 0;
  for (const c of block.companies || []) {
    const key = normalizeTicker(c.ticker);
    if (!key) continue;
    const q = quoteByTicker.get(key);
    const mcap = q && q.mcap_won;
    if (mcap == null || !Number.isFinite(mcap) || mcap <= 0) continue;
    sum += mcap;
    n += 1;
  }
  return n > 0 ? sum : null;
}

function sectorSumFromHistory(hubIndex, sectorId, mcapByTicker) {
  if (!mcapByTicker || !mcapByTicker.size) return null;
  const block = hubIndex.sectors && hubIndex.sectors[sectorId];
  if (!block) return null;
  let sum = 0;
  let n = 0;
  for (const c of block.companies || []) {
    const key = normalizeTicker(c.ticker);
    if (!key) continue;
    const mcap = mcapByTicker.get(key);
    if (mcap == null || !Number.isFinite(mcap) || mcap <= 0) continue;
    sum += mcap;
    n += 1;
  }
  return n > 0 ? sum : null;
}

async function loadIntradaySectorIds(supabaseUrl, serviceKey, tradeDateDash) {
  const seen = new Set();
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const url =
      `${supabaseUrl}/rest/v1/sector_intraday_snapshots` +
      `?trade_date=eq.${encodeURIComponent(tradeDateDash)}` +
      `&select=sector_id&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, body, ids: seen };
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      if (row && row.sector_id) seen.add(row.sector_id);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return { ok: true, ids: seen };
}

async function insertIntradaySnapshots(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return { ok: true, upserted: 0 };
  const res = await fetch(`${supabaseUrl}/rest/v1/sector_intraday_snapshots`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=sector_id,ts',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true, upserted: rows.length };
  const body = await res.text();
  return { ok: false, upserted: 0, status: res.status, body };
}

async function pruneIntradaySnapshots(supabaseUrl, serviceKey, keepDates) {
  const keep = [...new Set((keepDates || []).filter(Boolean))];
  if (keep.length < 1) return { ok: true };
  const url =
    `${supabaseUrl}/rest/v1/sector_intraday_snapshots` +
    `?trade_date=not.in.(${keep.map((d) => encodeURIComponent(d)).join(',')})`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=minimal',
    },
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  return { ok: false, status: res.status, body };
}

/**
 * Regular-session only: seed 0% baseline from previous close sum, append live sumNow,
 * keep today + previous trading day snapshots.
 */
async function syncSectorIntradaySnapshots({
  hubIndex,
  quoteByTicker,
  historyByDate,
  tradeDateDash,
  supabaseUrl,
  serviceKey,
  now = new Date(),
}) {
  if (!tradeDateDash) {
    console.log('  sector intraday snapshots: skip (no trade date)');
    return { seeded: 0, appended: 0, pruned: false };
  }

  const dates = tradingDates(10, now);
  const todayDd = dashToBasDd(tradeDateDash);
  let prevDash = null;
  const idx = dates.indexOf(todayDd);
  if (idx >= 0 && idx + 1 < dates.length) prevDash = basDdToDash(dates[idx + 1]);
  else if (dates.length) {
    const before = dates.filter((d) => d < todayDd);
    if (before.length) prevDash = basDdToDash(before[0]);
  }

  let prevMap = prevDash ? historyByDate.get(prevDash) : null;
  if (prevDash && (!prevMap || prevMap.size < 50)) {
    const loaded = await loadHistoryMcapByDates(supabaseUrl, serviceKey, [prevDash]);
    prevMap = loaded.get(prevDash) || new Map();
    if (prevMap.size) historyByDate.set(prevDash, prevMap);
  }

  const existing = await loadIntradaySectorIds(supabaseUrl, serviceKey, tradeDateDash);
  if (!existing.ok) {
    console.warn(
      `  sector intraday snapshots: table missing or fetch failed (${existing.status}): ` +
      `${(existing.body || '').slice(0, 160)}`,
    );
    return { seeded: 0, appended: 0, pruned: false, missingTable: true };
  }

  const seedTs = `${tradeDateDash}T09:00:00+09:00`;
  const liveTs = now.toISOString();
  const rows = [];
  let seeded = 0;
  let appended = 0;

  for (const sid of SECTOR_ORDER) {
    const sumNow = sectorSumNow(hubIndex, sid, quoteByTicker);
    if (sumNow == null) continue;

    if (!existing.ids.has(sid) && prevMap) {
      const seedSum = sectorSumFromHistory(hubIndex, sid, prevMap);
      if (seedSum != null) {
        rows.push({
          sector_id: sid,
          ts: seedTs,
          mcap_sum: seedSum,
          trade_date: tradeDateDash,
        });
        seeded += 1;
      }
    }
    rows.push({
      sector_id: sid,
      ts: liveTs,
      mcap_sum: sumNow,
      trade_date: tradeDateDash,
    });
    appended += 1;
  }

  if (rows.length) {
    const result = await insertIntradaySnapshots(rows, supabaseUrl, serviceKey);
    if (!result.ok) {
      console.error(
        `  sector intraday insert failed (${result.status}): ${(result.body || '').slice(0, 200)}`,
      );
      return { seeded: 0, appended: 0, pruned: false, failed: true };
    }
  }

  const keep = [tradeDateDash];
  if (prevDash) keep.push(prevDash);
  const prune = await pruneIntradaySnapshots(supabaseUrl, serviceKey, keep);
  if (!prune.ok) {
    console.warn(`  sector intraday prune failed (${prune.status}): ${(prune.body || '').slice(0, 160)}`);
  }

  console.log(
    `  sector intraday snapshots: seeded=${seeded} appended=${appended}` +
    ` trade_date=${tradeDateDash} prev=${prevDash || 'n/a'} prune=${prune.ok ? 'ok' : 'fail'}`,
  );
  return { seeded, appended, pruned: !!prune.ok };
}

/**
 * Consensus trade marker across all fetched Naver quotes.
 * Uses the most common tradeDate and the majority marketClosed among quotes on
 * that date, so one flaky page cannot flip the whole run's session flag.
 * @param {Record<string, {tradeDate?: string|null, marketClosed?: boolean|null}>} quotes
 */
function deriveNaverTradeConsensus(quotes) {
  const dateCounts = new Map();
  for (const q of Object.values(quotes)) {
    if (q && q.tradeDate) dateCounts.set(q.tradeDate, (dateCounts.get(q.tradeDate) || 0) + 1);
  }
  let tradeDate = null;
  let best = 0;
  for (const [d, n] of dateCounts) {
    if (n > best) { best = n; tradeDate = d; }
  }

  let closedVotes = 0;
  let openVotes = 0;
  for (const q of Object.values(quotes)) {
    if (!q || q.tradeDate !== tradeDate) continue;
    if (q.marketClosed === true) closedVotes += 1;
    else if (q.marketClosed === false) openVotes += 1;
  }
  let marketClosed = null;
  if (closedVotes || openVotes) marketClosed = closedVotes >= openVotes;

  return { tradeDate, marketClosed };
}

/** ISO timestamp anchored to a trade date's KST close (15:30). */
function tradeDateToAsOf(tradeDate) {
  if (!tradeDate) return new Date().toISOString();
  const d = new Date(`${tradeDate}T15:30:00+09:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

async function main() {
  const started = Date.now();
  const force = process.argv.includes('--force');
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = getAuthKey(env);

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  await verifyMomentumSchema(supabaseUrl, serviceKey);

  // Weekends can never have a session; skip without a network round-trip.
  // Holidays are detected from Naver's own marker below (no hardcoded calendar).
  const weekday = kstWeekday();
  const todayYmdDash = kstYmdDash();
  if ((weekday === 0 || weekday === 6) && !force) {
    console.log(`Skip sync: ${todayYmdDash} is a weekend (KST). Pass --force to run anyway.`);
    process.exit(0);
  }

  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const tickers = loadHubTickers(hubIndex);
  const clockRegular = isKrxClockRegularSession();

  console.log(`Sync ${tickers.length} hub tickers → Supabase`);
  console.log(`  kst=${todayYmdDash} clockRegular=${clockRegular}${force ? ' --force' : ''}`);

  const naverResult = await fetchNaverQuotes(tickers);
  const krxResult = await loadKrxQuotes(authKey);

  // Naver's page marker is the source of truth for holiday detection.
  const consensus = deriveNaverTradeConsensus(naverResult.quotes);
  const session = resolveNaverSession({
    clockRegular,
    tradeDate: consensus.tradeDate,
    marketClosed: consensus.marketClosed,
    todayYmdDash,
  });
  const regularSession = session.regularSession;
  const asOf = session.regularSession ? new Date().toISOString() : tradeDateToAsOf(session.tradeDate);
  console.log(
    `  naverTradeDate=${consensus.tradeDate || 'n/a'} naverMarketClosed=${consensus.marketClosed} ` +
    `→ regularSession=${regularSession} asOf=${asOf}`,
  );
  if (clockRegular && !regularSession) {
    console.log('  (clock says session, but Naver marker indicates non-trading day → holiday)');
  }

  const rows = tickers.map((ticker) =>
    toSupabaseRow(
      ticker,
      naverResult.quotes[ticker],
      krxResult.quotes[ticker],
      asOf,
      regularSession,
      session.marketClosed,
    ),
  );

  console.log(`Upserting ${rows.length} rows…`);
  const upsertResult = await upsertToSupabase(rows, supabaseUrl, serviceKey);

  // Keep stock_price_history current: session close from Naver + KRX gap fill.
  await upsertSessionCloseHistory(
    rows,
    consensus.tradeDate,
    session.marketClosed === true,
    supabaseUrl,
    serviceKey,
    authKey,
  );
  await fillMissingHistoryDays(
    authKey,
    supabaseUrl,
    serviceKey,
    consensus.tradeDate || todayYmdDash,
    tickers,
  );
  await upsertHistoryIndicatorsForTickers(tickers, rows, supabaseUrl, serviceKey);

  // Session close: persist today's sector mcap sums for multi-day sparklines.
  if (session.marketClosed === true && consensus.tradeDate) {
    const mcapRows = buildSectorMcapDailyRows(hubIndex, new Map(rows.map((r) => [r.ticker, r.mcap_won])), consensus.tradeDate);
    const dailyResult = await upsertSectorMcapDaily(mcapRows, supabaseUrl, serviceKey);
    if (dailyResult.ok) {
      console.log(`  sector_mcap_daily upsert ${dailyResult.upserted} rows for ${consensus.tradeDate}`);
    } else {
      console.error(
        `  sector_mcap_daily upsert failed (${dailyResult.status}): ${(dailyResult.body || '').slice(0, 200)}`,
      );
    }

    const rankRows = buildHubRankDailyRows(hubIndex, rows, consensus.tradeDate);
    const rankResult = await upsertHubRankDaily(rankRows, supabaseUrl, serviceKey);
    if (rankResult.ok) {
      console.log(`  hub_rank_daily upsert ${rankResult.upserted} rows for ${consensus.tradeDate}`);
    } else {
      console.error(
        `  hub_rank_daily upsert failed (${rankResult.status}): ${(rankResult.body || '').slice(0, 200)}`,
      );
    }
  } else {
    console.log('  sector_mcap_daily / hub_rank_daily: skip (session not closed)');
  }

  const quoteByTicker = new Map(rows.map((r) => [r.ticker, r]));
  const historyCtx = await prepareSectorHistoryContext(supabaseUrl, serviceKey);
  const sectorBuilt = await buildSectorReturnRows(hubIndex, quoteByTicker, asOf, historyCtx);
  const sectorRows = sectorBuilt.rows;
  console.log(`Upserting ${sectorRows.length} sector_returns rows…`);
  const sectorResult = await upsertSectorReturns(sectorRows, supabaseUrl, serviceKey);
  for (const r of sectorRows) {
    const vals = SECTOR_HORIZONS.map((f) => `${f.out}=${r[f.out] == null ? 'null' : r[f.out]}`).join(' ');
    console.log(`  ${r.sector_id}: ${vals}`);
  }

  if (regularSession) {
    await syncSectorIntradaySnapshots({
      hubIndex,
      quoteByTicker,
      historyByDate: historyCtx.historyByDate,
      tradeDateDash: consensus.tradeDate || todayYmdDash,
      supabaseUrl,
      serviceKey,
      now: new Date(),
    });
  } else {
    console.log('  sector intraday snapshots: skip (not regular session)');
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  const naverFailedUnique = [...new Set(naverResult.failed)];
  const upsertFailedUnique = [...new Set(upsertResult.failed)];

  console.log('\n=== sync_quotes_to_supabase summary ===');
  console.log(`total tickers:     ${tickers.length}`);
  console.log(`naver ok:          ${naverResult.ok}`);
  console.log(`naver failed:      ${naverFailedUnique.length}`);
  console.log(`krx matched:       ${tickers.filter((t) => krxResult.quotes[t]).length}`);
  console.log(`supabase upserted: ${upsertResult.upserted.length}`);
  console.log(`supabase failed:   ${upsertFailedUnique.length}`);
  console.log(`sector upserted:   ${sectorResult.upserted}`);
  console.log(`sector failed:     ${sectorResult.failed}`);
  console.log(`elapsed:           ${elapsedSec}s`);

  if (naverFailedUnique.length) {
    console.log(`naver failed tickers: ${naverFailedUnique.join(', ')}`);
  }
  if (upsertFailedUnique.length) {
    console.log(`supabase failed tickers: ${upsertFailedUnique.join(', ')}`);
    process.exit(1);
  }
  if (sectorResult.failed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
