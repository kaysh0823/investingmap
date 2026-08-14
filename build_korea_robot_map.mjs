/**
 * Builds korea_robot_map.html from semiconductor/korea_semiconductor_map.html template
 * (robot / physical AI value chain, KRX mcap merge).
 * ASCII-only (\\u escapes) for Korean literals in this file.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './lib/krx_per_pbr.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map, mergeListedEnglishIntoCompanies } from './lib/krx_data_sources.mjs';
import { passesMcapFloor } from './lib/mcap_policy.mjs';
import { patchKoreanCompaniesHtml } from './lib/map_company_serialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const S = {
  H1: '\uD734\uBA38\uB178\uC774\uB4DC\u00B7\uBAA8\uBC14\uC77C',
  H2: '\uD611\uB3D9\u00B7\uC5C5\uBB34\uC6A9\uB85C\uBD07',
  H3: '\uC0B0\uC5C5\uC790\uB3D9\uD654\u00B7\uC7A5\uBE44',
  H4: '\uBB3C\uB958\u00B7\uBB34\uC778\uC8FC\uD589',
  H5: '\uC815\uBC00\u00B7\uC13C\uC11C\u00B7\uBE44\uC804',
  H6: '\uC9C0\uB2A5\uC81C\uC5B4\u00B7\uBB3C\uB9ACAI',
};

const SECTOR_ORDER = [S.H1, S.H2, S.H3, S.H4, S.H5, S.H6];

const CHAIN_COLORS = {
  [S.H1]: '#4FC3F7',
  [S.H2]: '#66BB6A',
  [S.H3]: '#FFA726',
  [S.H4]: '#EF5350',
  [S.H5]: '#AB47BC',
  [S.H6]: '#26C6DA',
};

const CHAIN_ANGLE = {
  [S.H1]: 0,
  [S.H2]: 60,
  [S.H3]: 120,
  [S.H4]: 180,
  [S.H5]: 240,
  [S.H6]: 300,
};

function loadKrx() {
  return loadMergedKrxMap(join(__dirname, 'data'));
}

function fmtMcap(won) {
  if (won == null || won === 0) return '\u2014';
  if (won >= 1e12) {
    const t = won / 1e12;
    const s = t >= 10 ? t.toFixed(0) : t.toFixed(1).replace(/\.0$/, '');
    return '\uC57D ' + s + '\uC870\uC6D0';
  }
  if (won >= 1e8) return '\uC57D ' + (won / 1e8).toFixed(0) + '\uC5B5\uC6D0';
  return '\uC57D ' + won.toLocaleString('ko-KR') + '\uC6D0';
}

function mcapTier(won) {
  if (!won) return 1;
  if (won >= 15e12) return 3;
  if (won >= 1e12) return 2;
  return 1;
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatPartner(p) {
  if (typeof p === 'string') return `'${p}'`;
  const bits = [`id: '${esc(p.id)}'`];
  if (p.edgeLabel) bits.push(`edgeLabel: '${esc(p.edgeLabel)}'`);
  if (p.edgeLabelEn) bits.push(`edgeLabelEn: '${esc(p.edgeLabelEn)}'`);
  if (p.weight != null && Number.isFinite(p.weight)) bits.push(`weight: ${p.weight}`);
  if (p.kind) bits.push(`kind: '${esc(p.kind)}'`);
  return `{ ${bits.join(', ')} }`;
}

const SEED = [
  {
    id: 'rainbow',
    name: '\uB808\uC778\uBCF4\uC6B0\uB85C\uBCF4\uD2F1\uC2A4',
    nameEn: 'Rainbow Robotics',
    ticker: '277810',
    chain: S.H1,
    semType: '\uD734\uBA38\uB178\uC774\uB4DC \uBC0F \uB9E4\uB2C8\uD37C\uB808\uC774\uD130 \uD50C\uB7AB\uD3FC',
    semTypeEn: 'Humanoid & dual-arm systems',
    products: 'HUBO, \uC81C\uC870\uC6A9\u00B7\uC11C\uBE44\uC2A4\uB85C\uBD07',
    productsEn: 'HUBO, manufacturing & service robots',
    partners: [
      'nvidia', 'siemens', 'hyundai_mt',
      { id: 'samsung_eco', kind: 'backing', edgeLabel: '\uC0BC\uC131\uACC4 \uC5F0\uD569\u00B7\uC9C0\uBD84 \uCC38\uC5EC(\uCC38\uACE0)', edgeLabelEn: 'Samsung ecosystem tie (illus.)', weight: 0.15 },
    ],
  },
  {
    id: 'clobot',
    name: '\uD074\uB85C\uBD07',
    nameEn: 'Clobot',
    ticker: '466100',
    chain: S.H1,
    semType: '\uC11C\uBE44\uC2A4\u00B7\uAC00\uC774\uB4DC \uB85C\uBD07',
    semTypeEn: 'Service & guide robots',
    products: 'CLOi \uB77C\uC778\uC5C5, \uAC00\uC815\u00B7\uC0C1\uC5C5\uC6A9',
    productsEn: 'CLOi lineup, home & commercial',
    partners: ['amazon', 'google'],
  },
  {
    id: 'doosan_robot',
    name: '\uB450\uC0B0\uB85C\uBCF4\uD2F1\uC2A4',
    nameEn: 'Doosan Robotics',
    ticker: '454910',
    chain: S.H2,
    semType: '\uD611\uB3D9\uB85C\uBD07\u00B7\uC5C5\uBB34\uC6A9',
    semTypeEn: 'Collaborative robots',
    products: 'A-, M-, H-\uC2DC\uB9AC\uC988, \uD32C\uD134\uD2B8',
    productsEn: 'A/M/H-series cobots, Palletizing',
    partners: [
      'nvidia', 'fanuc', 'abb',
      { id: 'doosan_grp', kind: 'backing', edgeLabel: '\uB450\uC0B0\uADF8\uB8F9 \uC9C0\uBD84(\uCC38\uACE0)', edgeLabelEn: 'Doosan group backing (illus.)', weight: 0.18 },
    ],
  },
  {
    id: 'robotis',
    name: '\uB85C\uBCF4\uD2F0\uC988',
    nameEn: 'Robotis',
    ticker: '108490',
    chain: S.H2,
    semType: '\uC5C5\uBB34\uC6A9\u00B7\uAD50\uC721\uB85C\uBD07',
    semTypeEn: 'Manipulators & educational robots',
    products: 'DYNAMIXEL \uC561\uD280\uC5D0\uC774\uD130, OPENMANIPULATOR',
    productsEn: 'DYNAMIXEL actuators, OPENMANIPULATOR',
    partners: ['nvidia', 'intel'],
  },
  {
    id: 'robostar',
    name: '\uB85C\uBCF4\uC2A4\uD0C0',
    nameEn: 'Robostar',
    ticker: '090360',
    chain: S.H3,
    semType: '\uC81C\uC5B4\u00B7\uBAA8\uC158\uCEE8\uD2B8\uB864',
    semTypeEn: 'Motion control',
    products: 'RC\uC11C\uBCF4, \uC0B0\uC5C5\uC6A9 \uBAA8\uC158\uCEE8\uD2B8\uB864',
    productsEn: 'Servo drives, industrial motion',
    partners: [
      'siemens', 'fanuc',
      { id: 'doosan_robot', edgeLabel: '\uBAA8\uC158\u00B7\uC11C\uBCF4 \uBD80\uD488\u00B7\uC81C\uC5B4', edgeLabelEn: 'Motion/servo to cobot OEM', weight: 0.14 },
    ],
  },
  {
    id: 'ls_m',
    name: 'LS\uBA38\uD2B8\uB9AC\uC194\uB8E8\uC158',
    nameEn: 'LS Mtron / smart factory',
    ticker: '417200',
    chain: S.H3,
    semType: '\uC9C0\uC5ED\uC811\uADC0\u00B7\uC790\uB3D9\uD654\uC18C\uD504\uD2B8',
    semTypeEn: 'Smart factory & drives',
    products: 'PLC, \uC11C\uBCF4\uBAA8\uD130, \uC790\uB3D9\uD654\uC18C\uD504\uD2B8',
    productsEn: 'PLC, servo motors, factory SW',
    partners: ['siemens', 'abb'],
  },
  {
    id: 'rs_auto',
    name: '\uC54C\uC5D0\uC2A4\uC624\uD1A0\uBA54\uC774\uC158',
    nameEn: 'RS Automation',
    ticker: '140670',
    chain: S.H3,
    semType: 'FA\u00B7\uC2A4\uB9C8\uD2B8\uD329\uD1A0\uB9AC',
    semTypeEn: 'Factory automation',
    products: 'PLC, HMI, \uC778\uBC84\uD130',
    productsEn: 'PLC, HMI, inverters',
    partners: ['siemens', 'mitsubishi_e'],
  },
  {
    id: 'hd_movex',
    name: '\uD604\uB300\uBB34\uBCA1\uC2A4',
    nameEn: 'HYUNDAI MOVEX',
    ticker: '319400',
    chain: S.H4,
    semType: '\uBB34\uC778\uC9C0\uC0C1\u00B7\uBB3C\uB958\uC7A5\uBE44',
    semTypeEn: 'Compact equipment & logistics',
    products: '\uBB34\uC778\uC9C0\uC0C1\uC7A5\uBE44, \uC790\uC7AC\uCCB4\uD56D',
    productsEn: 'Compact construction, materials handling',
    partners: ['caterpillar', 'volvo_ce'],
  },
  {
    id: 'yujin',
    name: '\uC720\uC9C4\uB85C\uBD07',
    nameEn: 'Yujin Robot',
    ticker: '056080',
    chain: S.H5,
    semType: '\uCCAD\uC18C\u00B7\uC11C\uBE44\uC2A4\uB85C\uBD07',
    semTypeEn: 'Cleaning & service robots',
    products: 'iClebo \uB4F1 \uAC00\uC815\u00B7\uC0C1\uC5C5\uCCAD\uC18C',
    productsEn: 'iClebo line, vacuum robots',
    partners: ['amazon', 'google'],
  },
  {
    id: 'piai',
    name: '\uD53C\uC544\uC774\uC774',
    nameEn: 'PIA',
    ticker: '452450',
    chain: S.H5,
    semType: '\uBE44\uC804\u00B7\uC601\uC0C1\uCC98\uB9AC',
    semTypeEn: 'Vision & inspection',
    products: '\uC18C\uD504\uD2B8\uC6E8\uC5B4 \uBE44\uC804, AOI',
    productsEn: 'Machine vision, AOI SW',
    partners: ['keyence', 'cognex'],
  },
  {
    id: 'halla_cast',
    name: '\uD55C\uB77C\uCE90\uC2A4\uD2B8',
    nameEn: 'Halla Cast',
    ticker: '125490',
    chain: S.H5,
    semType: '\uB85C\uBD07\u00B7\uC790\uB3D9\uCC28\uC6A9 \uC815\uBC00 \uB2E4\uC774\uCE90\uC2A4\uD305',
    semTypeEn: 'Precision die casting for robotics & automotive electronics',
    products: '\uB85C\uBD07 \uAD6C\uC870\u00B7\uC5F4\uAD00\uB9AC \uBD80\uD488, \uC790\uC728\uC8FC\uD589\u00B7\uC804\uC7A5 \uD558\uC6B0\uC9D5',
    productsEn: 'Robot structural and thermal-management parts; ADAS and electronics housings',
    partners: ['keyence', 'cognex'],
  },
];

const GLOBALS = [
  { id: 'nvidia', name: 'NVIDIA', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'AI / robotics compute' },
  { id: 'fanuc', name: 'FANUC', country: '\uC77C\uBCF8/Japan', region: 'jp', sector: 'Industrial robots' },
  { id: 'abb', name: 'ABB', country: '\uC2A4\uC704\uC2A4/Switzerland', region: 'eu', sector: 'Robotics & drives' },
  { id: 'siemens', name: 'Siemens', country: '\uB3C5\uC77C/Germany', region: 'eu', sector: 'Digital factory' },
  { id: 'amazon', name: 'Amazon Robotics', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Logistics automation' },
  { id: 'google', name: 'Google DeepMind', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'AI / robotics research' },
  { id: 'intel', name: 'Intel', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Edge AI' },
  { id: 'keyence', name: 'Keyence', country: '\uC77C\uBCF8/Japan', region: 'jp', sector: 'Sensors & vision' },
  { id: 'cognex', name: 'Cognex', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Machine vision' },
  { id: 'hyundai_mt', name: 'Hyundai Motor', country: '\uD55C\uAD6D/Korea', region: 'kr', sector: 'Mobility / pilot projects' },
  { id: 'mitsubishi_e', name: 'Mitsubishi Electric', country: '\uC77C\uBCF8/Japan', region: 'jp', sector: 'FA equipment' },
  { id: 'caterpillar', name: 'Caterpillar', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Heavy equipment' },
  { id: 'volvo_ce', name: 'Volvo CE', country: '\uC2A4\uC704\uC2A4/Sweden', region: 'eu', sector: 'Construction equipment' },
  { id: 'doosan_grp', name: '\uB450\uC0B0\uADF8\uB8F9', country: '\uD55C\uAD6D/Korea', region: 'kr', sector: 'Captive / backing (illus.)' },
  { id: 'samsung_eco', name: '\uC0BC\uC131 \uC5ED\uB7C9', country: '\uD55C\uAD6D/Korea', region: 'kr', sector: 'Strategic partner (illus.)' },
];

function chainLabelKo() {
  return {
    [S.H1]: '\uD734\uBA38\uB178\uC774\uB4DC \u00B7 \uBAA8\uBC14\uC77C \uB85C\uBD07',
    [S.H2]: '\uD611\uB3D9\uB85C\uBD07 \u00B7 \uC5C5\uBB34\uC6A9',
    [S.H3]: '\uC0B0\uC5C5\uC790\uB3D9\uD654 \u00B7 FA',
    [S.H4]: '\uBB3C\uB958 \u00B7 AMR \u00B7 \uBB34\uC778\uC9C0\uC0C1',
    [S.H5]: '\uC815\uBC00\uBD80\uD488 \u00B7 \uC11C\uBC29 \u00B7 \uBE44\uC804',
    [S.H6]: '\uC9C0\uC5ED\uC811\uADC0 \u00B7 \uBB3C\uB9ACAI \u00B7 SW',
  };
}

function chainLabelEn() {
  return {
    [S.H1]: 'Humanoid & mobile robots',
    [S.H2]: 'Collaborative & service arms',
    [S.H3]: 'Industrial automation',
    [S.H4]: 'Logistics, AMR, compact equipment',
    [S.H5]: 'Precision parts, sensing, vision',
    [S.H6]: 'Edge AI, physical AI & software',
  };
}

function chainFilterKo() {
  return {
    [S.H1]: '\uD734\uBA38\uB178\uC774\uB4DC',
    [S.H2]: '\uD611\uB3D9\uB85C\uBD07',
    [S.H3]: '\uC790\uB3D9\uD654',
    [S.H4]: '\uBB3C\uB958',
    [S.H5]: '\uBD80\uD488',
    [S.H6]: '\uBB3C\uB9ACAI',
  };
}

function chainFilterEn() {
  return {
    [S.H1]: 'Humanoid',
    [S.H2]: 'Cobots',
    [S.H3]: 'Factory auto.',
    [S.H4]: 'Logistics',
    [S.H5]: 'Components',
    [S.H6]: 'Physical AI',
  };
}

function buildT(n, kospi, kosdaq) {
  const clk = chainLabelKo();
  const cle = chainLabelEn();
  const cfk = chainFilterKo();
  const cfe = chainFilterEn();
  return {
    ko: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D \uB85C\uBD07 \u00B7 \uD53C\uC9C0\uCEECAI \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4',
      subtitle:
        '\uAD6D\uB0B4 \uC0C1\uC7A5 \uC0B0\uC5C5\uB85C\uBD07\u00B7\uC790\uB3D9\uD654\u00B7\uBB3C\uB958\u00B7\uC9C0\uC5EDAI \uBCA8\uB958\uC640 \uAE00\uB85C\uBC8C \uC7A5\uBE44\u00B7SW \uAD00\uACC4',
      badgeTotal: `\uCD1D <span>${n}</span>\uAC1C \uC0C1\uC7A5\uC0AC`,
      badgeMarket: `KOSPI <span>${kospi}</span>\uC0AC \u00B7 KOSDAQ <span>${kosdaq}</span>\uC0AC`,
      dataAsof: '\uC5C5\uB370\uC774\uD2B8 \uAE30\uC900\uC77C: 2026\uB144 6\uC6D4 12\uC77C',
      tabTable: '\uD83D\uDCCB \uAE30\uC5C5 \uBAA9\uB85D &amp; \uD544\uD130',
      tabGraph: '\uD83C\uDF10 \uAD00\uACC4 \uB124\uD2B8\uC6CC\uD06C',
      langFlag: '\uD83C\uDDFA\uD83C\uDDF8',
      langText: 'English',
      flChain: '\uBCA8\uB958\uCCB4\uC778',
      flMarket: '\uC2DC\uC7A5',
      searchPlaceholder: '\uD83D\uDD0D \uAE30\uC5C5\uBA85 \uAC80\uC0C9...',
      resultLabel: '\uD45C\uC2DC: ',
      resultUnit: '\uAC1C',
      thName: '\uAE30\uC5C5\uBA85',
      thTicker: '\uC885\uBAA9\uCF54\uB4DC',
      thMcap: '\uC2DC\uAC00\uCD1D\uC561',
      thPer: 'PER',
      thPbr: 'PBR',
      thMarket: '\uC2DC\uC7A5',
      thChain: '\uBCA8\uB958\uCCB4\uC778',
      thSemType: '\uC138\uBD80 \uC720\uD615',
      thProducts: '\uC8FC\uC694 \uC81C\uD488\u00B7\uC11C\uBE44\uC2A4',
      thPartners: '\uAE00\uB85C\uBC8C \uC5F0\uACB0\u00B7\uC624\uD504\uC18C\uC2A4',
      note: '\u26A0 \uC885\uBAA9\uCF54\uB4DC\u00B7\uAC70\uB798 \uAD00\uACC4\uB294 \uACF5\uAC1C \uC815\uBCF4 \uAE30\uC900\uC785\uB2C8\uB2E4. \uC2DC\uAC00\uCD1D\uC561\u00B7\uC2DC\uC7A5\uC740 \uC0C1\uB2E8 \uAE30\uC900\uC77C\uC758 KRX \uACF5\uC2DC\uC5D0 \uB9DE\uCD94\uC5C8\uC73C\uBA70, \uBCA8\uB958\uB294 \uC5D0\uB514\uD130\uB9AC\uC5BC \uADF8\uB8F9\uC785\uB2C8\uB2E4. \uD55C\uAD6D\uC5B4 \uC5F4\uC740 \uC2DC\uCD1D\uC744 \uC870(\u5146)\uC6D0 \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC601\uBB38 \uC5F4\uC740 \uB124\uC774\uBC84 \uAE08\uC735 USD/KRW \uACE0\uC2DC \uD658\uC728(/api/fx)\uC744 \uC801\uC6A9\uD574 B(\uC2ED\uC5B5 \uB2EC\uB7EC) \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD658\uC0B0\uD55C \uCC38\uACE0\uCE58\uC785\uB2C8\uB2E4.',
      sbKorean: '\uAD6D\uB0B4 \uC0C1\uC7A5 (\uBCA8\uB958\uCCB4\uC778)',
      sbGlobal: '\uAE00\uB85C\uBC8C \uC7A5\uBE44\u00B7SW\u00B7\uC624\uD504\uC18C\uC2A4',
      sbSize: '\uB178\uB4DC \uD06C\uAE30',
      sbHow: '\uC870\uC791 \uBC29\uBC95',
      chainLabel: clk,
      chainFilter: cfk,
      allFilter: '\uC804\uCCB4',
      kosp: 'KOSPI',
      kosdaq: 'KOSDAQ',
      regionLabel: {
        us: '\uBBF8\uAD6D',
        tw: '\uB300\uB9CC',
        cn: '\uC911\uAD6D',
        eu: '\uC720\uB7FD',
        kr: '\uD55C\uAD6D',
        jp: '\uC77C\uBCF8',
        gb: '\uC601\uAD6D',
      },
      sizeDesc:
        '\uB300\uD615: \uC2DC\uCD1D \uC57D 15\uC870\uC6D0\u2191\n\uC911\uD615: \uC57D 1~15\uC870\uC6D0\n\uC18C\uD615: 1\uC870\uC6D0 \uBBF8\uB9CC\n\u25C7 \uAE00\uB85C\uBC8C \uC218\uC8FC\u00B7\uC5D0\uB108\uC9C0',
      howDesc:
        '\u2022 \uB178\uB4DC \uD074\uB9AD: \uAD00\uACC4 \uAC15\uC870\n\u2022 \uB4DC\uB798\uADF8: \uC774\uB3D9\n\u2022 \uC2A4\uD06C\uB864: \uD655\uB300/\uCD95\uC18C\n\u2022 \uBE48 \uAC74: \uC120\uD0DD \uD574\uC81C\n\u2022 \uBC94\uB840: \uADF8\uB8F9 \uD558\uC774\uB77C\uC774\uD2B8\n\u2022 \uCD95: \uBD80\uD488\u2192\uC644\uC131\uB85C\uBD07 \uB0A9\uC5C5; \uC810\uC120=\uADF8\uB8F9 \uBC31\uC2DD(\uC9C0\uBD84)',
      graphHint: '\uBD80\uD488 \uB0A9\uC5C5\u00B7\uADF8\uB8F9 \uBC31\uC2DD \uC5D4\uC9C0(\uAC00\uC911\uCE58 \uCC38\uACE0)\uB97C \uD568\uAED8 \uBCF4\uC138\uC694',
      ttChain: '\uBCA8\uB958',
      ttSemType: '\uC138\uBD80',
      ttProducts: '\uC81C\uD488',
      ttRevenue: '\uC2DC\uAC00\uCD1D\uC561',
      ttPartners: '\uAE00\uB85C\uBC8C \uC5F0\uACB0',
      ttSuppliers: '\uAD6D\uB0B4 \uAE30\uC5C5',
      ttCountry: '\uAD6D\uAC00',
      ttSector: '\uBD84\uC57C',
      ttTags: '\uBCF5\uC218 \uCD95',
      fieldSemType: 'semType',
      fieldProducts: 'products',
    },
    en: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 Korea Robotics & Physical AI Map',
      subtitle: 'Listed Korean robotics, factory automation, logistics tech & physical-AI software links',
      badgeTotal: `<span>${n}</span> listed companies`,
      badgeMarket: `KOSPI <span>${kospi}</span> \u00B7 KOSDAQ <span>${kosdaq}</span>`,
      dataAsof: 'Data as of: June 12, 2026',
      tabTable: '\uD83D\uDCCB Company list &amp; filters',
      tabGraph: '\uD83C\uDF10 Relationship network',
      langFlag: '\uD83C\uDDF0\uD83C\uDDF7',
      langText: '\uD55C\uAD6D\uC5B4',
      flChain: 'Value chain',
      flMarket: 'Market',
      searchPlaceholder: '\uD83D\uDD0D Search company...',
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
      thPartners: 'Global ecosystem',
      note: '\u26A0 Public information only. Market cap and segment follow KRX disclosures as of the date shown above. Value chain labels are editorial groupings. English table shows market cap in USD billions (two decimals) using the USD/KRW spot from Naver Finance (/api/fx, illustrative).',
      sbKorean: 'Korean listed (value chain)',
      sbGlobal: 'Global equipment & software',
      sbSize: 'Node size',
      sbHow: 'Controls',
      chainLabel: cle,
      chainFilter: cfe,
      allFilter: 'All',
      kosp: 'KOSPI',
      kosdaq: 'KOSDAQ',
      regionLabel: { us: 'USA', tw: 'Taiwan', cn: 'China', eu: 'Europe', kr: 'Korea', jp: 'Japan', gb: 'UK' },
      sizeDesc: 'Large: mcap ~\u20A915T+\nMid: ~\u20A91\u201315T\nSmall: <\u20A91T\n\u25C7 Global peers',
      howDesc:
        '\u2022 Click: highlight\n\u2022 Drag\n\u2022 Scroll: zoom\n\u2022 Background: clear\n\u2022 Legend: group\n\u2022 Backbone: components \u2192 robot OEMs; dashed = group backing',
      graphHint: 'Explore component supply and captive backing (weights illustrative)',
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

function formatCompany(c) {
  const lines = [];
  lines.push(`      {`);
  lines.push(
    `        id: '${c.id}', name: '${esc(c.name)}', nameEn: '${esc(c.nameEn)}', ticker: '${c.ticker}', market: '${c.market}', chain: '${esc(c.chain)}',`,
  );
  lines.push(`        semType: '${esc(c.semType)}', semTypeEn: '${esc(c.semTypeEn)}',`);
  lines.push(`        products: '${esc(c.products)}', productsEn: '${esc(c.productsEn)}',`);
  if (c.tags && c.tags.length) {
    lines.push(`        tags: ${JSON.stringify(c.tags)},`);
  }
  lines.push(
    `        revenue: '${esc(c.revenue)}', mcapWon: ${c.mcapWon}, per: ${c.per == null || !Number.isFinite(c.per) ? 'null' : c.per}, pbr: ${c.pbr == null || !Number.isFinite(c.pbr) ? 'null' : c.pbr}, revTier: ${c.revTier}, partners: [${c.partners.map(formatPartner).join(', ')}]`,
  );
  lines.push(`      }`);
  return lines.join('\n');
}

function serializeCompanies(list) {
  return (
    '[\n' +
    list.map((c, idx) => formatCompany(c) + (idx < list.length - 1 ? ',\n\n' : '\n')).join('') +
    '\n    ]'
  );
}

function formatGlobal(g) {
  const nameEn = g.nameEn != null && g.nameEn !== '' ? g.nameEn : g.name;
  return `      { id: '${g.id}', name: '${esc(g.name)}', nameEn: '${esc(nameEn)}', country: '${esc(g.country)}', region: '${g.region}', sector: '${esc(g.sector)}' }`;
}

function serializeGlobals(list) {
  return '[\n' + list.map((g, i) => formatGlobal(g) + (i < list.length - 1 ? ',\n' : '\n')).join('') + '    ]';
}

function robotAngleLiteral() {
  const parts = SECTOR_ORDER.map((k) => `'${esc(k)}': ${CHAIN_ANGLE[k]}`);
  return `{ ${parts.join(', ')} }`;
}

/** Escape string for use inside RegExp source */
function reEsc(s) {
  return s.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}

function main() {
  const krx = loadKrx();
  const companies = SEED.map((s, i) => {
    const row = krx.get(s.ticker);
    const mcapWon = row ? row.mcap : 0;
    const market = row ? row.market : 'KOSPI';
    const revenue = row ? fmtMcap(row.mcap) : '\u2014';
    const revTier = mcapTier(mcapWon);
    return {
      id: s.id || `robot_${i}`,
      name: s.name,
      nameEn: s.nameEn,
      ticker: s.ticker,
      market,
      chain: s.chain,
      semType: s.semType,
      semTypeEn: s.semTypeEn,
      products: s.products,
      productsEn: s.productsEn,
      revenue,
      mcapWon,
      revTier,
      partners: s.partners,
      tags: s.tags || [],
    };
  }).filter((c) => passesMcapFloor({ mcapWon: c.mcapWon || 0 }));

  mergePerPbrIntoCompanies(companies, loadPerPbrMap(join(__dirname, 'data')));
  mergeListedEnglishIntoCompanies(companies, loadListedEnglish3557Map(join(__dirname, 'data')));

  let kospi = 0;
  let kosdaq = 0;
  for (const c of companies) {
    if (c.market === 'KOSPI') kospi++;
    else if (c.market === 'KOSDAQ') kosdaq++;
  }
  const n = companies.length;
  const T = buildT(n, kospi, kosdaq);

  let html = fs.readFileSync(join(__dirname, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');

  const titlePage =
    '\uD55C\uAD6D \uB85C\uBD07\u00B7\uD53C\uC9C0\uCEECAI \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4 / Korea Robotics Map';
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${titlePage}</title>`);

  html = html.replace(
    /const CHAIN_COLORS = \{[^}]+\};/,
    `const CHAIN_COLORS = ${JSON.stringify(CHAIN_COLORS)};`,
  );

  html = html.replace(
    /const REGION_COLORS = \{[^}]+\};/,
    "const REGION_COLORS = { us: '#90A4AE', tw: '#80CBC4', eu: '#B0BEC5', cn: '#F48FB1', kr: '#A5D6A7', jp: '#F472B6', gb: '#A5B4FC' };",
  );

  const semiAngleNeedle =
    '{ IDM: 0, \uD339\uB9AC\uC2A4: 60, \uD30C\uC6B4\uB4DC\uB9AC: 120, \uC18C\uC7AC: 180, \uC7A5\uBE44: 240, ' +
    "'\uBD80\uD488/\uAE30\uD310': 300, '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8': 330 }";
  const semiAngleRe = new RegExp(reEsc(semiAngleNeedle), 'g');
  const robotAngle = robotAngleLiteral();
  const angleMatches = html.match(semiAngleRe);
  if (angleMatches && angleMatches.length >= 2) {
    html = html.replace(semiAngleRe, robotAngle);
  } else {
    const robotAngleRe = new RegExp(reEsc(robotAngle), 'g');
    const robotAngleMatches = html.match(robotAngleRe);
    if (!robotAngleMatches || robotAngleMatches.length < 2) {
      throw new Error('forceX/Y: expected semiconductor or robot angle snippet');
    }
  }

  const semiChainsAll =
    "const chains = ['all', 'IDM', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8'];";
  const semiChainsNoAll =
    "const chains = ['IDM', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8'];";
  const shipChainsAll = `const chains = ['all', ${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;
  const shipChainsNoAll = `const chains = [${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;

  if (html.includes(semiChainsAll)) {
    html = html.replace(semiChainsAll, shipChainsAll);
    html = html.replace(semiChainsNoAll, shipChainsNoAll);
  } else if (!html.includes(shipChainsAll)) {
    let allReplaced = false;
    html = html.replace(/const chains = \['all', [^\]]+\];/, () => {
      allReplaced = true;
      return shipChainsAll;
    });
    html = html.replace(/const chains = \[(?!'all')[^\]]+\];/, shipChainsNoAll);
    if (!allReplaced) throw new Error('robot map: chains lines not found');
  }

  html = html.replace(
    /const regions = \['us', 'tw', 'cn', 'eu', 'kr'\];/,
    "const regions = ['us', 'tw', 'cn', 'eu', 'kr', 'jp', 'gb'];",
  );

  html = html.replace(/const T = \{[\s\S]*?\n    \};/, `const T = ${JSON.stringify(T, null, 4)};`);

  html = patchKoreanCompaniesHtml(html, companies);

  html = html.replace(
    /const globalCompanies = \[[\s\S]*?\n    \];/,
    `const globalCompanies = ${serializeGlobals(GLOBALS)};`,
  );

  const badgeTotal =
    '<div class="badge" id="badge-total">\uCD1D <span>' + n + '</span>\uAC1C \uC0C1\uC7A5\uC0AC</div>';
  const badgeMarket =
    '<div class="badge" id="badge-market">KOSPI <span>' +
    kospi +
    '</span>\uC0AC \u00B7 KOSDAQ <span>' +
    kosdaq +
    '</span>\uC0AC</div>';
  html = html.replace(/<div class="badge" id="badge-total">[\s\S]*?<\/div>/, badgeTotal);
  html = html.replace(/<div class="badge" id="badge-market">[\s\S]*?<\/div>/, badgeMarket);
  html = html.replace(
    /<div class="result-count" id="result-label">[^<]+<span id="show-count">\d+<\/span>[^<]+<\/div>/,
    `<div class="result-count" id="result-label">\uD45C\uC2DC: <span id="show-count">${n}</span>\uAC1C</div>`,
  );

  html = html.replace(
    /<h1 id="hdr-title">[^<]+<\/h1>/,
    '<h1 id="hdr-title">\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D \uB85C\uBD07\u00B7\uD53C\uC9C0\uCEECAI \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">\uAD6D\uB0B4 \uC0C1\uC7A5 \uC0B0\uC5C5\uB85C\uBD07\u00B7\uC790\uB3D9\uD654\u00B7\uBB3C\uB958\u00B7\uC9C0\uC5EDAI \uBCA8\uB958\uC640 \uAE00\uB85C\uBC8C \uC7A5\uBE44\u00B7SW \uAD00\uACC4</p>',
  );

  fs.writeFileSync(join(__dirname, 'robot', 'korea_robot_map.html'), html, 'utf8');
  console.log('Wrote robot/korea_robot_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
