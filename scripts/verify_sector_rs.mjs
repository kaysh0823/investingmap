import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildSectorRs, RS_PERIODS, percentileRanks } from '../functions/lib/krx_rs.mjs';

const groups = {
  semi: { meta: { ko: '반도체', en: 'Semiconductor', map: 'semiconductor/korea_semiconductor_map.html' }, companies: [{ ticker: 'A' }, { ticker: 'B' }, { ticker: 'A' }, { ticker: 'MISSING' }] },
  empty: { companies: [{ ticker: 'MISSING' }] },
};
const pool = [{ code: 'A', ret: -10 }, { code: 'B', ret: 30 }, { code: 'C', ret: 5 }, { code: '__KOSPI', ret: 0 }, { code: '__KOSDAQ', ret: 10 }];
const pools = Object.fromEntries(RS_PERIODS.map(({ key }) => [key, pool]));
const caps = Object.fromEntries(RS_PERIODS.map(({ key }) => [key, new Map([['A', 3], ['B', 1]])]));
const before = JSON.stringify(pools);
const result = buildSectorRs(groups, pools, caps);
assert.equal(result.semi.ret5, 0, 'period-start caps yield -10*75% + 30*25%');
assert.equal(result.semi.rs5, 33.3, 'minimum tie rank in stock/index pool including this sector');
assert.equal(result.semi.coverage.rs5, 2, 'deduplicate members and exclude missing data');
assert.equal(result.semi.members, 3);
assert.equal(result.empty.rs5, null, 'no fabricated RS for missing data');
assert.equal(result.empty.rs, null);
assert.equal(JSON.stringify(pools), before, 'sector insertion must not modify stock/index pools');
assert.deepEqual([...percentileRanks(pool)], [...percentileRanks(pools.rs5)]);
assert.equal(buildSectorRs(groups, pools, { ...caps, rs10: new Map() }).semi.rs10, null, 'missing starting caps excluded');
const zeroPools = Object.fromEntries(RS_PERIODS.map(({ key }) => [key, [{ code: 'A', ret: 0 }]]));
assert.equal(buildSectorRs(groups, zeroPools, caps).semi.rs5, 50, 'all-zero return pool uses the existing neutral rule');

const context = { location: { pathname: '/semiconductor/korea_semiconductor_map' } };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../js/map_momentum.js', import.meta.url), 'utf8'), context);
const resolve = context.InvestingMapMomentum._test.sectorIndexForPage;
assert.equal(resolve(result, '/semiconductor/korea_semiconductor_map.html').id, 'semi');
assert.equal(resolve(result, '/semiconductor/korea_semiconductor_map').id, 'semi');
assert.equal(resolve(result, '/bio/korea_bio_map'), null);
assert.equal(resolve(undefined, '/semiconductor/korea_semiconductor_map'), null);

// API ingestion must preserve sector benchmarks through the public getter.
vm.runInContext(fs.readFileSync(new URL('../js/live_quotes.js', import.meta.url), 'utf8'), context);
context.InvestingMapLiveQuotes.rememberMomentumIndices({ indices: { KOSPI: { rs: 50, rs5: 30 }, sectors: result } });
assert.equal(context.InvestingMapLiveQuotes.getMomentumIndices().sectors.semi.rs5, 33.3);
console.log('verify:sector-rs OK — cap weighting, ties, missing data, unchanged pools, page routing and API ingestion');
