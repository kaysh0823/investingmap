import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
const read=p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8');
const baseline=JSON.parse(fs.readFileSync(new URL('../data/construction_machinery_merge.json',import.meta.url),'utf8'));
const hub=JSON.parse(read('data/hub_index.json'));
const companies=extractCompaniesFromHtml(read('construction/korea_construction_map.html'));
assert.equal(Object.keys(hub.sectors).length,24);
assert.ok(!hub.sectors.machinery);
assert.ok(!fs.existsSync(new URL('../dist/machinery',import.meta.url)));
assert.equal(hub.sectors.construction.meta.ko,'건설/기계');
const all=Object.values(hub.sectors).flatMap(s=>s.companies);
for(const old of baseline.companies) {
 const current=companies.filter(c=>c.ticker===old.ticker);
 assert.equal(current.length,1,old.ticker+' unique unified membership');
 assert.equal(current[0].id,old.id,old.ticker+' stable identity');
 assert.equal(current[0].chain,old.chain,old.ticker+' preserved value chain');
 assert.equal(all.filter(c=>c.ticker===old.ticker).length,1,old.ticker+' no duplicate aggregate');
}
assert.equal(all.length,new Set(all.map(c=>c.ticker)).size);
assert.match(read('_redirects'),/\/machinery\/korea_machinery_map\.html\s+\/construction\/korea_construction_map\.html\s+301/);
for(const file of ['js/sector_nav.js','js/global_bottom_nav.js','js/desktop_sidebar_nav.js','js/global_search.js']) assert.ok(!/id:\s*'machinery'|machinery:\s*'machinery\//.test(read(file)),file+' retired menu');
assert.ok(!read('index.html').includes('id="hub-link-machinery"'));
assert.ok(!read('sitemap.xml').includes('/machinery/'));
console.log('verify:construction-machinery OK — preserved '+baseline.companies.length+' stocks and chains, unique membership, 24 sectors, retired URL redirects');
