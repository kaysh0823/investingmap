/**
 * Confirmed rebalance:
 * A) medtech → cosmetics (미용기기): 214150, 214450, 336570
 * B) bio → medtech (진단·IVD): 137310, 099190, 228760
 * Display: cosmetics=화장품/미용기기, medtech=의료기기/헬스케어
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  esc,
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
  fmtMcap,
  mcapTier,
} from '../lib/map_company_serialize.mjs';
import {
  loadMergedKrxMap,
  loadListedEnglish3557Map,
  formatListedEnglishName,
} from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COS_HTML = path.join(ROOT, 'cosmetics', 'korea_cosmetics_map.html');
const MT_HTML = path.join(ROOT, 'medtech', 'korea_medtech_map.html');
const BIO_JSX = path.join(ROOT, 'bio', 'biomap.jsx');
const BIO_INLINE = path.join(ROOT, 'bio', 'korea_bio_map.inline.js');
const BIO_ADDITIONS = path.join(ROOT, 'bio', 'cp_list_bio_additions.json');

const TO_COSMETICS = new Set(['214150', '214450', '336570']);
const TO_MEDTECH = new Set(['137310', '099190', '228760']);

const COS_CHAINS = ['브랜드', 'ODM·OEM', '원료', '용기', '유통·채널', '미용기기'];
const COS_COLORS = {
  브랜드: '#F48FB1',
  'ODM·OEM': '#CE93D8',
  원료: '#80CBC4',
  용기: '#FFCC80',
  '유통·채널': '#81D4FA',
  미용기기: '#EF9A9A',
};
const COS_LABEL_KO = Object.fromEntries(COS_CHAINS.map((c) => [c, c]));
const COS_LABEL_EN = {
  브랜드: 'Brands',
  'ODM·OEM': 'ODM / OEM',
  원료: 'Ingredients',
  용기: 'Packaging',
  '유통·채널': 'Channels & distribution',
  미용기기: 'Aesthetic devices',
};

const MT_CHAINS = ['진단·IVD', '임플란트·치과', '의료장비·수술'];
const MT_COLORS = {
  '진단·IVD': '#42A5F5',
  '임플란트·치과': '#66BB6A',
  '의료장비·수술': '#AB47BC',
};
const MT_LABEL_KO = Object.fromEntries(MT_CHAINS.map((c) => [c, c]));
const MT_LABEL_EN = {
  '진단·IVD': 'Diagnostics / IVD',
  '임플란트·치과': 'Implants / dental',
  '의료장비·수술': 'Equipment / surgery',
};

const COS_TITLE = {
  ko: '한국 화장품/미용기기 투자 지도',
  en: 'Korea Cosmetics / Aesthetic Devices Map',
  subKo: '브랜드·ODM/OEM·미용기기·유통·채널 — 상장사와 글로벌 참고 관계',
  subEn: 'Brands, ODM/OEM, aesthetic devices, and channels — listed companies and reference relationships',
  descKo: '화장품 브랜드·ODM/OEM·미용기기·유통 채널 관련 상장사의 KRX 데이터와 글로벌 참고 관계를 정리합니다.',
  descEn: 'Listed Korean cosmetics brands, ODM/OEM, aesthetic devices, and channel companies with illustrative global relationships.',
};

const MT_TITLE = {
  ko: '한국 의료기기/헬스케어 투자 지도',
  en: 'Korea MedTech / Healthcare Map',
  subKo: '진단·IVD·임플란트·의료장비 — 상장사와 글로벌 peer 참고 관계',
  subEn: 'Diagnostics, implants, and medical equipment — listed companies and peer relationships',
  descKo: '진단·IVD·임플란트·의료장비 등 의료기기/헬스케어 관련 상장사의 KRX 데이터와 글로벌 peer 참고 관계를 정리합니다.',
  descEn: 'KRX metrics and illustrative global peer relationships for listed Korean medtech/healthcare companies across diagnostics, implants, and equipment.',
};

function pad(t) {
  return String(t).padStart(6, '0');
}

function stripPrerenderRows(html, keepTickers) {
  const start = '<!-- investingmap-seo-prerender-start -->';
  const end = '<!-- investingmap-seo-prerender-end -->';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end);
  const strip = (body) =>
    body.replace(/<tr data-ticker="([^"]+)">[\s\S]*?<\/tr>/g, (full, t) =>
      keepTickers.has(pad(t)) ? full : '',
    );
  if (i0 === -1 || i1 === -1 || i1 <= i0) return strip(html);
  return html.slice(0, i0 + start.length) + strip(html.slice(i0 + start.length, i1)) + html.slice(i1);
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
  out = out.replace(/("ko":\s*\{[\s\S]*?"chainLabel":\s*\{)[\s\S]*?(\n\s*\},)/, `$1\n${blockKo}$2`);
  out = out.replace(/("ko":\s*\{[\s\S]*?"chainFilter":\s*\{)[\s\S]*?(\n\s*\},)/, `$1\n${blockKo}$2`);
  out = out.replace(/("en":\s*\{[\s\S]*?"chainLabel":\s*\{)[\s\S]*?(\n\s*\},)/, `$1\n${blockEn}$2`);
  out = out.replace(/("en":\s*\{[\s\S]*?"chainFilter":\s*\{)[\s\S]*?(\n\s*\},)/, `$1\n${blockEn}$2`);
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

function patchTitles(html, title, folder, file) {
  const url = `https://www.investingmap.kr/${folder}/${file}`;
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title.ko}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${title.descKo}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title.ko}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${title.descKo}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title.ko}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${title.descKo}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/(<h1 id="hdr-title">)[\s\S]*?(<\/h1>)/, `$1🇰🇷 ${title.ko}$2`)
    .replace(/(<p id="hdr-subtitle">)[^<]*(<\/p>)/, `$1${title.subKo}$2`)
    .replace(/"title":\s*"[^"]*"/, `"title": "🇰🇷 ${title.ko}"`)
    .replace(/"subtitle":\s*"[^"]*"/, `"subtitle": "${title.subKo}"`)
    .replace(/("en":\s*\{[\s\S]*?"title":\s*")[^"]*(")/, `$1🇰🇷 ${title.en}$2`)
    .replace(/("en":\s*\{[\s\S]*?"subtitle":\s*")[^"]*(")/, `$1${title.subEn}$2`);
  return out;
}

function extractBioCompanies() {
  const inline = fs.readFileSync(BIO_INLINE, 'utf8');
  const m = inline.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('bio inline koreanCompanies not found');
  return Function(`"use strict"; return (${m[1]});`)();
}

function stubFromKrx(ticker, chain, extras = {}) {
  const krx = loadMergedKrxMap(path.join(ROOT, 'data'));
  const meta3557 = loadListedEnglish3557Map(path.join(ROOT, 'data'));
  const perPbr = loadPerPbrMap(path.join(ROOT, 'data'));
  const row = krx.get(ticker);
  const meta = meta3557.get(ticker);
  const fin = perPbr.get(ticker);
  return {
    id: extras.id || `mt_${ticker}`,
    name: row?.name || extras.name || ticker,
    nameEn: formatListedEnglishName(meta?.nameEn || extras.nameEn || extras.name || ticker),
    ticker,
    market: row?.market || 'KOSDAQ',
    chain,
    semType: extras.semType || '—',
    semTypeEn: extras.semTypeEn || '—',
    products: extras.products || '—',
    productsEn: extras.productsEn || '—',
    revenue: fmtMcap(row?.mcap || 0),
    mcapWon: row?.mcap || 0,
    revTier: mcapTier(row?.mcap || 0),
    per: fin?.per ?? null,
    pbr: fin?.pbr ?? null,
    partners: extras.partners || [],
  };
}

const BIO_TO_MT_META = {
  '137310': {
    id: 'sd_biosensor',
    name: '에스디바이오센서',
    nameEn: 'SD Biosensor',
    semType: '분자·면역·POCT',
    semTypeEn: 'Molecular / immunoassay / POCT',
    products: '면역·현장진단',
    productsEn: 'Immunoassay & point-of-care diagnostics',
    partners: ['roche', 'abbott'],
  },
  '099190': {
    id: 'isens',
    name: '아이센스',
    nameEn: 'i-SENS',
    semType: '혈당측정·진단',
    semTypeEn: 'Blood glucose diagnostics',
    products: '혈당측정·진단',
    productsEn: 'Blood glucose monitoring',
    partners: ['roche', 'abbott'],
  },
  '228760': {
    id: 'genomictree',
    name: '지노믹트리',
    nameEn: 'Genomictree',
    semType: '분자진단·암진단',
    semTypeEn: 'Molecular / cancer diagnostics',
    products: '분자진단·암진단',
    productsEn: 'Molecular cancer diagnostics',
    partners: ['roche', 'illumina'],
  },
};

function writeCosmetics(cosHtml, companies) {
  const keep = new Set(companies.map((c) => pad(c.ticker)));
  const mapUrl = 'https://www.investingmap.kr/cosmetics/korea_cosmetics_map.html';
  let html = patchKoreanCompaniesHtml(cosHtml, companies);
  html = stripPrerenderRows(html, keep);
  html = rebuildItemList(html, companies, COS_TITLE.ko, mapUrl);
  html = patchTitles(html, COS_TITLE, 'cosmetics', 'korea_cosmetics_map.html');
  html = html.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${JSON.stringify(COS_COLORS)};`);
  html = patchChainLabels(html, COS_CHAINS, COS_LABEL_KO, COS_LABEL_EN);
  html = patchStaticChainArrays(html, COS_CHAINS, { hideEmpty: true });
  const angle = COS_CHAINS.map((c, i) => `'${esc(c)}': ${Math.round((360 / COS_CHAINS.length) * i)}`).join(', ');
  html = html.replace(/const ANGLE = \{[\s\S]*?\};/, `const ANGLE = { ${angle} };`);
  fs.writeFileSync(COS_HTML, html, 'utf8');
  console.log(`OK cosmetics: ${companies.length}`);
}

function writeMedtech(mtHtml, companies) {
  const keep = new Set(companies.map((c) => pad(c.ticker)));
  const mapUrl = 'https://www.investingmap.kr/medtech/korea_medtech_map.html';
  let html = patchKoreanCompaniesHtml(mtHtml, companies);
  html = stripPrerenderRows(html, keep);
  html = rebuildItemList(html, companies, MT_TITLE.ko, mapUrl);
  html = patchTitles(html, MT_TITLE, 'medtech', 'korea_medtech_map.html');
  html = html.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${JSON.stringify(MT_COLORS)};`);
  html = patchChainLabels(html, MT_CHAINS, MT_LABEL_KO, MT_LABEL_EN);
  html = patchStaticChainArrays(html, MT_CHAINS, { hideEmpty: false });
  const angle = MT_CHAINS.map((c, i) => `'${esc(c)}': ${Math.round((360 / MT_CHAINS.length) * i)}`).join(', ');
  html = html.replace(/const ANGLE = \{[\s\S]*?\};/, `const ANGLE = { ${angle} };`);
  // Drop legacy 미용기기 references in subtitle strings if any remain
  html = html.replace(/진단·IVD·임플란트·미용기기·의료장비/g, '진단·IVD·임플란트·의료장비');
  fs.writeFileSync(MT_HTML, html, 'utf8');
  console.log(`OK medtech: ${companies.length}`);
}

function scrubBioSources() {
  if (fs.existsSync(BIO_JSX)) {
    let jsx = fs.readFileSync(BIO_JSX, 'utf8');
    const before = jsx;
    for (const t of TO_MEDTECH) {
      jsx = jsx.replace(new RegExp(`\\s*\\{[^{}]*ticker:\\s*"${t}"[^{}]*\\},?`, 'g'), '');
    }
    if (jsx !== before) {
      fs.writeFileSync(BIO_JSX, jsx, 'utf8');
      console.log('OK biomap.jsx: removed IVD → medtech tickers');
    }
  }
  if (fs.existsSync(BIO_ADDITIONS)) {
    const arr = JSON.parse(fs.readFileSync(BIO_ADDITIONS, 'utf8'));
    const next = arr.filter((x) => !TO_MEDTECH.has(pad(x.ticker)));
    if (next.length !== arr.length) {
      fs.writeFileSync(BIO_ADDITIONS, JSON.stringify(next, null, 2) + '\n', 'utf8');
      console.log(`OK cp_list_bio_additions: ${arr.length} → ${next.length}`);
    }
  }
}

function patchMedtechBuilder() {
  const fp = path.join(ROOT, 'build_korea_medtech_map.mjs');
  if (!fs.existsSync(fp)) return;
  let src = fs.readFileSync(fp, 'utf8');
  // Remove AES seeds
  src = src.replace(/\s*\{ id: 'classys'[\s\S]*?partners: \[[^\]]+\] \},/, '');
  src = src.replace(/\s*\{ id: 'pharmaresearch'[\s\S]*?partners: \[[^\]]+\] \},/, '');
  src = src.replace(/\s*\{ id: 'wontech'[\s\S]*?partners: \[[^\]]+\] \},/, '');
  // Drop AES from S / SECTOR_ORDER if still present — leave constants; runtime HTML is source of truth after rebalance
  if (!src.includes("'137310'")) {
    src = src.replace(
      /\{ id: 'inbody'[\s\S]*?partners: \[[^\]]+\] \},/,
      (m) => `${m}
  { id: 'sd_biosensor', name: '에스디바이오센서', nameEn: 'SD Biosensor', ticker: '137310', chain: S.DX, semType: '분자·면역·POCT', semTypeEn: 'Molecular / immunoassay / POCT', products: '면역·현장진단', productsEn: 'Immunoassay & point-of-care diagnostics', partners: ['roche', 'abbott'] },
  { id: 'isens', name: '아이센스', nameEn: 'i-SENS', ticker: '099190', chain: S.DX, semType: '혈당측정·진단', semTypeEn: 'Blood glucose diagnostics', products: '혈당측정·진단', productsEn: 'Blood glucose monitoring', partners: ['roche', 'abbott'] },
  { id: 'genomictree', name: '지노믹트리', nameEn: 'Genomictree', ticker: '228760', chain: S.DX, semType: '분자진단·암진단', semTypeEn: 'Molecular / cancer diagnostics', products: '분자진단·암진단', productsEn: 'Molecular cancer diagnostics', partners: ['roche', 'illumina'] },`,
    );
  }
  src = src.replace(/한국 미용\/의료기기 투자 지도/g, '한국 의료기기/헬스케어 투자 지도');
  src = src.replace(/Korea Beauty \/ MedTech Map/g, 'Korea MedTech / Healthcare Map');
  src = src.replace(/진단·임플란트·미용기기·의료장비/g, '진단·임플란트·의료장비');
  src = src.replace(/Diagnostics, implants, aesthetic devices, and medical equipment/g, 'Diagnostics, implants, and medical equipment');
  fs.writeFileSync(fp, src, 'utf8');
  console.log('OK build_korea_medtech_map.mjs seed/titles');
}

function patchCosmeticsSplitMeta() {
  const fp = path.join(ROOT, 'scripts', 'split_kconsume_cosmetics.mjs');
  if (!fs.existsSync(fp)) return;
  let src = fs.readFileSync(fp, 'utf8');
  if (!src.includes("'미용기기'")) {
    src = src.replace(
      /allChains: \['브랜드', 'ODM·OEM', '원료', '용기', '유통·채널'\]/,
      "allChains: ['브랜드', 'ODM·OEM', '원료', '용기', '유통·채널', '미용기기']",
    );
    src = src.replace(
      /'유통·채널': '#81D4FA',\s*\}/,
      "'유통·채널': '#81D4FA',\n    '미용기기': '#EF9A9A',\n  }",
    );
    src = src.replace(
      /'유통·채널': '유통·채널',\s*\}/,
      "'유통·채널': '유통·채널',\n    '미용기기': '미용기기',\n  }",
    );
    src = src.replace(
      /'유통·채널': 'Channels & distribution',\s*\}/,
      "'유통·채널': 'Channels & distribution',\n    '미용기기': 'Aesthetic devices',\n  }",
    );
  }
  src = src.replace(/titleKo: '한국 화장품 투자 지도'/, "titleKo: '한국 화장품/미용기기 투자 지도'");
  src = src.replace(/titleEn: 'Korea Cosmetics Industry Map'/, "titleEn: 'Korea Cosmetics / Aesthetic Devices Map'");
  fs.writeFileSync(fp, src, 'utf8');
  console.log('OK split_kconsume_cosmetics.mjs meta');
}

function main() {
  const cos = extractCompaniesFromHtml(fs.readFileSync(COS_HTML, 'utf8'));
  const mt = extractCompaniesFromHtml(fs.readFileSync(MT_HTML, 'utf8'));
  const bio = extractBioCompanies();

  const aesByTicker = new Map();
  for (const c of cos.filter((x) => TO_COSMETICS.has(pad(x.ticker)))) {
    aesByTicker.set(pad(c.ticker), { ...c, chain: '미용기기' });
  }
  for (const c of mt.filter((x) => TO_COSMETICS.has(pad(x.ticker)))) {
    aesByTicker.set(pad(c.ticker), { ...c, chain: '미용기기' });
  }
  for (const t of TO_COSMETICS) {
    if (!aesByTicker.has(t)) {
      const meta =
        t === '214150'
          ? {
              id: 'classys',
              name: '클래시스',
              nameEn: 'Classys',
              semType: '미용 의료기기',
              semTypeEn: 'Aesthetic medical devices',
              products: 'HIFU·RF 장비',
              productsEn: 'HIFU & RF devices',
              partners: ['allergan', 'cynosure', 'syneron'],
            }
          : t === '214450'
            ? {
                id: 'pharmaresearch',
                name: '파마리서치',
                nameEn: 'PharmaResearch',
                semType: '스킨부스터·재생의학',
                semTypeEn: 'Skin boosters & regenerative aesthetics',
                products: '리쥬란(PDRN) 스킨부스터',
                productsEn: 'Rejuran (PDRN) skin boosters',
                partners: ['allergan', 'cynosure'],
              }
            : {
                id: 'wontech',
                name: '원텍',
                nameEn: 'Won Tech',
                semType: '레이저·미용기기',
                semTypeEn: 'Laser & aesthetic devices',
                products: '레이저·에너지 기반 미용기기',
                productsEn: 'Laser & energy-based aesthetic devices',
                partners: ['cynosure', 'syneron', 'cutera'],
              };
      aesByTicker.set(t, stubFromKrx(t, '미용기기', meta));
    }
  }

  const movingIvd = [];
  for (const t of TO_MEDTECH) {
    const fromBio = bio.find((c) => pad(c.ticker) === t);
    const fromMt = mt.find((c) => pad(c.ticker) === t);
    const meta = BIO_TO_MT_META[t];
    if (fromMt) {
      movingIvd.push({ ...fromMt, chain: '진단·IVD', ...pickMeta(meta) });
    } else if (fromBio) {
      movingIvd.push({
        ...fromBio,
        id: meta.id,
        chain: '진단·IVD',
        semType: meta.semType,
        semTypeEn: meta.semTypeEn,
        products: meta.products,
        productsEn: meta.productsEn,
        partners: meta.partners,
      });
    } else {
      movingIvd.push(stubFromKrx(t, '진단·IVD', meta));
    }
  }

  const cosNext = [
    ...cos.filter((c) => !TO_COSMETICS.has(pad(c.ticker))),
    ...aesByTicker.values(),
  ].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));

  const mtNext = [
    ...mt.filter((c) => !TO_COSMETICS.has(pad(c.ticker)) && !TO_MEDTECH.has(pad(c.ticker))),
    ...movingIvd,
  ]
    .filter((c) => c.chain !== '미용기기')
    .sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));

  if (cosNext.length < 13) console.warn(`Expected ≥13 cosmetics, got ${cosNext.length}`);
  if (mtNext.length < 5) {
    console.warn(`WARN medtech count ${mtNext.length} < 5 — consider cp_list diagnostics/implants/equipment reinforcement`);
  }
  console.log(
    `moves: aes→cos ${[...aesByTicker.keys()].join(',')}; ivd→mt ${movingIvd.map((c) => c.ticker).join(',')}`,
  );

  writeCosmetics(fs.readFileSync(COS_HTML, 'utf8'), cosNext);
  writeMedtech(fs.readFileSync(MT_HTML, 'utf8'), mtNext);
  scrubBioSources();
  patchMedtechBuilder();
  patchCosmeticsSplitMeta();

  fs.writeFileSync(
    path.join(ROOT, 'data', 'cosmetics_medtech_bio_rebalance_review.json'),
    JSON.stringify(
      {
        cosmetics: cosNext.map((c) => ({ ticker: c.ticker, name: c.name, chain: c.chain })),
        medtech: mtNext.map((c) => ({ ticker: c.ticker, name: c.name, chain: c.chain })),
        movedToCosmetics: [...TO_COSMETICS],
        movedToMedtech: [...TO_MEDTECH],
        displayNames: { cosmetics: COS_TITLE.ko, medtech: MT_TITLE.ko },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

function pickMeta(meta) {
  return {
    id: meta.id,
    semType: meta.semType,
    semTypeEn: meta.semTypeEn,
    products: meta.products,
    productsEn: meta.productsEn,
    partners: meta.partners,
  };
}

main();
