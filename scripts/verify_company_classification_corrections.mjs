/** Independent curated expectations guard reviewed facts in both sources and deploy output. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { HUB_MAP_PATHS, SECTOR_META } from '../lib/sector_meta.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';
import { MOBILITY_04C } from '../lib/mobility_04c_chain_ui.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p,dist=false)=>fs.readFileSync(path.join(ROOT,dist?'dist':'',p),'utf8');
const expected=[
 {ticker:'003280',sector:'shipping',id:'ship_heung_a_shipping',chain:'케미컬탱커',old:'컨테이너 해운',graph:'chemical_tanker'},
 {ticker:'004310',sector:'bio',id:'bio_62',chain:'종합 제약',old:'바이오시밀러',graph:'pharma'},
 {ticker:'002790',sector:'cosmetics',id:'cos_002790',chain:'지주회사',old:'화장품 브랜드',graph:'holdings'},
];
const manifest=JSON.parse(read('data/company_classification_corrections.json')).rows;
assert.equal(manifest.length,3);
assert.equal(new Set(manifest.map(r=>r.ticker)).size,3);
const chainOverrides=JSON.parse(read('data/chain_overrides.json'));
const fieldOverrides=JSON.parse(read('data/ticker_field_overrides.json'));
const additions=JSON.parse(read('bio/cp_list_bio_additions.json'));
const hub=JSON.parse(read('data/hub_index.json',true));
assert.equal(Object.keys(hub.sectors).length,24,'retain the 24-sector structure');
assert.deepEqual(Object.keys(hub.sectors).sort(),Object.keys(SECTOR_META).sort());
const search=JSON.parse(read('data/search_index.json',true));
const allMaps=HUB_MAP_PATHS.flatMap(([sector,p])=>extractCompaniesFromHtml(read(p,true)).map(c=>({...c,home:sector})));
const verifyCompany=(c,e)=>{
 assert.equal(c.id,e.id,`${e.ticker}: preserve company identity`);
 assert.equal(c.chain,e.chain,`${e.ticker}: approved business classification`);
};
for(const e of expected) {
 const rule=manifest.find(r=>r.ticker===e.ticker);
 assert.equal(rule.sector,e.sector);
 assert.equal(rule.id,e.id);
 assert.equal(rule.fields.chain,e.chain,'manifest must match the independently reviewed expectation');
 assert.equal(chainOverrides[e.sector][e.ticker],e.chain,'chain source cannot restore the old fact');
 assert.equal(fieldOverrides[e.ticker].byIndustry[e.sector].chain,e.chain,'field source cannot restore the old fact');
 const hits=allMaps.filter(c=>c.ticker===e.ticker);
 assert.equal(hits.length,1,`${e.ticker}: exactly one map home`);
 const company=hits[0];
 assert.equal(company.home,e.sector,'no sector move');
 verifyCompany(company,e);
 // Prove every previous misclassification is detected, without touching files.
 assert.throws(()=>verifyCompany({...company,chain:e.old},e),/approved business classification/);
 for(const [key,value] of Object.entries(rule.fields))assert.equal(company[key],value,`${e.ticker}: ${key} survives rebuild`);
 for(const key of ['semType','semTypeEn','products','productsEn'])assert.equal(fieldOverrides[e.ticker][key],rule.fields[key]);
 const sourcePath=e.sector==='bio'?'bio/korea_bio_map.inline.js':SECTOR_META[e.sector].map;
 verifyCompany(extractCompaniesFromHtml(read(sourcePath)).find(c=>c.ticker===e.ticker),e);
 const hubHits=Object.entries(hub.sectors).flatMap(([sector,s])=>s.companies.filter(c=>c.ticker===e.ticker).map(c=>({sector,...c})));
 assert.equal(hubHits.length,1);assert.equal(hubHits[0].sector,e.sector);
 const searchHits=search.filter(c=>c.t===e.ticker);assert.equal(searchHits.length,1);assert.equal(searchHits[0].s,e.sector);
 const html=read(sourcePath,true);
 assert.ok(html.match(/const CHAIN_COLORS\s*=\s*(\{[^;]+\});/),'chain color dictionary');
 const colors=Function('return ('+html.match(/const CHAIN_COLORS\s*=\s*(\{[^;]+\});/)[1]+')')();
 assert.ok(colors[e.chain],`${e.ticker}: visible chain color`);
 const graph=JSON.parse(read('data/netmap/'+e.sector+'.json',true));
 const node=graph.nodes.find(n=>n.ticker===e.ticker);
 assert.ok(node);assert.equal(node.chain,e.graph);assert.equal(graph.chains[e.graph],e.chain);
 assert.equal(node.role,rule.fields.semType);
}
assert.equal(additions.find(c=>c.ticker==='004310').chain,'종합 제약');
assert.equal(additions.find(c=>c.ticker==='004310').sectorId,'pharma_integrated');
assert.ok(MOBILITY_04C.shipping.chains.includes('케미컬탱커'));
assert.equal(MOBILITY_04C.shipping.labelEn['케미컬탱커'],'Chemical tankers');
const shipping=read('shipping/korea_shipping_map.html',true);
assert.ok((shipping.match(/Chemical tankers/g)||[]).length>=2,'English labels and filters');
for(const match of shipping.matchAll(/const chains\s*=\s*(\[[^\];]*\]);/g))assert.ok(Function('return ('+match[1]+')')().includes('케미컬탱커'),'chain must be available in filters and legend');
console.log('verify:company-classification OK — 3 corrected facts, source overrides, identities, unchanged homes, search, graphs, bilingual chain UI; all 3 reversion probes rejected');
