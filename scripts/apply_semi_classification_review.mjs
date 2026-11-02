/** Local-only semiconductor corrections. No build, network, commit or deployment. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { extractCompaniesFromHtml, esc } from '../lib/map_company_serialize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);
const json = rel => JSON.parse(read(rel));
const save = (rel, value) => write(rel, JSON.stringify(value, null, 2) + '\n');
export const corrections = {
  '144960': { chain: '공정 부품·유지관리', semType: 'RF 전원·플라즈마 발생장치', semTypeEn: 'RF power and remote plasma sources', products: '증착·식각 장비용 RF Generator·Matcher·Remote Plasma Generator', productsEn: 'RF generators, matching networks and remote plasma generators for deposition and etch equipment' },
  '110990': { chain: '전공정 장비', semType: '레이저 어닐링·광학검사 장비', semTypeEn: 'Laser annealing and optical inspection equipment', products: 'DRAM·NAND·SiC 웨이퍼 레이저 어닐링 시스템, AOI·비전 검사장비', productsEn: 'Laser annealing systems for DRAM, NAND and SiC wafers; AOI and vision inspection equipment' },
  '241770': { chain: '공정 부품·유지관리', semType: '히터블록·반도체 정밀부품', semTypeEn: 'Heater blocks and precision semiconductor parts', products: '반도체 공정용 히터블록·정밀부품 (기존 화학소재 사업 매각)', productsEn: 'Heater blocks and precision parts for semiconductor processes (legacy chemicals business divested)' },
};
const source = {
  '144960': 'https://www.newpower.co.kr/mobile/sub_eng/sub_02_02.php',
  '110990': 'https://kind.krx.co.kr/external/2026/05/15/000683/20260515001442/11013.htm',
  '241770': 'https://www.emdgroup.com/en/news/q4-2022-02-03-2023.html',
};
const file = 'semiconductor/korea_semiconductor_map.html';
let html = read(file);
const before = extractCompaniesFromHtml(html);
for (const [ticker, fields] of Object.entries(corrections)) {
  const company = before.find(c => c.ticker === ticker);
  assert.ok(company, ticker);
  // Edit only this company block, preserving existing tags, relationships and prices.
  const start = html.indexOf("id: '" + company.id + "', name:");
  const end = html.indexOf('\n      }', start);
  assert.ok(start >= 0 && end > start, ticker + ' block');
  let block = html.slice(start, end);
  for (const [key, value] of Object.entries(fields)) {
    const re = new RegExp('\\b' + key + ": '(?:\\\\.|[^'\\\\])*'");
    assert.ok(re.test(block), ticker + ' ' + key);
    block = block.replace(re, () => key + ": '" + esc(value) + "'");
  }
  html = html.slice(0, start) + block + html.slice(end);
  // Keep the existing static table row and financial cells; replace facts only.
  const oldRow = html.match(new RegExp('<tr data-ticker="' + ticker + '">[\\s\\S]*?</tr>'))?.[0];
  if (oldRow) {
    let row = oldRow;
    for (const key of ['chain', 'semType', 'products']) row = row.split(company[key]).join(fields[key]);
    html = html.replace(oldRow, () => row);
  }
}
// Stage is distinct from business role. Design and distribution are not wafer stages.
const fe = ['파운드리', '전공정 장비', '공정 소재', '공정 부품·유지관리', '팹 인프라·지원설비'];
const be = ['패키징 장비', '검사·계측 장비', '기판·패키징 소재', '메모리 모듈·서버 기판', '테스트 부품·인터페이스', '패키징·테스트 서비스'];
html = html.replace(/const FE_CHAINS = \[[^\]]+\];/, 'const FE_CHAINS = ' + JSON.stringify(fe) + ';');
html = html.replace(/const BE_CHAINS = \[[^\]]+\];/, 'const BE_CHAINS = ' + JSON.stringify(be) + ';');
const stages = { '140860': ['전공정'], '348210': ['전공정'], '039030': ['전공정', '후공정'], '110990': ['전공정', '후공정'], '039440': ['전공정', '후공정'] };
html = html.replace(/    const SEMI_PROCESS_STAGES = [^\n]+;\r?\n/, '');
html = html.replace('    function chainMatchesFilter(companyChain, filter)', '    function chainMatchesFilter(companyChain, filter, ticker)');
html = html.replace(/    function chainMatchesFilter\(companyChain, filter, ticker\) \{[\s\S]*?\n    \}/, `    const SEMI_PROCESS_STAGES = ${JSON.stringify(stages)};
    function chainMatchesFilter(companyChain, filter, ticker) {
      filter = normalizeChainFilter(filter);
      if (filter === 'all') return true;
      if (filter === '전공정' || filter === '후공정') {
        const stages = SEMI_PROCESS_STAGES[ticker];
        if (stages) return stages.includes(filter);
        return (filter === '전공정' ? FE_CHAINS : BE_CHAINS).includes(companyChain);
      }
      return companyChain === filter;
    }`);
html = html.replaceAll('chainMatchesFilter(c.chain, ch)', 'chainMatchesFilter(c.chain, ch, c.ticker)');
for (const key of ['chainLabel', 'chainFilter']) {
  let i = 0;
  html = html.replace(new RegExp(key + ': (\\{[^{}\\n]*\\})', 'g'), (_, literal) => {
    const dict = JSON.parse(literal);
    const en = i++ % 2;
    dict['메모리 모듈·서버 기판'] = en ? 'Memory modules & server boards' : '메모리 모듈·서버 기판';
    if (key === 'chainLabel') {
      dict['전공정'] = en ? 'Front-end (wafer processing and supporting equipment)' : '전공정 (웨이퍼 제조·공정 소재·부품·설비)';
      dict['후공정'] = en ? 'Back-end (packaging, testing, modules and boards)' : '후공정 (패키징·테스트·모듈·기판)';
    }
    return key + ': ' + JSON.stringify(dict);
  });
}
write(file, html);
const chains = json('data/chain_overrides.json');
const fields = json('data/ticker_field_overrides.json');
for (const [ticker, change] of Object.entries(corrections)) {
  chains.semi[ticker] = change.chain;
  fields[ticker] ??= {};
  fields[ticker].byIndustry ??= {};
  fields[ticker].byIndustry.semi = { ...fields[ticker].byIndustry.semi, ...change, review_status: 'corrected', review_evidence: source[ticker], needs_review: false };
}
save('data/chain_overrides.json', chains);
save('data/ticker_field_overrides.json', fields);
for (const folder of ['netmap', 'networks']) {
  const rel = 'data/' + folder + '/semiconductor.json';
  const graph = json(rel);
  for (const [ticker, change] of Object.entries(corrections)) {
    const node = graph.nodes.find(n => n.ticker === ticker);
    assert.ok(node, rel + ' ' + ticker);
    node.role = change.semType;
    const chainKey = ticker === '110990' ? 'front_equip' : 'process_parts';
    if (folder === 'netmap') node.chain = chainKey;
    else {
      node.group = change.chain;
      for (const edge of graph.edges.filter(e => e.type === 'member_of' && e.source === node.id)) {
        edge.target = 'group:' + chainKey;
        edge.id = 'member-' + chainKey + '-' + ticker;
        edge.labelKo = change.chain + ' 밸류체인 분류';
        edge.labelEn = (ticker === '110990' ? 'Front-end equipment' : 'Process parts & MRO') + ' value-chain grouping';
      }
    }
  }
  save(rel, graph);
}
const after = extractCompaniesFromHtml(html);
assert.deepEqual(after.map(c => [c.ticker, c.id, c.mcapWon, c.per, c.pbr]), before.map(c => [c.ticker, c.id, c.mcapWon, c.per, c.pbr]));
console.log('OK: semiconductor classification review applied locally; membership, IDs and financial values preserved');
