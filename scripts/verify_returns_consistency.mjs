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

  // (c) trend last == hub_sectors return1dPct
  for (const sid of SAMPLE_SECTORS) {
    const series = trend.trends?.[sid];
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

  console.log(
    `verify:returns-consistency OK — base=${BASE} `
    + `mode=${quotes.numeratorMode} anchor=${quotes.anchorDd} k=${quotes.k} `
    + `sectors=${Object.keys(sectors.sectors || {}).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
