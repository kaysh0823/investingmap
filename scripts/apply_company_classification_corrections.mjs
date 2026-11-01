/** Reapply approved facts after legacy builders, without changing membership or IDs. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { HUB_MAP_PATHS } from '../lib/sector_meta.mjs';
import { MOBILITY_04C } from '../lib/mobility_04c_chain_ui.mjs';
import { esc, extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rows=JSON.parse(fs.readFileSync(path.join(ROOT,'data/company_classification_corrections.json'),'utf8')).rows;
assert.equal(rows.length,3);
for(const [sector,rel] of HUB_MAP_PATHS) {
 const changes=rows.filter(r=>r.sector===sector);
 if(!changes.length)continue;
 const file=path.join(ROOT,rel);
 let html=fs.readFileSync(file,'utf8');
 const companies=extractCompaniesFromHtml(html);
 for(const row of changes) {
   const hits=companies.filter(c=>c.ticker===row.ticker);
   assert.equal(hits.length,1,`${row.ticker}: must already have exactly one existing home`);
   assert.equal(hits[0].id,row.id,`${row.ticker}: preserve identity`);
   Object.assign(hits[0],row.fields);
 }
 html=patchKoreanCompaniesHtml(html,companies);
 if(sector==='shipping') {
   const cfg=MOBILITY_04C.shipping;
   html=html.replace(/const CHAIN_COLORS\s*=\s*\{[^;]+\};/,'const CHAIN_COLORS = '+JSON.stringify(cfg.colors)+';');
   html=html.replace(/const chains\s*=\s*(\[[^\];]*\]);/g,(_,literal)=>{
     const chains=Function('return ('+literal+')')();
     if(!chains.includes('케미컬탱커'))chains.push('케미컬탱커');
     return 'const chains = ['+chains.map(c=>"'"+esc(c)+"'").join(', ')+'];';
   });
   for(const field of ['chainLabel','chainFilter']) {
     let index=0;
     const re=new RegExp('(["\']?'+field+'["\']?\\s*:\\s*)\\{([^{}]*)\\}','g');
     html=html.replace(re,(_,prefix,body)=>{
       const dict=Function('return ({'+body+'})')();
       dict['케미컬탱커']=index++%2?'Chemical tankers':'케미컬탱커';
       return prefix+(prefix.trim().startsWith('"')?JSON.stringify(dict,null,4).replace(/\n/g,'\n        '):JSON.stringify(dict));
     });
   }
 }
 fs.writeFileSync(file,html);
 for(const folder of ['netmap','networks']) {
   const file=path.join(ROOT,'data',folder,sector+'.json');
   if(!fs.existsSync(file))continue;
   const graph=JSON.parse(fs.readFileSync(file,'utf8'));
   for(const row of changes) {
     const nodes=(graph.nodes||[]).filter(n=>n.ticker===row.ticker||n.id==='krx:'+row.ticker||n.legacyId===row.id);
     for(const node of nodes) {
       node.role=row.fields.semType;
       if(folder==='netmap') {
         graph.chains[row.graphChain]=row.fields.chain;
         node.chain=row.graphChain;
       } else if('group' in node) node.group=row.fields.sectorId||row.fields.chain;
     }
   }
   fs.writeFileSync(file,JSON.stringify(graph,null,2)+'\n');
 }
}
console.log('OK company classification corrections — 3 facts, existing sectors and IDs preserved');
