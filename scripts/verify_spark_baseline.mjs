import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
for (const [file, name] of [['hub_dashboard.js', 'sparklineSvg'], ['live_quotes.js', 'formatSpark20Svg']]) {
  const source = fs.readFileSync(new URL('js/' + file, root), 'utf8');
  const context = vm.createContext({});
  for (const fn of ['sparkSegments', name]) {
    const start = source.indexOf('  function ' + fn + '(');
    assert.ok(start >= 0, fn + ' exists');
    const end = source.indexOf('\n  function ', start + 12);
    vm.runInContext(source.slice(start, end), context);
  }
  const render = (values) => name === 'sparklineSvg'
    ? context[name](values.map(v => ({ v })), 0, false)
    : context[name](values.map(v => v + 10), 10);
  for (const values of [[-2, 2], [1, 2], [-2, -1], [0, 0]]) {
    const svg = render(values);
    const line = svg.match(/class="spark-prev-close"[^>]*y1="([\d.]+)"/);
    assert.ok(line, 'previous close line is present');
    assert.ok(+line[1] >= 2 && +line[1] <= 20, 'baseline stays in view');
    assert.ok(svg.indexOf('<line') < svg.indexOf('<polyline'), 'baseline behind price');
    assert.match(svg, /stroke-dasharray="2 2"/);
  }
  const crossed = render([-2, 2]);
  assert.match(crossed, /stroke="#3fb950"/);
  assert.match(crossed, /stroke="#f85149"/);
  assert.equal((crossed.match(/28.000,11.000/g) || []).length, 2, 'split at baseline crossing');
  if (name === 'sparklineSvg') {
    const svg = context[name]([{ v: 2 }], 2, false);
    assert.match(svg, /spark-prev-close/);
    assert.match(svg, /<circle/);
  }
  console.log(file + ': previous-close baseline and crossing checks passed');
}
