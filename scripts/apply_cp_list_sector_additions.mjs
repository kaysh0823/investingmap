/**
 * Merge committed cp_list additions into curated sector maps (cosmetics, medtech, holdings).
 * Source: {sector}/cp_list_{sector}_additions.json
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  esc,
  extractCompaniesFromHtml,
  fmtMcap,
  mcapTier,
  patchKoreanCompaniesHtml,
  slugId,
} from '../lib/map_company_serialize.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SECTOR_MAPS = {
  semi: {
    path: 'semiconductor/korea_semiconductor_map.html',
    additions: 'semiconductor/cp_list_semi_additions.json',
    idPrefix: '',
  },
  cosmetics: {
    path: 'cosmetics/korea_cosmetics_map.html',
    additions: 'cosmetics/cp_list_cosmetics_additions.json',
    idPrefix: 'cos',
    globalAdditions: [
      { id: 'loreal', name: "L'Oréal", nameEn: "L'Oréal", country: '프랑스/France', region: 'eu', sector: 'Beauty' },
      { id: 'shiseido', name: 'Shiseido', nameEn: 'Shiseido', country: '일본/Japan', region: 'jp', sector: 'Beauty' },
      { id: 'intercos', name: 'Intercos', nameEn: 'Intercos', country: '이탈리아/Italy', region: 'eu', sector: 'Cosmetics ODM' },
      { id: 'albea', name: 'Albéa', nameEn: 'Albéa', country: '프랑스/France', region: 'eu', sector: 'Cosmetics packaging' },
      { id: 'aptar', name: 'Aptar', nameEn: 'Aptar', country: '미국/USA', region: 'us', sector: 'Dispensing packaging' },
    ],
  },
  medtech: {
    path: 'medtech/korea_medtech_map.html',
    additions: 'medtech/cp_list_medtech_additions.json',
    idPrefix: 'medtech',
    globalAdditions: [
      { id: '3m', name: '3M', nameEn: '3M', country: '미국/USA', region: 'us', sector: 'Medical devices & materials' },
      { id: 'zeiss', name: 'ZEISS', nameEn: 'ZEISS', country: '독일/Germany', region: 'eu', sector: 'Microscopy & optics' },
    ],
  },
  holdings: {
    path: 'holdings/korea_holdings_map.html',
    additions: 'holdings/cp_list_holdings_additions.json',
    idPrefix: 'holdings',
  },
  finance: {
    path: 'finance/korea_finance_map.html',
    additions: 'finance/cp_list_finance_additions.json',
    idPrefix: 'finance',
  },
  ship: {
    path: 'ship/korea_ship_map.html',
    additions: 'ship/cp_list_ship_additions.json',
    idPrefix: 'ship',
  },
  battery: {
    path: 'battery/korea_battery_map.html',
    additions: 'battery/cp_list_battery_additions.json',
    idPrefix: 'battery',
    globalAdditions: [
      { id: 'panasonic', name: 'Panasonic', nameEn: 'Panasonic', country: '일본/Japan', region: 'jp', sector: 'Battery cells & industrial' },
      { id: 'umicore', name: 'Umicore', nameEn: 'Umicore', country: '벨기에/Belgium', region: 'eu', sector: 'Battery recycling & materials' },
    ],
  },
  robot: {
    path: 'robot/korea_robot_map.html',
    additions: 'robot/cp_list_robot_additions.json',
    idPrefix: 'robot',
    globalAdditions: [
      { id: 'yaskawa', name: 'Yaskawa', nameEn: 'Yaskawa Electric', country: '일본/Japan', region: 'jp', sector: 'Industrial robots & drives' },
    ],
  },
  kconsume: {
    path: 'kconsume/korea_kconsume_map.html',
    additions: 'kconsume/cp_list_kconsume_additions.json',
    idPrefix: 'kc',
    chainOrder: ['음식·라면·식품', '패션', '쇼핑/유통', '가구·리빙', '물류·상사'],
    extraChains: {
      '물류·상사': { color: '#5C6BC0', labelEn: 'Logistics & trading' },
    },
    globalAdditions: [
      { id: 'coca_cola', name: 'Coca-Cola', nameEn: 'The Coca-Cola Company', country: '미국/USA', region: 'us', sector: 'Beverages' },
      { id: 'seven_i', name: 'Seven & i Holdings', nameEn: 'Seven & i Holdings', country: '일본/Japan', region: 'jp', sector: 'Convenience & retail' },
      { id: 'walmart', name: 'Walmart', nameEn: 'Walmart', country: '미국/USA', region: 'us', sector: 'Mass retail' },
      { id: 'inditex', name: 'Inditex', nameEn: 'Inditex', country: '스페인/Spain', region: 'eu', sector: 'Fashion retail' },
      { id: 'nike', name: 'Nike', nameEn: 'Nike', country: '미국/USA', region: 'us', sector: 'Sportswear & apparel' },
      { id: 'ikea', name: 'IKEA', nameEn: 'IKEA', country: '스웨덴/Sweden', region: 'eu', sector: 'Home furnishings' },
      { id: 'steelcase', name: 'Steelcase', nameEn: 'Steelcase', country: '미국/USA', region: 'us', sector: 'Office furniture' },
      { id: 'dhl', name: 'DHL Group', nameEn: 'DHL Group', country: '독일/Germany', region: 'eu', sector: 'Logistics peer' },
      { id: 'maersk', name: 'Maersk', nameEn: 'Maersk', country: '덴마크/Denmark', region: 'eu', sector: 'Shipping & logistics peer' },
      { id: 'mitsubishi_corp', name: 'Mitsubishi Corp', nameEn: 'Mitsubishi Corporation', country: '일본/Japan', region: 'jp', sector: 'Trading company peer' },
      { id: 'itochu', name: 'Itochu', nameEn: 'Itochu Corporation', country: '일본/Japan', region: 'jp', sector: 'Trading company peer' },
    ],
  },
  software: {
    path: 'software/korea_software_map.html',
    additions: 'software/cp_list_software_additions.json',
    idPrefix: 'sw',
    chainOrder: ['플랫폼·AI', 'SI·클라우드', '기업SW·SaaS', '보안', '결제·핀테크'],
    legendFirstChain: '플랫폼·AI',
    extraChains: {
      '결제·핀테크': { color: '#7E57C2', labelEn: 'Payments & fintech' },
    },
    globalAdditions: [
      { id: 'visa', name: 'Visa', nameEn: 'Visa', country: '미국/USA', region: 'us', sector: 'Payment networks' },
      { id: 'paypal', name: 'PayPal', nameEn: 'PayPal', country: '미국/USA', region: 'us', sector: 'Digital payments' },
      { id: 'mastercard', name: 'Mastercard', nameEn: 'Mastercard', country: '미국/USA', region: 'us', sector: 'Payment networks' },
      { id: 'crowdstrike', name: 'CrowdStrike', nameEn: 'CrowdStrike', country: '미국/USA', region: 'us', sector: 'Cybersecurity' },
      { id: 'fortinet', name: 'Fortinet', nameEn: 'Fortinet', country: '미국/USA', region: 'us', sector: 'Network security' },
      { id: 'nvidia', name: 'NVIDIA', nameEn: 'NVIDIA', country: '미국/USA', region: 'us', sector: 'AI compute' },
    ],
  },
  kcontent: {
    path: 'kcontent/korea_kcontent_map.html',
    additions: 'kcontent/cp_list_kcontent_additions.json',
    idPrefix: 'kc',
    chainOrder: ['게임', '드라마·미디어·웹툰·컨텐츠', 'K-pop·엔터테인먼트', '광고', '교육'],
    legendFirstChain: '게임',
    extraChains: {
      '광고': { color: '#FF7043', labelEn: 'Advertising' },
      '교육': { color: '#29B6F6', labelEn: 'Education' },
    },
    globalAdditions: [
      { id: 'wpp', name: 'WPP', nameEn: 'WPP', country: '영국/UK', region: 'gb', sector: 'Advertising holding' },
      { id: 'omnicom', name: 'Omnicom', nameEn: 'Omnicom Group', country: '미국/USA', region: 'us', sector: 'Advertising holding' },
      { id: 'twitch', name: 'Twitch', nameEn: 'Twitch', country: '미국/USA', region: 'us', sector: 'Live streaming' },
      { id: 'coursera', name: 'Coursera', nameEn: 'Coursera', country: '미국/USA', region: 'us', sector: 'Online education' },
    ],
  },
  construction: {
    path: 'construction/korea_construction_map.html',
    additions: 'construction/cp_list_construction_additions.json',
    idPrefix: 'construction',
    chainOrder: [
      '종합건설',
      '종합건설·EPC',
      '주택·디벨로퍼',
      '건설기계',
      '건자재',
      '시멘트',
      '부동산신탁',
      '지주·기타',
    ],
    extraChains: {
      '종합건설·EPC': { color: '#1E88E5', labelEn: 'General construction & EPC' },
      '건자재': { color: '#26A69A', labelEn: 'Building materials' },
      '시멘트': { color: '#8D6E63', labelEn: 'Cement' },
      '부동산신탁': { color: '#5C6BC0', labelEn: 'Real estate trust' },
    },
    globalAdditions: [
      { id: 'holcim', name: 'Holcim', nameEn: 'Holcim', country: '스위스/Switzerland', region: 'eu', sector: 'Cement' },
      { id: 'heidelberg', name: 'Heidelberg Materials', nameEn: 'Heidelberg Materials', country: '독일/Germany', region: 'eu', sector: 'Cement' },
      { id: 'saint_gobain', name: 'Saint-Gobain', nameEn: 'Saint-Gobain', country: '프랑스/France', region: 'eu', sector: 'Building materials' },
      { id: 'ppg', name: 'PPG Industries', nameEn: 'PPG Industries', country: '미국/USA', region: 'us', sector: 'Coatings' },
      { id: 'sherwin_williams', name: 'Sherwin-Williams', nameEn: 'Sherwin-Williams', country: '미국/USA', region: 'us', sector: 'Coatings' },
    ],
  },
  metal: {
    path: 'metal/korea_metal_map.html',
    additions: 'metal/cp_list_metal_additions.json',
    idPrefix: 'metal',
  },
  elec: {
    path: 'elec/korea_elec_map.html',
    additions: 'elec/cp_list_elec_additions.json',
    idPrefix: 'elec',
    globalAdditions: [
      { id: 'hp', name: 'HP', nameEn: 'HP Inc.', country: '미국/USA', region: 'us', sector: 'Printers & PCs' },
      { id: 'canon', name: 'Canon', nameEn: 'Canon', country: '일본/Japan', region: 'jp', sector: 'Printers & imaging' },
      { id: 'xerox', name: 'Xerox', nameEn: 'Xerox', country: '미국/USA', region: 'us', sector: 'Office equipment' },
      { id: 'nichia', name: 'Nichia', nameEn: 'Nichia', country: '일본/Japan', region: 'jp', sector: 'LED & optoelectronics' },
    ],
  },
  auto: {
    path: 'auto/korea_auto_map.html',
    additions: 'auto/cp_list_auto_additions.json',
    idPrefix: 'auto',
    chainOrder: ['완성차', '부품', '타이어', '전장·ADAS', '모빌리티·유통'],
    legendFirstChain: '완성차',
    extraChains: {
      '모빌리티·유통': { color: '#26C6DA', labelEn: 'Mobility & distribution' },
    },
    globalAdditions: [
      { id: 'uber', name: 'Uber', nameEn: 'Uber', country: '미국/USA', region: 'us', sector: 'Mobility platform' },
      { id: 'lyft', name: 'Lyft', nameEn: 'Lyft', country: '미국/USA', region: 'us', sector: 'Ride-hailing' },
      { id: 'carvana', name: 'Carvana', nameEn: 'Carvana', country: '미국/USA', region: 'us', sector: 'Used-car retail' },
      { id: 'autonation', name: 'AutoNation', nameEn: 'AutoNation', country: '미국/USA', region: 'us', sector: 'Auto retail' },
    ],
  },
  telecom: {
    path: 'telecom/korea_telecom_map.html',
    additions: 'telecom/cp_list_telecom_additions.json',
    idPrefix: 'telecom',
  },
};

function padTicker(t) {
  return String(t).trim().padStart(6, '0');
}

function loadAdditions(relPath) {
  const fp = join(ROOT, relPath);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function formatGlobal(g) {
  return (
    `      { id: '${esc(g.id)}', name: '${esc(g.name)}', nameEn: '${esc(g.nameEn)}', ` +
    `country: '${esc(g.country)}', region: '${esc(g.region)}', sector: '${esc(g.sector)}' }`
  );
}

function patchChainProp(html, prop, extraChains, occurrenceIndex) {
  if (!extraChains || !Object.keys(extraChains).length) return html;
  let n = 0;
  const re = new RegExp(`"${prop}"\\s*:\\s*\\{([^}]+)\\}`, 'g');
  return html.replace(re, (full, inner) => {
    if (n++ !== occurrenceIndex) return full;
    let next = inner.trimEnd();
    for (const [chain, meta] of Object.entries(extraChains)) {
      if (inner.includes(`"${chain}"`)) continue;
      const label = occurrenceIndex % 2 === 0 ? chain : meta.labelEn;
      next += `,\n            "${chain}": "${label}"`;
    }
    return `"${prop}": {${next}}`;
  });
}

function patchExtraChains(html, { extraChains, chainOrder, legendFirstChain }) {
  if (!extraChains || !Object.keys(extraChains).length) return html;

  const m = html.match(/const CHAIN_COLORS = (\{[\s\S]*?\});/);
  if (!m) return html;
  const colors = Function(`"use strict"; return (${m[1]});`)();
  for (const [chain, meta] of Object.entries(extraChains)) {
    colors[chain] = meta.color;
  }

  const ordered = [...(chainOrder || [])];
  for (const k of Object.keys(colors)) {
    if (!ordered.includes(k)) ordered.push(k);
  }

  html = html.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${JSON.stringify(colors)};`);

  const chipList = `['all', ${ordered.map((c) => `'${esc(c)}'`).join(', ')}]`;
  const legendList = `[${ordered.map((c) => `'${esc(c)}'`).join(', ')}]`;
  html = html.replace(/const chains = \['all',[^\]]+\];/, `const chains = ${chipList};`);
  html = html.replace(/const chains = \['종합건설',[^\]]+\];/, `const chains = ${legendList};`);
  if (legendFirstChain) {
    const legendRe = new RegExp(`const chains = \\['${esc(legendFirstChain)}',[^\\]]+\\];`, 'g');
    html = html.replace(legendRe, `const chains = ${legendList};`);
  }

  html = patchChainProp(html, 'chainLabel', extraChains, 0);
  html = patchChainProp(html, 'chainLabel', extraChains, 1);
  html = patchChainProp(html, 'chainFilter', extraChains, 0);
  html = patchChainProp(html, 'chainFilter', extraChains, 1);
  return html;
}

function patchGlobalCompanies(html, additions) {
  if (!additions?.length) return html;
  const m = html.match(/const globalCompanies = (\[[\s\S]*?\]);/);
  if (!m) return html;
  const globals = Function(`"use strict"; return (${m[1]});`)();
  const byId = new Set(globals.map((g) => g.id));
  const inject = additions.filter((g) => !byId.has(g.id)).map(formatGlobal);
  if (!inject.length) return html;
  return html.replace(
    /const globalCompanies = \[[\s\S]*?\];/,
    `const globalCompanies = [\n${[...globals.map(formatGlobal), ...inject].join(',\n')}\n    ];`,
  );
}

function upsertSector(sectorKey, config) {
  const additions = loadAdditions(config.additions);
  if (!additions.length) {
    console.log(`${sectorKey}: no additions (${config.additions})`);
    return;
  }

  const htmlPath = join(ROOT, config.path);
  let html = fs.readFileSync(htmlPath, 'utf8');
  const krx = loadMergedKrxMap(join(ROOT, 'data'));
  const perPbr = loadPerPbrMap(join(ROOT, 'data'));
  const companies = extractCompaniesFromHtml(html);
  const byTicker = new Map(companies.map((c) => [padTicker(c.ticker), c]));

  let applied = 0;
  for (const row of additions) {
    const ticker = padTicker(row.ticker);
    const krxRow = krx.get(ticker);
    if (!krxRow) {
      console.warn(`${sectorKey}: skip ${ticker} — not in KRX merge`);
      continue;
    }
    if (!passesMcapFloor({ mcapWon: krxRow.mcap })) {
      console.warn(`${sectorKey}: skip ${ticker} — below mcap floor (${krxRow.mcap})`);
      continue;
    }
    applied++;
    const fin = perPbr.get(ticker);
    const existing = byTicker.get(ticker) || {};
    byTicker.set(ticker, {
      ...existing,
      id: existing.id || slugId(ticker, row.nameEn || row.name, config.idPrefix),
      name: row.name || krxRow.name,
      nameEn: row.nameEn || existing.nameEn || krxRow.name,
      ticker,
      market: krxRow.market,
      chain: row.chain || existing.chain,
      semType: row.semType || existing.semType || '—',
      semTypeEn: row.semTypeEn || existing.semTypeEn || '—',
      products: row.products || existing.products || '—',
      productsEn: row.productsEn || existing.productsEn || '—',
      revenue: fmtMcap(krxRow.mcap),
      mcapWon: krxRow.mcap,
      per: fin?.per ?? existing.per ?? null,
      pbr: fin?.pbr ?? existing.pbr ?? null,
      revTier: mcapTier(krxRow.mcap),
      partners: row.partners || existing.partners || [],
    });
  }

  const next = [...byTicker.values()].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  html = patchKoreanCompaniesHtml(html, next);
  html = patchGlobalCompanies(html, config.globalAdditions);
  html = patchExtraChains(html, config);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`${sectorKey}: cp_list additions applied (${next.length} companies, +${applied} from ${config.additions})`);
}

for (const [sectorKey, config] of Object.entries(SECTOR_MAPS)) {
  upsertSector(sectorKey, config);
}
