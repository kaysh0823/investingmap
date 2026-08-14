/**
 * Builds construction/korea_construction_map.html from powergrid template.
 * Chains: general contractors, housing/developers, equipment, holdings/other.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './lib/krx_per_pbr.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map, mergeListedEnglishIntoCompanies } from './lib/krx_data_sources.mjs';
import { passesMcapFloor } from './lib/mcap_policy.mjs';
import {
  esc,
  fmtMcap,
  mcapTier,
  patchKoreanCompaniesHtml,
} from './lib/map_company_serialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const S = {
  GC: '종합건설',
  HOUSE: '주택·디벨로퍼',
  EQUIP: '건설기계',
  OTHER: '지주·기타',
};

const SECTOR_ORDER = [S.GC, S.HOUSE, S.EQUIP, S.OTHER];

const CHAIN_COLORS = {
  [S.GC]: '#42A5F5',
  [S.HOUSE]: '#66BB6A',
  [S.EQUIP]: '#FFA726',
  [S.OTHER]: '#78909C',
};

const CHAIN_ANGLE = {
  [S.GC]: 0,
  [S.HOUSE]: 90,
  [S.EQUIP]: 180,
  [S.OTHER]: 270,
};

const SEED = [
  { id: 'samsung_ct', name: '삼성물산', nameEn: 'Samsung C&T', ticker: '028260', chain: S.GC, semType: '종합건설·플랜트', semTypeEn: 'General contractor & plant', products: '건축·토목·플랜트·해외수주', productsEn: 'Building, civil, plant, overseas orders', partners: ['bechtel', 'fluor', 'vinci'] },
  { id: 'hyundai_enc', name: '현대건설', nameEn: 'Hyundai E&C', ticker: '000720', chain: S.GC, semType: '종합건설·플랜트', semTypeEn: 'General contractor & plant', products: '건축·토목·플랜트·원전', productsEn: 'Building, civil, plant, nuclear', partners: ['bechtel', 'fluor', 'vinci'] },
  { id: 'daewoo_enc', name: '대우건설', nameEn: 'Daewoo E&C', ticker: '047040', chain: S.GC, semType: '종합건설', semTypeEn: 'General contractor', products: '건축·토목·플랜트·주택', productsEn: 'Building, civil, plant, housing', partners: ['fluor', 'acs'] },
  { id: 'dl_enc', name: 'DL이앤씨', nameEn: 'DL E&C', ticker: '375500', chain: S.GC, semType: '종합건설·플랜트', semTypeEn: 'General contractor & plant', products: '건축·토목·플랜트', productsEn: 'Building, civil, plant', partners: ['fluor', 'vinci'] },
  { id: 'gs_enc', name: 'GS건설', nameEn: 'GS E&C', ticker: '006360', chain: S.GC, semType: '종합건설·플랜트', semTypeEn: 'General contractor & plant', products: '건축·토목·플랜트·주택', productsEn: 'Building, civil, plant, housing', partners: ['bechtel', 'skanska'] },
  { id: 'taeyoung', name: '태영건설', nameEn: 'Taeyoung E&C', ticker: '009410', chain: S.GC, semType: '종합건설', semTypeEn: 'General contractor', products: '건축·토목·환경', productsEn: 'Building, civil, environment', partners: ['acs'] },

  { id: 'ipark_hdc', name: '현대산업개발', nameEn: 'IPARK Hyundai Development', ticker: '294870', chain: S.HOUSE, semType: '주택·디벨로퍼', semTypeEn: 'Housing developer', products: '아파트·도시개발', productsEn: 'Apartments, urban development', partners: ['skanska', 'hochtief'] },
  { id: 'hdc_hold', name: 'HDC', nameEn: 'HDC Holdings', ticker: '012630', chain: S.HOUSE, semType: '건설·부동산 지주', semTypeEn: 'Construction & real-estate holding', products: '주택·복합개발', productsEn: 'Housing & mixed-use development', partners: ['skanska'] },
  { id: 'seohee', name: '서희건설', nameEn: 'Seohee Construction', ticker: '035890', chain: S.HOUSE, semType: '주택·시공', semTypeEn: 'Housing contractor', products: '아파트·재건축', productsEn: 'Apartments, reconstruction', partners: ['hochtief'] },

  { id: 'hd_ce', name: 'HD건설기계', nameEn: 'HD Construction Equipment', ticker: '267270', chain: S.EQUIP, semType: '건설기계', semTypeEn: 'Construction equipment', products: '굴착기·휠로더', productsEn: 'Excavators, wheel loaders', partners: ['caterpillar', 'komatsu', 'volvo_ce'] },

  { id: 'dl_hold', name: 'DL', nameEn: 'DL', ticker: '000210', chain: S.OTHER, semType: '건설·화학 지주', semTypeEn: 'Construction & chemicals holding', products: 'DL이앤씨 등 계열', productsEn: 'DL E&C and affiliates', partners: ['fluor'] },
  { id: 'koreit', name: '한국토지신탁', nameEn: 'KOREIT', ticker: '034830', chain: S.OTHER, semType: '토지신탁·개발', semTypeEn: 'Land trust & development', products: '토지신탁·도시정비', productsEn: 'Land trust, urban renewal', partners: ['hochtief'] },
];

const SEED_CLEAN = SEED.filter((s) => s.ticker && /^\d{6}$/.test(s.ticker));

const GLOBALS = [
  { id: 'vinci', name: 'VINCI', nameEn: 'VINCI', country: '프랑스/France', region: 'eu', sector: 'Global contractor' },
  { id: 'acs', name: 'ACS', nameEn: 'ACS', country: '스페인/Spain', region: 'eu', sector: 'Global contractor' },
  { id: 'bechtel', name: 'Bechtel', nameEn: 'Bechtel', country: '미국/USA', region: 'us', sector: 'EPC contractor' },
  { id: 'fluor', name: 'Fluor', nameEn: 'Fluor', country: '미국/USA', region: 'us', sector: 'EPC contractor' },
  { id: 'skanska', name: 'Skanska', nameEn: 'Skanska', country: '스웨덴/Sweden', region: 'eu', sector: 'Construction & development' },
  { id: 'hochtief', name: 'Hochtief', nameEn: 'Hochtief', country: '독일/Germany', region: 'eu', sector: 'Construction' },
  { id: 'caterpillar', name: 'Caterpillar', nameEn: 'Caterpillar', country: '미국/USA', region: 'us', sector: 'Construction equipment' },
  { id: 'komatsu', name: 'Komatsu', nameEn: 'Komatsu', country: '일본/Japan', region: 'jp', sector: 'Construction equipment' },
  { id: 'volvo_ce', name: 'Volvo CE', nameEn: 'Volvo Construction Equipment', country: '스웨덴/Sweden', region: 'eu', sector: 'Construction equipment' },
];

function buildT(n, kospi, kosdaq) {
  const clk = {};
  const cle = {};
  const cfk = {};
  const cfe = {};
  const labels = {
    [S.GC]: { ko: S.GC, en: 'General contractors' },
    [S.HOUSE]: { ko: S.HOUSE, en: 'Housing & developers' },
    [S.EQUIP]: { ko: S.EQUIP, en: 'Construction equipment' },
    [S.OTHER]: { ko: S.OTHER, en: 'Holdings & other' },
  };
  for (const k of SECTOR_ORDER) {
    clk[k] = labels[k].ko;
    cle[k] = labels[k].en;
    cfk[k] = labels[k].ko;
    cfe[k] = labels[k].en;
  }
  return {
    ko: {
      title: '🇰🇷 한국 건설 투자 지도',
      subtitle: '종합건설·주택·디벨로퍼·건설기계 등 국내 상장 건설사와 글로벌 peer 참고 관계',
      badgeTotal: `총 <span>${n}</span>개 상장사`,
      badgeMarket: `KOSPI <span>${kospi}</span>사 · KOSDAQ <span>${kosdaq}</span>사`,
      dataAsof: '데이터 기준일: 2026-06-12',
      tabHeatmap: '🔥 섹터 히트맵',
      heatmapHint: '시가총액 기준',
      tabTable: '📋 기업목록 & 필터',
      tabGraph: '🌐 관계 네트워크',
      thLast: '현재가',
      th52High: '52주 최고',
      th52Lo: '52주 최저',
      thPosition: '주가 위치',
      thRs: 'RS',
      langFlag: '🇺🇸',
      langText: 'English',
      flChain: '밸류체인',
      flMarket: '시장',
      searchPlaceholder: '🔍 기업 검색...',
      resultLabel: '표시: ',
      resultUnit: '개',
      thName: '기업명',
      thTicker: '종목코드',
      thMcap: '시가총액',
      thPer: 'PER',
      thPbr: 'PBR',
      thMarket: '시장',
      thChain: '밸류체인',
      thSemType: '세부 유형',
      thProducts: '주요 사업',
      thPartners: '글로벌 peer',
      note: '⚠ 종목코드·참고 관계는 에디터리얼 그룹이며 공식 정보가 아닙니다. 시가총액·시장은 상단 기준일의 KRX 공시에 맞추었으며, 한국어 열은 시총을 조(兆)원 단위로 소수 둘째 자리까지 표시합니다. 영문 열은 네이버 금융 USD/KRW 고시 환율(/api/fx)을 적용해 B(십억 달러) 단위로 소수 둘째 자리까지 환산한 참고치입니다.',
      sbKorean: '국내 상장 (밸류체인)',
      sbGlobal: '글로벌 건설 peer',
      sbSize: '노드 크기',
      sbHow: '조작법',
      chainLabel: clk,
      chainFilter: cfk,
      allFilter: '전체',
      kosp: 'KOSPI',
      kosdaq: 'KOSDAQ',
      regionLabel: { us: '미국', tw: '대만', cn: '중국', eu: '유럽', kr: '한국', jp: '일본', gb: '영국' },
      sizeDesc: '대형: 시총 약 15조원↑\n중형: 약 1~15조원\n소형: 1조원 미만\n◇ 글로벌 peer',
      howDesc: '• 노드 클릭: 관계 강조\n• 드래그: 이동\n• 스크롤: 확대/축소\n• 빈 칸: 선택 해제\n• 범례: 그룹 하이라이트',
      graphHint: '국내 건설사와 글로벌 EPC·장비 peer 참고 연결(가중치 참고)',
      ttChain: '밸류체인',
      ttSemType: '세부',
      ttProducts: '사업',
      ttRevenue: '시가총액',
      ttPartners: '글로벌 연결',
      ttSuppliers: '국내 기업',
      ttCountry: '국가',
      ttSector: '분야',
      ttTags: '복수 축',
      fieldSemType: 'semType',
      fieldProducts: 'products',
    },
    en: {
      title: '🇰🇷 Korea Construction Map',
      subtitle: 'Listed Korean contractors, housing developers, and construction equipment with global peer relationships',
      badgeTotal: `<span>${n}</span> listings`,
      badgeMarket: `KOSPI <span>${kospi}</span> · KOSDAQ <span>${kosdaq}</span>`,
      dataAsof: 'Data as of: June 12, 2026',
      tabHeatmap: '🔥 Sector heatmap',
      heatmapHint: 'By market cap',
      tabTable: '📋 Company list & filters',
      tabGraph: '🌐 Relationship network',
      thLast: 'Last',
      th52High: '52W High',
      th52Lo: '52W Low',
      thPosition: '52W Range',
      thRs: 'RS',
      langFlag: '🇰🇷',
      langText: '한국어',
      flChain: 'Value chain',
      flMarket: 'Market',
      searchPlaceholder: '🔍 Search company...',
      resultLabel: 'Showing: ',
      resultUnit: '',
      thName: 'Company',
      thTicker: 'Ticker',
      thMcap: 'Market cap (~$B)',
      thPer: 'PER',
      thPbr: 'PBR',
      thMarket: 'Market',
      thChain: 'Value chain',
      thSemType: 'Segment',
      thProducts: 'Products / services',
      thPartners: 'Global peers',
      note: '⚠ Public information only. Market cap and segment follow KRX disclosures as of the date shown above. Value chain labels are editorial groupings. English table shows market cap in USD billions (two decimals) using the USD/KRW spot from Naver Finance (/api/fx, illustrative).',
      sbKorean: 'Korean listed (value chain)',
      sbGlobal: 'Global construction peers',
      sbSize: 'Node size',
      sbHow: 'Controls',
      chainLabel: cle,
      chainFilter: cfe,
      allFilter: 'All',
      kosp: 'KOSPI',
      kosdaq: 'KOSDAQ',
      regionLabel: { us: 'USA', tw: 'Taiwan', cn: 'China', eu: 'Europe', kr: 'Korea', jp: 'Japan', gb: 'UK' },
      sizeDesc: 'Large: mcap ~₩15T+\nMid: ~₩1–15T\nSmall: <₩1T\n◇ Global peers',
      howDesc: '• Click: highlight\n• Drag\n• Scroll: zoom\n• Background: clear\n• Legend: group',
      graphHint: 'Explore domestic contractors and global EPC / equipment peers (weights illustrative)',
      ttChain: 'Chain',
      ttSemType: 'Segment',
      ttProducts: 'Products',
      ttRevenue: 'Market cap',
      ttPartners: 'Partners',
      ttSuppliers: 'Korean companies',
      ttCountry: 'Country',
      ttSector: 'Field',
      ttTags: 'Multi-axis',
      fieldSemType: 'semTypeEn',
      fieldProducts: 'productsEn',
    },
  };
}

function angleLiteral() {
  const parts = SECTOR_ORDER.map((k) => `'${esc(k)}': ${CHAIN_ANGLE[k]}`);
  return `{ ${parts.join(', ')} }`;
}

function main() {
  const krx = loadMergedKrxMap(join(__dirname, 'data'));
  const meta3557 = loadListedEnglish3557Map(join(__dirname, 'data'));
  const perPbr = loadPerPbrMap(join(__dirname, 'data'));

  let companies = SEED_CLEAN.map((s, i) => {
    const row = krx.get(s.ticker);
    const mcapWon = row ? row.mcap : 0;
    const market = row ? row.market : 'KOSPI';
    return {
      id: s.id || `construction_${i}`,
      name: s.name,
      nameEn: s.nameEn,
      ticker: s.ticker,
      market,
      chain: s.chain,
      semType: s.semType,
      semTypeEn: s.semTypeEn,
      products: s.products,
      productsEn: s.productsEn,
      revenue: row ? fmtMcap(row.mcap) : '—',
      mcapWon,
      revTier: mcapTier(mcapWon),
      partners: s.partners || [],
    };
  }).filter((c) => passesMcapFloor({ mcapWon: c.mcapWon || 0 }));

  mergePerPbrIntoCompanies(companies, perPbr);
  mergeListedEnglishIntoCompanies(companies, meta3557);
  for (const c of companies) {
    const row = krx.get(c.ticker);
    if (row?.name) c.name = row.name;
  }
  companies.sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));

  let kospi = 0;
  let kosdaq = 0;
  for (const c of companies) {
    if (c.market === 'KOSPI') kospi++;
    else if (c.market === 'KOSDAQ') kosdaq++;
  }
  const n = companies.length;
  const T = buildT(n, kospi, kosdaq);

  let html = fs.readFileSync(join(__dirname, 'powergrid', 'korea_powergrid_map.html'), 'utf8');

  html = html.replace(/powergrid\/korea_powergrid_map/g, 'construction/korea_construction_map');
  html = html.replace(/\/powergrid\//g, '/construction/');
  html = html.replace(/data-sector="powergrid"/g, 'data-sector="construction"');
  html = html.replace(/한국 전력설비 투자 지도/g, '한국 건설 투자 지도');
  html = html.replace(/Korea Power Grid Equipment Map/g, 'Korea Construction Map');
  html = html.replace(/전력설비·송배전·발전설비/g, '종합건설·주택·디벨로퍼·건설기계');
  html = html.replace(/Power equipment, T&amp;D, and power generation equipment/g, 'General contractors, housing developers, and construction equipment');
  html = html.replace(/Power equipment, T&D, and power generation equipment/g, 'General contractors, housing developers, and construction equipment');

  html = html.replace(/<title>[^<]*<\/title>/, '<title>한국 건설 투자 지도 / Korea Construction Map</title>');

  html = html.replace(
    /const CHAIN_COLORS = \{[\s\S]*?\};/,
    `const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};`,
  );

  html = html.replace(/\{ '[^']+': \d+(?:, '[^']+': \d+)+ \}/g, angleLiteral());

  const chainsAll = `const chains = ['all', ${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;
  const chainsNoAll = `const chains = [${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;
  html = html.replace(/const chains = \['all', [^\]]+\];/g, chainsAll);
  html = html.replace(/const chains = \['전력설비', '송배전', '발전설비'\];/g, chainsNoAll);
  html = html.replace(/const chains = \[[^\]]+\];(?=\s*\n\s*const btnRow)/g, chainsNoAll);

  {
    const tStart = 'const T = ';
    const ti0 = html.indexOf(tStart);
    const co0 = html.indexOf('const koreanCompanies = ', ti0);
    if (ti0 < 0 || co0 < 0) throw new Error('T block not found');
    const endOfT = html.lastIndexOf('};', co0);
    if (endOfT < ti0) throw new Error('T block end not found');
    html = html.slice(0, ti0) + tStart + JSON.stringify(T, null, 4) + ';' + html.slice(endOfT + 2);
  }

  html = patchKoreanCompaniesHtml(html, companies);

  const globalsBlock =
    '[\n' +
    GLOBALS.map((g, i) => {
      const nameEn = g.nameEn != null && g.nameEn !== '' ? g.nameEn : g.name;
      return `      { id: '${g.id}', name: '${esc(g.name)}', nameEn: '${esc(nameEn)}', country: '${esc(g.country)}', region: '${g.region}', sector: '${esc(g.sector)}' }${i < GLOBALS.length - 1 ? ',' : ''}`;
    }).join('\n') +
    '\n    ]';

  if (!/const globalCompanies = \[[\s\S]*?\n    \];/.test(html)) {
    throw new Error('globalCompanies block not found');
  }
  html = html.replace(
    /const globalCompanies = \[[\s\S]*?\n    \];/,
    `const globalCompanies = ${globalsBlock};`,
  );

  html = html.replace(
    /<div class="badge" id="badge-total">[\s\S]*?<\/div>/,
    `<div class="badge" id="badge-total">총 <span>${n}</span>개 상장사</div>`,
  );
  html = html.replace(
    /<div class="badge" id="badge-market">[\s\S]*?<\/div>/,
    `<div class="badge" id="badge-market">KOSPI <span>${kospi}</span>사 · KOSDAQ <span>${kosdaq}</span>사</div>`,
  );
  html = html.replace(
    /<div class="result-count" id="result-label">[^<]+<span id="show-count">\d+<\/span>[^<]+<\/div>/,
    `<div class="result-count" id="result-label">표시: <span id="show-count">${n}</span>개</div>`,
  );

  html = html.replace(
    /<h1 id="hdr-title">[^<]+<\/h1>/,
    '<h1 id="hdr-title">🇰🇷 한국 건설 투자 지도</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">종합건설·주택·디벨로퍼·건설기계 등 국내 상장 건설사와 글로벌 peer 참고 관계</p>',
  );

  const outDir = join(__dirname, 'construction');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(join(outDir, 'korea_construction_map.html'), html, 'utf8');
  console.log('Wrote construction/korea_construction_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
