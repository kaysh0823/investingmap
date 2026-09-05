import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './krx_per_pbr.mjs';
import {
  formatDataAsofLabels,
  loadListedEnglish3557Map,
  loadMergedKrxMap,
  maxQuantCsvDateYmd,
  mergeListedEnglishIntoCompanies,
} from './krx_data_sources.mjs';
import { passesMcapFloor } from './mcap_policy.mjs';
import { esc, fmtMcap, mcapTier, patchKoreanCompaniesHtml } from './map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const TEMPLATE = join(ROOT, 'powergrid', 'korea_powergrid_map.html');

function buildTranslations(config, companies) {
  const kospi = companies.filter((c) => c.market === 'KOSPI').length;
  const kosdaq = companies.filter((c) => c.market === 'KOSDAQ').length;
  const labelsKo = Object.fromEntries(config.chains.map((c) => [c.id, c.ko]));
  const labelsEn = Object.fromEntries(config.chains.map((c) => [c.id, c.en]));
  const filterKo = Object.fromEntries(config.chains.map((c) => [c.id, c.filterKo || c.ko]));
  const filterEn = Object.fromEntries(config.chains.map((c) => [c.id, c.filterEn || c.en]));
  const asof = formatDataAsofLabels(maxQuantCsvDateYmd(DATA_DIR));
  const commonKo = {
    badgeTotal: `총 <span>${companies.length}</span>개 상장사`,
    badgeMarket: `KOSPI <span>${kospi}</span>사 · KOSDAQ <span>${kosdaq}</span>사`,
    dataAsof: asof.ko,
    tabHeatmap: '🔥 섹터 히트맵', heatmapHint: '시가총액 기준',
    tabTable: '📋 기업목록 & 필터', tabGraph: '🌐 관계 네트워크 (수정중)',
    thLast: '현재가', th52High: '52주 최고', th52Lo: '52주 최저', thPosition: '주가 위치', thRs: 'RS',
    langFlag: '🇺🇸', langText: 'English', flChain: '밸류체인', flMarket: '시장',
    searchPlaceholder: '🔍 기업 검색...', resultLabel: '표시: ', resultUnit: '개',
    thName: '기업명', thTicker: '종목코드', thMcap: '시가총액', thPer: 'PER', thPbr: 'PBR',
    thMarket: '시장', thChain: '밸류체인', thSemType: '세부 유형', thProducts: '주요 사업',
    thPartners: '글로벌 peer', sbKorean: '국내 상장 (밸류체인)', sbGlobal: '글로벌 peer',
    peerNetworkDesc: '국내 상장사와 글로벌 peer의 공개자료 기반 참고 관계입니다.',
    sbSize: '노드 크기', sbHow: '조작법', chainLabel: labelsKo, chainFilter: filterKo,
    allFilter: '전체', kosp: 'KOSPI', kosdaq: 'KOSDAQ',
    regionLabel: { us: '미국', tw: '대만', cn: '중국', eu: '유럽', kr: '한국', jp: '일본', gb: '영국' },
    sizeDesc: '대형: 시총 약 15조원↑\n중형: 약 1~15조원\n소형: 1조원 미만\n◇ 글로벌 peer',
    howDesc: '• 노드 클릭: 관계 강조\n• 드래그: 이동\n• 스크롤: 확대/축소\n• 빈 칸: 선택 해제\n• 범례: 그룹 하이라이트',
    graphHint: '국내 밸류체인과 글로벌 동종업체의 참고 연결이며 계약 관계를 의미하지 않습니다.',
    ttChain: '밸류체인', ttSemType: '세부', ttProducts: '사업', ttRevenue: '시가총액',
    ttPartners: '글로벌 peer', ttSuppliers: '국내 기업', ttCountry: '국가', ttSector: '분야', ttTags: '복수 축',
    fieldSemType: 'semType', fieldProducts: 'products',
    note: '⚠ 본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 시가총액·PER·PBR·시장 구분은 KRX 데이터 기준이고 밸류체인 및 글로벌 연결은 공개 자료를 바탕으로 한 편집 분류입니다. 한국어 시총은 조원, 영문 시총은 네이버 금융 USD/KRW 환율(/api/fx)을 적용한 USD Billion 단위로 소수 둘째 자리까지 표시합니다.',
  };
  const commonEn = {
    badgeTotal: `<span>${companies.length}</span> listings`,
    badgeMarket: `KOSPI <span>${kospi}</span> · KOSDAQ <span>${kosdaq}</span>`,
    dataAsof: asof.en,
    tabHeatmap: '🔥 Sector heatmap', heatmapHint: 'By market cap',
    tabTable: '📋 Company list & filters', tabGraph: '🌐 Relationship network (WIP)',
    thLast: 'Last', th52High: '52W High', th52Lo: '52W Low', thPosition: '52W Range', thRs: 'RS',
    langFlag: '🇰🇷', langText: '한국어', flChain: 'Value chain', flMarket: 'Market',
    searchPlaceholder: '🔍 Search company...', resultLabel: 'Showing: ', resultUnit: '',
    thName: 'Company', thTicker: 'Ticker', thMcap: 'Market cap (~$B)', thPer: 'PER', thPbr: 'PBR',
    thMarket: 'Market', thChain: 'Value chain', thSemType: 'Segment', thProducts: 'Products / services',
    thPartners: 'Global peers', sbKorean: 'Korean listed (value chain)', sbGlobal: 'Global peers',
    peerNetworkDesc: 'Public-source reference relationships between Korean listings and global peers.',
    sbSize: 'Node size', sbHow: 'Controls', chainLabel: labelsEn, chainFilter: filterEn,
    allFilter: 'All', kosp: 'KOSPI', kosdaq: 'KOSDAQ',
    regionLabel: { us: 'USA', tw: 'Taiwan', cn: 'China', eu: 'Europe', kr: 'Korea', jp: 'Japan', gb: 'UK' },
    sizeDesc: 'Large: mcap ~₩15T+\nMid: ~₩1–15T\nSmall: <₩1T\n◇ Global peers',
    howDesc: '• Click: highlight\n• Drag\n• Scroll: zoom\n• Background: clear\n• Legend: group',
    graphHint: 'Illustrative domestic value-chain and global peer links; they do not assert contractual relationships.',
    ttChain: 'Chain', ttSemType: 'Segment', ttProducts: 'Products', ttRevenue: 'Market cap',
    ttPartners: 'Global peers', ttSuppliers: 'Korean companies', ttCountry: 'Country', ttSector: 'Field', ttTags: 'Multi-axis',
    fieldSemType: 'semTypeEn', fieldProducts: 'productsEn',
    note: '⚠ Informational only—not investment advice. Market cap, PER, PBR and market classification follow KRX data. Value-chain and global-peer links are editorial classifications based on public information. English market cap uses the Naver Finance USD/KRW rate (/api/fx) and is shown in USD billions to two decimals.',
  };
  return {
    ko: { title: `🇰🇷 ${config.titleKo}`, subtitle: config.subtitleKo, ...commonKo, ...(config.translations?.ko || {}) },
    en: { title: `🇰🇷 ${config.titleEn}`, subtitle: config.subtitleEn, ...commonEn, ...(config.translations?.en || {}) },
  };
}

function replaceTranslationBlock(html, translations) {
  const start = html.indexOf('const T = ');
  const companies = html.indexOf('const koreanCompanies = ', start);
  if (start < 0 || companies < 0) throw new Error('Template translation block not found');
  const end = html.lastIndexOf('};', companies);
  if (end < start) throw new Error('Template translation block end not found');
  return html.slice(0, start) + `const T = ${JSON.stringify(translations, null, 4)};` + html.slice(end + 2);
}

function globalsBlock(globals) {
  return '[\n' + globals.map((g) => {
    const fields = [
      `id: '${esc(g.id)}'`,
      `name: '${esc(g.name)}'`,
      `nameEn: '${esc(g.nameEn || g.name)}'`,
      `country: '${esc(g.country)}'`,
      `region: '${esc(g.region)}'`,
      `sector: '${esc(g.sector)}'`,
    ];
    if (g.countryCode) fields.push(`countryCode: '${esc(g.countryCode)}'`);
    if (g.primaryRole) fields.push(`primaryRole: '${esc(g.primaryRole)}'`);
    if (g.ticker) fields.push(`ticker: '${esc(g.ticker)}'`);
    if (g.market) fields.push(`market: '${esc(g.market)}'`);
    if (g.chain) fields.push(`chain: '${esc(g.chain)}'`);
    if (g.mcapWon) fields.push(`mcapWon: ${Number(g.mcapWon) || 0}`);
    if (g.revTier) fields.push(`revTier: ${Number(g.revTier) || 1}`);
    if (g.targetUrl) fields.push(`targetUrl: '${esc(g.targetUrl)}'`);
    return `      { ${fields.join(', ')} }`;
  }).join(',\n') + '\n    ]';
}

export function buildCuratedSectorMap(config) {
  const krx = loadMergedKrxMap(DATA_DIR);
  const perPbr = loadPerPbrMap(DATA_DIR);
  const english = loadListedEnglish3557Map(DATA_DIR);
  const seen = new Set();
  let companies = config.companies.map((seed, index) => {
    if (seen.has(seed.ticker)) throw new Error(`${config.id}: duplicate ticker ${seed.ticker}`);
    seen.add(seed.ticker);
    const row = krx.get(seed.ticker);
    if (!row) throw new Error(`${config.id}: KRX row missing for ${seed.ticker}`);
    return {
      id: seed.id || `${config.id}_${index}`,
      name: row.name || seed.name,
      nameEn: seed.nameEn,
      ticker: seed.ticker,
      market: row.market,
      chain: seed.chain,
      semType: seed.semType,
      semTypeEn: seed.semTypeEn,
      products: seed.products,
      productsEn: seed.productsEn,
      revenue: fmtMcap(row.mcap),
      mcapWon: row.mcap,
      revTier: mcapTier(row.mcap),
      partners: seed.partners || [],
    };
  }).filter((c) => passesMcapFloor({ mcapWon: c.mcapWon }));
  mergePerPbrIntoCompanies(companies, perPbr);
  mergeListedEnglishIntoCompanies(companies, english);
  companies.sort((a, b) => b.mcapWon - a.mcapWon);

  let html = fs.readFileSync(TEMPLATE, 'utf8');
  html = html.replace(/powergrid\/korea_powergrid_map/g, `${config.id}/korea_${config.id}_map`);
  html = html.replace(/\/powergrid\//g, `/${config.id}/`);
  html = html.replace(/data-sector="powergrid"/g, `data-sector="${config.id}"`);
  html = html
    .replaceAll('한국 전력설비 투자 지도', config.titleKo)
    .replaceAll('Korea Power Grid Equipment Map', config.titleEn)
    .replaceAll('Korea Power Equipment Map', config.titleEn)
    .replaceAll('전력설비·송배전·발전설비 관련 상장사와 글로벌 참고 관계를 정리합니다.', config.subtitleKo)
    .replaceAll('전력설비·송배전·발전설비 관련 상장사와 글로벌 참고 관계 지도.', config.subtitleKo)
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${config.subtitleKo}$2`,
    )
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/,
      `$1${config.titleKo}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/,
      `$1${config.subtitleKo}$2`,
    )
    .replace(
      /(<meta name="twitter:title" content=")[^"]*(")/,
      `$1${config.titleKo}$2`,
    )
    .replace(
      /(<meta name="twitter:description" content=")[^"]*(")/,
      `$1${config.subtitleKo}$2`,
    );
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${config.titleKo} / ${config.titleEn}</title>`);
  html = html.replace(/<h1 id="hdr-title">[^<]+<\/h1>/, `<h1 id="hdr-title">🇰🇷 ${config.titleKo}</h1>`);
  html = html.replace(/<p id="hdr-subtitle">[^<]+<\/p>/, `<p id="hdr-subtitle">${config.subtitleKo}</p>`);
  html = html.replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${JSON.stringify(Object.fromEntries(config.chains.map((c) => [c.id, c.color])))};`);
  const angles = Object.fromEntries(config.chains.map((c, i) => [c.id, Math.round((360 / config.chains.length) * i)]));
  html = html.replace(/\{ '[^']+': \d+(?:, '[^']+': \d+)+ \}/g, `{ ${Object.entries(angles).map(([k, v]) => `'${esc(k)}': ${v}`).join(', ')} }`);
  const chainsAll = `const chains = ['all', ${config.chains.map((c) => `'${esc(c.id)}'`).join(', ')}];`;
  const chainsOnly = `const chains = [${config.chains.map((c) => `'${esc(c.id)}'`).join(', ')}];`;
  html = html.replace(/const chains = \['all', [^\]]+\];/g, chainsAll);
  html = html.replace(/const chains = \[[^\]]+\];(?=\s*\n\s*(?:const btnRow|chainContainer))/g, chainsOnly);
  html = replaceTranslationBlock(html, buildTranslations(config, companies));
  html = patchKoreanCompaniesHtml(html, companies);
  html = html.replace(/const globalCompanies = \[[\s\S]*?\n    \];/, `const globalCompanies = ${globalsBlock(config.globals)};`);
  html = html.replace(/<div class="badge" id="badge-total">[\s\S]*?<\/div>/, `<div class="badge" id="badge-total">총 <span>${companies.length}</span>개 상장사</div>`);
  const kospi = companies.filter((c) => c.market === 'KOSPI').length;
  const kosdaq = companies.filter((c) => c.market === 'KOSDAQ').length;
  html = html.replace(/<div class="badge" id="badge-market">[\s\S]*?<\/div>/, `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>사 · KOSDAQ <span>${kosdaq}</span>사</div>`);
  html = html.replace(/<div class="result-count" id="result-label">[\s\S]*?<\/div>/, `<div class="result-count" id="result-label">표시: <span id="show-count">${companies.length}</span>개</div>`);

  const isBigchip = config.id === 'bigchip' || config.sectorId === 'bigchip';
  if (isBigchip) {
    // bigchip has only 2 companies (Samsung, SK hynix); skip chain filter row and neutralize currentChain logic
    html = html.replace(
      /\s*<div class="filter-row filter-row-chain">[\s\S]*?<div id="chain-chips"><\/div>\s*<\/div>/,
      '',
    );
    html = html.replace(
      /\s*document\.getElementById\('fl-chain-label'\)\.textContent = t\.flChain;/,
      '',
    );
    html = html.replace(
      /function buildChainChips\(\) \{[\s\S]*?document\.getElementById\('chain-chips'\);[\s\S]*?\n    \}/,
      'function buildChainChips() {}',
    );
    html = html.replace(
      /function setChainFilter\([^)]*\) \{[\s\S]*?buildChainChips\(\);[\s\S]*?\n    \}/,
      'function setChainFilter() {}',
    );
    html = html.replace(
      /\s*if \(currentChain !== 'all' && c\.chain !== currentChain\) return false;/,
      '\n        /* bigchip: no chain filter */',
    );
  }

  const outDir = join(ROOT, config.id);
  fs.mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `korea_${config.id}_map.html`);
  fs.writeFileSync(out, html, 'utf8');
  console.log(`Wrote ${config.id}/korea_${config.id}_map.html n=${companies.length} KOSPI=${kospi} KOSDAQ=${kosdaq}`);
  return companies;
}
