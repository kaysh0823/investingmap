/**
 * Build data/hub_valuation_snapshot.json —
 * KRX 12021 FY multiples (full market) + Naver TTM PER/PBR (hub tickers).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseConfig, fetchSupabaseJson } from '../functions/lib/supabase_hub.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'data', 'hub_valuation_snapshot.json');
const MIN_UNIVERSE = 1000;

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

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round4(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10000) / 10000;
}

async function resolveRecentDd(config) {
  const refsPath = path.join(ROOT, 'data', 'hub_return_refs.json');
  if (fs.existsSync(refsPath)) {
    try {
      const refs = JSON.parse(fs.readFileSync(refsPath, 'utf8'));
      if (refs?.recentDd) return String(refs.recentDd).slice(0, 10);
    } catch { /* fall through */ }
  }
  try {
    const rows = await fetchSupabaseJson(
      config,
      'stock_valuation_daily?select=trade_date&order=trade_date.desc&limit=1',
      { preferCountExact: false },
    );
    if (Array.isArray(rows) && rows[0]?.trade_date) return String(rows[0].trade_date).slice(0, 10);
  } catch { /* ignore */ }
  return kstYmdDash();
}

/** KRX FY row shape (full market). */
function fyQuoteFromKrx(v) {
  return {
    perFy: numOrNull(v.per),
    pbrFy: numOrNull(v.pbr),
    epsFy: numOrNull(v.eps),
    bpsFy: numOrNull(v.bps),
    dvdYld: numOrNull(v.dvdYld ?? v.dvd_yld),
    dps: numOrNull(v.dps),
    close: numOrNull(v.close),
    perTtm: null,
    pbrTtm: null,
    epsTtm: null,
    valAsOf: null,
  };
}

async function loadFyQuotes(config, tradeDateDash, env) {
  try {
    const rows = await fetchSupabaseJson(
      config,
      `stock_valuation_daily?trade_date=eq.${tradeDateDash}`
        + '&select=ticker,close,eps,per,bps,pbr,dps,dvd_yld,source',
      { paginate: true, pageSize: 1000, preferCountExact: false },
    );
    const quotes = {};
    for (const row of rows || []) {
      const t = normalizeTicker(row.ticker);
      if (!t) continue;
      quotes[t] = fyQuoteFromKrx({
        per: row.per,
        pbr: row.pbr,
        eps: row.eps,
        bps: row.bps,
        dvdYld: row.dvd_yld,
        dps: row.dps,
        close: row.close,
      });
    }
    if (Object.keys(quotes).length >= MIN_UNIVERSE) return quotes;
    console.warn(
      `valuation table sparse (${Object.keys(quotes).length}) for ${tradeDateDash} — falling back to KRX fetch`,
    );
  } catch (e) {
    console.warn(`valuation table read failed: ${e.message || e} — falling back to KRX fetch`);
  }

  const { fetchKrxValuationDay } = await import('../functions/lib/krx_valuation.mjs');
  const basDd = String(tradeDateDash).replace(/\D/g, '');
  const byCode = await fetchKrxValuationDay(basDd, env);
  const quotes = {};
  for (const [ticker, v] of byCode) {
    quotes[ticker] = fyQuoteFromKrx(v);
  }
  return quotes;
}

/**
 * Attach Naver TTM PER/PBR for hub tickers.
 * Naver per null/≤0 → perTtm null (loss).
 * epsTtm from last÷per when last available, else close÷per; perTtm normalized to KRX close.
 */
async function attachHubTtm(quotes, hubTickers, config) {
  if (!hubTickers.size) return { hubHit: 0, ttmFilled: 0 };
  const list = [...hubTickers];
  const byTicker = new Map();
  const chunk = 200;
  for (let i = 0; i < list.length; i += chunk) {
    const part = list.slice(i, i + chunk);
    const rows = await fetchSupabaseJson(
      config,
      `stock_quotes_latest?ticker=in.(${part.join(',')})&select=ticker,last,per,pbr,as_of`,
      { preferCountExact: false, paginate: true, pageSize: 1000 },
    );
    for (const row of rows || []) {
      const t = normalizeTicker(row.ticker);
      if (t) byTicker.set(t, row);
    }
  }

  let hubHit = 0;
  let ttmFilled = 0;
  let ttmNullLoss = 0;
  let ttmMissingQuote = 0;
  for (const t of hubTickers) {
    if (!quotes[t]) continue;
    hubHit += 1;
    const nq = byTicker.get(t);
    if (!nq) {
      ttmMissingQuote += 1;
      quotes[t].perTtm = null;
      quotes[t].pbrTtm = null;
      quotes[t].epsTtm = null;
      quotes[t].valAsOf = null;
      continue;
    }
    const perN = numOrNull(nq?.per);
    const pbrN = numOrNull(nq?.pbr);
    const lastN = numOrNull(nq?.last);
    const close = numOrNull(quotes[t].close);
    const valAsOf = nq?.as_of || null;

    let perTtm = null;
    let epsTtm = null;
    if (perN != null && perN > 0) {
      if (lastN != null && lastN > 0) {
        epsTtm = lastN / perN;
      } else if (close != null && close > 0) {
        epsTtm = close / perN;
      }
      if (epsTtm != null && epsTtm > 0 && close != null && close > 0) {
        perTtm = close / epsTtm;
      } else {
        perTtm = perN;
      }
    }
    quotes[t].perTtm = round4(perTtm);
    quotes[t].pbrTtm = pbrN != null && pbrN > 0 ? round4(pbrN) : null;
    quotes[t].epsTtm = round4(epsTtm);
    quotes[t].valAsOf = valAsOf;
    if (quotes[t].perTtm != null && quotes[t].perTtm > 0) ttmFilled += 1;
    else ttmNullLoss += 1; // Naver null/≤0 → 적자 처리 (의도된 null)
  }
  return { hubHit, ttmFilled, ttmNullLoss, ttmMissingQuote };
}

export async function buildValuationSnapshot(env = loadEnv()) {
  const config = getSupabaseConfig(env, { preferServiceRole: true });
  if (!config) throw new Error('SUPABASE_URL + key required');

  const recentDd = await resolveRecentDd(config);
  const quotes = await loadFyQuotes(config, recentDd, env);
  const universe = Object.keys(quotes).length;
  if (universe < MIN_UNIVERSE) {
    throw new Error(
      `valuation snapshot too small: ${universe} < ${MIN_UNIVERSE} for ${recentDd}`,
    );
  }

  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const hubTickers = new Set(
    listHubCompanies(hubIndex).map((c) => normalizeTicker(c.ticker)).filter(Boolean),
  );
  const { hubHit, ttmFilled, ttmNullLoss, ttmMissingQuote } = await attachHubTtm(
    quotes,
    hubTickers,
    config,
  );
  const ttmAttachRate = hubHit > 0 ? (ttmFilled + ttmNullLoss) / hubHit : 0;
  const ttmPositiveRate = hubHit > 0 ? ttmFilled / hubHit : 0;

  const out = {
    builtAt: new Date().toISOString(),
    recentDd,
    source: 'mdcstat+naver',
    marketBasis: 'fy',
    count: universe,
    universe,
    hubCount: hubTickers.size,
    hubHit,
    ttmFilled,
    ttmNullLoss,
    ttmMissingQuote,
    ttmAttachRate: Math.round(ttmAttachRate * 1000) / 1000,
    ttmFillRate: Math.round(ttmPositiveRate * 1000) / 1000,
    quotes,
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`, 'utf8');
  console.log(
    `Wrote ${OUT_PATH} recentDd=${recentDd} universe=${universe} `
    + `hubHit=${hubHit}/${hubTickers.size} ttm+=${ttmFilled} lossNull=${ttmNullLoss} `
    + `attach=${(ttmAttachRate * 100).toFixed(1)}%`,
  );
  return out;
}

const isMain =
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  buildValuationSnapshot().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
