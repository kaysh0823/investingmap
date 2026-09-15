/**
 * Cross-API return consistency: quotes / hub_sectors / trend / calendar tip
 * share the same meta + aggregateSectorReturns math.
 *
 * Usage:
 *   BASE_URL=https://… npm run verify:returns-consistency
 *   (defaults to http://127.0.0.1:8788 when unset)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  listHubCompanies,
  normalizeTicker,
  SECTOR_ORDER,
} from '../functions/lib/hub_dashboard_core.mjs';
import { aggregateSectorReturns } from '../functions/lib/returns_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const SAMPLE_SECTORS = ['bigchip', 'semi', 'bio'].filter((s) => SECTOR_ORDER.includes(s));

async function getJson(pathname) {
  const url = `${BASE}${pathname}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${pathname} non-JSON ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(`${pathname} ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

function metaKey(m) {
  return {
    anchorDd: m?.anchorDd ?? null,
    numeratorMode: m?.numeratorMode ?? null,
    refsRecentDd: m?.refsRecentDd ?? null,
    k: m?.k ?? null,
  };
}

function assertMetaEqual(a, b, label) {
  const A = metaKey(a);
  const B = metaKey(b);
  assert.deepEqual(B, A, `${label} meta mismatch ${JSON.stringify(A)} vs ${JSON.stringify(B)}`);
}

async function main() {
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const tickers = listHubCompanies(hub).map((c) => normalizeTicker(c.ticker)).filter(Boolean);
  assert.ok(tickers.length > 100, 'hub tickers');

  const codesParam = tickers.join(',');
  const [quotes, sectors, trend] = await Promise.all([
    getJson(`/api/quotes?codes=${encodeURIComponent(codesParam)}&nocache=1`),
    getJson('/api/hub_sectors?horizon=1d&nocache=1'),
    getJson('/api/hub_sector_trend?horizon=1d&nocache=1'),
  ]);

  assertMetaEqual(quotes, sectors, 'quotes vs hub_sectors');
  if (trend.anchorDd != null || trend.numeratorMode != null) {
    assertMetaEqual(quotes, trend, 'quotes vs hub_sector_trend');
  }

  const year = new Date().getFullYear();
  const calendars = {};
  for (const sid of SAMPLE_SECTORS) {
    calendars[sid] = await getJson(
      `/api/sector_perf_calendar?sector=${sid}&year=${year}&nocache=1`,
    );
    assertMetaEqual(quotes, calendars[sid], `quotes vs calendar(${sid})`);
  }

  // (b) sector returnXdPct == aggregate from quote members
  for (const sid of SECTOR_ORDER) {
    const block = hub.sectors?.[sid];
    if (!block) continue;
    const members = [];
    for (const c of block.companies || []) {
      const t = normalizeTicker(c.ticker);
      const item = quotes.items?.[t];
      const refShares = sectors.sectors?.[sid] ? true : true;
      // Reconstruct from quotes display returns is wrong — use items last + need closes.
      // Instead re-check using hub_sectors vs recomputed from quotes chg fields
      // only for 1d via shares from calendar tip path:
      void refShares;
      void item;
    }
  }

  // Recompute from hub_return_refs + quotes last using same aggregate helper.
  const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_return_refs.json'), 'utf8'));
  const k = quotes.k ?? 0;
  for (const sid of SECTOR_ORDER) {
    const block = hub.sectors?.[sid];
    const card = sectors.sectors?.[sid];
    if (!block || !card) continue;
    const members = [];
    for (const c of block.companies || []) {
      const t = normalizeTicker(c.ticker);
      const refQ = refs.quotes?.[t];
      const item = quotes.items?.[t];
      if (!refQ?.closes?.length || !item) continue;
      const shares = refQ.shares;
      if (shares == null || !(shares > 0)) continue;
      const numerator = item.last;
      if (numerator == null || !(numerator > 0)) continue;
      members.push({ numerator, closes: refQ.closes, k, shares });
    }
    const agg = aggregateSectorReturns(members);
    const pairs = [
      ['return1dPct', 'chg1dPct'],
      ['return5dPct', 'ret5dPct'],
      ['return20dPct', 'ret20dPct'],
      ['return50dPct', 'ret50dPct'],
      ['return120dPct', 'ret120dPct'],
      ['return200dPct', 'ret200dPct'],
    ];
    for (const [apiKey, aggKey] of pairs) {
      if (card[apiKey] == null || agg[aggKey] == null) continue;
      assert.equal(
        card[apiKey],
        agg[aggKey],
        `${sid} ${apiKey}: card=${card[apiKey]} agg=${agg[aggKey]}`,
      );
    }
  }

  // (c) hub_sector_trend tip == hub_sectors return1dPct
  function trendSeriesMap(payload) {
    if (!payload || payload.error) return {};
    if (payload.trends && typeof payload.trends === 'object') return payload.trends;
    const meta = new Set([
      'horizon', 'asOf', 'tradeDate', 'regularSession', 'sessionOpen',
      'numeratorMode', 'anchorDd', 'refsRecentDd', 'k', 'synthesized',
      'source', 'stale', 'error', 'message', 'base', 'sectors', 'indices',
    ]);
    const out = {};
    for (const [key, val] of Object.entries(payload)) {
      if (meta.has(key)) continue;
      if (Array.isArray(val)) out[key] = val;
    }
    return out;
  }

  const sparkMap = trendSeriesMap(trend);
  for (const sid of SAMPLE_SECTORS) {
    const series = sparkMap[sid];
    const card = sectors.sectors?.[sid]?.return1dPct;
    if (!series?.length || card == null) continue;
    const last = series[series.length - 1]?.v;
    assert.equal(last, card, `trend tip ${sid}: ${last} vs card ${card}`);
  }

  // (d) calendar tipRet1dPct == sector return1dPct
  for (const sid of SAMPLE_SECTORS) {
    const cal = calendars[sid];
    const card = sectors.sectors?.[sid]?.return1dPct;
    if (cal?.tipRet1dPct == null || card == null) continue;
    assert.equal(cal.tipRet1dPct, card, `calendar tip ${sid}`);
  }

  // (e) bigchip == 005930 + 000660 only
  {
    const members = [];
    for (const t of ['005930', '000660']) {
      const refQ = refs.quotes?.[t];
      const item = quotes.items?.[t];
      if (!refQ?.closes?.length || !item?.last || !refQ.shares) continue;
      members.push({
        numerator: item.last,
        closes: refQ.closes,
        k,
        shares: refQ.shares,
      });
    }
    const agg = aggregateSectorReturns(members);
    const card = sectors.sectors?.bigchip;
    assert.ok(card, 'bigchip sector');
    if (agg.chg1dPct != null && card.return1dPct != null) {
      assert.equal(card.return1dPct, agg.chg1dPct, 'bigchip 1d');
    }
  }

  // (f)(g)(h) hub_trend chart tip == hub_sectors / hub_sector_trend
  const [hubTrend1d, hubTrend20d, hubTrend200d] = await Promise.all([
    getJson('/api/hub_trend?horizon=1d&nocache=1&cb=1'),
    getJson('/api/hub_trend?horizon=20d&nocache=1&cb=1'),
    getJson('/api/hub_trend?horizon=200d&nocache=1&cb=1'),
  ]);
  assertMetaEqual(quotes, hubTrend1d, 'quotes vs hub_trend 1d');

  function sectorTipPct(payload, sid) {
    const entry = (payload.sectors || []).find((s) => s.sector === sid);
    const series = entry?.series;
    if (!series?.length) return null;
    const v = series[series.length - 1]?.v;
    if (v == null || !Number.isFinite(v)) return null;
    return Math.round((v - 100) * 100) / 100;
  }

  for (const sid of SAMPLE_SECTORS) {
    const card1 = sectors.sectors?.[sid]?.return1dPct;
    const tip1 = sectorTipPct(hubTrend1d, sid);
    if (card1 != null && tip1 != null) {
      assert.equal(tip1, card1, `(f) hub_trend 1d tip ${sid}`);
    }
    const card20 = sectors.sectors?.[sid]?.return20dPct;
    const tip20 = sectorTipPct(hubTrend20d, sid);
    if (card20 != null && tip20 != null) {
      assert.equal(tip20, card20, `(g) hub_trend 20d tip ${sid}`);
    }
    const card200 = sectors.sectors?.[sid]?.return200dPct;
    const tip200 = sectorTipPct(hubTrend200d, sid);
    if (card200 != null && tip200 != null) {
      assert.equal(tip200, card200, `(g) hub_trend 200d tip ${sid}`);
    }
    // (h) hub_trend 1d tip (base100→%) == hub_sector_trend last %
    const sparkLast = sparkMap[sid]?.length
      ? sparkMap[sid][sparkMap[sid].length - 1]?.v
      : null;
    if (tip1 != null && sparkLast != null) {
      assert.equal(tip1, sparkLast, `(h) hub_trend==spark ${sid}`);
    }
  }

  console.log(
    `verify:returns-consistency OK — base=${BASE} `
    + `mode=${quotes.numeratorMode} anchor=${quotes.anchorDd} k=${quotes.k} `
    + `sectors=${Object.keys(sectors.sectors || {}).length}`
    + ` hub_trend1d_synth=${!!hubTrend1d.synthesized}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
