/**
 * Build data/hub_return_refs.json — shared adjusted-close history for live returns.
 * Does not alter existing hub APIs; foundation for a single return math path.
 *
 * Flags:
 *   --guard-today     Skip (exit 3) if weekday trading day but history max(trade_date) < today
 *   --require-date=YYYYMMDD  Fail (exit 2) if built recentDd !== this date
 *                            (ignored on non-trading days when --guard-today allows last session)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildAdjustedCloseRefsFromHistory,
  RETURN_REF_CLOSES,
  RETURN_REF_TRADING_DATES,
} from '../functions/lib/krx_rs_from_history.mjs';
import { fetchSupabaseJson, getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';
import {
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';
import { fetchKrxDailyOhlc } from '../functions/lib/krx_daily_ohlc.mjs';
import { kstDateParts, kstYmdDash } from '../functions/lib/krx_session.mjs';
import { fetchNaverQuote } from '../functions/lib/naver_sise_quotes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'data', 'hub_return_refs.json');
const SAMPLE_TICKER = '005930';
/** Exit: today's candle missing on an expected trading day — do not overwrite refs. */
export const EXIT_SKIP_MISSING_TODAY = 3;
/** Exit: --require-date mismatch after build. */
export const EXIT_REQUIRE_DATE = 2;

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

function parseArgs(argv) {
  let requireDate = null;
  let guardToday = false;
  for (const a of argv) {
    if (a === '--guard-today') guardToday = true;
    else if (a.startsWith('--require-date=')) {
      const raw = a.slice('--require-date='.length).replace(/-/g, '');
      requireDate = /^\d{8}$/.test(raw) ? raw : null;
    }
  }
  return { requireDate, guardToday };
}

function collectHubTickers() {
  const set = new Set();
  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  if (fs.existsSync(hubPath)) {
    const hub = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
    for (const c of listHubCompanies(hub)) {
      const t = normalizeTicker(c.ticker);
      if (t) set.add(t);
    }
  }
  return [...set].sort();
}

function collectUniverseTickers() {
  const set = new Set(collectHubTickers());
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

async function fetchHistoryMaxTradeDate(config) {
  const rows = await fetchSupabaseJson(
    config,
    `stock_price_history?ticker=eq.${SAMPLE_TICKER}`
      + `&select=trade_date&order=trade_date.desc&limit=1`,
  );
  if (!Array.isArray(rows) || !rows[0]?.trade_date) return null;
  return String(rows[0].trade_date).slice(0, 10);
}

const TRUSTED_HISTORY_SOURCES = new Set(['apihub', 'mdcstat', 'backfill']);

/**
 * Reject tip build when hub coverage/source quality on the anchor day is poor.
 * @returns {Promise<void>} exits 3 on failure
 */
async function guardAnchorDaySourceQuality(config, anchorDash, hubTickers) {
  if (!anchorDash || !hubTickers.length) return;
  const pageSize = 1000;
  /** @type {Map<string, string|null>} */
  const byTicker = new Map();
  let sourceColumnOk = true;
  try {
    for (let offset = 0; ; offset += pageSize) {
      const rows = await fetchSupabaseJson(
        config,
        `stock_price_history?trade_date=eq.${encodeURIComponent(anchorDash)}`
          + `&select=ticker,source,close&limit=${pageSize}&offset=${offset}`,
      );
      for (const r of rows || []) {
        const t = normalizeTicker(r.ticker);
        if (t) byTicker.set(t, r.source != null ? String(r.source) : null);
      }
      if (!rows || rows.length < pageSize) break;
    }
  } catch (e) {
    const msg = String(e.message || e);
    if (/source|42703/i.test(msg)) {
      console.warn(
        '  anchor-day source guard: source column missing — apply migration 0021; '
        + 'falling back to coverage-only check',
      );
      sourceColumnOk = false;
      for (let offset = 0; ; offset += pageSize) {
        const rows = await fetchSupabaseJson(
          config,
          `stock_price_history?trade_date=eq.${encodeURIComponent(anchorDash)}`
            + `&select=ticker,close&limit=${pageSize}&offset=${offset}`,
        );
        for (const r of rows || []) {
          const t = normalizeTicker(r.ticker);
          if (t) byTicker.set(t, null);
        }
        if (!rows || rows.length < pageSize) break;
      }
    } else {
      throw e;
    }
  }

  let missing = 0;
  let badSource = 0;
  for (const t of hubTickers) {
    if (!byTicker.has(t)) {
      missing += 1;
      continue;
    }
    if (!sourceColumnOk) continue;
    const src = byTicker.get(t);
    // null / naver / unknown → untrusted for tip
    if (!src || !TRUSTED_HISTORY_SOURCES.has(src)) badSource += 1;
  }
  const n = hubTickers.length;
  const missingPct = missing / n;
  const badPct = badSource / n;
  console.log(
    `  anchor-day source guard ${anchorDash}: hub=${n} missing=${missing} `
    + `(${(missingPct * 100).toFixed(2)}%) badSource=${badSource} `
    + `(${(badPct * 100).toFixed(2)}%) sourceCol=${sourceColumnOk}`,
  );
  if (missingPct >= 0.05) {
    console.error(
      `FATAL: ≥5% hub tickers missing history on ${anchorDash} `
      + `(${missing}/${n}) — exit 3`,
    );
    process.exit(EXIT_SKIP_MISSING_TODAY);
  }
  if (sourceColumnOk && badPct >= 0.01) {
    console.error(
      `FATAL: ≥1% hub tickers have untrusted source on ${anchorDash} `
      + `(${badSource}/${n}; need apihub|mdcstat|backfill) — exit 3`,
    );
    process.exit(EXIT_SKIP_MISSING_TODAY);
  }
}

async function fetchHistoryClose(config, ticker, tradeDateDash) {
  try {
    const rows = await fetchSupabaseJson(
      config,
      `stock_price_history?ticker=eq.${encodeURIComponent(ticker)}`
        + `&trade_date=eq.${encodeURIComponent(tradeDateDash)}`
        + `&select=close,source&limit=1`,
    );
    if (!Array.isArray(rows) || !rows[0]) return null;
    const close = Number(rows[0].close);
    return {
      close: Number.isFinite(close) && close > 0 ? close : null,
      source: rows[0].source != null ? String(rows[0].source) : null,
    };
  } catch {
    const rows = await fetchSupabaseJson(
      config,
      `stock_price_history?ticker=eq.${encodeURIComponent(ticker)}`
        + `&trade_date=eq.${encodeURIComponent(tradeDateDash)}`
        + `&select=close&limit=1`,
    );
    if (!Array.isArray(rows) || !rows[0]) return null;
    const close = Number(rows[0].close);
    return {
      close: Number.isFinite(close) && close > 0 ? close : null,
      source: null,
    };
  }
}

/**
 * True when KST "today" is expected to be a trading session (weekday + Naver
 * tradeDate already on today, or weekday with no holiday signal).
 * Holidays: Naver tradeDate stays on the prior session while calendar is weekday.
 */
async function expectTradingSessionToday(todayDash) {
  const p = kstDateParts();
  if (p.weekday < 1 || p.weekday > 5) return false;
  try {
    const q = await fetchNaverQuote(SAMPLE_TICKER);
    const td = q?.tradeDate ? String(q.tradeDate).slice(0, 10) : null;
    if (td && td < todayDash) {
      console.log(
        `  post_close guard: Naver tradeDate=${td} < today=${todayDash} → non-trading day`,
      );
      return false;
    }
  } catch (e) {
    console.warn(`  post_close guard: Naver peek failed (${e.message || e}) — treat as trading day`);
  }
  return true;
}

/**
 * @returns {Promise<'ok'|'skip_missing_today'|'allow_non_trading'>}
 */
async function guardTodayCandle(config) {
  const todayDash = kstYmdDash();
  const maxDash = await fetchHistoryMaxTradeDate(config);
  console.log(`  post_close guard: history max(trade_date)=${maxDash || 'n/a'} today=${todayDash}`);

  if (!maxDash) return 'ok';
  if (maxDash >= todayDash) return 'ok';

  const expectTrade = await expectTradingSessionToday(todayDash);
  if (!expectTrade) return 'allow_non_trading';

  console.warn(
    `::warning::post_close: today's candle missing (max=${maxDash}) — skip refs/RS rebuild`,
  );
  return 'skip_missing_today';
}

async function main() {
  const { requireDate, guardToday } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const supabase = getSupabaseConfig(env, { preferServiceRole: true });
  if (!supabase) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }

  let skipRequireDate = false;
  if (guardToday) {
    const g = await guardTodayCandle(supabase);
    if (g === 'skip_missing_today') {
      process.exit(EXIT_SKIP_MISSING_TODAY);
    }
    if (g === 'allow_non_trading') {
      skipRequireDate = true;
      console.log('  post_close guard: non-trading day — build allowed on last session');
    }
  }

  const tickers = collectUniverseTickers();
  const hubTickers = collectHubTickers();
  if (!tickers.length) {
    console.error('No tickers from hub_index / hub_rs_snapshot');
    process.exit(1);
  }
  console.log(
    `Universe: hub+rs = ${tickers.length} tickers (hub=${hubTickers.length}) `
    + `(closes=${RETURN_REF_CLOSES}, tradingDates=${RETURN_REF_TRADING_DATES})`,
  );

  // Prefer today's dash when history already has it; else max trade_date.
  const todayDash = kstYmdDash();
  const maxDash = await fetchHistoryMaxTradeDate(supabase);
  const anchorForGuard = maxDash && maxDash >= todayDash ? todayDash : maxDash;
  if (anchorForGuard) {
    await guardAnchorDaySourceQuality(supabase, anchorForGuard, hubTickers);
  }

  const refs = await buildAdjustedCloseRefsFromHistory(supabase, tickers, {
    tradingDatesCount: RETURN_REF_TRADING_DATES,
    closesCount: RETURN_REF_CLOSES,
  });
  if (!refs || !refs.quotes?.size) {
    console.error('buildAdjustedCloseRefsFromHistory failed');
    process.exit(1);
  }

  const { recentDd, tradingDates, quotes: seriesMap } = refs;

  // Re-check on the tip day actually used by the builder.
  const tipDash = `${recentDd.slice(0, 4)}-${recentDd.slice(4, 6)}-${recentDd.slice(6, 8)}`;
  if (tipDash !== anchorForGuard) {
    await guardAnchorDaySourceQuality(supabase, tipDash, hubTickers);
  }

  if (requireDate && !skipRequireDate && recentDd !== requireDate) {
    console.error(
      `FATAL: --require-date=${requireDate} but recentDd=${recentDd} `
      + '(refusing to publish stale tip)',
    );
    process.exit(EXIT_REQUIRE_DATE);
  }
  if (requireDate && skipRequireDate) {
    console.log(
      `  --require-date=${requireDate} waived (non-trading day); recentDd=${recentDd}`,
    );
  }

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
    const hist = await fetchHistoryClose(supabase, SAMPLE_TICKER, tipDash);
    console.log(
      `tip check ${SAMPLE_TICKER}: refsTip=${last} history.close=${hist?.close ?? 'n/a'} `
      + `source=${hist?.source ?? 'n/a'}`,
    );
    if (hist?.close != null && Number(last) !== Number(hist.close)) {
      console.error(
        `FATAL: ${SAMPLE_TICKER} refs tip ${last} != history.close ${hist.close} on ${tipDash}`,
      );
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
