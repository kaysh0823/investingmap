/** Build sector pages and networks from a shared source map. */
import fs from 'node:fs';
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { extractCompaniesFromHtml, patchKoreanCompaniesHtml } from '../lib/map_company_serialize.mjs';
import { countBadges, patchBadgesHtml } from './sync_map_badges.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const write = (path, data) => {
  const file = new URL(path, root);
  if (!fs.existsSync(file) || read(path) !== data) fs.writeFileSync(file, data, 'utf8');
};
export function buildSplitSectorMaps({ sourcePath, sourceGraph, graphSlugs, sectorFor, transformPage }) {
  const ids = Object.keys(graphSlugs);
  const source = read(sourcePath);
  const companies = extractCompaniesFromHtml(source);
  const sectorByTicker = new Map(companies.map((company) => [company.ticker, sectorFor(company)]));

  const graph = JSON.parse(read(sourceGraph));

  for (const id of ids) {
    const meta = SECTOR_META[id];
    const members = companies.filter((company) => sectorFor(company) === id);
    const tickers = new Set(members.map((company) => company.ticker));
    const chains = new Set(members.map((company) => company.chain));
    const slug = graphSlugs[id];
    const graphPath = `data/netmap/${slug}.json`;

    let page = transformPage(source, id, meta)
      .replaceAll(sourcePath, meta.map)
      .replace(`../${sourceGraph}`, `../${graphPath}`)
      .replace(/(<span id="show-count">)\d+(<\/span>)/, (_, open, close) => `${open}${members.length}${close}`)
      .replace(/<tr data-ticker="([A-Z0-9]{6})">[\s\S]*?<\/tr>/g, (row, ticker) => tickers.has(ticker) ? row : '')
      .replace(/const chains = (\['(?:all|게임)'[^;]*\]);/g, (_, list) => {
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
    // split sector's companies as external nodes.
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
    const flaggedSeeds = (graph.flaggedSeeds || []).filter((seed) => tickers.has(seed.ticker));
    write(graphPath, JSON.stringify({ ...graph, sectorId: slug, nodes, edges, flaggedSeeds }, null, 2) + '\n');
    console.log(`${id}: ${members.length} companies`);
  }

  const sitemapPath = 'sitemap.xml';
  const sitemap = read(sitemapPath);
  const urls = ids
    .map((id) => `  <url><loc>https://www.investingmap.kr/${SECTOR_META[id].map}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`)
    .filter((entry) => !sitemap.includes(entry.match(/<loc>(.*?)<\/loc>/)[1]));
  write(sitemapPath, sitemap.replace('</urlset>', `${urls.join('')}</urlset>`));
}
