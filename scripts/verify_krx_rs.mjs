import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  percentileRanks,
  RS_WEIGHTS,
  compositeRs,
  rsUniverseExclusionReason,
  isOrdinaryShareForRs,
} from '../functions/lib/krx_rs.mjs';
import { ffillLimited } from '../functions/lib/krx_rs_from_history.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.deepEqual(RS_WEIGHTS, { rs20: 0.1, rs50: 0.2, rs120: 0.3, rs200: 0.4 });
assert.equal(
  RS_WEIGHTS.rs20 + RS_WEIGHTS.rs50 + RS_WEIGHTS.rs120 + RS_WEIGHTS.rs200,
  1,
  'RS weights must sum to 1',
);

assert.equal(compositeRs({ rs20: 100, rs50: 100, rs120: 100, rs200: 100 }), 100);
assert.equal(compositeRs({ rs20: 0, rs50: 0, rs120: 0, rs200: 0 }), 0);
assert.equal(compositeRs({ rs20: 80, rs50: 60, rs120: 40, rs200: 20 }), 40);
assert.equal(compositeRs({ rs20: 80, rs50: 60, rs120: 40 }), 53.3);
assert.equal(compositeRs({ rs20: 50 }), 50);
assert.equal(compositeRs({}), null);

const ranks = percentileRanks([
  { code: 'A', ret: -5 },
  { code: 'B', ret: 0 },
  { code: 'C', ret: 10 },
  { code: 'D', ret: 10 },
]);
assert.equal(ranks.get('A'), 25);
assert.equal(ranks.get('B'), 50);
assert.equal(ranks.get('C'), 75);
assert.equal(ranks.get('D'), 75);

const allZero = percentileRanks([
  { code: 'X', ret: 0 },
  { code: 'Y', ret: 0 },
]);
assert.equal(allZero.get('X'), 50);
assert.equal(allZero.get('Y'), 50);

const solo = percentileRanks([{ code: 'Z', ret: 3 }]);
assert.equal(solo.get('Z'), 100);

assert.equal(rsUniverseExclusionReason('005930', '삼성전자'), null);
assert.equal(isOrdinaryShareForRs('005930', '삼성전자'), true);
assert.equal(rsUniverseExclusionReason('005935', '삼성전자우'), 'preferred');
assert.equal(rsUniverseExclusionReason('00104K', 'CJ4우(전환)'), 'preferred');
assert.equal(rsUniverseExclusionReason('000000', '테스트스팩'), 'spac');
assert.equal(rsUniverseExclusionReason('000000', '기업인수목적회사'), 'spac');
assert.equal(rsUniverseExclusionReason('000000', '롯데리츠'), 'reit');
assert.equal(rsUniverseExclusionReason('000000', 'KODEX ETF'), 'etf_etn');

assert.deepEqual(
  ffillLimited([10, null, null, 12, null], 2),
  [10, 10, 10, 12, 12],
);
assert.deepEqual(
  ffillLimited([10, null, null, null], 2),
  [10, 10, 10, null],
  'ffill stops after limit',
);

const src = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'krx_rs.mjs'), 'utf8');
assert.ok(src.includes('RS_WEIGHTS'), 'krx_rs must define RS_WEIGHTS');
assert.ok(src.includes('compositeRs'), 'krx_rs must export compositeRs');
assert.ok(src.includes("key: 'rs200'"), 'krx_rs must include rs200 period');
assert.ok(src.includes('rs200: 0.4'), 'krx_rs must weight rs200 at 0.4');
assert.ok(src.includes('krx_rs_from_history'), 'history path wired');
assert.ok(src.includes('buildRsSnapshotFromHistory') || src.includes('from_history'));

const histSrc = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'krx_rs_from_history.mjs'), 'utf8');
assert.ok(histSrc.includes('stock_price_history'), 'history path reads stock_price_history');
assert.ok(histSrc.includes('applyPriceAdjustmentsToBars'), 'same adj as ticker_ohlc');
assert.ok(histSrc.includes('market_index_daily'), 'indices from market_index_daily');
assert.ok(histSrc.includes('ffillLimited') && histSrc.includes('RS_FFILL_LIMIT'), 'halt ffill≤20');
assert.ok(histSrc.includes('supabase-history-adj'), 'source tag');

const buildSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'build_hub_rs_snapshot.mjs'), 'utf8');
assert.ok(buildSrc.includes('getSupabaseConfig'), 'build injects Supabase');
assert.ok(buildSrc.includes('preferServiceRole'), 'build prefers service role key');

console.log(
  'verify:krx-rs OK — weights, min/pct, ordinary universe, history+adj+ffill path',
);
