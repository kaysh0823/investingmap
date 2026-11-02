/** Offline regression checks for approved semiconductor classification changes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('semiconductor/korea_semiconductor_map.html');
const companies = extractCompaniesFromHtml(html);
assert.equal(new Set(companies.map(c => c.ticker)).size, companies.length);
const byTicker = Object.fromEntries(companies.map(c => [c.ticker, c]));
const expected = { '144960': '공정 부품·유지관리', '110990': '전공정 장비', '241770': '공정 부품·유지관리' };
for (const [ticker, chain] of Object.entries(expected)) {
  assert.equal(byTicker[ticker].chain, chain);
  assert.equal(JSON.parse(read('data/chain_overrides.json')).semi[ticker], chain);
  const row = html.match(new RegExp('<tr data-ticker="' + ticker + '">[\\s\\S]*?</tr>'))[0];
  assert.ok(row.includes('<span class="chain-tag">' + chain + '</span>'));
  for (const folder of ['netmap', 'networks']) {
    const graph = JSON.parse(read('data/' + folder + '/semiconductor.json'));
    const node = graph.nodes.find(n => n.ticker === ticker);
    assert.equal(node.role, byTicker[ticker].semType);
    if (folder === 'netmap') assert.equal(graph.chains[node.chain], chain);
    else {
      assert.equal(node.group, chain);
      const edge = graph.edges.find(e => e.source === node.id && e.type === 'member_of');
      assert.ok(edge);
      assert.equal(graph.nodes.find(n => n.id === edge.target).group, chain);
    }
  }
}
assert.ok(byTicker['241770'].products.includes('히터블록'));
for (const field of ['chainLabel', 'chainFilter']) {
  const dictionaries = [...html.matchAll(new RegExp(field + ': (\\{[^{}\\n]*\\})', 'g'))];
  assert.equal(dictionaries.length, 2);
  for (const [, literal] of dictionaries) {
    const dict = JSON.parse(literal);
    for (const chain of new Set(companies.map(c => c.chain))) assert.ok(dict[chain], field + ' ' + chain);
  }
}
const start = html.indexOf('    const FE_CHAINS =');
const end = html.indexOf('    const REGION_COLORS', start);
const matches = new Function(html.slice(start, end) + '\nreturn chainMatchesFilter;')();
for (const ticker of ['140860', '348210', '144960']) {
  assert.equal(matches(byTicker[ticker].chain, '전공정', ticker), true, ticker);
  assert.equal(matches(byTicker[ticker].chain, '후공정', ticker), false, ticker);
}
for (const ticker of ['039030', '110990', '039440']) {
  assert.equal(matches(byTicker[ticker].chain, '전공정', ticker), true);
  assert.equal(matches(byTicker[ticker].chain, '후공정', ticker), true);
}
for (const ticker of ['440110', '399720', '093520', '402340']) {
  for (const stage of ['전공정', '후공정']) assert.equal(matches(byTicker[ticker].chain, stage, ticker), false);
  assert.equal(matches(byTicker[ticker].chain, byTicker[ticker].chain, ticker), true);
}
assert.ok(html.includes('chainMatchesFilter(c.chain, ch, c.ticker)'));
let count = 0;
for (const [, attributes, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/\bsrc\s*=|application\/ld\+json|type=["']module/.test(attributes) || !code.trim()) continue;
  new vm.Script(code);
  count++;
}
console.log(`PASS: classification, graph membership, static rows, translations, stage filters; ${count} inline scripts parse`);
