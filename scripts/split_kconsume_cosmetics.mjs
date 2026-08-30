/**
 * Split cosmetics from kconsume; move Pharmaresearch bio→medtech; drop Classys from kconsume.
 *
 * Cosmetics chains: 브랜드, ODM·OEM, 원료, 용기, 유통·채널
 * Empty 원료/용기 stay in metadata but are filtered out of chips/legend until populated.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  esc,
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';
import {
  loadMergedKrxMap,
  loadListedEnglish3557Map,
  formatListedEnglishName,
} from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';
import { fmtMcap, mcapTier } from '../lib/map_company_serialize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KCONSUME_HTML = path.join(ROOT, 'kconsume', 'korea_kconsume_map.html');
const MEDTECH_HTML = path.join(ROOT, 'medtech', 'korea_medtech_map.html');
const BIO_JSX = path.join(ROOT, 'bio', 'biomap.jsx');

const COSMETICS_BRAND = new Set(['278470', '090430', '051900', '483650', '002790', '018290', '092730', '078520', '018250']);
const COSMETICS_ODM = new Set(['161890', '192820', '241710', '003350', '352480']);
const COSMETICS_PACKAGING = new Set(['251970']);
const COSMETICS_CHANNEL = new Set(['257720']);
const COSMETICS_AESTHETIC = new Set(['214150', '214450', '336570', '145020', '214370']); // Classys, Pharmaresearch, Wontech, Hugel, Caregen
const COSMETICS_ALL = new Set([
  ...COSMETICS_BRAND,
  ...COSMETICS_ODM,
  ...COSMETICS_PACKAGING,
  ...COSMETICS_CHANNEL,
  ...COSMETICS_AESTHETIC,
]);
const DROP_FROM_KCONSUME = new Set([...COSMETICS_ALL]); // beauty + aesthetic (Classys never returns to kconsume)
const PHARMARESEARCH = '214450';

const COSMETICS_META = {
  folder: 'cosmetics',
  file: 'korea_cosmetics_map.html',
  dataSector: 'cosmetics',
  titleKo: '한국 화장품/미용기기 투자 지도',
  titleEn: 'Korea Cosmetics / Aesthetic Devices Map',
  subtitleKo: '브랜드·ODM/OEM·원료·용기·유통·채널 — 상장사와 글로벌 참고 관계',
  subtitleEn: 'Brands, ODM/OEM, ingredients, packaging, and channels — listed companies and reference relationships',
  descriptionKo: '화장품 브랜드·ODM/OEM·원료·용기·유통 채널 관련 상장사와 글로벌 참고 관계를 정리합니다.',
  descriptionEn: 'Listed Korean cosmetics brands, ODM/OEM, ingredients, packaging, and channel companies with illustrative global relationships.',
  allChains: ['브랜드', 'ODM·OEM', '원료', '용기', '유통·채널', '미용기기'],
  colors: {
    '브랜드': '#F48FB1',
    'ODM·OEM': '#CE93D8',
    '원료': '#80CBC4',
    '용기': '#FFCC80',
    '유통·채널': '#81D4FA',
    '미용기기': '#EF9A9A',
  },
  chainLabelKo: {
    '브랜드': '브랜드',
    'ODM·OEM': 'ODM·OEM',
    '원료': '원료',
    '용기': '용기',
    '유통·채널': '유통·채널',
    '미용기기': '미용기기·에스테틱',
  },
  chainLabelEn: {
    '브랜드': 'Brands',
    'ODM·OEM': 'ODM / OEM',
    '원료': 'Ingredients',
    '용기': 'Packaging',
    '유통·채널': 'Channels & distribution',
    '미용기기': 'Aesthetic devices & products',
  },
};

const KCONSUME_CHAINS = ['음식·라면·식품', '여행·레저·항공', '패션', '쇼핑/유통'];
const KCONSUME_COLORS = {
  '음식·라면·식품': '#FF8A65',
  '여행·레저·항공': '#4FC3F7',
  '패션': '#AB47BC',
  '쇼핑/유통': '#26A69A',
};
const KCONSUME_LABEL_KO = {
  '음식·라면·식품': '음식·라면·식품',
  '여행·레저·항공': '여행·레저·항공',
  '패션': '패션',
  '쇼핑/유통': '쇼핑/유통',
};
const KCONSUME_LABEL_EN = {
  '음식·라면·식품': 'Food & ramen',
  '여행·레저·항공': 'Travel, leisure & aviation',
  '패션': 'Fashion',
  '쇼핑/유통': 'Shopping & retail',
};

function chainForCosmetics(ticker) {
  if (COSMETICS_BRAND.has(ticker)) return '브랜드';
  if (COSMETICS_ODM.has(ticker)) return 'ODM·OEM';
  if (COSMETICS_PACKAGING.has(ticker)) return '용기';
  if (COSMETICS_CHANNEL.has(ticker)) return '유통·채널';
  if (COSMETICS_AESTHETIC.has(ticker)) return '미용기기';
  return '브랜드';
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

function patchChainLabels(html, chains, labelKo, labelEn) {
  let out = html;
  const blockKo = chains.map((c) => `            "${c}": "${labelKo[c] || c}"`).join(',\n');
  const blockEn = chains.map((c) => `            "${c}": "${labelEn[c] || c}"`).join(',\n');
  out = out.replace(
    /("ko":\s*\{[\s\S]*?"chainLabel":\s*\{)[\s\S]*?(\n\s*\},)/,
    `$1\n${blockKo}$2`,
  );
  out = out.replace(
    /("ko":\s*\{[\s\S]*?"chainFilter":\s*\{)[\s\S]*?(\n\s*\},)/,
    `$1\n${blockKo}$2`,
  );
  out = out.replace(
    /("en":\s*\{[\s\S]*?"chainLabel":\s*\{)[\s\S]*?(\n\s*\},)/,
    `$1\n${blockEn}$2`,
  );
  out = out.replace(
    /("en":\s*\{[\s\S]*?"chainFilter":\s*\{)[\s\S]*?(\n\s*\},)/,
    `$1\n${blockEn}$2`,
  );
  return out;
}

function patchStaticChainArrays(html, chains, { hideEmpty = false } = {}) {
  const all = `['all', ${chains.map((c) => `'${esc(c)}'`).join(', ')}]`;
  const bare = `[${chains.map((c) => `'${esc(c)}'`).join(', ')}]`;
  let out = html
    .replace(/const chains = \['all', [^\]]+\];/g, `const chains = ${all};`)
    .replace(/const chains = \[[^\]]+\];(?=\s*\n\s*chainContainer)/g, `const chains = ${bare};`)
    .replace(
      /(const chainContainer = document\.getElementById\('sb-chain-legend'\);\s*const chains = )(\[[^\]]+\])/,
      `$1${bare}`,
    );

  if (hideEmpty) {
    // Inject populatedChains helper and rewrite chip/legend builders to skip empty chains.
    if (!out.includes('function populatedChains(')) {
      out = out.replace(
        /function buildChainChips\(\) \{/,
        `function populatedChains() {
      const present = new Set(koreanCompanies.map(c => c.chain).filter(Boolean));
      return ${bare}.filter(ch => present.has(ch));
    }

    function buildChainChips() {`,
      );
    }
    out = out.replace(
      /function buildChainChips\(\) \{[\s\S]*?const chains = \['all',[^\]]+\];/,
      `function buildChainChips() {
      const t = T[lang];
      const container = document.getElementById('chain-chips');
      const chains = ['all', ...populatedChains()];`,
    );
    // If the replace above didn't catch because of prior injection, also fix bare form:
    out = out.replace(
      /(function buildChainChips\(\) \{[\s\S]*?const container = document\.getElementById\('chain-chips'\);\s*)const chains = \['all', [^\]]+\];/,
      `$1const chains = ['all', ...populatedChains()];`,
    );
    out = out.replace(
      /(const chainContainer = document\.getElementById\('sb-chain-legend'\);\s*)const chains = \[[^\]]+\];/,
      `$1const chains = populatedChains();`,
    );
  }
  return out;
}

function patchMapText(html, meta, fromFolder) {
  const url = `https://www.investingmap.kr/${meta.folder}/${meta.file}`;
  let out = html
    .replace(new RegExp(`${fromFolder}/korea_${fromFolder}_map\\.html`, 'g'), `${meta.folder}/${meta.file}`)
    .replace(new RegExp(`/${fromFolder}/`, 'g'), `/${meta.folder}/`)
    .replace(new RegExp(`\\.\\./${fromFolder}/`, 'g'), `../${meta.folder}/`)
    .replace(/data-sector="[^"]+"/, `data-sector="${meta.dataSector}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.titleKo}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${meta.descriptionKo}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${meta.titleKo}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${meta.descriptionKo}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${meta.titleKo}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${meta.descriptionKo}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<link rel="alternate" hreflang="ko-KR" href="[^"]*">/, `<link rel="alternate" hreflang="ko-KR" href="${url}?lang=ko">`)
    .replace(/<link rel="alternate" hreflang="en-US" href="[^"]*">/, `<link rel="alternate" hreflang="en-US" href="${url}?lang=en">`)
    .replace(/<link rel="alternate" hreflang="x-default" href="[^"]*">/, `<link rel="alternate" hreflang="x-default" href="${url}">`)
    .replace(/(<h1 id="hdr-title">)[\s\S]*?(<\/h1>)/, `$1🇰🇷 ${meta.titleKo}$2`)
    .replace(/(<p id="hdr-subtitle">)[^<]*(<\/p>)/, `$1${meta.subtitleKo}$2`)
    .replace(/"title":\s*"[^"]*"/, `"title": "🇰🇷 ${meta.titleKo}"`)
    .replace(/"subtitle":\s*"[^"]*"/, `"subtitle": "${meta.subtitleKo}"`)
    .replace(/("en":\s*\{[\s\S]*?"title":\s*")[^"]*(")/, `$1🇰🇷 ${meta.titleEn}$2`)
    .replace(/("en":\s*\{[\s\S]*?"subtitle":\s*")[^"]*(")/, `$1${meta.subtitleEn}$2`);
  const angle = meta.allChains
    .map((c, i) => `'${esc(c)}': ${Math.round((360 / meta.allChains.length) * i)}`)
    .join(', ');
  out = out.replace(/const ANGLE = \{[\s\S]*?\};/, `const ANGLE = { ${angle} };`);
  return out;
}

function writeCosmeticsMap(templateHtml, companies) {
  const meta = COSMETICS_META;
  const keep = new Set(companies.map((c) => String(c.ticker).padStart(6, '0')));
  const mapUrl = `https://www.investingmap.kr/${meta.folder}/${meta.file}`;
  let html = patchKoreanCompaniesHtml(templateHtml, companies);
  html = stripPrerenderRows(html, keep);
  html = rebuildItemList(html, companies, meta.titleKo, mapUrl);
  html = patchMapText(html, meta, 'kconsume');
  html = html.replace(
    /const CHAIN_COLORS = \{[\s\S]*?\};/,
    `const CHAIN_COLORS = ${JSON.stringify(meta.colors)};`,
  );
  html = patchChainLabels(html, meta.allChains, meta.chainLabelKo, meta.chainLabelEn);
  html = patchStaticChainArrays(html, meta.allChains, { hideEmpty: true });
  // kconsume leftover subtitle references
  html = html.replace(/화장품·패션·식품·라면·쇼핑·유통·여행/g, '브랜드·ODM/OEM·원료·용기·유통 채널');
  fs.mkdirSync(path.join(ROOT, meta.folder), { recursive: true });
  fs.writeFileSync(path.join(ROOT, meta.folder, meta.file), html, 'utf8');
  console.log(`OK cosmetics: ${companies.length} companies`);
}

function rewriteKconsume(html, companies) {
  const keep = new Set(companies.map((c) => String(c.ticker).padStart(6, '0')));
  const mapUrl = 'https://www.investingmap.kr/kconsume/korea_kconsume_map.html';
  let out = patchKoreanCompaniesHtml(html, companies);
  out = stripPrerenderRows(out, keep);
  out = rebuildItemList(out, companies, '한국 K-소비/유통 투자 지도', mapUrl);
  out = out.replace(
    /const CHAIN_COLORS = \{[\s\S]*?\};/,
    `const CHAIN_COLORS = ${JSON.stringify(KCONSUME_COLORS)};`,
  );
  out = patchChainLabels(out, KCONSUME_CHAINS, KCONSUME_LABEL_KO, KCONSUME_LABEL_EN);
  out = patchStaticChainArrays(out, KCONSUME_CHAINS, { hideEmpty: false });
  out = out.replace(
    /const ANGLE = \{[\s\S]*?\};/,
    `const ANGLE = { ${KCONSUME_CHAINS.map((c, i) => `'${esc(c)}': ${Math.round((360 / KCONSUME_CHAINS.length) * i)}`).join(', ')} };`,
  );
  out = out.replace(
    /<meta name="description" content="[^"]*">/,
    '<meta name="description" content="패션·식품·라면·쇼핑·유통·여행 관련 상장사의 KRX 데이터와 글로벌 연계 예시를 제공합니다.">',
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*">/,
    '<meta property="og:description" content="패션·식품·라면·쇼핑·유통·여행 관련 상장사의 KRX 데이터와 글로벌 연계 예시를 제공합니다.">',
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    '<meta name="twitter:description" content="패션·식품·라면·쇼핑·유통·여행 관련 상장사의 KRX 데이터와 글로벌 연계 예시를 제공합니다.">',
  );
  out = out.replace(
    /(<p id="hdr-subtitle">)[^<]*(<\/p>)/,
    '$1패션·식품·라면·쇼핑·유통·여행 관련 상장사$2',
  );
  out = out.replace(/"subtitle":\s*"[^"]*"/, '"subtitle": "패션·식품·라면·쇼핑·유통·여행 관련 상장사"');
  out = out.replace(
    /("en":\s*\{[\s\S]*?"subtitle":\s*")[^"]*(")/,
    '$1Fashion, food, retail, and travel listed companies$2',
  );
  fs.writeFileSync(KCONSUME_HTML, out, 'utf8');
  console.log(`OK kconsume: ${companies.length} companies (beauty+Classys removed)`);
}

function movePharmaresearchToMedtech() {
  // Pharmaresearch (214450) is cosmetics/미용기기 after rebalance; only scrub bio sources here.
  if (fs.existsSync(BIO_JSX)) {
    let jsx = fs.readFileSync(BIO_JSX, 'utf8');
    const next = jsx.replace(/\s*\{[^{}]*ticker:\s*"214450"[^{}]*\},?/g, '');
    if (next !== jsx) {
      fs.writeFileSync(BIO_JSX, next, 'utf8');
      console.log('OK biomap.jsx: removed Pharmaresearch');
    }
  }

  const bioHtmlPath = path.join(ROOT, 'bio', 'korea_bio_map.html');
  if (fs.existsSync(bioHtmlPath)) {
    let bioHtml = fs.readFileSync(bioHtmlPath, 'utf8');
    if (bioHtml.includes('214450') && bioHtml.includes('const koreanCompanies')) {
      try {
        const bioCos = extractCompaniesFromHtml(bioHtml).filter(
          (c) => String(c.ticker).padStart(6, '0') !== PHARMARESEARCH,
        );
        const keep = new Set(bioCos.map((c) => String(c.ticker).padStart(6, '0')));
        bioHtml = patchKoreanCompaniesHtml(bioHtml, bioCos);
        bioHtml = stripPrerenderRows(bioHtml, keep);
        fs.writeFileSync(bioHtmlPath, bioHtml, 'utf8');
        console.log(`OK bio HTML: removed Pharmaresearch → ${bioCos.length}`);
      } catch (e) {
        console.warn('bio HTML strip skipped:', e.message);
      }
    }
  }
}

function stubCosmeticsFromKrx() {
  const krx = loadMergedKrxMap(path.join(ROOT, 'data'));
  const meta3557 = loadListedEnglish3557Map(path.join(ROOT, 'data'));
  const perPbr = loadPerPbrMap(path.join(ROOT, 'data'));
  const out = [];
  for (const ticker of COSMETICS_ALL) {
    const row = krx.get(ticker);
    const meta = meta3557.get(ticker);
    const fin = perPbr.get(ticker);
    const name = row?.name || ticker;
    const nameEn = formatListedEnglishName(meta?.nameEn || name);
    const id = `cos_${ticker}`;
    out.push({
      id,
      name,
      nameEn,
      ticker,
      market: row?.market || 'KOSPI',
      chain: chainForCosmetics(ticker),
      semType: '—',
      semTypeEn: '—',
      products: '—',
      productsEn: '—',
      revenue: fmtMcap(row?.mcap || 0),
      mcapWon: row?.mcap || 0,
      revTier: mcapTier(row?.mcap || 0),
      per: fin?.per ?? null,
      pbr: fin?.pbr ?? null,
      partners: [],
    });
  }
  return out.sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
}

function resolveCosmeticsCompanies(fromKconsume) {
  if (fromKconsume.length === COSMETICS_ALL.size) {
    return fromKconsume
      .map((c) => ({
        ...c,
        chain: chainForCosmetics(String(c.ticker).padStart(6, '0')),
      }))
      .sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  }

  const cosmeticsPath = path.join(ROOT, COSMETICS_META.folder, COSMETICS_META.file);
  if (fs.existsSync(cosmeticsPath)) {
    try {
      const existing = extractCompaniesFromHtml(fs.readFileSync(cosmeticsPath, 'utf8'))
        .filter((c) => COSMETICS_ALL.has(String(c.ticker).padStart(6, '0')))
        .map((c) => ({
          ...c,
          chain: chainForCosmetics(String(c.ticker).padStart(6, '0')),
        }));
      if (existing.length === COSMETICS_ALL.size) {
        console.log('cosmetics: reusing existing map companies (idempotent)');
        return existing.sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
      }
      if (existing.length > 0) {
        const byTicker = new Map(existing.map((c) => [String(c.ticker).padStart(6, '0'), c]));
        for (const stub of stubCosmeticsFromKrx()) {
          if (!byTicker.has(stub.ticker)) byTicker.set(stub.ticker, stub);
        }
        const merged = [...byTicker.values()].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
        if (merged.length === COSMETICS_ALL.size) {
          console.log(`cosmetics: merged existing (${existing.length}) + stubs → ${merged.length}`);
          return merged;
        }
      }
    } catch (e) {
      console.warn('cosmetics existing parse skipped:', e.message);
    }
  }

  console.log('cosmetics: building from KRX stubs (not in kconsume)');
  return stubCosmeticsFromKrx();
}

function main() {
  const kconsumeHtml = fs.readFileSync(KCONSUME_HTML, 'utf8');
  const all = extractCompaniesFromHtml(kconsumeHtml);

  const fromKconsume = all.filter((c) =>
    COSMETICS_ALL.has(String(c.ticker).padStart(6, '0')),
  );
  const cosmetics = resolveCosmeticsCompanies(fromKconsume);

  const remain = all
    .filter((c) => !DROP_FROM_KCONSUME.has(String(c.ticker).padStart(6, '0')))
    .sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));

  if (cosmetics.length !== COSMETICS_ALL.size) {
    console.warn(`Expected ${COSMETICS_ALL.size} cosmetics, got ${cosmetics.length}`);
  }

  // Prefer cosmetics HTML as template once created; else clone from kconsume.
  const cosmeticsPath = path.join(ROOT, COSMETICS_META.folder, COSMETICS_META.file);
  const templateHtml = fs.existsSync(cosmeticsPath)
    ? fs.readFileSync(cosmeticsPath, 'utf8')
    : kconsumeHtml;

  writeCosmeticsMap(templateHtml, cosmetics);
  rewriteKconsume(kconsumeHtml, remain);
  movePharmaresearchToMedtech();

  fs.writeFileSync(
    path.join(ROOT, 'data', 'cosmetics_sector_split_review.json'),
    JSON.stringify(
      {
        cosmetics: cosmetics.map((c) => ({
          ticker: c.ticker,
          name: c.name,
          chain: c.chain,
          mcapWon: c.mcapWon || 0,
        })),
        kconsumeRemain: remain.map((c) => ({ ticker: c.ticker, name: c.name, chain: c.chain })),
        droppedFromKconsume: ['214150'],
        movedBioToMedtech: [PHARMARESEARCH],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

main();
