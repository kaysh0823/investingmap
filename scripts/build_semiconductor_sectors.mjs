/** Publish two semiconductor maps from the shared company and relationship data. */
import fs from 'node:fs';
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { SEMI_BE_CHAINS } from '../lib/semi_chain_ui.mjs';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { countBadges, patchBadgesHtml } from './sync_map_badges.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const write = (path, data) => {
  const file = new URL(path, root);
  if (!fs.existsSync(file) || read(path) !== data) fs.writeFileSync(file, data, 'utf8');
};
const sourcePath = SECTOR_META.semi.map;
const source = read(sourcePath);
// RF Materials was admitted separately and remains available on the legacy map.
const companies = extractCompaniesFromHtml(source).filter(({ ticker }) => ticker !== '327260');
const frontInspection = new Set(['140860', '348210']); // Wafer inspection and metrology
const backChains = new Set(SEMI_BE_CHAINS);
const sectorFor = ({ chain, ticker }) =>
  backChains.has(chain) && !frontInspection.has(ticker) ? 'semiback' : 'semifront';
const sectorByTicker = new Map(companies.map((company) => [company.ticker, sectorFor(company)]));

const graph = JSON.parse(read('data/netmap/semiconductor.json'));

for (const id of ['semifront', 'semiback']) {
  const meta = SECTOR_META[id];
  const members = companies.filter((company) => sectorFor(company) === id);
  const tickers = new Set(members.map((company) => company.ticker));
  const chains = new Set(members.map((company) => company.chain));
  const slug = id === 'semifront' ? 'semiconductor_front' : 'semiconductor_back';
  const graphPath = `data/netmap/${slug}.json`;

  let page = source
    .replace('data-sector="semi"', `data-sector="${id}"`)
    .replaceAll('한국 반도체 산업 투자 지도', `${meta.ko} 투자 지도`)
    .replaceAll('Korea Semiconductor Industry Investment Map', `${meta.en} Investment Map`)
    .replaceAll('Korea Semiconductor Investment Map', `${meta.en} Investment Map`)
    .replaceAll(sourcePath, meta.map)
    .replace('../data/netmap/semiconductor.json', `../${graphPath}`)
    .replace(/(<span id="show-count">)\d+(<\/span>)/, (_, open, close) => `${open}${members.length}${close}`)
    .replace(/<tr data-ticker="(\d{6})">[\s\S]*?<\/tr>/g, (row, ticker) => tickers.has(ticker) ? row : '')
    .replace(/const chains = (\['all', '전공정', '후공정'[^;]*\]);/, (_, list) => {
      const present = [...list.matchAll(/'([^']+)'/g)].map(([, chain]) => chain)
        .filter((chain) => chain === 'all' || chains.has(chain));
      return `const chains = ${JSON.stringify(present)};`;
    })
    .replace(/(<script type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g, (script, open, json, close) => {
      const data = JSON.parse(json);
      if (data['@type'] !== 'ItemList') return script;
      data.itemListElement = data.itemListElement.filter(({ url }) => tickers.has(url?.split('#ticker-')[1]));
      data.itemListElement.forEach((item, index) => { item.position = index + 1; });
      data.numberOfItems = data.itemListElement.length;
      return `${open}\n${JSON.stringify(data, null, 2)}\n${close}`;
    });
  page = patchKoreanCompaniesHtml(page, members);
  page = patchBadgesHtml(page, countBadges(members));
  write(meta.map, page);

  // Preserve direct evidence and connected counterparties, including the other
  // semiconductor sector's companies as external nodes.
  const memberNodes = new Set(graph.nodes.filter((node) => tickers.has(node.ticker)).map((node) => node.id));
  const edges = graph.edges.filter(({ source, target }) => memberNodes.has(source) || memberNodes.has(target));
  const connected = new Set(edges.flatMap(({ source, target }) => [source, target]));
  const nodes = graph.nodes
    .filter((node) => memberNodes.has(node.id) || connected.has(node.id))
    .map((node) => {
      if (memberNodes.has(node.id) || node.type !== 'kr_listed') return node;
      const peer = SECTOR_META[sectorByTicker.get(node.ticker)];
      return { ...node, type: 'kr_other', ...(peer && { map: peer.map }) };
    });
  const flaggedSeeds = graph.flaggedSeeds.filter((seed) => tickers.has(seed.ticker));
  write(graphPath, JSON.stringify({ ...graph, sectorId: slug, nodes, edges, flaggedSeeds }, null, 2) + '\n');
  console.log(`${id}: ${members.length} companies`);
}

const sitemapPath = 'sitemap.xml';
const sitemap = read(sitemapPath);
const urls = ['semifront', 'semiback']
  .map((id) => `  <url><loc>https://www.investingmap.kr/${SECTOR_META[id].map}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`)
  .filter((entry) => !sitemap.includes(entry.match(/<loc>(.*?)<\/loc>/)[1]));
write(sitemapPath, sitemap.replace('</urlset>', `${urls.join('')}</urlset>`));
