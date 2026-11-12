/**
 * Investor supply checks. Pass a ticker to also verify the configured Supabase feed.
 * Usage: node scripts/verify_investor_osc.mjs [ticker]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateDailyBarsToWeekly,
  attachInvestorSupplyToBars,
  groupInvestorNetByDate,
} from '../functions/lib/investor_osc.mjs';
import { fetchTickerOhlcBars, getSupabaseConfig } from '../functions/lib/ticker_ohlc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const bars = Array.from({ length: 165 }, (_, i) => ({
  t: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
  c: 100,
}));
const rows = bars.flatMap(({ t }, i) => {
  // Individual nets sum to i + 1 KRW. The excluded codes must have no effect.
  return [
    ['3000', i],
    ['3100', -1],
    ['6000', 2],
    ['9000', 0],
    ['9001', 500],
    ['2000', 500],
  ].map(([invst_tp_cd, net_val]) => ({ trade_date: t, invst_tp_cd, net_val }));
});

const byDate = groupInvestorNetByDate(rows);
const fields = ['institutionalBandwidthRank', 'foreignBandwidthRank'];
attachInvestorSupplyToBars(bars, byDate);
assert.deepEqual(fields.map((key) => bars[71][key]), [null, null], '50 widths are required');
assert.deepEqual(fields.map((key) => bars[72][key]), [50, 50], 'tied widths rank at 50');

const last = bars.at(-1);
const lastNet = byDate.get(last.t);
lastNet.set('9000', 1000);
attachInvestorSupplyToBars(bars, byDate);
assert.equal(last.foreignBandwidthRank, 100, 'largest foreign width ranks at 100');
assert.equal(last.institutionalBandwidthRank, 50, 'foreign flow cannot affect the institutional rank');
const week = aggregateDailyBarsToWeekly(bars).at(-1);
assert.equal(week.t, last.t);
for (const key of fields) assert.equal(week[key], last[key]);

lastNet.delete('9000');
lastNet.set('6000', 1000);
lastNet.delete('3100');
attachInvestorSupplyToBars(bars, byDate);
assert.equal(last.institutionalBandwidthRank, 100, 'sum the available institutional categories');
assert.equal(last.foreignBandwidthRank, null, 'foreign data is missing despite institutional activity');

const missingDay = bars[153];
byDate.delete(missingDay.t);
attachInvestorSupplyToBars(bars, byDate);
assert.deepEqual(fields.map((key) => missingDay[key]), [null, null], 'unreported session stays blank');
const nextDay = bars[154];
const observedBars = bars.filter(({ t }) => byDate.has(t)).map(({ t }) => ({ t }));
attachInvestorSupplyToBars(observedBars, byDate);
const nextObserved = observedBars.find(({ t }) => t === nextDay.t);
for (const key of fields) {
  assert.ok(Number.isFinite(nextDay[key]), 'rank resumes on the next reported session');
  assert.equal(nextDay[key], nextObserved[key]);
}

const ticker = process.argv[2];
if (ticker) {
  const config = getSupabaseConfig(loadEnv());
  assert.ok(config, 'Supabase credentials required for a live check');
  const daily = await fetchTickerOhlcBars(config, ticker, '1y');
  const weekly = await fetchTickerOhlcBars(config, ticker, '1y', { interval: 'weekly' });
  for (const key of fields) {
    assert.ok(daily.bars.some((bar) => Number.isFinite(bar[key])), 'live daily ' + key);
    assert.ok(weekly.bars.some((bar) => Number.isFinite(bar[key])), 'live weekly ' + key);
  }
  const dailyByDate = new Map(daily.bars.map((bar) => [bar.t, bar]));
  for (const bar of weekly.bars) {
    const day = dailyByDate.get(bar.t);
    for (const key of fields) assert.equal(bar[key], day[key]);
  }
}

console.log('verify_investor_osc: OK');
