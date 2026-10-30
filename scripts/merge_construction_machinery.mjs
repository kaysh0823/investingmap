/** Final taxonomy step: preserve legacy builders, publish one construction/machinery home. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml, esc } from '../lib/map_company_serialize.mjs';
import { HUB_MAP_PATHS } from '../lib/sector_meta.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');
const write = (p,s) => fs.writeFileSync(path.join(ROOT,p),s);
const json = p => JSON.parse(read(p));
const save = (p,v) => write(p,JSON.stringify(v,null,2)+'\n');
const sourcePath = 'machinery/korea_machinery_map.html';
const targetPath = 'construction/korea_construction_map.html';
const source = read(sourcePath);
let target = read(targetPath);
const incoming = extractCompaniesFromHtml(source);
const companies = [...new Map([...extractCompaniesFromHtml(target),...incoming].map(c=>[c.ticker,c])).values()];
target = patchKoreanCompaniesHtml(target, companies.map(c=>({...c,sectorId:c.sectorId==='machinery'?'construction':c.sectorId})));
const literal = (text,name) => Function('return ('+text.match(new RegExp('const '+name+'\\s*=\\s*(\\{[^;]+\\}|\\[[\\s\\S]*?\\]);'))[1]+')')();
const colors = {...literal(target,'CHAIN_COLORS'),...literal(source,'CHAIN_COLORS')};
target = target.replace(/const CHAIN_COLORS\s*=\s*\{[^;]+\};/,'const CHAIN_COLORS = '+JSON.stringify(colors)+';');
target = target.replace(/const (chains|CURATED_CHAIN_ORDER|SECTOR_ORDER)\s*=\s*(\[[^\];]*\]);/g,(stmt,name,arr)=>{
  if(arr.includes('...')) return stmt;
  const values=Function('return ('+arr+')')();
  for(const c of companies) if(!values.includes(c.chain)) values.push(c.chain);
  return 'const '+name+' = ['+values.map(c=>"'"+esc(c)+"'").join(', ')+'];';
});
for(const field of ['chainLabel','chainFilter']) {
  const re = new RegExp('"'+field+'"\\s*:\\s*(\\{[^}]*\\})','g');
  const additions=[...source.matchAll(re)].map(m=>JSON.parse(m[1]));
  let n=0;
  target=target.replace(re,(_,old)=>'"'+field+'": '+JSON.stringify({...JSON.parse(old),...additions[n++]},null,2));
}
const globals = [...new Map([...literal(target,'globalCompanies'),...literal(source,'globalCompanies')].map(c=>[c.id,c])).values()];
target=target.replace(/const globalCompanies\s*=\s*\[[\s\S]*?\];/,'const globalCompanies = '+JSON.stringify(globals,null,2)+';');
write(targetPath,target);

// Merge graph nodes and evidence edges without inventing relationships.
const a=json('data/netmap/construction.json'), b=json('data/netmap/machinery.json');
a.chains={...a.chains,...b.chains};
a.chains.end_customer='그룹·발주처·유통';
a.chains.global_peer='글로벌 건설·건자재·기계';
for(const key of ['nodes','edges']) a[key]=[...new Map([...a[key],...b[key]].map(v=>[v.id,v])).values()];
for(const n of a.nodes) if(companies.some(c=>c.ticker===n.ticker||n.id==='krx:'+c.ticker)) n.type='kr_listed';
save('data/netmap/construction.json',a);

function remap(value) {
  if(Array.isArray(value)) return value.map(remap);
  if(!value||typeof value!=='object') return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='string' ? (['sector','sectorId','dataSector','homeSector'].includes(k)&&v==='machinery'?'construction':v.replace(/machinery\/korea_machinery_map(?:\.html)?/g,targetPath)) : remap(v)]));
}
for(const dir of ['data/netmap','data/networks']) for(const name of fs.readdirSync(path.join(ROOT,dir))) if(name.endsWith('.json')) save(dir+'/'+name,remap(json(dir+'/'+name)));
save('data/cross_relations.json',remap(json('data/cross_relations.json')));

const pages=['index.html','about.html','authors.html','faq.html','privacy.html','disclaimer.html','editorial-policy.html',...HUB_MAP_PATHS.map(([,p])=>p).filter(p=>p.endsWith('.html'))];
for(const p of pages) {
  let s=read(p);
  if(p==='index.html') {
    s=s.replace(/<a\b[^>]*id="hub-link-machinery"[^>]*>[\s\S]*?<\/a>/g,'');
    // Old translation code is guarded; remove the obsolete ID from generic loops.
    s=s.replace(/'machinery',\s*/g,'');
  }
  s=s.replace(/<a\b[^>]*href=["'][^"']*machinery\/korea_machinery_map[^"']*["'][^>]*>[\s\S]*?<\/a>/g,'');
  s=s.replace(/machinery\/korea_machinery_map(?:\.html)?/g,targetPath);
  s=s.replace(/한국 건설 투자 지도/g,'한국 건설/기계 투자 지도').replace(/Korea Construction Sector Map/g,'Korea Construction & Machinery Map');
  s=s.replace(/Korea Construction Map/g,'Korea Construction & Machinery Map');
  if(p===targetPath) s=s.replace(/한국 건설 산업 투자 지도/g,'한국 건설/기계 투자 지도');
  write(p,s);
}
let index=read('index.html');

write('index.html',index);
// Remove the retired canonical URL left by historical SEO generators.
if(fs.existsSync(path.join(ROOT,'sitemap.xml'))) write('sitemap.xml',read('sitemap.xml').replace(/<url>\s*<loc>[^<]*\/machinery\/[^<]*<\/loc>[\s\S]*?<\/url>/g,''));
console.log('OK construction/machinery merge:',companies.length,'stocks;',incoming.length,'machinery stocks preserved');
