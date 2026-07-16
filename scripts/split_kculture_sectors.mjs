/**
 * Split kculture map into:
 *   kconsume — 화장품·retail·fashion·food/ramen (+ travel)
 *   kcontent — games·media/webtoon·K-pop
 * Updates hub/nav/index registrations and rebuilds hub_index.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'kculture', 'korea_kculture_map.html');

const CONSUME_CHAINS = new Set([
  '음식·라면·식품',
  '여행·레저·항공',
  '화장품·뷰티케어',
  '패션',
  '쇼핑/유통',
]);
const CONTENT_CHAINS = new Set([
  '게임',
  '드라마·미디어·웹툰·컨텐츠',
  'K-pop·엔터테인먼트',
]);

const CONSUME_COLORS = {
  '음식·라면·식품': '#FF8A65',
  '여행·레저·항공': '#4FC3F7',
  '화장품·뷰티케어': '#F48FB1',
  패션: '#AB47BC',
  '쇼핑/유통': '#26A69A',
};
const CONTENT_COLORS = {
  게임: '#66BB6A',
  '드라마·미디어·웹툰·컨텐츠': '#BA68C8',
  'K-pop·엔터테인먼트': '#FFD54F',
};

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function rebuildItemList(html, companies, title, mapUrl) {
  const items = companies
    .map(
      (c, i) => `      {
        "@type": "ListItem",
        "position": ${i + 1},
        "name": "${c.name} (${c.ticker}, ${c.market})",
        "url": "${mapUrl}#ticker-${c.ticker}"
      }`,
    )
    .join(',\n');
  const block = `{
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "${title}",
    "url": "${mapUrl}",
    "numberOfItems": ${companies.length},
    "itemListElement": [
${items}
    ]
  }`;
  return html.replace(
    /<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "ItemList"[\s\S]*?\}\s*<\/script>/,
    `<script type="application/ld+json">\n  ${block}\n  </script>`,
  );
}

function stripPrerenderRows(html, keepTickers) {
  const start = '<!-- investingmap-seo-prerender-start -->';
  const end = '<!-- investingmap-seo-prerender-end -->';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end);
  if (i0 === -1 || i1 === -1 || i1 <= i0) {
    return html.replace(/<tr data-ticker="([^"]+)">[\s\S]*?<\/tr>/g, (full, t) =>
      keepTickers.has(String(t).padStart(6, '0')) ? full : '',
    );
  }
  const head = html.slice(0, i0 + start.length);
  const body = html.slice(i0 + start.length, i1);
  const tail = html.slice(i1);
  const stripped = body.replace(/<tr data-ticker="([^"]+)">[\s\S]*?<\/tr>/g, (full, t) =>
    keepTickers.has(String(t).padStart(6, '0')) ? full : '',
  );
  return head + stripped + tail;
}

function patchMapHtml(html, opts) {
  const {
    companies,
    chains,
    colors,
    titleKo,
    titleEn,
    subtitleKo,
    subtitleEn,
    folder,
    file,
  } = opts;
  const mapUrl = `https://www.investingmap.kr/${folder}/${file}`;
  const keep = new Set(companies.map((c) => String(c.ticker).padStart(6, '0')));
  let out = patchKoreanCompaniesHtml(html, companies);
  out = stripPrerenderRows(out, keep);
  out = rebuildItemList(out, companies, titleKo, mapUrl);

  const colorJson = JSON.stringify(colors);
  out = out.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${colorJson};`);

  // buildChainChips / legend chain arrays
  const chainListAll = `['all', ${chains.map((c) => `'${c}'`).join(', ')}]`;
  const chainList = `[${chains.map((c) => `'${c}'`).join(', ')}]`;
  out = out.replace(/const chains = \['all', [^\]]+\];/g, `const chains = ${chainListAll};`);
  out = out.replace(
    /const chains = \[[^\]]+\];(?=\s*\n\s*chainContainer)/g,
    `const chains = ${chainList};`,
  );
  // sidebar legend often: const chains = ['음식...
  out = out.replace(
    /(const chainContainer = document\.getElementById\('sb-chain-legend'\);\s*const chains = )(\[[^\]]+\])/,
    `$1${chainList}`,
  );

  const replacements = [
    [/한국 K컬처 산업 투자 지도/g, titleKo],
    [/Korea K-Culture Industry Map/g, titleEn],
    [/korea_kculture_map\.html/g, file],
    [/\/kculture\//g, `/${folder}/`],
    [/\.\.\/kculture\//g, `../${folder}/`],
  ];
  for (const [re, to] of replacements) out = out.replace(re, to);

  // subtitle / description soft updates
  out = out.replace(
    /(<p id="hdr-subtitle">)[^<]*(<\/p>)/,
    `$1${subtitleKo}$2`,
  );
  out = out.replace(
    /("subtitle":\s*")[^"]*(")/,
    `$1${subtitleKo}$2`,
  );
  // English subtitle in T.en — first occurrence after "en":
  out = out.replace(
    /("en":\s*\{[\s\S]*?"subtitle":\s*")[^"]*(")/,
    `$1${subtitleEn}$2`,
  );

  // Fix self-relative script paths stay ../js (already correct from clone in subfolder)
  return out;
}

function writeSector(folder, file, companies, chains, colors, titles) {
  ensureDir(path.join(ROOT, folder));
  let html = fs.readFileSync(SRC, 'utf8');
  html = patchMapHtml(html, {
    companies,
    chains,
    colors,
    folder,
    file,
    ...titles,
  });
  const outPath = path.join(ROOT, folder, file);
  fs.writeFileSync(outPath, html, 'utf8');
  // verify
  const written = fs.readFileSync(outPath, 'utf8');
  if (!/return `<tr data-ticker="\$\{c\.ticker\}">/.test(written)) {
    throw new Error(`${folder}: renderTable row template missing (check stripPrerenderRows scope)`);
  }
  const check = extractCompaniesFromHtml(written);
  console.log(`OK ${folder}: ${check.length} companies (expected ${companies.length})`);
  if (check.length !== companies.length) {
    throw new Error(`${folder} company count mismatch`);
  }
}

function replaceInFile(rel, pairs) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  let t = fs.readFileSync(p, 'utf8');
  let next = t;
  for (const [a, b] of pairs) next = next.split(a).join(b);
  if (next !== t) {
    fs.writeFileSync(p, next, 'utf8');
    console.log('patched', rel);
  }
}

function patchNavJs(rel) {
  const p = path.join(ROOT, rel);
  let t = fs.readFileSync(p, 'utf8');
  const oldItem =
    rel.includes('sector_nav')
      ? `    { id: 'kculture', path: '../kculture/korea_kculture_map.html', ko: 'K\\uCEEC\\uCC98', en: 'K-Culture' },`
      : `    { id: 'kculture', path: 'kculture/korea_kculture_map.html', icon: '\\uD83C\\uDFAC', ko: 'K\\uCEEC\\uCC98', en: 'K-Culture' },`;
  // Try unicode and literal forms
  const patterns = [
    /\{ id: 'kculture', path: '[^']+', icon: '[^']*', ko: '[^']*', en: '[^']*' \},/,
    /\{ id: 'kculture', path: '[^']+', ko: '[^']*', en: '[^']*' \},/,
  ];
  let replaced = false;
  for (const re of patterns) {
    if (re.test(t)) {
      const prefix = rel.includes('sector_nav') ? '../' : '';
      const withIcon = !rel.includes('sector_nav');
      const insert = withIcon
        ? `    { id: 'kconsume', path: '${prefix}kconsume/korea_kconsume_map.html', icon: '\\uD83D\\uDED2', ko: 'K-\\uC18C\\uBE44/\\uC720\\uD1B5', en: 'K-Consume' },\n` +
          `    { id: 'kcontent', path: '${prefix}kcontent/korea_kcontent_map.html', icon: '\\uD83C\\uDFAC', ko: 'K-\\uCF58\\uD150\\uCE20', en: 'K-Content' },`
        : `    { id: 'kconsume', path: '${prefix}kconsume/korea_kconsume_map.html', ko: 'K-\\uC18C\\uBE44/\\uC720\\uD1B5', en: 'K-Consume' },\n` +
          `    { id: 'kcontent', path: '${prefix}kcontent/korea_kcontent_map.html', ko: 'K-\\uCF58\\uD150\\uCE20', en: 'K-Content' },`;
      t = t.replace(re, insert);
      replaced = true;
      break;
    }
  }
  // pathPrefix / detectActiveId
  t = t.replace(
    /semiconductor\|bio\|ship\|defense\|robot\|energy\|powergrid\|kculture\|finance\|construction/g,
    'semiconductor|bio|ship|defense|robot|energy|powergrid|kculture|kconsume|kcontent|finance|construction',
  );
  t = t.replace(
    /if \(path\.indexOf\('\/kculture\/'\) !== -1\) return 'kculture';/,
    `if (path.indexOf('/kconsume/') !== -1) return 'kconsume';\n    if (path.indexOf('/kcontent/') !== -1) return 'kcontent';\n    if (path.indexOf('/kculture/') !== -1) return 'kconsume';`,
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log(replaced ? 'nav replaced kculture' : 'nav paths updated', rel);
}

// --- main ---
const all = extractCompaniesFromHtml(fs.readFileSync(SRC, 'utf8'));
// Need full company objects with chain — extractCompaniesFromHtml returns full objects from Function eval
const consume = all.filter((c) => CONSUME_CHAINS.has(c.chain));
const content = all.filter((c) => CONTENT_CHAINS.has(c.chain));
const leftover = all.filter((c) => !CONSUME_CHAINS.has(c.chain) && !CONTENT_CHAINS.has(c.chain));
if (leftover.length) {
  console.warn('Unassigned chains:', leftover.map((c) => `${c.ticker}:${c.chain}`).join(', '));
}
console.log(`split ${all.length} → consume ${consume.length}, content ${content.length}`);

writeSector('kconsume', 'korea_kconsume_map.html', consume, [...CONSUME_CHAINS], CONSUME_COLORS, {
  titleKo: '한국 K-소비/유통 투자 지도',
  titleEn: 'Korea K-Consume / Retail Map',
  subtitleKo: '화장품·패션·식품·라면·쇼핑·유통·여행 관련 상장사',
  subtitleEn: 'Listed Korean beauty, fashion, food, retail and travel names',
});
writeSector('kcontent', 'korea_kcontent_map.html', content, [...CONTENT_CHAINS], CONTENT_COLORS, {
  titleKo: '한국 K-콘텐츠 투자 지도',
  titleEn: 'Korea K-Content Industry Map',
  subtitleKo: '게임·드라마·웹툰·미디어·K-pop 관련 상장사',
  subtitleEn: 'Listed Korean games, drama/webtoon/media and K-pop names',
});

// Redirect old kculture map → kconsume (canonical split home for consume-heavy legacy links)
{
  const redirect = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>K컬처 → K-소비/유통 · K-콘텐츠</title>
  <link rel="canonical" href="https://www.investingmap.kr/kconsume/korea_kconsume_map.html">
  <meta http-equiv="refresh" content="0;url=../kconsume/korea_kconsume_map.html?tab=table">
  <script>location.replace('../kconsume/korea_kconsume_map.html'+location.search+(location.search?'&':'?')+'tab=table');</script>
</head>
<body>
  <p>K컬처 지도는 <a href="../kconsume/korea_kconsume_map.html">K-소비/유통</a>과 <a href="../kcontent/korea_kcontent_map.html">K-콘텐츠</a>로 분리되었습니다.</p>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, 'kculture', 'korea_kculture_map.html'), redirect, 'utf8');
  console.log('OK kculture redirect stub');
}

// Hub index / dashboard / API order
{
  const p = path.join(ROOT, 'scripts', 'build_hub_index.mjs');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(
    `  ['kculture', 'kculture/korea_kculture_map.html'],`,
    `  ['kconsume', 'kconsume/korea_kconsume_map.html'],\n  ['kcontent', 'kcontent/korea_kcontent_map.html'],`,
  );
  t = t.replace(
    `  kculture: { ko: 'K컬처', en: 'K-Culture', icon: '\uD83C\uDFAC', map: 'kculture/korea_kculture_map.html' },`,
    `  kconsume: { ko: 'K-소비/유통', en: 'K-Consume', icon: '\uD83D\uDED2', map: 'kconsume/korea_kconsume_map.html' },\n  kcontent: { ko: 'K-콘텐츠', en: 'K-Content', icon: '\uD83C\uDFAC', map: 'kcontent/korea_kcontent_map.html' },`,
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('OK build_hub_index.mjs');
}

{
  const p = path.join(ROOT, 'js', 'hub_dashboard.js');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(
    "var SECTOR_ORDER = ['semi', 'energy', 'powergrid', 'ship', 'defense', 'kculture', 'bio', 'robot', 'finance', 'construction'];",
    "var SECTOR_ORDER = ['semi', 'energy', 'powergrid', 'ship', 'defense', 'kconsume', 'kcontent', 'bio', 'robot', 'finance', 'construction'];",
  );
  t = t.replace(
    /kculture: \['라면·식품', '여행·항공', '뷰티', '게임', '패션', '쇼핑·유통', '드라마·웹툰', 'K-pop'\],/,
    `kconsume: ['라면·식품', '여행·항공', '뷰티', '패션', '쇼핑·유통'],\n      kcontent: ['게임', '드라마·웹툰', 'K-pop'],`,
  );
  t = t.replace(
    /kculture: \['Food', 'Travel & airlines', 'Beauty', 'Games', 'Fashion', 'Retail', 'Drama & webtoon', 'K-pop'\],/,
    `kconsume: ['Food', 'Travel', 'Beauty', 'Fashion', 'Retail'],\n      kcontent: ['Games', 'Drama & webtoon', 'K-pop'],`,
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('OK hub_dashboard.js SECTOR_ORDER/tags');
}

{
  const p = path.join(ROOT, 'functions', 'lib', 'hub_dashboard_core.mjs');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(
    "export const SECTOR_ORDER = ['semi', 'energy', 'powergrid', 'ship', 'defense', 'kculture', 'bio', 'robot', 'finance', 'construction'];",
    "export const SECTOR_ORDER = ['semi', 'energy', 'powergrid', 'ship', 'defense', 'kconsume', 'kcontent', 'bio', 'robot', 'finance', 'construction'];",
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('OK hub_dashboard_core.mjs');
}

patchNavJs('js/desktop_sidebar_nav.js');
patchNavJs('js/global_bottom_nav.js');
patchNavJs('js/sector_nav.js');

// map_tab_state already has kconsume|kcontent from earlier edit
{
  const p = path.join(ROOT, 'js', 'map_tab_state.js');
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes('kconsume')) {
    t = t.replace(
      /semiconductor\|bio\|ship\|defense\|robot\|energy\|powergrid\|kculture\|finance\|construction/g,
      'semiconductor|bio|ship|defense|robot|energy|powergrid|kculture|kconsume|kcontent|finance|construction',
    );
    fs.writeFileSync(p, t, 'utf8');
  }
}

// sector_exclusive: kculture → split
{
  const p = path.join(ROOT, 'lib', 'sector_exclusive.mjs');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(/: 'kculture'/g, ": 'kconsume'"); // beauty tickers etc. — content ones may need fix
  // Content tickers that were exclusive to kculture — override known ones
  const contentTickers = content.map((c) => String(c.ticker).padStart(6, '0'));
  for (const tk of contentTickers) {
    t = t.replace(new RegExp(`'${tk}':\\s*'kconsume'`), `'${tk}': 'kcontent'`);
  }
  fs.writeFileSync(p, t, 'utf8');
  console.log('OK sector_exclusive');
}

// Sync hub_sector_returns listingCount from hub_index after rebuild
function syncSectorReturnsListingCounts() {
  const indexPath = path.join(ROOT, 'data', 'hub_index.json');
  const retPath = path.join(ROOT, 'data', 'hub_sector_returns.json');
  if (!fs.existsSync(retPath)) return;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const ret = JSON.parse(fs.readFileSync(retPath, 'utf8'));
  if (!ret.sectors) return;
  // migrate kculture → drop; ensure keys exist
  delete ret.sectors.kculture;
  for (const [sid, block] of Object.entries(index.sectors || {})) {
    const n = (block.companies || []).length;
    if (!ret.sectors[sid]) {
      ret.sectors[sid] = { listingCount: n };
    } else {
      ret.sectors[sid].listingCount = n;
    }
  }
  fs.writeFileSync(retPath, JSON.stringify(ret) + '\n', 'utf8');
  console.log('OK hub_sector_returns listingCount sync');
}

execSync('node scripts/build_hub_index.mjs', { cwd: ROOT, stdio: 'inherit' });
syncSectorReturnsListingCounts();

console.log('Done. Update index.html hub cards manually if script did not.');
