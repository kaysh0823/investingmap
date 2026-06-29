/**
 * Hub dashboard aggregation: sector mcap-weighted 1Y return + top-10 price position.
 */

import { getCachedNaverQuotes } from './naver_quote_store.mjs';
import { getAuthKey, fetchHubSectorMcapPair } from './krx_yoy.mjs';
import { krxSessionInfo } from './krx_session.mjs';

export const SECTOR_ORDER = ['semi', 'energy', 'ship', 'defense', 'kculture', 'bio', 'robot'];

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

export function calcQuotePosition(last, hi, lo) {
  if (last == null || hi == null || lo == null) return null;
  if (!Number.isFinite(last) || !Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  if (last >= hi) return 100;
  if (last <= lo) return 0;
  const span = hi - lo;
  if (span <= 0) return null;
  const pct = ((last - lo) / span) * 100;
  return pct < 0 ? 0 : pct > 100 ? 100 : pct;
}

function shouldHideQuote(q) {
  if (!q) return true;
  return q.last === 0 || q.high52w === 0 || q.low52w === 0;
}

function collectUniqueCodes(hubIndex) {
  const codes = [];
  const seen = new Set();
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block || !block.companies) continue;
    for (const c of block.companies) {
      const k = normalizeTicker(c.ticker);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      codes.push(k);
    }
  }
  return codes;
}

function flattenCompanies(hubIndex) {
  const out = [];
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block || !block.companies) continue;
    const mapPath = block.meta && block.meta.map ? block.meta.map : 'index.html';
    for (const c of block.companies) {
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
 * Sector 1Y return = Σ(mcap_recent) / Σ(mcap_252d_ago) − 1 (KRX close-day mcap).
 */
function sectorReturnMcapRatio(companies, mcapNow, mcapPast) {
  let sumNow = 0;
  let sumPast = 0;
  for (const c of companies) {
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
  }
  if (sumPast <= 0) return null;
  return ((sumNow / sumPast) - 1) * 100;
}

function buildSectors(hubIndex, mcapPair) {
  let totalMcap = 0;
  for (const c of flattenCompanies(hubIndex)) {
    totalMcap += c.mcapWon || 0;
  }

  const mcapNow = mcapPair && mcapPair.mcapNow;
  const mcapPast = mcapPair && mcapPair.mcapPast;

  const sectors = {};
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const companies = block.companies || [];
    const sectorMcap = companies.reduce((s, c) => s + (c.mcapWon || 0), 0);
    sectors[sid] = {
      yoyReturnPct: (mcapNow && mcapPast)
        ? sectorReturnMcapRatio(companies, mcapNow, mcapPast)
        : null,
      mcapWon: sectorMcap,
      weightPct: totalMcap > 0 ? (sectorMcap / totalMcap) * 100 : 0,
      listingCount: companies.length,
    };
  }
  return sectors;
}

function buildTop10(hubIndex, items) {
  return flattenCompanies(hubIndex)
    .map((c) => {
      const key = normalizeTicker(c.ticker);
      const q = key ? items[key] : null;
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
    .sort((a, b) => b.positionPct - a.positionPct)
    .slice(0, 10);
}

/**
 * @param {object} hubIndex — parsed data/hub_index.json
 * @param {object|null} env — Cloudflare env (KRX key)
 */
export async function buildHubSectors(hubIndex, env) {
  const authKey = getAuthKey(env);
  const session = krxSessionInfo();
  const mcapPair = authKey ? await fetchHubSectorMcapPair(authKey) : null;

  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: session.regular,
    source: mcapPair ? 'krx-mcap-ratio' : 'hub_index',
    krxConfigured: !!authKey,
    mcapRecentDd: mcapPair ? mcapPair.recentDd : null,
    mcapPastDd: mcapPair ? mcapPair.pastDd : null,
    sectors: buildSectors(hubIndex, mcapPair),
  };
}

/**
 * @param {object} hubIndex
 * @param {object|null} env
 */
export async function buildHubTop10(hubIndex, env) {
  void env;
  const codes = collectUniqueCodes(hubIndex);
  const cached = await getCachedNaverQuotes(codes, {
    concurrency: QUOTE_CONCURRENCY,
    maxFetches: 45,
  });

  return {
    asOf: new Date().toISOString(),
    builtAt: hubIndex.builtAt || null,
    regularSession: cached.regularSession,
    source: 'naver-sise-cache',
    cacheHits: cached.cacheHits,
    naverFetched: cached.fetched,
    top10: buildTop10(hubIndex, cached.items),
  };
}

export async function buildHubDashboard(hubIndex, env) {
  const [sectorsPayload, top10Payload] = await Promise.all([
    buildHubSectors(hubIndex, env),
    buildHubTop10(hubIndex, env),
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
