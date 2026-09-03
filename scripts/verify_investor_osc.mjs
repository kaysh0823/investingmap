/**
 * Unit + optional live checks for investor OSC on ticker_ohlc bars.
 * Usage: node scripts/verify_investor_osc.mjs [ticker]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attachInvestorOscToBars,
  attachInvestorOscToWeeklyBars,
  aggregateDailyBarsToWeekly,
  computeInvestorOscSeries,
  ewmSpan,
  groupInvestorNetByDate,
  investorOscBarKey,
  isoWeekKey,
  INVESTOR_CUM_WINDOWS,
  INVESTOR_OSC_PERIODS,
  WEEKLY_CUM,
  WEEKLY_PERIOD,
  rollingSum,
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

// rolling 5, min_periods=1
assert.deepEqual(rollingSum([1, 2, 3, 4, 5], 5, 1), [1, 3, 6, 10, 15]);

// warmup: cumWindow + period − 1 ⇒ first OSC at bar index (w + p − 2)
{
  const nets = [];
  for (let i = 0; i < 40; i++) nets.push(100 + i * 10);
  const osc10 = computeInvestorOscSeries(nets, 10, 20);
  assert.equal(osc10[27], null, 'OSC null before 20-day range on 10-day cum');
  assert.ok(Number.isFinite(osc10[28]), 'OSC finite at bar 29');
  const osc5 = computeInvestorOscSeries(nets, 5, 20);
  assert.ok(Number.isFinite(osc5[23]), 'OSC finite at bar 24 on 5-day cum');
  assert.ok(Number.isFinite(osc5[27]), '5d OSC ready before 10d at bar 28');
  assert.equal(osc10[27], null, '10d OSC still warming at bar 28');
  const osc10p50 = computeInvestorOscSeries(
    Array.from({ length: 70 }, (_, i) => 100 + (i % 7) * 50),
    10,
    50,
  );
  assert.equal(osc10p50[57], null, 'period-50 OSC null before warmup');
  assert.ok(Number.isFinite(osc10p50[58]), 'period-50 OSC finite after warmup');
  const osc10p20 = computeInvestorOscSeries(
    Array.from({ length: 70 }, (_, i) => 100 + (i % 7) * 50),
    10,
    20,
  );
  assert.ok(Number.isFinite(osc10p20[69]) && Number.isFinite(osc10p50[69]), 'both periods on tail bar');
}

// ewm span=2 null propagation
{
  const ema = ewmSpan([null, null, 50, 60, null, 70], 2);
  assert.equal(ema[1], null);
  assert.equal(ema[2], 50);
  assert.ok(Math.abs(ema[3] - (2 / 3) * 60 - (1 / 3) * 50) < 1e-9);
  assert.ok(Math.abs(ema[4] - ema[3]) < 1e-9, 'null raw keeps previous EMA');
}

// group inst = 3000+3100+6000, frgn = 9000
{
  const grouped = groupInvestorNetByDate([
    { trade_date: '2026-08-28', invst_tp_cd: '3000', net_val: 10 },
    { trade_date: '2026-08-28', invst_tp_cd: '3100', net_val: 20 },
    { trade_date: '2026-08-28', invst_tp_cd: '6000', net_val: 30 },
    { trade_date: '2026-08-28', invst_tp_cd: '9000', net_val: 100 },
  ]);
  assert.equal(grouped.get('2026-08-28').inst, 60);
  assert.equal(grouped.get('2026-08-28').frgn, 100);
}

// attach fields on bars
{
  const bars = [{ t: '2026-08-27' }, { t: '2026-08-28' }];
  const byDate = groupInvestorNetByDate([
    { trade_date: '2026-08-27', invst_tp_cd: '9000', net_val: 1 },
    { trade_date: '2026-08-28', invst_tp_cd: '9000', net_val: 2 },
  ]);
  attachInvestorOscToBars(bars, byDate);
  assert.ok('instOsc5' in bars[0] && 'instOsc10' in bars[0] && 'instOsc20' in bars[0]);
  assert.ok('frgnOsc5' in bars[0] && 'frgnOsc10' in bars[0] && 'frgnOsc20' in bars[0]);
  assert.equal(bars[1].instOsc, bars[1].instOsc10, 'instOsc aliases instOsc10');
  for (const cum of INVESTOR_CUM_WINDOWS) {
    for (const period of INVESTOR_OSC_PERIODS) {
      assert.ok(investorOscBarKey('instOsc', cum, period) in bars[0]);
      assert.ok(investorOscBarKey('frgnOsc', cum, period) in bars[0]);
    }
    assert.equal(
      bars[1][`instOsc${cum}`],
      bars[1][investorOscBarKey('instOsc', cum, 20)],
      `instOsc${cum} aliases period-20`,
    );
  }
}

// weekly: sum daily nets by ISO week, then OSC on weekly series
{
  assert.equal(isoWeekKey('2025-12-29'), isoWeekKey('2026-01-02'), 'same ISO week');
  const daily = [
    { t: '2025-12-29', o: 10, h: 12, l: 8, c: 10, v: 100 },
    { t: '2025-12-30', o: 10, h: 13, l: 9, c: 12, v: 150 },
    { t: '2026-01-02', o: 12, h: 15, l: 11, c: 14, v: 200 },
    { t: '2026-01-05', o: 14, h: 16, l: 13, c: 15, v: 250 },
  ];
  const weekly = aggregateDailyBarsToWeekly(daily);
  assert.equal(weekly.length, 2, 'weekly bar count');
  assert.equal(weekly[0].t, '2026-01-02');
  assert.equal(weekly[0].v, 450);
  const byDate = groupInvestorNetByDate([
    { trade_date: '2025-12-29', invst_tp_cd: '9000', net_val: 10 },
    { trade_date: '2025-12-30', invst_tp_cd: '9000', net_val: 20 },
    { trade_date: '2026-01-02', invst_tp_cd: '9000', net_val: 30 },
    { trade_date: '2026-01-05', invst_tp_cd: '9000', net_val: 40 },
  ]);
  attachInvestorOscToWeeklyBars(weekly, byDate);
  assert.equal(WEEKLY_CUM, 4, 'weekly cum constant');
  assert.equal(WEEKLY_PERIOD, 13, 'weekly period constant');
  assert.ok(
    investorOscBarKey('frgnOsc', WEEKLY_CUM, WEEKLY_PERIOD) in weekly[0],
    'weekly bars get OSC 4/13 fields',
  );
  assert.equal(
    weekly[0].frgnOsc,
    weekly[0][investorOscBarKey('frgnOsc', WEEKLY_CUM, WEEKLY_PERIOD)],
    'weekly frgnOsc aliases 4/13',
  );
  assert.equal(weekly[0].frgnOsc_10_20, null, 'weekly clears daily OSC grid');
}

const ticker = process.argv[2] || '005930';
const env = loadEnv();
const config = getSupabaseConfig(env);
if (config?.url && config?.anonKey) {
  const payload = await fetchTickerOhlcBars(config, ticker, '1y');
  assert.ok(payload.bars.length > 200, '1y bars loaded');
  const withInst = payload.bars.filter((b) => b.instOsc != null);
  const withFrgn = payload.bars.filter((b) => b.frgnOsc != null);
  assert.ok(withInst.length > 0, 'instOsc populated in recent window');
  assert.ok(withFrgn.length > 0, 'frgnOsc populated in recent window');
  const tail = payload.bars.slice(-250);
  const firstInTail = tail.findIndex((b) => b.instOsc != null);
  assert.ok(firstInTail >= 0, 'instOsc present in recent window');

  const last = payload.bars[payload.bars.length - 1];
  assert.ok('instOsc5' in last && 'instOsc10' in last && 'instOsc20' in last);
  assert.ok('frgnOsc5' in last && 'frgnOsc10' in last && 'frgnOsc20' in last);
  assert.equal(last.instOsc, last.instOsc10, 'instOsc aliases 10d');
  for (const cum of [5, 10, 20]) {
    for (const period of [20, 50]) {
      assert.ok(investorOscBarKey('instOsc', cum, period) in last, `${cum}/${period} inst field`);
      assert.ok(investorOscBarKey('frgnOsc', cum, period) in last, `${cum}/${period} frgn field`);
    }
  }
  console.log(
    `Live ${ticker} @ ${last.t}: instOsc_10_20=${last.instOsc_10_20}, instOsc_10_50=${last.instOsc_10_50} ` +
      `(legacy10=${last.instOsc10}; filled ${withInst.length}/${payload.bars.length})`,
  );

  const payload5y = await fetchTickerOhlcBars(config, ticker, '5y');
  assert.ok(payload5y.bars.length > 1000, '5y bars loaded');
  const withInst5y = payload5y.bars.filter((b) => b.instOsc != null);
  assert.ok(
    withInst5y.length >= 1000,
    `5y instOsc filled leftward (got ${withInst5y.length}/${payload5y.bars.length})`,
  );
  console.log(
    `Live 5y ${ticker}: instOsc filled ${withInst5y.length}/${payload5y.bars.length}`,
  );

  const weeklyPayload = await fetchTickerOhlcBars(config, ticker, '1y', { interval: 'weekly' });
  assert.equal(weeklyPayload.interval, 'weekly', 'weekly payload interval');
  assert.ok(weeklyPayload.bars.length > 40, 'weekly bars loaded');
  assert.ok(weeklyPayload.bars.length < payload.bars.length, 'weekly fewer than daily bars');
  const wLast = weeklyPayload.bars[weeklyPayload.bars.length - 1];
  assert.ok(!('instOsc_4_13' in wLast), 'weekly API payload skips OSC attach');
  assert.ok(!('instOsc' in wLast) || wLast.instOsc == null, 'weekly bar has no instOsc');
  console.log(
    `Live weekly ${ticker} @ ${wLast.t}: bars=${weeklyPayload.bars.length}, investor OSC skipped`,
  );
} else {
  console.log('Skipping live Supabase check (SUPABASE_URL/ANON_KEY missing)');
}

console.log('verify_investor_osc: OK');
