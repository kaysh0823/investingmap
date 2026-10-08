/**
 * PostgREST bulk upserts reject a batch whose objects do not share one key set.
 * Mixed rows must be split by signature, and missing keys must stay missing
 * (null would overwrite columns under resolution=merge-duplicates).
 */
import assert from 'node:assert/strict';
import {
  groupRowsByKeySignature,
  keyMismatchReport,
  postgrestJsonKeys,
  toSupabaseRow,
} from './sync_quotes_to_supabase.mjs';

const returns = {
  chg_1d_pct: 1.25,
  ret_5d_pct: null,
  ret_20d_pct: null,
  ret_50d_pct: null,
  ret_120d_pct: null,
  ret_200d_pct: null,
};

function quote(last) {
  return {
    last,
    prevClose: 1000,
    open: 990,
    high: 1010,
    low: 980,
    volume: 100,
    high52w: 1200,
    low52w: 800,
    mcapWon: 5_000_000_000_000,
    turnoverWon: 10_000_000,
    per: 8,
    pbr: 0.4,
  };
}

const asOf = '2026-10-08T02:00:00.000Z';
const priced = toSupabaseRow('072710', quote(3200), { rs: 50 }, asOf, true, false, returns, null);
const halted = toSupabaseRow('082640', quote(null), { rs: 40 }, asOf, true, false, returns, null);

assert.equal('last' in priced, true);
assert.equal(priced.last, 3200);
assert.equal('last' in halted, false, 'null last is omitted so merge-duplicates keeps the stored price');
assert.equal(halted.per, 8);
assert.equal(halted.mcap_won, 5_000_000_000_000);

const batch = [];
for (let i = 0; i < 39; i += 1) {
  batch.push({
    ticker: String(72000 + i).padStart(6, '0'),
    last: 1000 + i,
    per: 10,
    pbr: 1,
  });
}
const odd = { ticker: '082640', per: 10, pbr: 1, note: undefined };
batch.push(odd);
const before = JSON.stringify(odd);

const groups = groupRowsByKeySignature(batch);
assert.equal(groups.length, 2, 'one mixed 40-row batch becomes two signature groups, not 40 requests');
assert.equal(JSON.stringify(odd), before, 'grouping must not mutate rows or fill nulls');

const sizes = groups.map((group) => group.length).sort((a, b) => a - b);
assert.deepEqual(sizes, [1, 39]);

const haltedGroup = groups.find((group) => group.some((row) => row.ticker === '082640'));
assert.equal(haltedGroup.length, 1);
const posted = JSON.parse(JSON.stringify(haltedGroup[0]));
assert.equal('last' in posted, false);
assert.equal('note' in posted, false);
assert.equal(posted.per, 10);
assert.equal(posted.pbr, 1);
assert.equal(Object.values(posted).includes(null), false);

for (const group of groups) {
  const signatures = new Set(group.map((row) => postgrestJsonKeys(row).join(',')));
  assert.equal(signatures.size, 1);
}

const report = keyMismatchReport(batch);
assert.match(report, /082640: missing=\[last\]/);
assert.equal(report.includes('072000'), false);

const uniform = groupRowsByKeySignature(batch.slice(0, 39));
assert.equal(uniform.length, 1);
assert.equal(uniform[0].length, 39);

const withUndefinedReturn = toSupabaseRow(
  '073240',
  quote(1500),
  { rs: 1 },
  asOf,
  true,
  false,
  { chg_1d_pct: undefined, ret_5d_pct: 2 },
  null,
);
assert.equal(withUndefinedReturn.chg_1d_pct, null);
assert.equal(withUndefinedReturn.ret_5d_pct, 2);
assert.equal('chg_1d_pct' in withUndefinedReturn, true);

const quoteGroups = groupRowsByKeySignature([priced, halted].map((row) => {
  const {
    _sessionOpen, _sessionHigh, _sessionLow, _sessionClose, _basicLast,
    _basicTradeDate, _sessionVolume, _naverMarketClosed, ...rest
  } = row;
  return rest;
}));
assert.equal(quoteGroups.length, 2);
const haltedPosted = JSON.parse(JSON.stringify(
  quoteGroups.find((group) => group[0].ticker === '082640')[0],
));
assert.equal('last' in haltedPosted, false);
assert.equal(haltedPosted.per, 8);
assert.equal(haltedPosted.session_open, 990);

console.log('verify:postgrest-keys ok');
console.log(keyMismatchReport([priced, halted].map((row) => {
  const {
    _sessionOpen, _sessionHigh, _sessionLow, _basicLast, _basicTradeDate,
    _sessionVolume, _naverMarketClosed, ...rest
  } = row;
  return rest;
})));
