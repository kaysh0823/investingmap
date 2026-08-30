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
  computeInvestorOscSeries,
  ewmSpan,
  groupInvestorNetByDate,
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

// warmup: first 19 OSC values null (need 20 cum for range)
{
  const nets = new Array(30).fill(100);
  const osc = computeInvestorOscSeries(nets);
  assert.equal(osc[18], null, 'OSC null before 20-day cum window');
  assert.ok(Number.isFinite(osc[19]), 'OSC finite at bar 20');
  assert.ok(osc[19] >= 0 && osc[19] <= 100, 'OSC clipped 0-100');
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
  assert.ok('instOsc' in bars[0] && 'frgnOsc' in bars[0]);
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
  const early = payload.bars.slice(0, 30);
  const earlyInst = early.filter((b) => b.instOsc != null);
  assert.ok(earlyInst.length < early.length, 'warmup left edge has null instOsc');

  const last = payload.bars[payload.bars.length - 1];
  console.log(
    `Live ${ticker} @ ${last.t}: instOsc=${last.instOsc}, frgnOsc=${last.frgnOsc} ` +
      `(filled inst=${withInst.length}/${payload.bars.length}, frgn=${withFrgn.length}/${payload.bars.length})`,
  );
} else {
  console.log('Skipping live Supabase check (SUPABASE_URL/ANON_KEY missing)');
}

console.log('verify_investor_osc: OK');
