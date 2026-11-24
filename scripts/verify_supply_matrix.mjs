import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { aggregateSupply, onRequestGet } from '../functions/api/supply_matrix.js';
import { SUPPLY_FOREIGN_CODE, SUPPLY_INSTITUTION_CODE } from '../functions/lib/supply_investor_codes.mjs';

const dates = Array.from({ length: 50 }, (_, i) => new Date(Date.UTC(2026, 10, 20 - i)).toISOString().slice(0, 10));
const rows = dates.flatMap((date) => [
  { ticker: '005930', trade_date: date, invst_tp_cd: SUPPLY_INSTITUTION_CODE, net_val: '20' },
  { ticker: '005930', trade_date: date, invst_tp_cd: SUPPLY_FOREIGN_CODE, net_val: '-10' },
]);
const expected = Object.fromEntries([5, 10, 20, 50].map((days) => [days, {
  institution: 20 * days, foreign: -10 * days,
}]));
assert.deepEqual(aggregateSupply(rows, dates), { '005930': expected });
assert.deepEqual(aggregateSupply(rows.filter((_, i) => i !== 11), dates), { '005930': { 5: expected[5] } });
assert.deepEqual(aggregateSupply(rows.map((row, i) => i < 10 ? { ...row, net_val: '0' } : row), dates)['005930'][5],
  { institution: 0, foreign: 0 });

const request = (codes) => new Request('https://example.test/api/supply_matrix?codes=' + codes);
assert.equal((await onRequestGet({ request: request('invalid'), env: {} })).status, 400);
assert.equal((await onRequestGet({ request: request('005930'), env: {} })).status, 503);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => {
    const query = new URL(url).searchParams;
    if (query.get('ticker') === 'eq.005930') {
      if (query.get('invst_tp_cd') === `eq.${SUPPLY_INSTITUTION_CODE}`) {
        assert.equal(query.get('limit'), '1');
        return Response.json([{ trade_date: dates[0] }]);
      }
      assert.equal(query.get('trade_date'), 'lte.' + dates[0]);
      const sessions = url.includes('stock_price_history') ? dates : dates.filter((_, i) => i !== 6);
      return Response.json(sessions.map((trade_date) => ({ trade_date })));
    }
    assert.equal(query.get('ticker'), 'in.(005930)');
    assert.equal(query.get('invst_tp_cd'), `in.(${SUPPLY_INSTITUTION_CODE},${SUPPLY_FOREIGN_CODE})`);
    assert.ok(query.get('trade_date').includes(dates[6]), 'price history supplies a skipped flow session');
    return Response.json(rows);
  };
  const response = await onRequestGet({
    request: request('005930,005930'),
    env: { SUPABASE_URL: 'https://db.example.test', SUPABASE_ANON_KEY: 'test' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { asOf: dates[0], totals: { '005930': expected } });
} finally {
  globalThis.fetch = originalFetch;
}

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
for (const file of ['semiconductor/korea_semiconductor_front_map.html', 'bio/korea_bio_map.html']) {
  const { document } = parseHTML(read(file));
  assert.equal(document.getElementById('tab-btn-momentum').nextElementSibling.id, 'tab-btn-supply-matrix');
  assert.ok(document.querySelector('#tab-supply-matrix #supply-matrix-root'));
}
const { document } = parseHTML('<div id="supply-matrix-root"></div>');
const container = document.getElementById('supply-matrix-root');
const window = { location: { search: '' } };
let fetches = 0;
vm.runInNewContext(read('js/map_supply_matrix.js'), {
  document, window, URLSearchParams,
  async fetch(url) {
    assert.equal(url, '/api/supply_matrix?codes=005930');
    fetches += 1;
    return Response.json({ asOf: dates[0], totals: { '005930': { 5: expected[5] } } });
  },
});
window.InvestingMapSupplyMatrix.render({
  container, companies: [{ ticker: '005930', mcapWon: 10000 }], lang: 'ko',
});
await new Promise((resolve) => setImmediate(resolve));
assert.match(container.querySelector('.supply-status').textContent, /1\/1/);
assert.match(container.querySelector('.supply-status').textContent, /시장 대비 RS/);
assert.deepEqual([...container.querySelectorAll('.supply-filters button')].map((button) => button.textContent),
  ['5일', '10일', '20일', '50일']);
container.querySelector('button[data-days="50"]').onclick();
assert.equal(container.querySelector('button[data-days="50"]').getAttribute('aria-pressed'), 'true');
assert.match(container.querySelector('.supply-status').textContent, /종목이 없습니다/);
assert.equal(fetches, 1);
console.log('verify_supply_matrix OK');
