/**
 * Builds korea_defense_map.html from semiconductor/korea_semiconductor_map.html template
 * (defense / space / aviation value chain, KRX mcap merge).
 * ASCII-only (\\u escapes) for Korean literals in this file.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './lib/krx_per_pbr.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map, mergeListedEnglishIntoCompanies } from './lib/krx_data_sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const S = {
  D1: '\uD56D\uACF5\uAE30\u00B7\uC5D4\uC9C4\u00B7MRO',
  D2: '\uBBF8\uC0AC\uC77C\u00B7\uB808\uC774\uB354\u00B7C4ISR',
  D3: '\uC721\uC0C1\uBB34\uAE30\u00B7\uCC28\uB7C9\u00B7\uD0C4\uC57D',
  D4: '\uD574\uAD70\u00B7\uD568\uC815\u00B7\uC870\uC120\uBC29\uC0B0',
  D5: '\uC6B0\uC8FC\u00B7\uC704\uC131\u00B7\uBBFC\uD56D',
};

const SECTOR_ORDER = [S.D1, S.D2, S.D3, S.D4, S.D5];

const CHAIN_COLORS = {
  [S.D1]: '#5C6BC0',
  [S.D2]: '#78909C',
  [S.D3]: '#8D6E63',
  [S.D4]: '#00838F',
  [S.D5]: '#7E57C2',
};

const CHAIN_ANGLE = {
  [S.D1]: 0,
  [S.D2]: 72,
  [S.D3]: 144,
  [S.D4]: 216,
  [S.D5]: 288,
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
    id: 'hanwha_aero',
    name: '\uD55C\uD654\uC5D0\uC5B4\uB85C\uC2A4\uD398\uC774\uC2A4',
    nameEn: 'Hanwha Aerospace',
    ticker: '012450',
    chain: S.D1,
    semType: '\uC5D4\uC9C4\u00B7\uD56D\uACF5\uAE30\uBD80\uD488\u00B7\uBC29\uC0B0',
    semTypeEn: 'Engines, aerostructures & defense',
    products: 'T-50, FA-50, \uC5D4\uC9C4\u00B7\uAE30\uCCB4',
    productsEn: 'T-50/FA-50 family, propulsion & structures',
    partners: ['lockheed', 'boeing', 'airbus',
      { id: 'prog_kf21', edgeLabel: '\uC5D4\uC9C4\u00B7\uAE30\uCCB4 \uCC38\uC5EC', edgeLabelEn: 'Propulsion / structures', weight: 0.33 },
      { id: 'prog_fa50', edgeLabel: 'T-50/FA-50 \uC5D4\uC9C4', edgeLabelEn: 'T-50 family engines', weight: 0.26 },
    ],
  },
  {
    id: 'kai',
    name: '\uD55C\uAD6D\uD56D\uACF5\uC6B0\uC8FC\uC0B0\uC5C5',
    nameEn: 'Korea Aerospace Industries',
    ticker: '047810',
    chain: S.D1,
    semType: '\uAD50\uC721\uAE30\u00B7\uBB34\uC778\uAE30\u00B7\uC18C\uD615\uAE30',
    semTypeEn: 'Trainers, helicopters & light jets',
    products: 'T-50, KUH Surion, KF-21 \uCC38\uC5EC',
    productsEn: 'T-50, Surion, KF-21 program',
    partners: [
      'lockheed', 'airbus', 'boeing',
      { id: 'prog_kf21', edgeLabel: '\uCCB4\uACC4\uC885\uD569(\uCC38\uACE0)', edgeLabelEn: 'KF-21 integrator (illus.)', weight: 0.38 },
      { id: 'prog_fa50', edgeLabel: 'T-50/KUH \uD504\uB85C\uADF8\uB7A8', edgeLabelEn: 'T-50 / helicopter programs', weight: 0.22 },
    ],
  },
  {
    id: 'lig',
    name: 'LIG\uB125\uC2A4\uC6D0',
    nameEn: 'LIG Nex1',
    ticker: '079550',
    chain: S.D2,
    semType: '\uBBF8\uC0AC\uC77C\u00B7\uD575\uC804\uC7A5\uBE44\u00B7\uC601\uC0C1',
    semTypeEn: 'Missiles, guided weapons & EO/IR',
    products: 'Chiron, \uC720\uB3C4\uBB34\uAE30, \uAC10\uC2DC\uC7A5\uBE44',
    productsEn: 'MANPADS, guided munitions, surveillance',
    partners: [
      'lockheed', 'rtx', 'thales',
      { id: 'prog_cheongung', edgeLabel: '\uC9C0\uB300\uACF5 \uBB34\uC7A5\u00B7\uB808\uC774\uB354', edgeLabelEn: 'SAM / radar segment', weight: 0.24 },
      { id: 'prog_kf21', edgeLabel: '\uBB34\uC7A5\uBC29 \uD328\uD0A4\uC9C0', edgeLabelEn: 'KF-21 weapons', weight: 0.18 },
      { id: 'exp_poland', kind: 'export', edgeLabel: 'K9\u00B7\uC8FC\uC704 \uC218\uCD9C(\uCC38\uACE0)', edgeLabelEn: 'Howitzer export (illus.)', weight: 0.12 },
    ],
  },
  {
    id: 'hanwha_sys',
    name: '\uD55C\uD654\uC2DC\uC2A4\uD15C',
    nameEn: 'Hanwha Systems',
    ticker: '272210',
    chain: S.D2,
    semType: '\uD574\uAD70\uC804\uC790\u00B7\uC704\uC131\uB808\uC774\uB354\u00B7C4ISR',
    semTypeEn: 'Naval electronics, space radar & C4ISR',
    products: '\uD574\uAD70\uC804\uC790\uC804\uC7C1, \uC704\uC131\u00B7\uC0AC\uC774\uBC84',
    productsEn: 'Combat systems, satellite payloads & cyber',
    tags: ['\uBC29\uC0B0 C4ISR', '\uC6B0\uC8FC\u00B7\uC704\uC131'],
    partners: [
      'northrop', 'thales', 'lockheed',
      { id: 'prog_cheongung', edgeLabel: '\uD30C\uC774\uC5B4\uC5D8\u00B7\uC720\uB3C4', edgeLabelEn: 'Fire control / guidance', weight: 0.2 },
      { id: 'prog_kf21', edgeLabel: 'AESA\u00B7\uC804\uC790\uC804', edgeLabelEn: 'AESA & avionics', weight: 0.17 },
      { id: 'exp_uae', kind: 'export', edgeLabel: '\uBC29\uC0B0\u00B7ICT \uC218\uCD9C(\uCC38\uACE0)', edgeLabelEn: 'Defense export (illus.)', weight: 0.09 },
    ],
  },
  {
    id: 'rotem',
    name: '\uD604\uB300\uB85C\uD15C',
    nameEn: 'Hyundai Rotem',
    ticker: '064350',
    chain: S.D3,
    semType: '\uC7A5\uAC11\uC804\uCC28\u00B7\uCC28\uB7C9\u00B7\uCCA8\uB3C4',
    semTypeEn: 'Armor, rail & defense mobility',
    products: 'K2 \uC7A5\uAC11\uC804\uCC28, \uC7A5\uC7A5\uC804\uCC28, \uCCA8\uB3C4',
    productsEn: 'K2 MBT, wheeled systems, rolling stock',
    partners: ['bae', 'lockheed'],
  },
  {
    id: 'poongsan',
    name: '\uD48D\uC0B0',
    nameEn: 'Poongsan',
    ticker: '103140',
    chain: S.D3,
    semType: '\uD0C4\uC57D\u00B7\uD568\uC218\u00B7\uBC29\uC0B0\uAE08\uC18D',
    semTypeEn: 'Ammunition, copper & defense metals',
    products: '\uD3EC\uD0C1\u00B7\uD0C4\uC57D, \uBC29\uC0B0\uC6A9 \uD2B9\uC218\uAE08\uC18D',
    productsEn: 'Small/large caliber ammo, specialty alloys',
    partners: ['rtx', 'lockheed'],
  },
  {
    id: 'satrec',
    name: '\uC138\uD2B8\uB809\uC544\uC774',
    nameEn: 'Satrec Initiative',
    ticker: '099320',
    chain: S.D5,
    semType: '\uC704\uC131\u00B7\uC5B4\uC0C9\u00B7\uC9C0\uC5ED\uC815\uBCF4',
    semTypeEn: 'Satellites, Earth observation & payloads',
    products: '\uC704\uC131 \uC124\uACC4\u00B7\uC81C\uC870, SIIS \uC601\uC0C1',
    productsEn: 'Satellite buses, SIIS EO services',
    partners: ['airbus', 'nasa', 'spacex'],
  },
];

const GLOBALS = [
  { id: 'lockheed', name: 'Lockheed Martin', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Aerospace & defense' },
  { id: 'boeing', name: 'Boeing', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Defense aviation' },
  { id: 'rtx', name: 'RTX (Raytheon)', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Missiles & sensors' },
  { id: 'northrop', name: 'Northrop Grumman', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'C4ISR & space' },
  { id: 'airbus', name: 'Airbus', country: '\uC720\uB7FD/Europe', region: 'eu', sector: 'Civil & military aircraft' },
  { id: 'thales', name: 'Thales', country: '\uD504\uB791\uC2A4/France', region: 'eu', sector: 'Radar & avionics' },
  { id: 'bae', name: 'BAE Systems', country: '\uC601\uAD6D/UK', region: 'gb', sector: 'Land & naval systems' },
  { id: 'spacex', name: 'SpaceX', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Launch & LEO' },
  { id: 'nasa', name: 'NASA', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Space programs' },
  { id: 'prog_kf21', name: '\uD504\uB85C\uADF8\uB7A8: KF-21', country: '\uD504\uB85C\uADF8\uB7A8/Korea', region: 'kr', sector: 'Fighter program (illus.)' },
  { id: 'prog_fa50', name: '\uD504\uB85C\uADF8\uB7A8: T-50/FA-50', country: '\uD504\uB85C\uADF8\uB7A8/Korea', region: 'kr', sector: 'Trainer/light fighter (illus.)' },
  { id: 'prog_cheongung', name: '\uD504\uB85C\uADF8\uB7A8: \uCC9C\uAD81 II', country: '\uD504\uB85C\uADF8\uB7A8/Korea', region: 'kr', sector: 'SAM program (illus.)' },
  { id: 'exp_poland', name: '\uC218\uCD9C: \uD3F4\uB780\uB4DC', country: 'Poland', region: 'eu', sector: 'Export (illus.)' },
  { id: 'exp_uae', name: '\uC218\uCD9C: \uC911\uB3D9\u00B7\uC544\uD0C0\uC9C0', country: 'Gulf', region: 'us', sector: 'Export (illus.)' },
];

function chainLabelKo() {
  return {
    [S.D1]: '\uD56D\uACF5\uAE30 \u00B7 \uC5D4\uC9C4 \u00B7 MRO',
    [S.D2]: '\uBBF8\uC0AC\uC77C \u00B7 \uB808\uC774\uB354 \u00B7 C4ISR',
    [S.D3]: '\uC721\uC0C1 \uBB34\uAE30 \u00B7 \uCC28\uB7C9 \u00B7 \uD0C4\uC57D',
    [S.D4]: '\uD574\uAD70 \u00B7 \uD568\uC815 \u00B7 \uC870\uC120 \uBC29\uC0B0',
    [S.D5]: '\uC6B0\uC8FC \u00B7 \uC704\uC131 \u00B7 \uBBFC\uC6A9 \uD56D\uACF5',
  };
}

function chainLabelEn() {
  return {
    [S.D1]: 'Military aircraft, engines & MRO',
    [S.D2]: 'Missiles, radars & C4ISR',
    [S.D3]: 'Land systems, vehicles & ammunition',
    [S.D4]: 'Navy ships & naval shipbuilding',
    [S.D5]: 'Space, satellites & civil aviation',
  };
}

function chainFilterKo() {
  return {
    [S.D1]: '\uD56D\uACF5\u00B7\uC5D4\uC9C4',
    [S.D2]: '\uBBF8\uC0AC\uC77C\u00B7C4ISR',
    [S.D3]: '\uC721\uC0C1\u00B7\uD0C4\uC57D',
    [S.D4]: '\uD574\uAD70\u00B7\uD568\uC815',
    [S.D5]: '\uC6B0\uC8FC\u00B7\uBBFC\uD56D',
  };
}

function chainFilterEn() {
  return {
    [S.D1]: 'Aviation',
    [S.D2]: 'Missiles & EW',
    [S.D3]: 'Land & ammo',
    [S.D4]: 'Naval',
    [S.D5]: 'Space & civil',
  };
}

function buildT(n, kospi, kosdaq) {
  const clk = chainLabelKo();
  const cle = chainLabelEn();
  const cfk = chainFilterKo();
  const cfe = chainFilterEn();
  return {
    ko: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D \uBC29\uC0B0\u00B7\uC6B0\uC8FC\u00B7\uD56D\uACF5 \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4',
      subtitle:
        '\uD56D\uACF5\uAE30\u00B7\uC5D4\uC9C4, \uBBF8\uC0AC\uC77C\u00B7\uB808\uC774\uB354, \uC721\uC0C1\uBB34\uAE30, \uD574\uAD70\u00B7\uD568\uC815, \uC6B0\uC8FC\u00B7\uC704\uC131\u00B7\uBBFC\uD56D \uAD00\uB828 \uC0C1\uC7A5\uC0AC\u00B7\uAE00\uB85C\uBC8C \uCC38\uACE0 \uB124\uD2B8\uC6CC\uD06C',
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
      thPartners: '\uAE00\uB85C\uBC8C \uCC38\uACE0 \uAD00\uACC4',
      note: '\u26A0 \uC885\uBAA9\uCF54\uB4DC\u00B7\uCC38\uACE0 \uAD00\uACC4\uB294 \uC5D0\uB514\uD130\uB9AC\uC5BC \uADF8\uB8F9\uC774\uBA70 \uACF5\uC2DD \uC815\uBCF4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uC2DC\uAC00\uCD1D\uC561\u00B7\uC2DC\uC7A5\uC740 \uC0C1\uB2E8 \uAE30\uC900\uC77C\uC758 KRX \uACF5\uC2DC\uC5D0 \uB9DE\uCD94\uC5C8\uC73C\uBA70, \uD55C\uAD6D\uC5B4 \uC5F4\uC740 \uC2DC\uCD1D\uC744 \uC870(\u5146)\uC6D0 \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC601\uBB38 \uC5F4\uC740 \uB124\uC774\uBC84 \uAE08\uC735 USD/KRW \uACE0\uC2DC \uD658\uC728(/api/fx)\uC744 \uC801\uC6A9\uD574 B(\uC2ED\uC5B5 \uB2EC\uB7EC) \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD658\uC0B0\uD55C \uCC38\uACE0\uCE58\uC785\uB2C8\uB2E4.',
      sbKorean: '\uAD6D\uB0B4 \uC0C1\uC7A5 (\uBCA8\uB958\uCCB4\uC778)',
      sbGlobal: '\uAE00\uB85C\uBC8C \uBC29\uC0B0\u00B7\uC6B0\uC8FC\u00B7\uD56D\uACF5',
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
        '\uB300\uD615: \uC2DC\uCD1D \uC57D 15\uC870\uC6D0\u2191\n\uC911\uD615: \uC57D 1~15\uC870\uC6D0\n\uC18C\uD615: 1\uC870\uC6D0 \uBBF8\uB9CC\n\u25C7 \uAE00\uB85C\uBC8C \uCC38\uACE0 \uAD00\uACC4',
      howDesc:
        '\u2022 \uB178\uB4DC \uD074\uB9AD: \uAD00\uACC4 \uAC15\uC870\n\u2022 \uB4DC\uB798\uADF8: \uC774\uB3D9\n\u2022 \uC2A4\uD06C\uB864: \uD655\uB300/\uCD95\uC18C\n\u2022 \uBE48 \uAC74: \uC120\uD0DD \uD574\uC81C\n\u2022 \uBC94\uB840: \uADF8\uB8F9 \uD558\uC774\uB77C\uC774\uD2B8\n\u2022 \uCD95: \uD504\uB85C\uADF8\uB7A8(prime\u2013\uD611\uB825)\u00B7\uC218\uCD9C \uBAA9\uC801\uC9C0; \uC810\uC120=\uC218\uCD9C \uB514\uB9DE',
      graphHint: '\uD504\uB85C\uADF8\uB7A8\u00B7\uC218\uCD9C \uB178\uB4DC\uB97C \uD3EC\uD568\uD55C \uCC38\uACE0 \uB124\uD2B8\uC6CC\uD06C(\uC5D4\uC9C0 \uAC00\uC911\uCE58\uB294 \uCC38\uACE0\uC6A9)',
      ttChain: '\uBCA8\uB958',
      ttSemType: '\uC138\uBD80',
      ttProducts: '\uC81C\uD488',
      ttRevenue: '\uC2DC\uAC00\uCD1D\uC561',
      ttPartners: '\uCC38\uACE0',
      ttSuppliers: '\uAD6D\uB0B4 \uAE30\uC5C5',
      ttCountry: '\uAD6D\uAC00',
      ttSector: '\uBD84\uC57C',
      ttTags: '\uBCF5\uC218 \uCD95',
      fieldSemType: 'semType',
      fieldProducts: 'products',
    },
    en: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 Korea Defense, Space & Aviation Map',
      subtitle:
        'Listed Korean primes in military aviation, missiles & C4ISR, land systems, naval shipbuilding, and space/civil aviation, with illustrative global relationships',
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
      thPartners: 'Global reference relationships',
      note: '\u26A0 Public information only. Tickers and reference relationships are editorial groupings, not official filings. Market cap follows KRX as of the date shown. English table shows market cap in USD billions (two decimals) using the USD/KRW spot from Naver Finance (/api/fx, illustrative).',
      sbKorean: 'Korean listed (value chain)',
      sbGlobal: 'Global defense & aerospace',
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
        '\u2022 Click: highlight\n\u2022 Drag\n\u2022 Scroll: zoom\n\u2022 Background: clear\n\u2022 Legend: group\n\u2022 Backbone: program (prime\u2013sub) & export destinations; dashed = export theme',
      graphHint: 'Click to explore program clusters and export links (weights illustrative)',
      ttChain: 'Chain',
      ttSemType: 'Segment',
      ttProducts: 'Products',
      ttRevenue: 'Market cap',
      ttPartners: 'Reference',
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

function defenseAngleLiteral() {
  const parts = SECTOR_ORDER.map((k) => `'${esc(k)}': ${CHAIN_ANGLE[k]}`);
  return `{ ${parts.join(', ')} }`;
}

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
      id: s.id || `defense_${i}`,
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
  });

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
    '\uD55C\uAD6D \uBC29\uC0B0\u00B7\uC6B0\uC8FC\u00B7\uD56D\uACF5 \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4 / Korea Defense, Space & Aviation Map';
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
  const defAngle = defenseAngleLiteral();
  const angleMatches = html.match(semiAngleRe);
  if (angleMatches && angleMatches.length >= 2) {
    html = html.replace(semiAngleRe, defAngle);
  } else {
    const defRe = new RegExp(reEsc(defAngle), 'g');
    const defMatches = html.match(defRe);
    if (!defMatches || defMatches.length < 2) {
      throw new Error('defense map: angle snippet not found');
    }
  }

  const semiChainsAll =
    "const chains = ['all', 'IDM', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8'];";
  const semiChainsNoAll =
    "const chains = ['IDM', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8'];";
  const defChainsAll = `const chains = ['all', ${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;
  const defChainsNoAll = `const chains = [${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;

  if (html.includes(semiChainsAll)) {
    html = html.replace(semiChainsAll, defChainsAll);
    html = html.replace(semiChainsNoAll, defChainsNoAll);
  } else if (!html.includes(defChainsAll)) {
    throw new Error('defense map: chains lines not found');
  }

  html = html.replace(
    /const regions = \['us', 'tw', 'cn', 'eu', 'kr'\];/,
    "const regions = ['us', 'tw', 'cn', 'eu', 'kr', 'jp', 'gb'];",
  );

  html = html.replace(/const T = \{[\s\S]*?\n    \};/, `const T = ${JSON.stringify(T, null, 4)};`);

  html = html.replace(
    /const koreanCompanies = \[[\s\S]*?\n    \];\r?\n\r?\n    const globalCompanies/,
    `const koreanCompanies = ${serializeCompanies(companies)};\n\n    const globalCompanies`,
  );

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
    '<h1 id="hdr-title">\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D \uBC29\uC0B0\u00B7\uC6B0\uC8FC\u00B7\uD56D\uACF5 \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">\uD56D\uACF5\uAE30\u00B7\uC5D4\uC9C4, \uBBF8\uC0AC\uC77C\u00B7\uB808\uC774\uB354\u00B7C4ISR, \uC721\uC0C1\uBB34\uAE30, \uD574\uAD70\u00B7\uD568\uC815, \uC6B0\uC8FC\u00B7\uC704\uC131\u00B7\uBBFC\uD56D \uAD00\uB828 \uC0C1\uC7A5\uC0AC\u00B7\uAE00\uB85C\uBC8C \uCC38\uACE0 \uB124\uD2B8\uC6CC\uD06C</p>',
  );

  fs.writeFileSync(join(__dirname, 'defense', 'korea_defense_map.html'), html, 'utf8');
  console.log('Wrote defense/korea_defense_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
