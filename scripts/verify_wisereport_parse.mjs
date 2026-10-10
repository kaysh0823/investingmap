/**
 * Offline WiseReport annual-consensus parser checks.
 */
import assert from 'node:assert/strict';
import { extractEncparam, parseConsensusAnnual } from '../functions/lib/wisereport_consensus.mjs';
import { computeForwardValuation } from './build_hub_valuation_snapshot.mjs';

function table(headers, epsCells) {
  const head = headers.map((h) => `<th>${h}<br/><span>(IFRS연결)</span></th>`).join('');
  const body = epsCells.map((v) => `<td class="num" title="${v}"><span>${v}</span></td>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>`
    + `<tr><th>EPS(원)</th>${body}</tr></tbody></table>`;
}

assert.equal(extractEncparam("var x = { encparam: 'abc+/=', id: 1 }"), 'abc+/=');
assert.equal(extractEncparam('no token'), null);

// 1. December year-end, three estimate columns.
{
  const html = table(
    ['2024/12', '2025/12', '2026/12(E)', '2027/12(E)', '2028/12(E)'],
    ['4,950', '6,564', '45,419', '67,701', '75,333'],
  );
  const parsed = parseConsensusAnnual(html, '2026-10-10');
  assert.deepEqual(parsed.fy1, { end: '2026-12-31', eps: 45419 });
  assert.deepEqual(parsed.fy2, { end: '2027-12-31', eps: 67701 });
  assert.deepEqual(parsed.fy3, { end: '2028-12-31', eps: 75333 });
}

// 2. Estimate columns present but blank — consensus absent, ends kept.
{
  const html = table(
    ['2025/12', '2026/12(E)', '2027/12(E)'],
    ['1,200', '', '-'],
  );
  const parsed = parseConsensusAnnual(html, '2026-10-10');
  assert.deepEqual(parsed.fy1, { end: '2026-12-31', eps: null });
  assert.deepEqual(parsed.fy2, { end: '2027-12-31', eps: null });
  assert.equal(parsed.fy3, null);
}

// 3. March fiscal year-end.
{
  const html = table(
    ['2026/03', '2027/03(E)', '2028/03(E)'],
    ['800', '-1,250', '900'],
  );
  const parsed = parseConsensusAnnual(html, '2026-10-10');
  assert.deepEqual(parsed.fy1, { end: '2027-03-31', eps: -1250 });
  assert.deepEqual(parsed.fy2, { end: '2028-03-31', eps: 900 });
  assert.equal(parsed.fy3, null);
}

// 4. February "today" drops a prior-year column that is still marked (E).
{
  const html = table(
    ['2025/12(E)', '2026/12(E)', '2027/12(E)'],
    ['6,564', '45,419', '67,701'],
  );
  const parsed = parseConsensusAnnual(html, '2026-02-15');
  assert.deepEqual(parsed.fy1, { end: '2026-12-31', eps: 45419 });
  assert.deepEqual(parsed.fy2, { end: '2027-12-31', eps: 67701 });
  assert.equal(parsed.fy3, null);
}

// Missing EPS row.
{
  const html = '<table><tr><th>2026/12(E)</th></tr><tr><th>매출액</th><td>1</td></tr></table>';
  assert.deepEqual(parseConsensusAnnual(html, '2026-10-10'), {
    fy1: null,
    fy2: null,
    fy3: null,
  });
}

{
  const fwd = computeForwardValuation({
    fy1Eps: 45419,
    fy1End: '2026-12-31',
    fy2Eps: 67701,
    fy2End: '2027-12-31',
    close: 90000,
    epsTtm: 20000,
    recentDd: '20261010',
    fetchedAt: '2026-10-10T01:00:00Z',
  });
  assert.equal(fwd.ftmBasis, 'blend');
  assert.ok(fwd.epsFtm > 45419 && fwd.epsFtm < 67701, `epsFtm ${fwd.epsFtm} between FY1 and FY2`);
  assert.ok(fwd.perFtm > 0 && fwd.peg > 0, `perFtm=${fwd.perFtm} peg=${fwd.peg}`);
  const stale = computeForwardValuation({
    fy1Eps: 45419,
    fy1End: '2026-12-31',
    fy2Eps: 67701,
    fy2End: '2027-12-31',
    close: 90000,
    epsTtm: 20000,
    recentDd: '20261010',
    fetchedAt: '2026-09-01T00:00:00Z',
  });
  assert.equal(stale.epsFtm, null, 'consensus older than 10 days is ignored');
  const fy1Only = computeForwardValuation({
    fy1Eps: 100,
    fy1End: '2026-12-31',
    fy2Eps: null,
    fy2End: null,
    close: 1000,
    epsTtm: 80,
    recentDd: '2026-10-10',
    fetchedAt: '2026-10-10',
  });
  assert.equal(fy1Only.ftmBasis, 'fy1');
  assert.equal(fy1Only.epsFtm, 100);
}

console.log('verify:wisereport-parse ok');
