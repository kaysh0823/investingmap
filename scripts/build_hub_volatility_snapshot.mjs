/**
 * Build data/hub_volatility_snapshot.json —
 * full-market ordinary shares: rangeVol5 + SMA20 + %b(20) from adjusted stock_price_history.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildAdjustedOhlcSeriesFromHistory,
  RS_FFILL_LIMIT,
} from '../functions/lib/krx_rs_from_history.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';
import { rsUniverseExclusionReason } from '../functions/lib/krx_rs.mjs';
import { normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';
import { loadListedShareMeta3557 } from '../lib/krx_data_sources.mjs';
import {
  RANGE_VOL_PERIOD,
  RANGE_VOL_SIGNAL,
  tipRangeVolFromSeries,
} from '../lib/range_vol.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'data', 'hub_volatility_snapshot.json');
const MIN_UNIVERSE = 100;
/** Need ≥24 sessions for SMA20 of 5D range vol (5 + 20 − 1). */
const OHLC_BARS = 30;
const TRADING_DATES = 40;

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

function computePctB(closes) {
  if (!closes || closes.length < 20) return null;
  const window = closes.slice(-20);
  if (window.some((c) => c == null || !(c > 0))) return null;
  const mid = window.reduce((s, v) => s + v, 0) / window.length;
  const variance = window.reduce((s, v) => s + (v - mid) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const close = window[window.length - 1];
  if (upper === lower) return null;
  return (close - lower) / (upper - lower);
}

function round5(v) {
  return Math.round(v * 100000) / 100000;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

/** @param {unknown} raw @returns {'KOSPI'|'KOSDAQ'|null} */
function coerceMarket(raw) {
  const s = String(raw || '').toUpperCase();
  if (s.includes('KOSDAQ')) return 'KOSDAQ';
  if (s.includes('KOSPI')) return 'KOSPI';
  return null;
}

/**
 * Ordinary-share universe from hub_rs_snapshot (same filter as RS percentiles).
 * Also returns marketByCode (RS quote.market first, else data_3557).
 * @param {object} env
 * @param {{ url: string, anonKey: string }} supabase
 * @returns {Promise<{ codes: string[], marketByCode: Map<string,string>, universeRaw: number, excluded: object }>}
 */
async function resolveOrdinaryUniverse(env, supabase) {
  const excluded = { preferred: 0, spac: 0, reit: 0, etf_etn: 0, non_ordinary_secu: 0 };
  const listingMeta = loadListedShareMeta3557(path.join(ROOT, 'data'));
  const rsPath = path.join(ROOT, 'data', 'hub_rs_snapshot.json');
  if (fs.existsSync(rsPath)) {
    try {
      const snap = JSON.parse(fs.readFileSync(rsPath, 'utf8'));
      const quotes = snap?.quotes || {};
      const codes = Object.keys(quotes)
        .map((t) => normalizeTicker(t))
        .filter(Boolean)
        .sort();
      if (codes.length >= MIN_UNIVERSE) {
        const marketByCode = new Map();
        for (const [raw, q] of Object.entries(quotes)) {
          const code = normalizeTicker(raw);
          if (!code) continue;
          const fromRs = coerceMarket(q?.market);
          const fromMeta = coerceMarket(listingMeta.get(code)?.market);
          marketByCode.set(code, fromRs || fromMeta || 'KOSPI');
        }
        return {
          codes,
          marketByCode,
          universeRaw: snap.universeRaw ?? codes.length,
          excluded: snap.universeExcluded || excluded,
        };
      }
    } catch (e) {
      console.warn('hub_rs_snapshot parse failed:', e.message || e);
    }
  }

  // Fallback: data_3557 listing filter (no apihub).
  void supabase;
  void env;
  const codes = [];
  const marketByCode = new Map();
  for (const [rawCode, meta] of listingMeta) {
    const code = normalizeTicker(rawCode);
    if (!code || !meta) continue;
    const row = {
      ISU_NM: meta.name || '',
      SECUGRP_NM: meta.secu || '',
      SECT_TP_NM: meta.dept || '',
      STK_KIND_NM: meta.kind || '',
    };
    const reason = rsUniverseExclusionReason(code, meta.name, row);
    if (reason) {
      if (excluded[reason] != null) excluded[reason] += 1;
      else excluded[reason] = 1;
      continue;
    }
    codes.push(code);
    marketByCode.set(code, coerceMarket(meta.market) || 'KOSPI');
  }
  return {
    codes: [...new Set(codes)].sort(),
    marketByCode,
    universeRaw: listingMeta.size,
    excluded,
  };
}

/**
 * @param {{ url: string, anonKey: string }} [supabase]
 * @param {object} [env]
 */
export async function buildVolatilitySnapshot(supabase, env = process.env) {
  const config = supabase || getSupabaseConfig(env, { preferServiceRole: true });
  if (!config) return null;

  const { codes, marketByCode, universeRaw, excluded } = await resolveOrdinaryUniverse(env, config);
  if (codes.length < MIN_UNIVERSE) {
    console.warn(`[volatility] ordinary universe too small (${codes.length})`);
    return null;
  }

  const series = await buildAdjustedOhlcSeriesFromHistory(config, codes, {
    tradingDatesCount: TRADING_DATES,
    closesCount: OHLC_BARS,
  });
  if (!series?.quotes?.size) return null;

  const refsPath = path.join(ROOT, 'data', 'hub_return_refs.json');
  let refsRecentDd = null;
  if (fs.existsSync(refsPath)) {
    try {
      refsRecentDd = JSON.parse(fs.readFileSync(refsPath, 'utf8'))?.recentDd || null;
    } catch {
      /* ignore */
    }
  }
  if (refsRecentDd && series.recentDd && refsRecentDd !== series.recentDd) {
    console.warn(
      `[volatility] recentDd ${series.recentDd} != refs.recentDd ${refsRecentDd} — anchors should match`,
    );
  }

  const quotes = {};
  for (const [code, q] of series.quotes) {
    const tip = tipRangeVolFromSeries(q.highs, q.lows, q.closes, RANGE_VOL_PERIOD, RANGE_VOL_SIGNAL);
    const pctB = computePctB(q.closes);
    if (tip.rangeVol5 == null || !(tip.rangeVol5 >= 0) || pctB == null || !Number.isFinite(pctB)) {
      continue;
    }
    if (!(q.mcap > 0)) continue;
    const close = q.closes[q.closes.length - 1];
    if (!(close > 0)) continue;
    const rangeVol5 = round5(tip.rangeVol5);
    const rangeVol5Sma20 =
      tip.rangeVol5Sma20 != null && Number.isFinite(tip.rangeVol5Sma20)
        ? round5(tip.rangeVol5Sma20)
        : null;
    quotes[code] = {
      mcap: q.mcap,
      rangeVol5,
      rangeVol5Sma20,
      // One-release alias for older map_volatility clients.
      atrPct: rangeVol5,
      pctB: round4(pctB),
      market: marketByCode.get(code) || 'KOSPI',
      close,
    };
  }

  return {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'supabase-history-adj',
    indicator: 'rangeVol5',
    recentDd: series.recentDd,
    universe: codes.length,
    universeRaw,
    universeExcluded: excluded,
    count: Object.keys(quotes).length,
    ffillLimit: RS_FFILL_LIMIT,
    quotes,
  };
}

async function main() {
  if (process.env.REFRESH_HUB_SNAPSHOTS !== '1') {
    console.log('skip hub_volatility_snapshot (deterministic build — use npm run refresh:hub-snapshots)');
    process.exit(0);
  }
  const env = loadEnv();
  const supabase = getSupabaseConfig(env, { preferServiceRole: true });
  if (!supabase) {
    if (fs.existsSync(OUT_PATH)) {
      console.warn('SUPABASE credentials missing — keeping existing hub_volatility_snapshot.json');
      process.exit(0);
    }
    console.warn('SUPABASE credentials missing — skip hub_volatility_snapshot.json');
    process.exit(0);
  }

  console.log(
    'Building volatility snapshot (rangeVol5 + SMA20 + %b20 from adjusted history)…',
  );
  const snapshot = await buildVolatilitySnapshot(supabase, env);
  if (!snapshot || !snapshot.quotes) {
    console.error('volatility snapshot build failed');
    process.exit(1);
  }
  if (snapshot.count < MIN_UNIVERSE) {
    console.error(`volatility count too low: ${snapshot.count}`);
    process.exit(1);
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(
    `OK ${OUT_PATH} — ${snapshot.count}/${snapshot.universe} quotes `
    + `recentDd=${snapshot.recentDd} source=${snapshot.source}`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
