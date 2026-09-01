/**
 * Build data/hub_volatility_snapshot.json — KRX full-market ATR3/close, %b(20), mcap.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAuthKey,
  fetchMarketDay,
  tradingDates,
  recentDateCandidates,
} from '../functions/lib/krx_yoy.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const KOSPI_DAILY = '/sto/stk_bydd_trd';
const KOSDAQ_DAILY = '/sto/ksq_bydd_trd';
const TRADING_DAYS = 22;
const MIN_UNIVERSE = 100;
const SHORT_CODE_RE = /^[0-9A-Z]{6}$/;

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function shortCodeFromRow(row) {
  const srt = row && row.ISU_SRT_CD;
  if (srt) {
    const s = String(srt).trim().toUpperCase();
    if (SHORT_CODE_RE.test(s)) return s;
  }
  const cd = row && row.ISU_CD;
  if (!cd) return null;
  const s = String(cd).trim().toUpperCase();
  if (SHORT_CODE_RE.test(s)) return s;
  if (s.length >= 9 && s.startsWith('KR')) return s.substring(3, 9);
  return null;
}

function mcapFromRow(row) {
  const cl = parseNum(row?.TDD_CLSPRC);
  const shrs = parseNum(row?.LIST_SHRS);
  if (cl != null && shrs != null && cl > 0 && shrs > 0) return cl * shrs;
  const direct = parseNum(row?.MKTCAP);
  if (direct != null && direct > 0) return direct;
  return null;
}

function barFromRow(row) {
  const close = parseNum(row?.TDD_CLSPRC);
  const high = parseNum(row?.TDD_HGPRC);
  const low = parseNum(row?.TDD_LWPRC);
  if (close == null || close <= 0) return null;
  return {
    close,
    high: high != null && high > 0 ? high : close,
    low: low != null && low > 0 ? low : close,
    mcap: mcapFromRow(row),
  };
}

async function krxDaily(authKey, endpoint, basDd) {
  const url = `${KRX_BASE}${endpoint}`;
  const headers = { AUTH_KEY: authKey, Accept: 'application/json', 'Content-Type': 'application/json' };
  let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ basDd }) });
  if (!res.ok) {
    res = await fetch(`${url}?basDd=${encodeURIComponent(basDd)}`, {
      method: 'GET',
      headers: { AUTH_KEY: authKey, Accept: 'application/json' },
    });
  }
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.OutBlock_1) ? j.OutBlock_1 : [];
}

async function fetchMarketDayTagged(authKey, basDd) {
  const [kospi, kosdaq] = await Promise.all([
    krxDaily(authKey, KOSPI_DAILY, basDd),
    krxDaily(authKey, KOSDAQ_DAILY, basDd),
  ]);
  const byCode = new Map();
  for (const row of kospi) {
    const code = shortCodeFromRow(row);
    if (code) byCode.set(code, { row, market: 'KOSPI' });
  }
  for (const row of kosdaq) {
    const code = shortCodeFromRow(row);
    if (code) byCode.set(code, { row, market: 'KOSDAQ' });
  }
  return byCode;
}

function trueRange(high, low, prevClose) {
  if (prevClose == null || prevClose <= 0) return high - low;
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

function computeAtrPct(bars) {
  if (bars.length < 4) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const prev = bars[i - 1].close;
    trs.push(trueRange(b.high, b.low, prev));
  }
  if (trs.length < 3) return null;
  const atr3 = (trs[trs.length - 3] + trs[trs.length - 2] + trs[trs.length - 1]) / 3;
  const close = bars[bars.length - 1].close;
  if (!(close > 0) || !(atr3 >= 0)) return null;
  return atr3 / close;
}

function computePctB(bars) {
  if (bars.length < 20) return null;
  const closes = bars.slice(-20).map((b) => b.close);
  const mid = closes.reduce((s, v) => s + v, 0) / closes.length;
  const variance = closes.reduce((s, v) => s + (v - mid) ** 2, 0) / closes.length;
  const sd = Math.sqrt(variance);
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const close = closes[closes.length - 1];
  if (upper === lower) return null;
  return (close - lower) / (upper - lower);
}

function loadAuthKey() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (fs.existsSync(devVars)) {
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
  }
  return getAuthKey(env);
}

export async function buildVolatilitySnapshot(authKey) {
  const dates = tradingDates(TRADING_DAYS + 12);
  let anchorDd = null;
  for (const basDd of recentDateCandidates(dates)) {
    const day = await fetchMarketDay(authKey, basDd);
    let valid = 0;
    for (const [, row] of day) {
      if (parseNum(row?.TDD_CLSPRC) > 0) valid += 1;
    }
    if (valid >= MIN_UNIVERSE) {
      anchorDd = basDd;
      break;
    }
  }
  if (!anchorDd) return null;

  const anchorIdx = dates.indexOf(anchorDd);
  const windowDates = dates.slice(anchorIdx, anchorIdx + TRADING_DAYS).reverse();
  const seriesByCode = new Map();
  const marketByCode = new Map();

  for (const basDd of windowDates) {
    const day = await fetchMarketDayTagged(authKey, basDd);
    for (const [code, { row, market }] of day) {
      const bar = barFromRow(row);
      if (!bar || !(bar.close > 0)) continue;
      if (!seriesByCode.has(code)) seriesByCode.set(code, []);
      seriesByCode.get(code).push({ ...bar, basDd });
      if (!marketByCode.has(code)) marketByCode.set(code, market);
    }
  }

  const quotes = {};
  for (const [code, bars] of seriesByCode) {
    bars.sort((a, b) => String(a.basDd).localeCompare(String(b.basDd)));
    const atrPct = computeAtrPct(bars);
    const pctB = computePctB(bars);
    if (atrPct == null || pctB == null || !Number.isFinite(pctB)) continue;
    const mcap = bars[bars.length - 1].mcap;
    if (!(mcap > 0)) continue;
    quotes[code] = {
      mcap,
      atrPct: Math.round(atrPct * 100000) / 100000,
      pctB: Math.round(pctB * 10000) / 10000,
      market: marketByCode.get(code) || 'KOSPI',
      close: bars[bars.length - 1].close,
    };
  }

  return {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'krx-volatility',
    recentDd: anchorDd,
    universe: seriesByCode.size,
    count: Object.keys(quotes).length,
    quotes,
  };
}

async function main() {
  const outPath = path.join(ROOT, 'data', 'hub_volatility_snapshot.json');
  if (process.env.REFRESH_HUB_SNAPSHOTS !== '1') {
    console.log('skip hub_volatility_snapshot (deterministic build — use npm run refresh:hub-snapshots)');
    process.exit(0);
  }
  const authKey = loadAuthKey();
  if (!authKey) {
    if (fs.existsSync(outPath)) {
      console.warn('KRX_AUTH_KEY missing — keeping existing hub_volatility_snapshot.json');
      process.exit(0);
    }
    console.warn('KRX_AUTH_KEY missing — skip hub_volatility_snapshot.json');
    process.exit(0);
  }

  console.log('Building KRX volatility snapshot (ATR3/close, %b20, mcap)…');
  const snapshot = await buildVolatilitySnapshot(authKey);
  if (!snapshot || !snapshot.quotes) {
    console.error('volatility snapshot build failed');
    process.exit(1);
  }

  fs.writeFileSync(outPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(`OK ${outPath} — ${snapshot.count}/${snapshot.universe} quotes`);
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
