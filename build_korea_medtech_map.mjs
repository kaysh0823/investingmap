/**
 * Builds medtech/korea_medtech_map.html from powergrid template.
 * Chains: diagnostics, implants, aesthetic devices, medical equipment.
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
  DX: '진단·IVD',
  IMP: '임플란트·치과',
  AES: '미용기기',
  EQ: '의료장비·수술',
};

const SECTOR_ORDER = [S.DX, S.IMP, S.AES, S.EQ];

const CHAIN_COLORS = {
  [S.DX]: '#42A5F5',
  [S.IMP]: '#66BB6A',
  [S.AES]: '#F48FB1',
  [S.EQ]: '#AB47BC',
};

const CHAIN_ANGLE = {
  [S.DX]: 0,
  [S.IMP]: 90,
  [S.AES]: 180,
  [S.EQ]: 270,
};

const SEED = [
  { id: 'seegene', name: '씨젠', nameEn: 'Seegene', ticker: '096530', chain: S.DX, semType: '분자진단·IVD', semTypeEn: 'Molecular diagnostics / IVD', products: '분자진단 키트·플랫폼', productsEn: 'Molecular diagnostic kits & platforms', partners: ['roche', 'abbott', 'siemens_health'] },
  { id: 'lunit', name: '루닛', nameEn: 'Lunit', ticker: '328130', chain: S.DX, semType: '의료AI·영상진단', semTypeEn: 'Medical AI / imaging', products: '흉부·유방 영상 AI', productsEn: 'Chest & breast imaging AI', partners: ['ge_health', 'philips', 'siemens_health'] },
  { id: 'inbody', name: '인바디', nameEn: 'InBody', ticker: '041830', chain: S.DX, semType: '체성분·측정', semTypeEn: 'Body composition & measurement', products: '체성분 분석기', productsEn: 'Body composition analyzers', partners: ['ge_health', 'philips'] },

  { id: 'dentium', name: '덴티움', nameEn: 'Dentium', ticker: '145720', chain: S.IMP, semType: '치과 임플란트', semTypeEn: 'Dental implants', products: '임플란트·어버트먼트', productsEn: 'Implants & abutments', partners: ['straumann', 'dentsply', 'zimmer'] },

  { id: 'classys', name: '클래시스', nameEn: 'Classys', ticker: '214150', chain: S.AES, semType: '미용 의료기기', semTypeEn: 'Aesthetic medical devices', products: 'HIFU·RF 장비', productsEn: 'HIFU & RF devices', partners: ['allergan', 'cynosure', 'syneron'] },
  { id: 'wontech', name: '원텍', nameEn: 'Won Tech', ticker: '336570', chain: S.AES, semType: '레이저·미용기기', semTypeEn: 'Laser & aesthetic devices', products: '레이저·에너지 기반 미용기기', productsEn: 'Laser & energy-based aesthetic devices', partners: ['cynosure', 'syneron', 'cutera'] },

  { id: 'curexo', name: '큐렉소', nameEn: 'Curexo', ticker: '060280', chain: S.EQ, semType: '수술로봇·정형', semTypeEn: 'Surgical robots / ortho', products: '정형외과 수술로봇', productsEn: 'Orthopedic surgical robots', partners: ['intuitive', 'stryker', 'medtronic'] },
  { id: 'nextbio', name: '넥스트바이오메디컬', nameEn: 'Next Biomedical', ticker: '389650', chain: S.EQ, semType: '내시경·지혈재', semTypeEn: 'Endoscopy / hemostats', products: '내시경 지혈재·의료소재', productsEn: 'Endoscopic hemostats & materials', partners: ['boston_sci', 'medtronic', 'olympus'] },
];

const SEED_CLEAN = SEED.filter((s) => s.ticker && /^\d{6}$/.test(s.ticker));

const GLOBALS = [
  { id: 'roche', name: 'Roche', nameEn: 'Roche', country: '스위스/Switzerland', region: 'eu', sector: 'Diagnostics' },
  { id: 'abbott', name: 'Abbott', nameEn: 'Abbott', country: '미국/USA', region: 'us', sector: 'Diagnostics / devices' },
  { id: 'siemens_health', name: 'Siemens Healthineers', nameEn: 'Siemens Healthineers', country: '독일/Germany', region: 'eu', sector: 'Imaging & diagnostics' },
  { id: 'ge_health', name: 'GE HealthCare', nameEn: 'GE HealthCare', country: '미국/USA', region: 'us', sector: 'Imaging' },
  { id: 'philips', name: 'Philips', nameEn: 'Philips', country: '네덜란드/NL', region: 'eu', sector: 'Imaging & monitoring' },
  { id: 'straumann', name: 'Straumann', nameEn: 'Straumann', country: '스위스/Switzerland', region: 'eu', sector: 'Dental implants' },
  { id: 'dentsply', name: 'Dentsply Sirona', nameEn: 'Dentsply Sirona', country: '미국/USA', region: 'us', sector: 'Dental' },
  { id: 'zimmer', name: 'Zimmer Biomet', nameEn: 'Zimmer Biomet', country: '미국/USA', region: 'us', sector: 'Ortho / dental' },
  { id: 'allergan', name: 'Allergan Aesthetics', nameEn: 'Allergan Aesthetics', country: '미국/USA', region: 'us', sector: 'Aesthetics' },
  { id: 'cynosure', name: 'Cynosure', nameEn: 'Cynosure', country: '미국/USA', region: 'us', sector: 'Aesthetic devices' },
  { id: 'syneron', name: 'Syneron Candela', nameEn: 'Syneron Candela', country: '미국/USA', region: 'us', sector: 'Aesthetic devices' },
  { id: 'cutera', name: 'Cutera', nameEn: 'Cutera', country: '미국/USA', region: 'us', sector: 'Aesthetic devices' },
  { id: 'intuitive', name: 'Intuitive Surgical', nameEn: 'Intuitive Surgical', country: '미국/USA', region: 'us', sector: 'Surgical robots' },
  { id: 'stryker', name: 'Stryker', nameEn: 'Stryker', country: '미국/USA', region: 'us', sector: 'Ortho / devices' },
  { id: 'medtronic', name: 'Medtronic', nameEn: 'Medtronic', country: '아일랜드/Ireland', region: 'eu', sector: 'Med devices' },
  { id: 'boston_sci', name: 'Boston Scientific', nameEn: 'Boston Scientific', country: '미국/USA', region: 'us', sector: 'Med devices' },
  { id: 'olympus', name: 'Olympus', nameEn: 'Olympus', country: '일본/Japan', region: 'jp', sector: 'Endoscopy' },
];

function buildT(n, kospi, kosdaq) {
  const clk = {};
  const cle = {};
  const cfk = {};
  const cfe = {};
  const labels = {
    [S.DX]: { ko: S.DX, en: 'Diagnostics / IVD' },
    [S.IMP]: { ko: S.IMP, en: 'Implants & dental' },
    [S.AES]: { ko: S.AES, en: 'Aesthetic devices' },
    [S.EQ]: { ko: S.EQ, en: 'Equipment & surgery' },
  };
  for (const k of SECTOR_ORDER) {
    clk[k] = labels[k].ko;
    cle[k] = labels[k].en;
    cfk[k] = labels[k].ko;
    cfe[k] = labels[k].en;
  }
  return {
    ko: {
      title: '🇰🇷 한국 의료·미용기기 투자 지도',
      subtitle: '진단·IVD·임플란트·미용기기·의료장비 등 국내 상장 의료기기와 글로벌 peer 참고 관계',
      badgeTotal: `총 <span>${n}</span>개 상장사`,
      badgeMarket: `KOSPI <span>${kospi}</span>사 · KOSDAQ <span>${kosdaq}</span>사`,
      dataAsof: '데이터 기준일: 2026-06-12',
      tabHeatmap: '🔥 시총 히트맵',
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
      sbGlobal: '글로벌 의료기기 peer',
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
      graphHint: '국내 의료·미용기기와 글로벌 진단·임플란트·에스테틱 peer 참고 연결(가중치 참고)',
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
      title: '🇰🇷 Korea MedTech Map',
      subtitle: 'Listed Korean diagnostics, implants, aesthetic devices, and medical equipment with global peer relationships',
      badgeTotal: `<span>${n}</span> listings`,
      badgeMarket: `KOSPI <span>${kospi}</span> · KOSDAQ <span>${kosdaq}</span>`,
      dataAsof: 'Data as of: June 12, 2026',
      tabHeatmap: '🔥 Market-cap heatmap',
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
      sbGlobal: 'Global medtech peers',
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
      graphHint: 'Explore domestic medtech value chains and global diagnostics / implant / aesthetic peers (weights illustrative)',
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
      id: s.id || `medtech_${i}`,
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

  html = html.replace(/powergrid\/korea_powergrid_map/g, 'medtech/korea_medtech_map');
  html = html.replace(/\/powergrid\//g, '/medtech/');
  html = html.replace(/data-sector="powergrid"/g, 'data-sector="medtech"');
  html = html.replace(/한국 전력설비 투자 지도/g, '한국 의료·미용기기 투자 지도');
  html = html.replace(/Korea Power Grid Equipment Map/g, 'Korea MedTech Map');
  html = html.replace(/전력설비·송배전·발전설비/g, '진단·임플란트·미용기기·의료장비');
  html = html.replace(/Power equipment, T&amp;D, and power generation equipment/g, 'Diagnostics, implants, aesthetic devices, and medical equipment');
  html = html.replace(/Power equipment, T&D, and power generation equipment/g, 'Diagnostics, implants, aesthetic devices, and medical equipment');

  html = html.replace(/<title>[^<]*<\/title>/, '<title>한국 의료·미용기기 투자 지도 / Korea MedTech Map</title>');

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
    '<h1 id="hdr-title">🇰🇷 한국 의료·미용기기 투자 지도</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">진단·IVD·임플란트·미용기기·의료장비 등 국내 상장 의료기기와 글로벌 peer 참고 관계</p>',
  );

  const outDir = join(__dirname, 'medtech');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(join(outDir, 'korea_medtech_map.html'), html, 'utf8');
  console.log('Wrote medtech/korea_medtech_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
