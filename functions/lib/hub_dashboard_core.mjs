/**
 * Hub dashboard aggregation: sector mcap-weighted 1Y return + top-10 price position.
 */

import { getCachedNaverQuotes } from './naver_quote_store.mjs';
import { getAuthKey, fetchHubSectorMcapSnapshots } from './krx_yoy.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';
import { buildKrxRsSnapshot } from './krx_rs.mjs';
import { krxSessionInfo, kstAnchorYmd } from './krx_session.mjs';
import { passesMcapFloor } from '../../lib/mcap_policy.mjs';
import { calcQuotePosition } from '../../lib/quote_position.mjs';
import { numOrNull } from './supabase_hub.mjs';

export { calcQuotePosition };

export const SECTOR_ORDER = ['semi', 'energy', 'powergrid', 'ship', 'defense', 'kculture', 'bio', 'robot', 'finance', 'construction'];

const QUOTE_CONCURRENCY = 24;

export function normalizeTicker(ticker) {
  if (ticker == null || ticker === '') return null;
  const s = String(ticker).trim().toUpperCase();
  if (/^[0-9A-Z]{6}$/.test(s)) return s;
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (alnum.length > 6) return alnum.slice(0, 6);
  if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
  if (alnum.length === 6) return alnum;
  return null;
}

function shouldHideQuote(q) {
  if (!q) return true;
  return q.last === 0 || q.high52w === 0 || q.low52w === 0;
}

function collectUniqueCodes(hubIndex) {
  return listHubCompanies(hubIndex)
    .map((c) => normalizeTicker(c.ticker))
    .filter(Boolean);
}

function mergeQuoteFields(base, overlay) {
  if (!overlay) return base;
  const out = base ? { ...base } : {};
  if (overlay.last != null && overlay.last > 0) out.last = overlay.last;
  if (overlay.high52w != null && overlay.high52w > 0) out.high52w = overlay.high52w;
  if (overlay.low52w != null && overlay.low52w > 0) out.low52w = overlay.low52w;
  return Object.keys(out).length ? out : null;
}

function buildTop10(hubIndex, quoteByTicker) {
  const ranked = listHubCompanies(hubIndex)
    .map((c) => {
      const key = normalizeTicker(c.ticker);
      const q = key ? quoteByTicker[key] : null;
      if (shouldHideQuote(q)) return null;
      const positionPct = calcQuotePosition(q.last, q.high52w, q.low52w);
      if (positionPct == null) return null;
      return {
        ticker: c.ticker,
        name: c.name,
        nameEn: c.nameEn,
        sectorId: c.sectorId,
        mapPath: c.mapPath,
        positionPct,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.positionPct - a.positionPct);

  return {
    top10: ranked.slice(0, 10),
    quotesRanked: ranked.length,
  };
}

/** Build hub_top10 payload from a pre-filled quote map (e.g. Supabase stock_quotes_latest). */
export function buildHubTop10PayloadFromQuoteMap(hubIndex, quoteByTicker, opts = {}) {
  const codes = new Set(
    listHubCompanies(hubIndex).map((c) => normalizeTicker(c.ticker)).filter(Boolean),
  );
  const quotesTotal = codes.size;
  const quotesRanked = countQuotesWithPosition(quoteByTicker);
  const { top10 } = buildTop10(hubIndex, quoteByTicker);
  return {
    asOf: opts.asOf || new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    snapshotBuiltAt: opts.snapshotBuiltAt ?? null,
    regularSession: opts.regularSession ?? null,
    source: opts.source || 'supabase',
    quotesTotal,
    quotesRanked,
    coveragePct: quotesTotal > 0 ? Math.round((quotesRanked / quotesTotal) * 1000) / 10 : 0,
    cacheHits: opts.cacheHits ?? 0,
    naverFetched: opts.naverFetched ?? 0,
    top10,
  };
}

/** Build hub_rs_top10 rows from Supabase stock_quotes_latest (rs ordered). */
export function buildHubRsTop10FromSupabaseRows(hubIndex, rows, opts = {}) {
  const byTicker = new Map();
  for (const c of listHubCompanies(hubIndex)) {
    const key = normalizeTicker(c.ticker);
    if (key) byTicker.set(key, c);
  }
  const top10 = [];
  let asOf = opts.asOf || null;
  for (const row of rows) {
    const key = normalizeTicker(row.ticker);
    const c = key ? byTicker.get(key) : null;
    const rs = numOrNull(row.rs);
    if (!c || rs == null) continue;
    if (row.as_of && !asOf) asOf = row.as_of;
    top10.push({
      ticker: c.ticker,
      name: c.name,
      nameEn: c.nameEn,
      sectorId: c.sectorId,
      mapPath: c.mapPath,
      rs,
      rs20: numOrNull(row.rs20),
      rs50: numOrNull(row.rs50),
      rs120: numOrNull(row.rs120),
    });
    if (top10.length >= 10) break;
  }
  const companies = listHubCompanies(hubIndex);
  let quotesRanked = 0;
  for (const c of companies) {
    const key = normalizeTicker(c.ticker);
    if (!key) continue;
    const match = rows.find((r) => normalizeTicker(r.ticker) === key);
    if (match && numOrNull(match.rs) != null) quotesRanked += 1;
  }
  return {
    asOf: asOf || new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    snapshotBuiltAt: null,
    source: opts.source || 'supabase',
    quotesTotal: companies.length,
    quotesRanked,
    coveragePct: companies.length > 0
      ? Math.round((quotesRanked / companies.length) * 1000) / 10
      : 0,
    top10,
  };
}

/** Map sector_returns rows + hub_index into hub_sectors payload shape. */
export function buildHubSectorsFromSupabaseRows(hubIndex, rows, env, opts = {}) {
  const session = krxSessionInfo();
  const horizon = opts.horizon != null ? normalizeSectorHorizon(opts.horizon) : null;
  const rowById = new Map();
  for (const row of rows) {
    if (row && row.sector_id) rowById.set(row.sector_id, row);
  }

  let totalMcap = 0;
  for (const c of flattenCompanies(hubIndex)) {
    totalMcap += c.mcapWon || 0;
  }

  const sectors = {};
  let updatedAt = null;
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const companies = block.companies || [];
    const sectorMcap = companies.reduce((s, c) => s + (c.mcapWon || 0), 0);
    const row = rowById.get(sid);
    if (row && row.updated_at && !updatedAt) updatedAt = row.updated_at;
    sectors[sid] = {
      return1dPct: null,
      return20dPct: row ? numOrNull(row.ret_20d_pct) : null,
      return50dPct: row ? numOrNull(row.ret_50d_pct) : null,
      return120dPct: row ? numOrNull(row.ret_120d_pct) : null,
      return250dPct: row ? numOrNull(row.ret_250d_pct) : null,
      mcapWon: sectorMcap,
      weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
      listingCount: companies.length,
    };
  }

  return {
    asOf: updatedAt || new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: session.regular,
    horizon: horizon || 'all',
    source: 'supabase',
    krxConfigured: !!getAuthKey(env),
    mcapRecentDd: null,
    effectiveAnchorDd: kstAnchorYmd(),
    mcapPast1dDd: null,
    mcapPast20dDd: null,
    mcapPast50dDd: null,
    mcapPast120dDd: null,
    mcapPast250dDd: null,
    sectors,
  };
}

function uniqueCompaniesForTop10(hubIndex) {
  const byKey = new Map();
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block || !block.companies) continue;
    const mapPath = block.meta && block.meta.map ? block.meta.map : 'index.html';
    for (const c of block.companies) {
      const key = normalizeTicker(c.ticker);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        ticker: c.ticker,
        name: c.name || '',
        nameEn: c.nameEn || c.name || '',
        mcapWon: c.mcapWon || 0,
        sectorId: sid,
        mapPath,
      });
    }
  }
  return [...byKey.values()];
}

/** @param {object} hubIndex */
export function listHubCompanies(hubIndex) {
  return uniqueCompaniesForTop10(hubIndex);
}

function countQuotesWithPosition(quoteByTicker) {
  let n = 0;
  for (const q of Object.values(quoteByTicker)) {
    if (!shouldHideQuote(q) && calcQuotePosition(q.last, q.high52w, q.low52w) != null) n++;
  }
  return n;
}

export function countTop10Sectors(top10) {
  const s = new Set();
  for (const row of top10 || []) {
    if (row && row.sectorId) s.add(row.sectorId);
  }
  return s.size;
}

function flattenCompanies(hubIndex) {
  const out = [];
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block || !block.companies) continue;
    const mapPath = block.meta && block.meta.map ? block.meta.map : 'index.html';
    for (const c of block.companies) {
      if (!passesMcapFloor(c)) continue;
      out.push({
        ticker: c.ticker,
        name: c.name || '',
        nameEn: c.nameEn || c.name || '',
        mcapWon: c.mcapWon || 0,
        sectorId: sid,
        mapPath,
      });
    }
  }
  return out;
}

/**
 * Sector return = Σ(mcap_recent) / Σ(mcap_past) − 1 for hub-listed names with both snapshots.
 */
function sectorReturnMcapRatio(companies, mcapNow, mcapPast) {
  let sumNow = 0;
  let sumPast = 0;
  let coveredHubMcap = 0;
  let totalHubMcap = 0;
  for (const c of companies) {
    totalHubMcap += c.mcapWon || 0;
    const key = normalizeTicker(c.ticker);
    if (!key) continue;
    const now = mcapNow.get(key);
    const past = mcapPast.get(key);
    if (
      now == null || past == null
      || !Number.isFinite(now) || !Number.isFinite(past)
      || now <= 0 || past <= 0
    ) {
      continue;
    }
    sumNow += now;
    sumPast += past;
    coveredHubMcap += c.mcapWon || 0;
  }
  if (sumPast <= 0 || totalHubMcap <= 0) return null;
  if (coveredHubMcap / totalHubMcap < 0.35) return null;
  return ((sumNow / sumPast) - 1) * 100;
}

function buildSectors(hubIndex, snapshots) {
  let totalMcap = 0;
  for (const c of flattenCompanies(hubIndex)) {
    totalMcap += c.mcapWon || 0;
  }

  const mcapNow = snapshots && snapshots.mcapNow;
  const mcapPast1d = snapshots && snapshots.mcapPast1d;
  const mcapPast20d = snapshots && snapshots.mcapPast20d;
  const mcapPast50d = snapshots && snapshots.mcapPast50d;
  const mcapPast120d = snapshots && snapshots.mcapPast120d;
  const mcapPast250d = snapshots && snapshots.mcapPast250d;

  const sectors = {};
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const companies = block.companies || [];
    const sectorMcap = companies.reduce((s, c) => s + (c.mcapWon || 0), 0);
    sectors[sid] = {
      return1dPct: (mcapNow && mcapPast1d)
        ? sectorReturnMcapRatio(companies, mcapNow, mcapPast1d)
        : null,
      return20dPct: (mcapNow && mcapPast20d)
        ? sectorReturnMcapRatio(companies, mcapNow, mcapPast20d)
        : null,
      return50dPct: (mcapNow && mcapPast50d)
        ? sectorReturnMcapRatio(companies, mcapNow, mcapPast50d)
        : null,
      return120dPct: (mcapNow && mcapPast120d)
        ? sectorReturnMcapRatio(companies, mcapNow, mcapPast120d)
        : null,
      return250dPct: (mcapNow && mcapPast250d)
        ? sectorReturnMcapRatio(companies, mcapNow, mcapPast250d)
        : null,
      mcapWon: sectorMcap,
      weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
      listingCount: companies.length,
    };
  }
  return sectors;
}

/**
 * @param {object} hubIndex — parsed data/hub_index.json
 * @param {object|null} env — Cloudflare env (KRX key)
 */
export async function buildHubSectors(hubIndex, env, opts = {}) {
  const authKey = getAuthKey(env);
  const session = krxSessionInfo();
  const horizon = opts.horizon != null ? normalizeSectorHorizon(opts.horizon) : null;
  const horizons = horizon ? [horizon] : ['1d', '20d', '50d', '120d', '250d'];
  const snapshots = authKey ? await fetchHubSectorMcapSnapshots(authKey, { horizons }) : null;

  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: session.regular,
    horizon: horizon || 'all',
    source: snapshots ? 'krx-mcap-ratio' : 'hub_index',
    krxConfigured: !!authKey,
    mcapRecentDd: snapshots ? snapshots.recentDd : null,
    effectiveAnchorDd: kstAnchorYmd(),
    mcapPast1dDd: snapshots ? snapshots.past1dDd : null,
    mcapPast20dDd: snapshots ? snapshots.past20dDd : null,
    mcapPast50dDd: snapshots ? snapshots.past50dDd : null,
    mcapPast120dDd: snapshots ? snapshots.past120dDd : null,
    mcapPast250dDd: snapshots ? snapshots.past250dDd : null,
    sectors: buildSectors(hubIndex, snapshots),
  };
}

/**
 * @param {object} hubIndex
 * @param {object|null} env
 * @param {Request|null} [request]
 * @param {{ snapshot?: object|null }} [opts]
 */
export async function buildHubTop10(hubIndex, env, request, opts) {
  void env;
  const codes = collectUniqueCodes(hubIndex);
  const snapshot = (opts && opts.snapshot !== undefined)
    ? opts.snapshot
    : (request ? await loadHubQuoteSnapshotFromRequest(request, env) : null);
  const snapshotQuotes = snapshot && snapshot.quotes ? snapshot.quotes : {};

  const quoteByTicker = {};
  for (const code of codes) {
    const base = snapshotQuotes[code] || null;
    quoteByTicker[code] = base ? { ...base } : null;
  }

  const cached = await getCachedNaverQuotes(codes, {
    concurrency: QUOTE_CONCURRENCY,
  });

  for (const code of codes) {
    const merged = mergeQuoteFields(quoteByTicker[code], cached.items[code]);
    if (merged) quoteByTicker[code] = merged;
  }

  const quotesTotal = codes.length;
  const quotesRanked = countQuotesWithPosition(quoteByTicker);
  const { top10 } = buildTop10(hubIndex, quoteByTicker);

  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    snapshotBuiltAt: snapshot ? snapshot.builtAt || null : null,
    regularSession: cached.regularSession,
    source: snapshot ? 'hub_quote_snapshot+naver-cache' : 'naver-sise-cache',
    quotesTotal,
    quotesRanked,
    coveragePct: quotesTotal > 0 ? Math.round((quotesRanked / quotesTotal) * 1000) / 10 : 0,
    cacheHits: cached.cacheHits,
    naverFetched: cached.fetched,
    top10,
  };
}

export async function buildHubDashboard(hubIndex, env, request, opts) {
  const topOpts = opts && opts.snapshot !== undefined ? { snapshot: opts.snapshot } : undefined;
  const [sectorsPayload, top10Payload] = await Promise.all([
    buildHubSectors(hubIndex, env),
    buildHubTop10(hubIndex, env, request, topOpts),
  ]);

  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: top10Payload.regularSession,
    source: sectorsPayload.krxConfigured ? 'krx-mcap-ratio+naver-sise' : 'naver-sise-cache',
    cacheHits: top10Payload.cacheHits,
    naverFetched: top10Payload.naverFetched,
    sectors: sectorsPayload.sectors,
    top10: top10Payload.top10,
  };
}

export async function loadHubIndexFromRequest(request, env) {
  const url = new URL('/data/hub_index.json', request.url);
  let res;
  if (env && env.ASSETS) {
    res = await env.ASSETS.fetch(new Request(url));
  } else {
    res = await fetch(url.toString(), { cf: { cacheTtl: 300 } });
  }
  if (!res.ok) throw new Error('hub_index_unavailable');
  return res.json();
}

export async function loadHubQuoteSnapshotFromRequest(request, env) {
  const url = new URL('/data/hub_quote_snapshot.json', request.url);
  let res;
  if (env && env.ASSETS) {
    res = await env.ASSETS.fetch(new Request(url));
  } else {
    res = await fetch(url.toString(), { cf: { cacheTtl: 300 } });
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function hubTop10Cacheable(payload) {
  if (!payload || !payload.top10 || payload.top10.length < 10) return false;
  if ((payload.coveragePct || 0) < 85) return false;
  return countTop10Sectors(payload.top10) >= 2;
}

export async function loadHubRsSnapshotFromRequest(request, env) {
  const url = new URL('/data/hub_rs_snapshot.json', request.url);
  let res;
  if (env && env.ASSETS) {
    res = await env.ASSETS.fetch(new Request(url));
  } else {
    res = await fetch(url.toString(), { cf: { cacheTtl: 300 } });
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function buildHubRsTop10(hubIndex, rsSnapshot) {
  const quotes = rsSnapshot && rsSnapshot.quotes ? rsSnapshot.quotes : {};
  return listHubCompanies(hubIndex)
    .map((c) => {
      const key = normalizeTicker(c.ticker);
      const q = key ? quotes[key] : null;
      if (!q || q.rs == null) return null;
      return {
        ticker: c.ticker,
        name: c.name,
        nameEn: c.nameEn,
        sectorId: c.sectorId,
        mapPath: c.mapPath,
        rs: q.rs,
        rs20: q.rs20,
        rs50: q.rs50,
        rs120: q.rs120,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rs - a.rs)
    .slice(0, 10);
}

/**
 * @param {object} hubIndex
 * @param {object|null} env
 * @param {Request|null} [request]
 * @param {{ snapshot?: object|null }} [opts]
 */
export async function buildHubRsTop10Payload(hubIndex, env, request, opts) {
  let snapshot = (opts && opts.snapshot !== undefined)
    ? opts.snapshot
    : (request ? await loadHubRsSnapshotFromRequest(request, env) : null);

  if ((!snapshot || !snapshot.quotes || !Object.keys(snapshot.quotes).length) && env) {
    const authKey = getAuthKey(env);
    if (authKey) {
      const live = await buildKrxRsSnapshot(authKey);
      if (live && live.quotes) snapshot = live;
    }
  }

  const companies = listHubCompanies(hubIndex);
  const quotes = snapshot && snapshot.quotes ? snapshot.quotes : {};
  let quotesRanked = 0;
  for (const c of companies) {
    const key = normalizeTicker(c.ticker);
    if (key && quotes[key] && quotes[key].rs != null) quotesRanked += 1;
  }
  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    snapshotBuiltAt: snapshot ? snapshot.builtAt || null : null,
    source: snapshot ? 'hub_rs_snapshot' : 'missing',
    quotesTotal: companies.length,
    quotesRanked,
    coveragePct: companies.length > 0
      ? Math.round((quotesRanked / companies.length) * 1000) / 10
      : 0,
    top10: buildHubRsTop10(hubIndex, snapshot),
  };
}

export function hubRsTop10Cacheable(payload) {
  return !!(payload && payload.top10 && payload.top10.length >= 10 && (payload.coveragePct || 0) >= 85);
}
