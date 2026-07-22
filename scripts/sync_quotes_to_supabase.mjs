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
} from '../functions/lib/krx_yoy.mjs';
import {
  SECTOR_ORDER,
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';

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
  { out: 'ret_250d_pct', days: 250, fallbackSrc: 'ret_250d_pct' },
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
    per: naver?.per ?? null,
    pbr: naver?.pbr ?? null,
    chg_1d_pct: chg1d,
    ret_5d_pct: krx?.ret5dPct ?? null,
    ret_20d_pct: krx?.ret20dPct ?? null,
    ret_50d_pct: krx?.ret50dPct ?? null,
    ret_120d_pct: krx?.ret120dPct ?? null,
    ret_250d_pct: krx?.ret250dPct ?? null,
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
  for (let i = 0; i < rows.length; i += HISTORY_UPSERT_BATCH) {
    const batch = rows.slice(i, i + HISTORY_UPSERT_BATCH);
    const result = await upsertHistoryBatch(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      console.error(`  history upsert failed: ${(result.body || '').slice(0, 200)}`);
      return { upserted, failed: rows.length - upserted };
    }
    upserted += batch.length;
  }
  return { upserted, failed: 0 };
}

/** Persist session close mcaps into history when the market is closed. */
async function upsertSessionCloseHistory(quoteRows, tradeDateDash, marketClosed, supabaseUrl, serviceKey, authKey) {
  if (!marketClosed || !tradeDateDash) return { upserted: 0, skipped: true };
  // Avoid writing a synthetic "close" on KRX holidays (Naver may still stamp today).
  if (authKey) {
    try {
      const byCode = await fetchMarketDay(authKey, dashToBasDd(tradeDateDash));
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
    if (q.last == null || !Number.isFinite(q.last) || q.last <= 0) continue;
    if (q.mcap_won == null || !Number.isFinite(q.mcap_won) || q.mcap_won <= 0) continue;
    rows.push({
      ticker: q.ticker,
      trade_date: tradeDateDash,
      close: q.last,
      mcap_won: q.mcap_won,
    });
  }
  if (!rows.length) return { upserted: 0, skipped: false };
  const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey);
  console.log(`  history session close ${tradeDateDash}: upserted ${result.upserted}`);
  return result;
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
async function fillMissingHistoryDays(authKey, supabaseUrl, serviceKey, throughTradeDateDash) {
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
        const close = parseNum(row.TDD_CLSPRC);
        if (close == null || close <= 0) continue;
        rows.push({
          ticker,
          trade_date: tradeDate,
          close,
          mcap_won: mcapFromKrxRow(row),
        });
      }
      if (!rows.length) continue;
      const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey);
      if (result.failed) continue;
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
async function upsertSectorReturns(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return { upserted: 0, failed: 0, body: null };
  const result = await upsertBatch('sector_returns', rows, supabaseUrl, serviceKey);
  if (result.ok) return { upserted: rows.length, failed: 0, body: null };
  console.error(`\n  sector_returns upsert failed (${result.status})`);
  if (result.body) console.error(`  ${result.body.slice(0, 300)}`);
  return { upserted: 0, failed: rows.length, body: result.body };
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
  );

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
