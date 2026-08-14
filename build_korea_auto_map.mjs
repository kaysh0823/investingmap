/**
 * Builds auto/korea_auto_map.html from powergrid template.
 * Chains: OEM, parts, tires, electronics / ADAS.
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
  OEM: '완성차',
  PARTS: '부품',
  TIRE: '타이어',
  ELEC: '전장·ADAS',
};

const SECTOR_ORDER = [S.OEM, S.PARTS, S.TIRE, S.ELEC];

const CHAIN_COLORS = {
  [S.OEM]: '#42A5F5',
  [S.PARTS]: '#66BB6A',
  [S.TIRE]: '#FFA726',
  [S.ELEC]: '#AB47BC',
};

const CHAIN_ANGLE = {
  [S.OEM]: 0,
  [S.PARTS]: 90,
  [S.TIRE]: 180,
  [S.ELEC]: 270,
};

const SEED = [
  { id: 'hyundai_motor', name: '현대차', nameEn: 'Hyundai Motor', ticker: '005380', chain: S.OEM, semType: '완성차·SUV·EV', semTypeEn: 'OEM · SUV & EV', products: '승용·상용·전기차·수소', productsEn: 'Passenger, commercial, EV, FCEV', partners: ['toyota', 'gm', 'vw'] },
  { id: 'kia', name: '기아', nameEn: 'Kia', ticker: '000270', chain: S.OEM, semType: '완성차·SUV·EV', semTypeEn: 'OEM · SUV & EV', products: '승용·전기차·모빌리티', productsEn: 'Passenger, EV, mobility', partners: ['toyota', 'vw', 'stellantis'] },
  { id: 'kg_mobility', name: 'KG모빌리티', nameEn: 'KG Mobility', ticker: '003620', chain: S.OEM, semType: 'SUV·픽업', semTypeEn: 'SUV & pickup OEM', products: 'SUV·픽업트럭', productsEn: 'SUV, pickup trucks', partners: ['stellantis', 'gm'] },

  { id: 'mobis', name: '현대모비스', nameEn: 'Hyundai Mobis', ticker: '012330', chain: S.PARTS, semType: '모듈·전장·A/S', semTypeEn: 'Modules, electronics, A/S', products: '샤시·콕핏·램프·전장', productsEn: 'Chassis, cockpit, lamps, electronics', partners: ['bosch', 'continental', 'denso'] },
  { id: 'hl_mando', name: 'HL만도', nameEn: 'HL Mando', ticker: '204320', chain: S.PARTS, semType: '조향·제동·ADAS', semTypeEn: 'Steering, braking, ADAS', products: '스티어링·브레이크·ADAS', productsEn: 'Steering, brakes, ADAS', partners: ['bosch', 'continental', 'zf'] },
  { id: 'hanon', name: '한온시스템', nameEn: 'Hanon Systems', ticker: '018880', chain: S.PARTS, semType: '열관리·공조', semTypeEn: 'Thermal & HVAC', products: '공조·열관리·컴프레서', productsEn: 'HVAC, thermal, compressors', partners: ['denso', 'mahindra', 'vw'] },
  { id: 'hyundai_wia', name: '현대위아', nameEn: 'Hyundai Wia', ticker: '011210', chain: S.PARTS, semType: '파워트레인·공작', semTypeEn: 'Powertrain & machinery', products: '엔진·변속기·공작기계', productsEn: 'Engines, transmissions, machine tools', partners: ['denso', 'bosch'] },
  { id: 'sl', name: '에스엘', nameEn: 'SL Corporation', ticker: '005850', chain: S.PARTS, semType: '램프·전장부품', semTypeEn: 'Lamps & electrical parts', products: '헤드램프·리어램프', productsEn: 'Headlamps, rear lamps', partners: ['bosch', 'continental'] },
  { id: 'dn_auto', name: 'DN오토모티브', nameEn: 'DN Automotive', ticker: '007340', chain: S.PARTS, semType: '배터리·부품', semTypeEn: 'Battery & auto parts', products: '배터리·부품·소재', productsEn: 'Batteries, parts, materials', partners: ['bosch', 'continental'] },
  { id: 'myungsin', name: '명신산업', nameEn: 'Myungshin Industry', ticker: '009900', chain: S.PARTS, semType: '차체·프레스', semTypeEn: 'Body & press parts', products: '차체부품·프레스', productsEn: 'Body & press parts', partners: ['toyota', 'gm'] },
  { id: 'sungwoo', name: '성우하이텍', nameEn: 'Sungwoo Hitech', ticker: '015750', chain: S.PARTS, semType: '범퍼·차체', semTypeEn: 'Bumpers & body', products: '범퍼·차체부품', productsEn: 'Bumpers, body parts', partners: ['vw', 'gm'] },
  { id: 'seoyon_ehwa', name: '서연이화', nameEn: 'Seoyon E-Hwa', ticker: '200880', chain: S.PARTS, semType: '내장·시트', semTypeEn: 'Interior & seats', products: '도어트림·시트', productsEn: 'Door trim, seats', partners: ['toyota', 'stellantis'] },
  { id: 'hwashin', name: '화신', nameEn: 'Hwashin', ticker: '010690', chain: S.PARTS, semType: '샤시·현가', semTypeEn: 'Chassis & suspension', products: '현가·샤시부품', productsEn: 'Suspension, chassis', partners: ['zf', 'continental'] },
  { id: 'daewon', name: '대원강업', nameEn: 'Daewon Kangup', ticker: '000430', chain: S.PARTS, semType: '스프링·현가', semTypeEn: 'Springs & suspension', products: '스프링·현가부품', productsEn: 'Springs, suspension parts', partners: ['zf', 'bosch'] },
  { id: 'snt_motive', name: 'SNT모티브', nameEn: 'SNT Motiv', ticker: '064960', chain: S.PARTS, semType: '모터·구동', semTypeEn: 'Motors & drivetrain', products: '모터·구동부품', productsEn: 'Motors, drivetrain parts', partners: ['denso', 'bosch'] },

  { id: 'hankook_tire', name: '한국타이어앤테크놀로지', nameEn: 'Hankook Tire & Technology', ticker: '161390', chain: S.TIRE, semType: '타이어', semTypeEn: 'Tires', products: '승용·상용 타이어', productsEn: 'Passenger & commercial tires', partners: ['michelin', 'bridgestone', 'goodyear'] },
  { id: 'kumho_tire', name: '금호타이어', nameEn: 'Kumho Tire', ticker: '073240', chain: S.TIRE, semType: '타이어', semTypeEn: 'Tires', products: '승용·상용 타이어', productsEn: 'Passenger & commercial tires', partners: ['michelin', 'bridgestone'] },
  { id: 'nexen_tire', name: '넥센타이어', nameEn: 'Nexen Tire', ticker: '002350', chain: S.TIRE, semType: '타이어', semTypeEn: 'Tires', products: '승용 타이어', productsEn: 'Passenger tires', partners: ['goodyear', 'bridgestone'] },
  { id: 'hankook_co', name: '한국앤컴퍼니', nameEn: 'Hankook & Company', ticker: '000240', chain: S.TIRE, semType: '타이어 지주', semTypeEn: 'Tire holding', products: '한국타이어 등 계열', productsEn: 'Hankook Tire affiliates', partners: ['michelin', 'bridgestone'] },

  { id: 'hyundai_autoever', name: '현대오토에버', nameEn: 'Hyundai AutoEver', ticker: '307950', chain: S.ELEC, semType: '차량 SW·IT', semTypeEn: 'Automotive SW & IT', products: '차량 SW·클라우드·모빌리티 IT', productsEn: 'Vehicle SW, cloud, mobility IT', partners: ['nvidia', 'bosch', 'continental'] },
  { id: 'mcnex', name: '엠씨넥스', nameEn: 'Mcnex', ticker: '097520', chain: S.ELEC, semType: '카메라·전장', semTypeEn: 'Cameras & electronics', products: '차량 카메라·모듈', productsEn: 'Automotive cameras & modules', partners: ['bosch', 'continental', 'denso'] },
];

const SEED_CLEAN = SEED.filter((s) => s.ticker && /^\d{6}$/.test(s.ticker));

const GLOBALS = [
  { id: 'toyota', name: 'Toyota', nameEn: 'Toyota', country: '일본/Japan', region: 'jp', sector: 'Global OEM' },
  { id: 'gm', name: 'GM', nameEn: 'General Motors', country: '미국/USA', region: 'us', sector: 'Global OEM' },
  { id: 'vw', name: 'Volkswagen', nameEn: 'Volkswagen', country: '독일/Germany', region: 'eu', sector: 'Global OEM' },
  { id: 'stellantis', name: 'Stellantis', nameEn: 'Stellantis', country: '네덜란드/NL', region: 'eu', sector: 'Global OEM' },
  { id: 'bosch', name: 'Bosch', nameEn: 'Bosch', country: '독일/Germany', region: 'eu', sector: 'Auto parts' },
  { id: 'continental', name: 'Continental', nameEn: 'Continental', country: '독일/Germany', region: 'eu', sector: 'Auto parts / ADAS' },
  { id: 'denso', name: 'DENSO', nameEn: 'DENSO', country: '일본/Japan', region: 'jp', sector: 'Auto parts' },
  { id: 'zf', name: 'ZF', nameEn: 'ZF', country: '독일/Germany', region: 'eu', sector: 'Driveline / chassis' },
  { id: 'michelin', name: 'Michelin', nameEn: 'Michelin', country: '프랑스/France', region: 'eu', sector: 'Tires' },
  { id: 'bridgestone', name: 'Bridgestone', nameEn: 'Bridgestone', country: '일본/Japan', region: 'jp', sector: 'Tires' },
  { id: 'goodyear', name: 'Goodyear', nameEn: 'Goodyear', country: '미국/USA', region: 'us', sector: 'Tires' },
  { id: 'nvidia', name: 'NVIDIA', nameEn: 'NVIDIA', country: '미국/USA', region: 'us', sector: 'ADAS compute' },
  { id: 'mahindra', name: 'Mahindra', nameEn: 'Mahindra', country: '인도/India', region: 'eu', sector: 'OEM / JV peer' },
];

function buildT(n, kospi, kosdaq) {
  const clk = {};
  const cle = {};
  const cfk = {};
  const cfe = {};
  const labels = {
    [S.OEM]: { ko: S.OEM, en: 'OEMs' },
    [S.PARTS]: { ko: S.PARTS, en: 'Parts' },
    [S.TIRE]: { ko: S.TIRE, en: 'Tires' },
    [S.ELEC]: { ko: S.ELEC, en: 'Electronics / ADAS' },
  };
  for (const k of SECTOR_ORDER) {
    clk[k] = labels[k].ko;
    cle[k] = labels[k].en;
    cfk[k] = labels[k].ko;
    cfe[k] = labels[k].en;
  }
  return {
    ko: {
      title: '🇰🇷 한국 자동차 투자 지도',
      subtitle: '완성차·부품·타이어·전장/ADAS 등 국내 상장 자동차 밸류체인과 글로벌 peer 참고 관계',
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
      sbGlobal: '글로벌 자동차 peer',
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
      graphHint: '국내 자동차 밸류체인과 글로벌 OEM·부품 peer 참고 연결(가중치 참고)',
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
      title: '🇰🇷 Korea Auto Industry Map',
      subtitle: 'Listed Korean OEMs, parts, tires, and electronics/ADAS with global peer relationships',
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
      sbGlobal: 'Global auto peers',
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
      graphHint: 'Explore domestic auto value chains and global OEM / parts peers (weights illustrative)',
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
      id: s.id || `auto_${i}`,
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

  html = html.replace(/powergrid\/korea_powergrid_map/g, 'auto/korea_auto_map');
  html = html.replace(/\/powergrid\//g, '/auto/');
  html = html.replace(/data-sector="powergrid"/g, 'data-sector="auto"');
  html = html.replace(/한국 전력설비 투자 지도/g, '한국 자동차 투자 지도');
  html = html.replace(/Korea Power Grid Equipment Map/g, 'Korea Auto Industry Map');
  html = html.replace(/전력설비·송배전·발전설비/g, '완성차·부품·타이어·전장');
  html = html.replace(/Power equipment, T&amp;D, and power generation equipment/g, 'OEMs, parts, tires, and electronics/ADAS');
  html = html.replace(/Power equipment, T&D, and power generation equipment/g, 'OEMs, parts, tires, and electronics/ADAS');

  html = html.replace(/<title>[^<]*<\/title>/, '<title>한국 자동차 투자 지도 / Korea Auto Industry Map</title>');

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
    '<h1 id="hdr-title">🇰🇷 한국 자동차 투자 지도</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">완성차·부품·타이어·전장/ADAS 등 국내 상장 자동차 밸류체인과 글로벌 peer 참고 관계</p>',
  );

  const outDir = join(__dirname, 'auto');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(join(outDir, 'korea_auto_map.html'), html, 'utf8');
  console.log('Wrote auto/korea_auto_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
