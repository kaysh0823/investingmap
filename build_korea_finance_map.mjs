/**
 * Builds finance/korea_finance_map.html from powergrid template.
 * Chains: banks, securities, insurance, cards/capital, other finance.
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
  BANK: '은행·금융지주',
  SEC: '증권·자산운용',
  INS: '보험',
  CARD: '카드·캐피탈',
  OTHER: '기타금융',
};

const SECTOR_ORDER = [S.BANK, S.SEC, S.INS, S.CARD, S.OTHER];

const CHAIN_COLORS = {
  [S.BANK]: '#42A5F5',
  [S.SEC]: '#66BB6A',
  [S.INS]: '#FFA726',
  [S.CARD]: '#AB47BC',
  [S.OTHER]: '#78909C',
};

const CHAIN_ANGLE = {
  [S.BANK]: 0,
  [S.SEC]: 72,
  [S.INS]: 144,
  [S.CARD]: 216,
  [S.OTHER]: 288,
};

/** Seed list — KRX mcap/PER/PBR merged at build time. */
const SEED = [
  // Banks & holdings
  { id: 'kb_fin', name: 'KB금융', nameEn: 'KB Financial Group', ticker: '105560', chain: S.BANK, semType: '금융지주·은행', semTypeEn: 'Bank holding', products: '국민은행·증권·보험·카드', productsEn: 'Bank, securities, insurance, card', partners: ['jpmorgan', 'hsbc'] },
  { id: 'shinhan', name: '신한지주', nameEn: 'Shinhan Financial Group', ticker: '055550', chain: S.BANK, semType: '금융지주·은행', semTypeEn: 'Bank holding', products: '신한은행·카드·투자증권', productsEn: 'Bank, card, securities', partners: ['jpmorgan', 'citi'] },
  { id: 'hana', name: '하나금융지주', nameEn: 'Hana Financial Group', ticker: '086790', chain: S.BANK, semType: '금융지주·은행', semTypeEn: 'Bank holding', products: '하나은행·증권·카드', productsEn: 'Bank, securities, card', partners: ['hsbc', 'jpmorgan'] },
  { id: 'woori', name: '우리금융지주', nameEn: 'Woori Financial Group', ticker: '316140', chain: S.BANK, semType: '금융지주·은행', semTypeEn: 'Bank holding', products: '우리은행·카드·캐피탈', productsEn: 'Bank, card, capital', partners: ['citi', 'hsbc'] },
  { id: 'ibk', name: '기업은행', nameEn: 'Industrial Bank of Korea', ticker: '024110', chain: S.BANK, semType: '국책·중소기업 금융', semTypeEn: 'SME & policy bank', products: '중소기업 대출·정책금융', productsEn: 'SME lending, policy finance', partners: ['adb', 'ifc'] },
  { id: 'bnk', name: 'BNK금융지주', nameEn: 'BNK Financial Group', ticker: '138930', chain: S.BANK, semType: '지방금융지주', semTypeEn: 'Regional bank holding', products: '부산·경남은행', productsEn: 'Busan & Kyongnam banks', partners: ['hsbc'] },
  { id: 'jb', name: 'JB금융지주', nameEn: 'JB Financial Group', ticker: '175330', chain: S.BANK, semType: '지방금융지주', semTypeEn: 'Regional bank holding', products: '전북·광주은행', productsEn: 'Jeonbuk & Gwangju banks', partners: ['hsbc'] },
  { id: 'dgb', name: 'DGB금융지주', nameEn: 'DGB Financial Group', ticker: '139130', chain: S.BANK, semType: '지방금융지주', semTypeEn: 'Regional bank holding', products: '대구은행·증권', productsEn: 'Daegu bank & securities', partners: ['hsbc'] },
  { id: 'meritz_fin', name: '메리츠금융지주', nameEn: 'Meritz Financial Group', ticker: '138040', chain: S.BANK, semType: '금융지주', semTypeEn: 'Financial holding', products: '메리츠증권·화재·캐피탈', productsEn: 'Securities, P&C, capital', partners: ['goldman', 'morgan_stanley'] },
  { id: 'korea_inv', name: '한국금융지주', nameEn: 'Korea Investment Holdings', ticker: '071050', chain: S.BANK, semType: '금융지주·증권', semTypeEn: 'Securities holding', products: '한국투자증권·자산운용', productsEn: 'Brokerage & asset management', partners: ['morgan_stanley', 'goldman'] },

  // Securities
  { id: 'mirae', name: '미래에셋증권', nameEn: 'Mirae Asset Securities', ticker: '006800', chain: S.SEC, semType: '종합증권·WM', semTypeEn: 'Full-service brokerage & WM', products: '브로커리지·IB·자산관리', productsEn: 'Brokerage, IB, wealth', partners: ['morgan_stanley', 'blackrock'] },
  { id: 'nh_inv', name: 'NH투자증권', nameEn: 'NH Investment & Securities', ticker: '005940', chain: S.SEC, semType: '종합증권', semTypeEn: 'Full-service brokerage', products: '브로커리지·IB·리서치', productsEn: 'Brokerage, IB, research', partners: ['jpmorgan', 'goldman'] },
  { id: 'samsung_sec', name: '삼성증권', nameEn: 'Samsung Securities', ticker: '016360', chain: S.SEC, semType: '종합증권', semTypeEn: 'Full-service brokerage', products: 'WM·브로커리지·IB', productsEn: 'WM, brokerage, IB', partners: ['goldman', 'morgan_stanley'] },
  { id: 'kiwoom', name: '키움증권', nameEn: 'Kiwoom Securities', ticker: '039490', chain: S.SEC, semType: '온라인·리테일 증권', semTypeEn: 'Online retail brokerage', products: '온라인 트레이딩·파생', productsEn: 'Online trading, derivatives', partners: ['interactive_brokers', 'schwab'] },
  { id: 'daishin', name: '대신증권', nameEn: 'Daishin Securities', ticker: '003540', chain: S.SEC, semType: '종합증권', semTypeEn: 'Full-service brokerage', products: '브로커리지·IB', productsEn: 'Brokerage, IB', partners: ['morgan_stanley'] },
  { id: 'yuant', name: '유안타증권', nameEn: 'Yuanta Securities Korea', ticker: '003470', chain: S.SEC, semType: '종합증권', semTypeEn: 'Full-service brokerage', products: '브로커리지·WM', productsEn: 'Brokerage, WM', partners: ['yuanta_tw'] },
  { id: 'hyundai_sec', name: '현대차증권', nameEn: 'Hyundai Motor Securities', ticker: '001500', chain: S.SEC, semType: '증권·IB', semTypeEn: 'Brokerage & IB', products: '브로커리지·기업금융', productsEn: 'Brokerage, corporate finance', partners: ['morgan_stanley'] },
  { id: 'hanwha_inv', name: '한화투자증권', nameEn: 'Hanwha Investment & Securities', ticker: '003530', chain: S.SEC, semType: '증권', semTypeEn: 'Brokerage', products: '브로커리지·IB', productsEn: 'Brokerage, IB', partners: ['goldman'] },
  { id: 'eugene', name: '유진투자증권', nameEn: 'Eugene Investment & Securities', ticker: '001200', chain: S.SEC, semType: '증권', semTypeEn: 'Brokerage', products: '브로커리지·IB', productsEn: 'Brokerage, IB', partners: ['morgan_stanley'] },
  { id: 'ebest', name: 'LS증권', nameEn: 'LS Securities', ticker: '078020', chain: S.SEC, semType: '온라인·리테일 증권', semTypeEn: 'Online retail brokerage', products: '온라인 트레이딩', productsEn: 'Online trading', partners: ['interactive_brokers'] },

  // Insurance
  { id: 'samsung_life', name: '삼성생명', nameEn: 'Samsung Life Insurance', ticker: '032830', chain: S.INS, semType: '생명보험', semTypeEn: 'Life insurance', products: '종신·연금·보장성', productsEn: 'Life, annuity, protection', partners: ['aig', 'metlife', 'prudential'] },
  { id: 'samsung_fire', name: '삼성화재', nameEn: 'Samsung Fire & Marine', ticker: '000810', chain: S.INS, semType: '손해보험', semTypeEn: 'P&C insurance', products: '자동차·장기·일반보험', productsEn: 'Auto, long-term, commercial', partners: ['allianz', 'aig'] },
  { id: 'db_ins', name: 'DB손해보험', nameEn: 'DB Insurance', ticker: '005830', chain: S.INS, semType: '손해보험', semTypeEn: 'P&C insurance', products: '자동차·장기보험', productsEn: 'Auto & long-term P&C', partners: ['allianz', 'munich_re'] },
  { id: 'hyundai_marine', name: '현대해상', nameEn: 'Hyundai Marine & Fire', ticker: '001450', chain: S.INS, semType: '손해보험', semTypeEn: 'P&C insurance', products: '자동차·장기·해상', productsEn: 'Auto, long-term, marine', partners: ['allianz', 'lloyds'] },
  { id: 'hanwha_life', name: '한화생명', nameEn: 'Hanwha Life Insurance', ticker: '088350', chain: S.INS, semType: '생명보험', semTypeEn: 'Life insurance', products: '종신·연금·보장성', productsEn: 'Life, annuity, protection', partners: ['metlife', 'prudential'] },
  { id: 'hanwha_gi', name: '한화손해보험', nameEn: 'Hanwha General Insurance', ticker: '000370', chain: S.INS, semType: '손해보험', semTypeEn: 'P&C insurance', products: '자동차·장기보험', productsEn: 'Auto & long-term P&C', partners: ['allianz'] },
  { id: 'heungkuk', name: '흥국화재', nameEn: 'Heungkuk Fire & Marine', ticker: '000540', chain: S.INS, semType: '손해보험', semTypeEn: 'P&C insurance', products: '자동차·장기보험', productsEn: 'Auto & long-term P&C', partners: ['munich_re'] },

  // Cards & capital
  { id: 'samsung_card', name: '삼성카드', nameEn: 'Samsung Card', ticker: '029780', chain: S.CARD, semType: '신용카드', semTypeEn: 'Credit card', products: '카드·할부·멤버십', productsEn: 'Cards, installments, membership', partners: ['visa', 'mastercard'] },

  // Other finance — PE/VC/investment names (인베스트·인베스트먼트)
  { id: 'mirae_vent', name: '미래에셋벤처투자', nameEn: 'Mirae Asset Venture Investment', ticker: '100790', chain: S.OTHER, semType: '벤처투자', semTypeEn: 'Venture investment', products: '벤처·성장기업 투자', productsEn: 'Venture & growth equity', partners: ['blackrock', 'morgan_stanley'] },
  { id: 'aju_ib', name: '아주IB투자', nameEn: 'AJU IB Investment', ticker: '027360', chain: S.OTHER, semType: 'IB·벤처투자', semTypeEn: 'IB & venture investment', products: '벤처·PE 투자', productsEn: 'Venture & PE investment', partners: ['goldman', 'blackrock'] },
  { id: 'maps_realty', name: '맵스리얼티', nameEn: 'Mirae Asset MAPS Realty Investment', ticker: '094800', chain: S.OTHER, semType: '부동산투자회사', semTypeEn: 'Realty investment company', products: '부동산 간접투자', productsEn: 'Real-estate investment', partners: ['blackrock'] },
  { id: 'woori_tech_inv', name: '우리기술투자', nameEn: 'Woori Technology Investment', ticker: '041190', chain: S.OTHER, semType: '기술투자', semTypeEn: 'Technology investment', products: '기술·벤처 투자', productsEn: 'Tech & venture investment', partners: ['blackrock', 'jpmorgan'] },
];

// Remove unlisted / invalid tickers from seed (lotte card may not be listed under that code)
const SEED_CLEAN = SEED.filter((s) => s.ticker && s.ticker !== '000000' && /^\d{6}$/.test(s.ticker));

const GLOBALS = [
  { id: 'jpmorgan', name: 'JPMorgan Chase', nameEn: 'JPMorgan Chase', country: '미국/USA', region: 'us', sector: 'Global bank' },
  { id: 'goldman', name: 'Goldman Sachs', nameEn: 'Goldman Sachs', country: '미국/USA', region: 'us', sector: 'Investment bank' },
  { id: 'morgan_stanley', name: 'Morgan Stanley', nameEn: 'Morgan Stanley', country: '미국/USA', region: 'us', sector: 'Investment bank' },
  { id: 'citi', name: 'Citigroup', nameEn: 'Citigroup', country: '미국/USA', region: 'us', sector: 'Global bank' },
  { id: 'hsbc', name: 'HSBC', nameEn: 'HSBC', country: '영국/UK', region: 'gb', sector: 'Global bank' },
  { id: 'blackrock', name: 'BlackRock', nameEn: 'BlackRock', country: '미국/USA', region: 'us', sector: 'Asset manager' },
  { id: 'visa', name: 'Visa', nameEn: 'Visa', country: '미국/USA', region: 'us', sector: 'Payments' },
  { id: 'mastercard', name: 'Mastercard', nameEn: 'Mastercard', country: '미국/USA', region: 'us', sector: 'Payments' },
  { id: 'aig', name: 'AIG', nameEn: 'AIG', country: '미국/USA', region: 'us', sector: 'Insurance' },
  { id: 'allianz', name: 'Allianz', nameEn: 'Allianz', country: '독일/Germany', region: 'eu', sector: 'Insurance' },
  { id: 'metlife', name: 'MetLife', nameEn: 'MetLife', country: '미국/USA', region: 'us', sector: 'Life insurance' },
  { id: 'prudential', name: 'Prudential', nameEn: 'Prudential', country: '미국/USA', region: 'us', sector: 'Life insurance' },
  { id: 'munich_re', name: 'Munich Re', nameEn: 'Munich Re', country: '독일/Germany', region: 'eu', sector: 'Reinsurance' },
  { id: 'lloyds', name: 'Lloyd\'s', nameEn: 'Lloyd\'s', country: '영국/UK', region: 'gb', sector: 'Insurance market' },
  { id: 'interactive_brokers', name: 'Interactive Brokers', nameEn: 'Interactive Brokers', country: '미국/USA', region: 'us', sector: 'Online brokerage' },
  { id: 'schwab', name: 'Charles Schwab', nameEn: 'Charles Schwab', country: '미국/USA', region: 'us', sector: 'Brokerage' },
  { id: 'yuanta_tw', name: 'Yuanta Financial', nameEn: 'Yuanta Financial', country: '대만/Taiwan', region: 'tw', sector: 'Financial holding' },
  { id: 'adb', name: 'ADB', nameEn: 'Asian Development Bank', country: '필리핀/Philippines', region: 'as', sector: 'Development finance' },
  { id: 'ifc', name: 'IFC', nameEn: 'IFC (World Bank)', country: '미국/USA', region: 'us', sector: 'Development finance' },
];

function buildT(n, kospi, kosdaq) {
  const clk = {};
  const cle = {};
  const cfk = {};
  const cfe = {};
  const labels = {
    [S.BANK]: { ko: S.BANK, en: 'Banks & holdings' },
    [S.SEC]: { ko: S.SEC, en: 'Securities & AM' },
    [S.INS]: { ko: S.INS, en: 'Insurance' },
    [S.CARD]: { ko: S.CARD, en: 'Cards & capital' },
    [S.OTHER]: { ko: S.OTHER, en: 'Other finance' },
  };
  for (const k of SECTOR_ORDER) {
    clk[k] = labels[k].ko;
    cle[k] = labels[k].en;
    cfk[k] = labels[k].ko;
    cfe[k] = labels[k].en;
  }
  return {
    ko: {
      title: '🇰🇷 한국 금융 투자 지도',
      subtitle: '은행·증권·보험·카드·캐피탈 등 국내 상장 금융사와 글로벌 peer 참고 관계',
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
      note: '⚠ 종목코드·참고 관계는 에디터리얼 그룹이며 공식 정보가 아닙니다. 시가총액·시장은 상단 기준일의 KRX 공시에 맞추었으며, 한국어 열은 시총을 조(兆)원 단위로 소수 둘째 자리까지 표시합니다. 영문 열은 네이버 금융 USD/KRW 고시 환율(data/fx_usdkrw.json)을 적용해 B(십억 달러) 단위로 소수 둘째 자리까지 환산한 참고치입니다.',
      sbKorean: '국내 상장 (밸류체인)',
      sbGlobal: '글로벌 금융 peer',
      sbSize: '노드 크기',
      sbHow: '조작법',
      chainLabel: clk,
      chainFilter: cfk,
      allFilter: '전체',
      kosp: 'KOSPI',
      kosdaq: 'KOSDAQ',
      regionLabel: { us: '미국', tw: '대만', cn: '중국', eu: '유럽', kr: '한국', jp: '일본', gb: '영국', as: '아시아' },
      sizeDesc: '대형: 시총 약 15조원↑\n중형: 약 1~15조원\n소형: 1조원 미만\n◇ 글로벌 peer',
      howDesc: '• 노드 클릭: 관계 강조\n• 드래그: 이동\n• 스크롤: 확대/축소\n• 빈 칸: 선택 해제\n• 범례: 그룹 하이라이트',
      graphHint: '국내 금융사와 글로벌 peer·결제망 참고 연결(가중치 참고)',
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
      title: '🇰🇷 Korea Finance Map',
      subtitle: 'Listed Korean banks, securities, insurers, cards & capital with global peer links',
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
      thPosition: 'Price Position',
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
      note: '⚠ Public information only. Market cap and segment follow KRX disclosures as of the date shown above. Value chain labels are editorial groupings. English table shows market cap in billions USD (two decimals) using the USD/KRW spot from Naver Finance (data/fx_usdkrw.json, illustrative).',
      sbKorean: 'Korean listed (value chain)',
      sbGlobal: 'Global finance peers',
      sbSize: 'Node size',
      sbHow: 'Controls',
      chainLabel: cle,
      chainFilter: cfe,
      allFilter: 'All',
      kosp: 'KOSPI',
      kosdaq: 'KOSDAQ',
      regionLabel: { us: 'USA', tw: 'Taiwan', cn: 'China', eu: 'Europe', kr: 'Korea', jp: 'Japan', gb: 'UK', as: 'Asia' },
      sizeDesc: 'Large: mcap ~₩15T+\nMid: ~₩1–15T\nSmall: <₩1T\n◇ Global peers',
      howDesc: '• Click: highlight\n• Drag\n• Scroll: zoom\n• Background: clear\n• Legend: group',
      graphHint: 'Explore domestic finance names and global peer / payments links (weights illustrative)',
      ttChain: 'Chain',
      ttSemType: 'Segment',
      ttProducts: 'Products',
      ttRevenue: 'Market cap',
      ttPartners: 'Partners',
      ttSuppliers: 'Korean cos.',
      ttCountry: 'Country',
      ttSector: 'Field',
      ttTags: 'Multi-axis',
      fieldSemType: 'semTypeEn',
      fieldProducts: 'productsEn',
    },
  };
}

function financeAngleLiteral() {
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
      id: s.id || `finance_${i}`,
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

  html = html.replace(/powergrid\/korea_powergrid_map/g, 'finance/korea_finance_map');
  html = html.replace(/\/powergrid\//g, '/finance/');
  html = html.replace(/data-sector="powergrid"/g, 'data-sector="finance"');
  html = html.replace(/한국 전력설비 투자 지도/g, '한국 금융 투자 지도');
  html = html.replace(/Korea Power Grid Equipment Map/g, 'Korea Finance Map');
  html = html.replace(/전력설비·송배전·발전설비/g, '은행·증권·보험·카드·캐피탈');
  html = html.replace(/Power equipment, T&amp;D, and generation OEM/g, 'Banks, securities, insurance, cards and capital');
  html = html.replace(/Power equipment, T&D, and generation OEM/g, 'Banks, securities, insurance, cards and capital');

  html = html.replace(/<title>[^<]*<\/title>/, '<title>한국 금융 투자 지도 / Korea Finance Map</title>');

  html = html.replace(
    /const CHAIN_COLORS = \{[\s\S]*?\};/,
    `const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};`,
  );

  const angleLit = financeAngleLiteral();
  html = html.replace(/\{ '[^']+': \d+(?:, '[^']+': \d+)+ \}/g, angleLit);

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
    '<h1 id="hdr-title">🇰🇷 한국 금융 투자 지도</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">은행·증권·보험·카드·캐피탈 등 국내 상장 금융사와 글로벌 peer 참고 관계</p>',
  );

  const outDir = join(__dirname, 'finance');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(join(outDir, 'korea_finance_map.html'), html, 'utf8');
  console.log('Wrote finance/korea_finance_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
