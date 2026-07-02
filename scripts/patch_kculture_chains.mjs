/**
 * K-culture map: remove 삼성물산, split 게임/패션/쇼핑·유통 chains, add department-store names.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
  fmtMcap,
  mcapTier,
  slugId,
} from '../lib/map_company_serialize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP = path.join(ROOT, 'kculture/korea_kculture_map.html');

export const KCULTURE_CHAINS = [
  '음식·라면·식품',
  '여행·레저·항공',
  '화장품·뷰티케어',
  '게임',
  '패션',
  '쇼핑/유통',
  '드라마·미디어·웹툰·컨텐츠',
  'K-pop·엔터테인먼트',
];

export const CHAIN_COLORS = {
  '음식·라면·식품': '#FF8A65',
  '여행·레저·항공': '#4FC3F7',
  '화장품·뷰티케어': '#F48FB1',
  '게임': '#66BB6A',
  '패션': '#AB47BC',
  '쇼핑/유통': '#26A69A',
  '드라마·미디어·웹툰·컨텐츠': '#BA68C8',
  'K-pop·엔터테인먼트': '#FFD54F',
};

const CHAIN_ANGLES = {
  '음식·라면·식품': 0,
  '여행·레저·항공': 45,
  '화장품·뷰티케어': 90,
  '게임': 135,
  '패션': 180,
  '쇼핑/유통': 225,
  '드라마·미디어·웹툰·컨텐츠': 270,
  'K-pop·엔터테인먼트': 315,
};

const GAME_TICKERS = new Set([
  '259960', '036570', '251270', '263750', '462870', '192080', '225570', '112040',
  '095660', '069080', '078340', '293490',
]);

const FASHION_TICKERS = new Set(['111770', '383220', '081660', '093050', '020000']);

const RETAIL_TICKERS = new Set(['139480', '007070', '023530', '004170', '069960']);

const FOOD_TICKERS = new Set(['005180', '136480']);

const BEAUTY_TICKERS = new Set(['214150', '257720']);

const MEDIA_TICKERS = new Set(['079160']);

const NEW_RETAIL = [
  {
    ticker: '023530',
    name: '롯데쇼핑',
    nameEn: 'LOTTE SHOPPING CO., LTD.',
    market: 'KOSPI',
    semType: '백화점·아울렛·면세',
    semTypeEn: 'Department stores, outlets & duty-free',
    products: '롯데백화점·롯데아울렛·면세',
    productsEn: 'Lotte Department Store, outlets, duty-free',
    mcapWon: 5533280478000,
    per: 14.28,
    pbr: 0.36,
  },
  {
    ticker: '004170',
    name: '신세계',
    nameEn: 'Shinsegae Co.,Ltd',
    market: 'KOSPI',
    semType: '백화점·이마트·스타필드',
    semTypeEn: 'Department stores, Emart affiliate & Starfield',
    products: '신세계백화점·스타필드·이마트 지분',
    productsEn: 'Shinsegae Dept., Starfield malls, Emart stake',
    mcapWon: 6564400795000,
    per: 17.14,
    pbr: 1.37,
  },
  {
    ticker: '069960',
    name: '현대백화점',
    nameEn: 'HYUNDAI DEPARTMENT STORE CO.,LTD',
    market: 'KOSPI',
    semType: '백화점·아울렛',
    semTypeEn: 'Department stores & outlets',
    products: '현대백화점·현대아울렛',
    productsEn: 'Hyundai Department Store & outlets',
    mcapWon: 3823458897600,
    per: 13.33,
    pbr: 0.84,
  },
];

function inferChain(c) {
  if (BEAUTY_TICKERS.has(c.ticker)) return '화장품·뷰티케어';
  if (MEDIA_TICKERS.has(c.ticker)) return '드라마·미디어·웹툰·컨텐츠';
  if (GAME_TICKERS.has(c.ticker)) return '게임';
  if (FASHION_TICKERS.has(c.ticker)) return '패션';
  if (RETAIL_TICKERS.has(c.ticker)) return '쇼핑/유통';
  if (FOOD_TICKERS.has(c.ticker)) return '음식·라면·식품';
  const st = `${c.semType || ''} ${c.semTypeEn || ''}`;
  if (/게임|game/i.test(st) && !/웹툰·게임·클라우드|Webtoon, games/i.test(st)) return '게임';
  if (/패션|의류|fashion|apparel/i.test(st)) return '패션';
  if (/백화점|편의점|마트|hypermarket|department store|convenience store/i.test(st)) return '쇼핑/유통';
  if (/유통|retail/i.test(st) && !/뷰티|beauty|영화|cinema|film|웹툰|webtoon/i.test(st)) return '쇼핑/유통';
  return c.chain;
}

function makeRetailStub(row) {
  return {
    id: slugId(row.ticker, row.nameEn, 'kc'),
    name: row.name,
    nameEn: row.nameEn,
    ticker: row.ticker,
    market: row.market,
    chain: '쇼핑/유통',
    semType: row.semType,
    semTypeEn: row.semTypeEn,
    products: row.products,
    productsEn: row.productsEn,
    revenue: fmtMcap(row.mcapWon),
    mcapWon: row.mcapWon,
    per: row.per,
    pbr: row.pbr,
    revTier: mcapTier(row.mcapWon),
    partners: [],
  };
}

function patchChainColors(html) {
  const json = JSON.stringify(CHAIN_COLORS);
  return html.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${json};`);
}

function patchChainArrays(html) {
  const list = `['all', ${KCULTURE_CHAINS.map((c) => `'${c}'`).join(', ')}]`;
  const legend = `[${KCULTURE_CHAINS.map((c) => `'${c}'`).join(', ')}]`;
  let out = html.replace(
    /const chains = \['all',[^\]]+\];/,
    `const chains = ${list};`,
  );
  out = out.replace(
    /const chains = \['음식·라면·식품',[^\]]+\];/,
    `const chains = ${legend};`,
  );
  return out;
}

function patchGraphAngles(html) {
  const angleObj = JSON.stringify(CHAIN_ANGLES).replace(/"/g, "'");
  return outReplaceAngles(html, angleObj);
}

function outReplaceAngles(html, angleObj) {
  const re = /\{ '음식·라면·식품': 0, '여행·레저·항공': 72, '화장품·뷰티케어': 144, '드라마·미디어·웹툰·컨텐츠': 216, 'K-pop·엔터테인먼트': 288 \}/g;
  return html.replace(re, angleObj);
}

function patchI18nChains(html) {
  const koLabel = {
    '음식·라면·식품': '라면·식품·스낵',
    '여행·레저·항공': '여행사·항공·호텔',
    '화장품·뷰티케어': '화장품·뷰티 ODM',
    '게임': '모바일·PC 게임·IP',
    '패션': '의류·스포츠 브랜드',
    '쇼핑/유통': '백화점·마트·편의점',
    '드라마·미디어·웹툰·컨텐츠': '드라마·웹툰·스트리밍',
    'K-pop·엔터테인먼트': 'K-pop·음악·글로벌 공연',
  };
  const koFilter = {
    '음식·라면·식품': '음식·라면',
    '여행·레저·항공': '여행·레저',
    '화장품·뷰티케어': '화장품',
    '게임': '게임',
    '패션': '패션',
    '쇼핑/유통': '쇼핑·유통',
    '드라마·미디어·웹툰·컨텐츠': '미디어·웹툰',
    'K-pop·엔터테인먼트': 'K-pop',
  };
  const enLabel = {
    '음식·라면·식품': 'Ramen, packaged food & snacks',
    '여행·레저·항공': 'Travel agencies, airlines & leisure',
    '화장품·뷰티케어': 'Beauty brands & cosmetics ODM',
    '게임': 'Mobile & PC games, IP',
    '패션': 'Apparel & licensed brands',
    '쇼핑/유통': 'Dept. stores, hypermarkets & CVS',
    '드라마·미디어·웹툰·컨텐츠': 'Drama, webtoons & streaming IP',
    'K-pop·엔터테인먼트': 'K-pop labels & live entertainment',
  };
  const enFilter = {
    '음식·라면·식품': 'Food & ramen',
    '여행·레저·항공': 'Travel',
    '화장품·뷰티케어': 'Beauty',
    '게임': 'Games',
    '패션': 'Fashion',
    '쇼핑/유통': 'Retail',
    '드라마·미디어·웹툰·컨텐츠': 'Media & webtoon',
    'K-pop·엔터테인먼트': 'K-pop',
  };

  function block(obj, indent) {
    return Object.entries(obj)
      .map(([k, v]) => `${indent}"${k}": "${v}"`)
      .join(',\n');
  }

  let out = html;
  out = out.replace(
    /"chainLabel": \{[\s\S]*?"K-pop·엔터테인먼트": "[^"]+"\s*\}/,
    `"chainLabel": {\n            ${block(koLabel, '            ')}\n        }`,
  );
  out = out.replace(
    /"chainFilter": \{[\s\S]*?"K-pop·엔터테인먼트": "[^"]+"\s*\}/,
    `"chainFilter": {\n            ${block(koFilter, '            ')}\n        }`,
    1,
  );
  out = out.replace(
    /"chainLabel": \{[\s\S]*?"K-pop·엔터테인먼트": "[^"]+"\s*\}/,
    `"chainLabel": {\n            ${block(enLabel, '            ')}\n        }`,
  );
  out = out.replace(
    /"chainFilter": \{[\s\S]*?"K-pop·엔터테인먼트": "[^"]+"\s*\}/,
    `"chainFilter": {\n            ${block(enFilter, '            ')}\n        }`,
  );
  return out;
}

function main() {
  let html = fs.readFileSync(MAP, 'utf8');
  let companies = extractCompaniesFromHtml(html).filter((c) => c.ticker !== '028260');

  const byTicker = new Map(companies.map((c) => [c.ticker, c]));
  for (const row of NEW_RETAIL) {
    if (!byTicker.has(row.ticker)) {
      byTicker.set(row.ticker, makeRetailStub(row));
    }
  }

  companies = [...byTicker.values()]
    .map((c) => ({ ...c, chain: inferChain(c) }))
    .sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));

  html = patchKoreanCompaniesHtml(html, companies);
  html = patchChainColors(html);
  html = patchChainArrays(html);
  html = patchGraphAngles(html);
  // i18n chainLabel/chainFilter patched manually in map HTML (ko/en blocks differ)

  fs.writeFileSync(MAP, html, 'utf8');
  console.log(`OK kculture chains — ${companies.length} companies`);
  const counts = {};
  for (const c of companies) counts[c.chain] = (counts[c.chain] || 0) + 1;
  console.log(counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
