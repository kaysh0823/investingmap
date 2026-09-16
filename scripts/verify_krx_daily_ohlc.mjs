/**
 * verify:krx-daily-ohlc — normalizeKrxCode + 0015G0≠000150 regression.
 *
 * Usage:
 *   npm run verify:krx-daily-ohlc
 *   node scripts/verify_krx_daily_ohlc.mjs --live[=20260916]
 */
import assert from 'node:assert/strict';
import { normalizeKrxCode } from '../functions/lib/krx_code.mjs';
import {
  fetchKrxDailyOhlc,
  parseDailyOhlcCsv,
  parseDailyOhlcJson,
} from '../functions/lib/krx_daily_ohlc.mjs';
import { loadEnv } from './lib/investor_net_supabase.mjs';

assert.equal(normalizeKrxCode('000150'), '000150');
assert.equal(normalizeKrxCode('150'), '000150');
assert.equal(normalizeKrxCode('0015G0'), '0015G0');
assert.equal(normalizeKrxCode('0015g0'), '0015G0');
assert.equal(normalizeKrxCode('0088D0'), '0088D0');
assert.equal(normalizeKrxCode('0120G0'), '0120G0');
assert.notEqual(normalizeKrxCode('0015G0'), normalizeKrxCode('000150'));
assert.equal(normalizeKrxCode(''), null);
assert.equal(normalizeKrxCode('12'), '000012');

// Synthetic CSV: alphanumeric then ordinary — must stay separate keys.
{
  const csv = [
    '종목코드,종목명,시장구분,소속부,종가,등락폭,등락률,시가,고가,저가,거래량,거래대금,시가총액,상장주식수',
    '"0015G0","그린광학","KOSDAQ","기술성장기업부","13980","50","0.36","14000","14020","13570","1","1","1","1"',
    '"000150","두산","KOSPI",,"1384000","95000","7.37","1297000","1397000","1273000","1","1","1","1"',
  ].join('\n');
  const rows = parseDailyOhlcCsv(csv);
  const by = new Map(rows.map((r) => [r.ticker, r]));
  assert.ok(by.has('0015G0'), '0015G0 kept as own key');
  assert.ok(by.has('000150'), '000150 kept as own key');
  assert.equal(by.get('000150').close, 1_384_000);
  assert.equal(by.get('0015G0').close, 13_980);
}

{
  const json = {
    OutBlock_1: [
      { ISU_SRT_CD: '0015G0', ISU_ABBRV: '그린광학', TDD_CLSPRC: '13,980' },
      { ISU_SRT_CD: '000150', ISU_ABBRV: '두산', TDD_CLSPRC: '1,384,000' },
    ],
  };
  const rows = parseDailyOhlcJson(json);
  const by = new Map(rows.map((r) => [r.ticker, r]));
  assert.equal(by.get('000150').close, 1_384_000);
  assert.equal(by.get('0015G0').close, 13_980);
}

const liveArg = process.argv.slice(2).find((a) => a.startsWith('--live'));
if (liveArg) {
  const dayYmd = liveArg.includes('=')
    ? liveArg.split('=')[1].replace(/\D/g, '')
    : '20260916';
  const env = loadEnv();
  const map = await fetchKrxDailyOhlc(dayYmd, env);
  assert.ok(map.has('000150'), 'live map has 000150');
  assert.ok(map.has('0015G0'), 'live map has 0015G0 as separate key');
  assert.notEqual(map.get('000150')?.close, map.get('0015G0')?.close);
  const doosan = map.get('000150').close;
  assert.ok(
    doosan >= 1_200_000 && doosan <= 1_500_000,
    `000150 close ${doosan} should be ~1.3M on ${dayYmd}`,
  );
  console.log(
    `verify:krx-daily-ohlc live OK — ${dayYmd} 000150=${doosan} 0015G0=${map.get('0015G0').close}`,
  );
}

console.log(
  'verify:krx-daily-ohlc OK — normalizeKrxCode preserves 0015G0≠000150; CSV/JSON parse split',
);
