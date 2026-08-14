/**
 * Builds korea_ship_map.html from semiconductor/korea_semiconductor_map.html template
 * by swapping chain config, translations, and company data (KRX mcap merge).
 *
 * File is ASCII-only (\u escapes) so encoding cannot corrupt Korean literals.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './lib/krx_per_pbr.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map, mergeListedEnglishIntoCompanies } from './lib/krx_data_sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const S = {
  YARD: '\uC885\uD569\uC870\uC120',
  ENGINE: '\uC5D4\uC9C4',
  OUTFIT: '\uC758\uC7A5/\uBC30\uAD00',
  EQUIP: '\uAE30\uD0C0 \uAE30\uC790\uC7AC',
  OFFSHORE: '\uC11C\uBE44\uC2A4\u00B7\uD574\uC591\uD50C\uB79C\uD2B8',
  SHIPPING: '\uD574\uC6B4\uBB3C\uB958',
};

const SECTOR_ORDER = [S.YARD, S.ENGINE, S.OUTFIT, S.EQUIP, S.OFFSHORE, S.SHIPPING];

const CHAIN_COLORS = {
  [S.YARD]: '#4FC3F7',
  [S.EQUIP]: '#66BB6A',
  [S.ENGINE]: '#26C6DA',
  [S.OUTFIT]: '#FFCA28',
  [S.OFFSHORE]: '#FFA726',
  [S.SHIPPING]: '#EF5350',
};

const CHAIN_ANGLE = {
  [S.YARD]: 0,
  [S.ENGINE]: 60,
  [S.OUTFIT]: 120,
  [S.EQUIP]: 180,
  [S.OFFSHORE]: 240,
  [S.SHIPPING]: 300,
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
    id: 'hd_ksoe',
    name: 'HD\uD55C\uAD6D\uC870\uC120\uD574\uC591',
    nameEn: 'HD Korea Shipbuilding & Offshore Engineering',
    ticker: '009540',
    chain: S.YARD,
    semType: '\uC9C0\uC8FC\u00B73\uC0AC \uC870\uC120 \uD1B5\uD569',
    semTypeEn: 'Holding / integrated shipbuilding group',
    products: 'HD\uD604\uB300\uC911\uACF5\uC5C5\u00B7\uD55C\uD654\uC624\uC158 \uB4F1 \uC0C1\uC7A5 \uC870\uC120 \uC790\uD68C\uC0AC',
    productsEn: 'Listed shipbuilding subsidiaries (operating yards)',
    partners: ['maersk', 'modec', 'technip', 'shell'],
  },
  {
    id: 'hd_hhi',
    name: 'HD\uD604\uB300\uC911\uACF5\uC5C5',
    nameEn: 'HD Hyundai Heavy Industries',
    ticker: '329180',
    chain: S.YARD,
    semType: '\uC0C1\uC120\u00B7\uD574\uC591\u00B7\uD2B9\uC218\uC120',
    semTypeEn: 'Merchant, offshore and naval newbuilds',
    products: '\uCEE8\uC120, LNG\uC120, FPSO, \uD574\uAD70\uD568\uC815',
    productsEn: 'Containerships, LNG carriers, FPSO, naval vessels',
    partners: [
      'modec', 'technip', 'shell', 'wartsila', 'man_es',
      { id: 'theme_lng', kind: 'theme', edgeLabel: 'LNG\uC120\u00B7\uC5D4\uC9C4 \uC218\uC8FC \uBBFC\uAC10', edgeLabelEn: 'LNG carrier order exposure', weight: 0.08 },
      { id: 'theme_contain', kind: 'theme', edgeLabel: '\uCEE8\uC120 \uC218\uC8FC \uBBFC\uAC10', edgeLabelEn: 'Containership cycle mix', weight: 0.06 },
      { id: 'theme_offshore', kind: 'theme', edgeLabel: 'FPSO\u00B7\uD574\uC591\uD50C\uB79C\uD2B8', edgeLabelEn: 'FPSO / offshore plant', weight: 0.05 },
    ],
  },
  {
    id: 'shi',
    name: '\uC0BC\uC131\uC911\uACF5\uC5C5',
    nameEn: 'Samsung Heavy Industries',
    ticker: '010140',
    chain: S.YARD,
    semType: 'LNG\u00B7\uD06C\uB8E8\uC988\u00B7\uBD80\uC720\uC2DD',
    semTypeEn: 'LNG carriers, cruise, floating units',
    products: 'LNGC, FLNG, \uC2DC\uCD94\uC120, \uC0C1\uC120',
    productsEn: 'LNGC, FLNG, drillships, merchant newbuilds',
    partners: [
      'shell', 'total', 'carnival', 'wartsila',
      { id: 'theme_lng', kind: 'theme', edgeLabel: 'LNGC\u00B7FLNG \uC911\uC2EC', edgeLabelEn: 'LNG-heavy backlog', weight: 0.1 },
      { id: 'theme_green', kind: 'theme', edgeLabel: '\uC554\uBAA8\uB2C8\uC544\u00B7\uBA54\uD0C4\uC628 \uC120\uC885', edgeLabelEn: 'Ammonia / methanol newbuilds', weight: 0.04 },
    ],
  },
  {
    id: 'hwo',
    name: '\uD55C\uD654\uC624\uC158',
    nameEn: 'Hanwha Ocean',
    ticker: '042660',
    chain: S.YARD,
    semType: 'LNG\u00B7\uCEE8\u00B7\uD2B9\uC218',
    semTypeEn: 'LNG, container and specialty vessels',
    products: 'LNG\uC120, \uD574\uAD70\uD568, \uD574\uC591\uBAA8\uB4C8',
    productsEn: 'LNG carriers, naval ships, offshore modules',
    partners: [
      'bae_systems', 'technip', 'shell',
      { id: 'theme_lng', kind: 'theme', edgeLabel: 'LNG\uC120 \uBE14\uB809', edgeLabelEn: 'LNG carrier backlog', weight: 0.09 },
      { id: 'theme_offshore', kind: 'theme', edgeLabel: '\uD574\uC591\uBAA8\uB4C8\u00B7\uBC29\uC0B0\uD568', edgeLabelEn: 'Offshore modules & naval', weight: 0.05 },
    ],
  },
  {
    id: 'hj_ship',
    name: 'HJ\uC911\uACF5\uC5C5',
    nameEn: 'HJ Shipbuilding',
    ticker: '097230',
    chain: S.YARD,
    semType: '\uC911\uC18C\uD615 \uC0C1\uC120',
    semTypeEn: 'Mid/small merchant and specialty',
    products: '\uBC8C\uD06C, \uD0F9\uCEE4, PCTC \uB4F1',
    productsEn: 'Bulkers, tankers, PCTC',
    partners: ['maersk', 'msc'],
  },
  {
    id: 'kss',
    name: 'KSS\uD574\uC591',
    nameEn: 'KSS Marine',
    ticker: '044450',
    chain: S.EQUIP,
    semType: '\uC120\uBC15\uC6A9 \uAC15\uC7AC \uAC00\uACF5',
    semTypeEn: 'Marine metal components',
    products: '\uC120\uCCB4 \uAC15\uC7AC, \uD574\uC591 \uAD6C\uC870\uBB3C',
    productsEn: 'Hull steel processing, offshore steel',
    partners: [
      { id: 'hd_hhi', edgeLabel: '\uC120\uCCB4\u00B7\uD574\uC591\uAC15\uC7AC \uAC00\uACF5 \uB0A9\uD488', edgeLabelEn: 'Hull / offshore steel to HHI', weight: 0.2 },
      { id: 'shi', edgeLabel: '\uC120\uCCB4\uAC15\uC7AC \uB0A9\uD488', edgeLabelEn: 'Hull steel to SHI', weight: 0.22 },
      { id: 'hwo', edgeLabel: '\uD568\uC815\u00B7\uC0C1\uC120 \uAC15\uC7AC', edgeLabelEn: 'Naval & commercial steel', weight: 0.18 },
    ],
  },
  {
    id: 'stxe',
    name: 'STX\uC5D4\uC9C4',
    nameEn: 'STX Engine',
    ticker: '077970',
    chain: S.ENGINE,
    semType: '\uC120\uBC15\uC6A9 \uC5D4\uC9C4\u00B7\uBC1C\uC804',
    semTypeEn: 'Marine diesel & gas engines',
    products: '\uBA54\uC778\uC5D4\uC9C4, \uBC1C\uC804\uAE30',
    productsEn: 'Marine main engines, Gensets',
    partners: [
      'man_es', 'wartsila',
      { id: 'hd_hhi', edgeLabel: '\uBA54\uC778\uC5D4\uC9C4\u00B7\uBD80\uC870\uC120 \uB0A9\uD488', edgeLabelEn: 'Main engine & gen to HHI', weight: 0.26 },
      { id: 'shi', edgeLabel: 'LNGC\u00B7\uC0C1\uC120 \uC5D4\uC9C4 \uB0A9\uD488', edgeLabelEn: 'Engines to SHI newbuilds', weight: 0.24 },
      { id: 'hwo', edgeLabel: '\uD574\uAD70\u00B7\uC0C1\uC120 \uCD94\uC9C4', edgeLabelEn: 'Naval / merchant engines', weight: 0.2 },
    ],
  },
  {
    id: 'hanwha_eng',
    name: '\uD55C\uD654\uC5D4\uC9C4',
    nameEn: 'Hanwha Engine',
    ticker: '082740',
    chain: S.ENGINE,
    semType: '\uAC00\uC2A4\uD130\uBE48\u00B7\uCD94\uC9C4',
    semTypeEn: 'Aero & marine propulsion',
    products: '\uAC00\uC2A4\uD130\uBE48, \uD568\uC815 \uCD94\uC9C4',
    productsEn: 'Gas turbines, naval/marine propulsion',
    partners: [
      'rolls_marine', 'bae_systems',
      { id: 'hd_hhi', edgeLabel: '\uAC00\uC2A4\uD130\uBE48\u00B7\uCD94\uC9C4 \uC7A5\uBE44', edgeLabelEn: 'GT / propulsion packages', weight: 0.12 },
      { id: 'hwo', edgeLabel: '\uD568\uC815 \uCD94\uC9C4\u00B7\uC5D4\uC9C4', edgeLabelEn: 'Naval propulsion', weight: 0.1 },
    ],
  },
  {
    id: 'hmm',
    name: 'HMM',
    nameEn: 'HMM',
    ticker: '011200',
    chain: S.SHIPPING,
    semType: '\uCEE8\uD14C\uC774\uB108 \uD574\uC6B4',
    semTypeEn: 'Container liner',
    products: '\uAE00\uB85C\uBC8C \uB178\uC120, \uCE5C\uD658\uACBD \uC120\uB300',
    productsEn: 'Global liner ops, eco fleet renewal',
    partners: ['maersk', 'msc', 'cma_cgm'],
  },
  {
    id: 'pan',
    name: '\uD32C\uC624\uC158',
    nameEn: 'Pan Ocean',
    ticker: '028670',
    chain: S.SHIPPING,
    semType: '\uBC8C\uD06C\u00B7\uB2E4\uBAA9\uC801',
    semTypeEn: 'Bulk & multipurpose shipping',
    products: '\uBC8C\uD06C, \uD0F9\uCEE4, PCTC',
    productsEn: 'Bulkers, tankers, PCTC',
    partners: ['vale', 'bhp'],
  },
  {
    id: 'kline',
    name: '\uB300\uD55C\uD574\uC6B4',
    nameEn: 'Korea Line Corporation',
    ticker: '005880',
    chain: S.SHIPPING,
    semType: '\uBC8C\uD06C\u00B7\uD504\uB85C\uC81D\uD2B8',
    semTypeEn: 'Bulk & project cargo',
    products: '\uAC74\uD654\uBB3C\u00B7\uD504\uB85C\uC81D\uD2B8 \uBB3C\uB958',
    productsEn: 'Dry bulk and project logistics',
    partners: ['vale', 'rio_tinto'],
  },
  {
    id: 'hyundai_steel',
    name: '\uD604\uB300\uC81C\uCCA0',
    nameEn: 'Hyundai Steel',
    ticker: '004020',
    chain: S.EQUIP,
    semType: '\uC120\uBC15\uC6A9 \uD6C4\uD310',
    semTypeEn: 'Steel plate for shipbuilding',
    products: '\uB450\uAEF4\uC6B4 \uC120\uCCB4\uC6A9 \uAC15\uD310',
    productsEn: 'Heavy plate for hulls',
    partners: [
      { id: 'hd_hhi', edgeLabel: '\uC120\uCCB4\uC6A9 \uD6C4\uD310 \uB0A9\uD488', edgeLabelEn: 'Heavy plate to HHI', weight: 0.28 },
      { id: 'shi', edgeLabel: '\uC120\uCCB4\uC6A9 \uD6C4\uD310', edgeLabelEn: 'Hull plate to SHI', weight: 0.26 },
      { id: 'hwo', edgeLabel: '\uD568\uC815\u00B7LNG\uC120 \uAC15\uD310', edgeLabelEn: 'Plate to naval/LNG', weight: 0.22 },
    ],
  },
  {
    id: 'posco_int',
    name: '\uD3EC\uC2A4\uCF54\uC778\uD130\uB0B4\uC154\uB110',
    nameEn: 'POSCO International',
    ticker: '047050',
    chain: S.EQUIP,
    semType: '\uCCA0\uAC15\u00B7\uC5D0\uB108\uC9C0 \uD2B8\uB808\uC774\uB529',
    semTypeEn: 'Steel & energy trading',
    products: '\uC870\uC120\uAC15\uC7AC \uACF5\uAE09, LNG \uD2B8\uB808\uC774\uB529',
    productsEn: 'Shipbuilding steel supply, LNG trading',
    partners: [
      'shell',
      { id: 'hd_hhi', edgeLabel: '\uC870\uC120\uAC15\uC7AC\u00B7LNG \uACF5\uAE09', edgeLabelEn: 'Shipbuilding steel & LNG supply', weight: 0.14 },
    ],
  },
];

const GLOBALS = [
  { id: 'maersk', name: 'Maersk', country: '\uB374\uB9C8\uD06C/Denmark', region: 'eu', sector: 'Container shipping' },
  { id: 'msc', name: 'MSC', country: '\uC2A4\uC704\uC2A4/Switzerland', region: 'eu', sector: 'Container shipping' },
  { id: 'cma_cgm', name: 'CMA CGM', country: '\uD504\uB791\uC2A4/France', region: 'eu', sector: 'Container shipping' },
  { id: 'modec', name: 'MODEC', country: '\uC77C\uBCF8/Japan', region: 'jp', sector: 'FPSO / offshore' },
  { id: 'technip', name: 'Technip Energies', country: '\uD504\uB791\uC2A4/France', region: 'eu', sector: 'Offshore EPCI' },
  { id: 'shell', name: 'Shell', country: '\uC601\uAD6D/UK', region: 'gb', sector: 'LNG / energy' },
  { id: 'total', name: 'TotalEnergies', country: '\uD504\uB791\uC2A4/France', region: 'eu', sector: 'LNG / energy' },
  { id: 'carnival', name: 'Carnival', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Cruise' },
  { id: 'wartsila', name: 'W\u00E4rtsil\u00E4', country: '\uD540\uB780\uB4DC/Finland', region: 'eu', sector: 'Marine engines' },
  { id: 'man_es', name: 'MAN ES', country: '\uB3C5\uC77C/Germany', region: 'eu', sector: 'Marine engines' },
  { id: 'rolls_marine', name: 'Rolls-Royce MTU', country: '\uC601\uAD6D/UK', region: 'gb', sector: 'Marine propulsion' },
  { id: 'bae_systems', name: 'BAE Systems', country: '\uC601\uAD6D/UK', region: 'gb', sector: 'Naval systems' },
  { id: 'lockheed', name: 'Lockheed Martin', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Defense' },
  { id: 'vale', name: 'Vale', country: '\uBE0C\uB77C\uC9C8/Brazil', region: 'us', sector: 'Mining / dry bulk' },
  { id: 'bhp', name: 'BHP', country: '\uD638\uC8FC/Australia', region: 'us', sector: 'Mining' },
  { id: 'rio_tinto', name: 'Rio Tinto', country: '\uC601\uAD6D/UK', region: 'gb', sector: 'Mining' },
  { id: 'airbus_d', name: 'Airbus', country: '\uC720\uB7FD/Europe', region: 'eu', sector: 'Aerospace' },
  { id: 'theme_lng', name: 'Theme: LNG\uC120\u00B7\uC5D4\uC9C4', country: '\uD14C\uB9C8/Korea', region: 'kr', sector: 'Order cycle' },
  { id: 'theme_green', name: 'Theme: \uC554\uBAA8\uB2C8\uC544\u00B7\uBA54\uD0C4\uC628 \uC120', country: '\uD14C\uB9C8/Korea', region: 'kr', sector: 'Order cycle' },
  { id: 'theme_contain', name: 'Theme: \uCEE8\uC120\u00B7\uCEE8\uD14C\uC774\uB108', country: '\uD14C\uB9C8/Korea', region: 'kr', sector: 'Order cycle' },
  { id: 'theme_offshore', name: 'Theme: \uD574\uC591\uD50C\uB79C\uD2B8\u00B7FPSO', country: '\uD14C\uB9C8/Korea', region: 'kr', sector: 'Order cycle' },
];

function chainLabelKo() {
  return {
    [S.YARD]: '\uC885\uD569 \uC870\uC120',
    [S.ENGINE]: '\uC120\uBC15 \uC5D4\uC9C4\u00B7\uCD94\uC9C4',
    [S.OUTFIT]: '\uC758\uC7A5\u00B7\uBC30\uAD00\u00B7\uD53C\uD305',
    [S.EQUIP]: '\uAE30\uD0C0 \uC870\uC120 \uAE30\uC790\uC7AC',
    [S.OFFSHORE]: '\uC11C\uBE44\uC2A4\u00B7\uAC1C\uC870\u00B7\uD574\uC591\uD50C\uB79C\uD2B8',
    [S.SHIPPING]: '\uD574\uC6B4\uBB3C\uB958',
  };
}

function chainLabelEn() {
  return {
    [S.YARD]: 'Integrated shipbuilding',
    [S.ENGINE]: 'Marine engines & propulsion',
    [S.OUTFIT]: 'Outfitting, piping & fittings',
    [S.EQUIP]: 'Other marine equipment',
    [S.OFFSHORE]: 'Services, retrofit & offshore plant',
    [S.SHIPPING]: 'Shipping & logistics',
  };
}

function chainFilterKo() {
  return {
    [S.YARD]: '\uC870\uC120\uC0AC',
    [S.ENGINE]: '\uC5D4\uC9C4',
    [S.OUTFIT]: '\uC758\uC7A5\u00B7\uBC30\uAD00',
    [S.EQUIP]: '\uAE30\uD0C0 \uAE30\uC790\uC7AC',
    [S.OFFSHORE]: '\uC11C\uBE44\uC2A4\u00B7\uD574\uC591',
    [S.SHIPPING]: '\uD574\uC6B4',
  };
}

function chainFilterEn() {
  return {
    [S.YARD]: 'Shipyards',
    [S.ENGINE]: 'Engines',
    [S.OUTFIT]: 'Outfitting',
    [S.EQUIP]: 'Other equipment',
    [S.OFFSHORE]: 'Services & offshore',
    [S.SHIPPING]: 'Shipping',
  };
}

function buildT(n, kospi, kosdaq) {
  const clk = chainLabelKo();
  const cle = chainLabelEn();
  const cfk = chainFilterKo();
  const cfe = chainFilterEn();
  return {
    ko: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D \uC870\uC120\u00B7\uC870\uC120\uAE30\uC790\uC7AC \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4',
      subtitle:
        '\uAD6D\uB0B4 \uC0C1\uC7A5 \uC870\uC120\u00B7\uD574\uC591\u00B7\uAE30\uC790\uC7AC \u00B7 \uBCA8\uB958\uCCB4\uC778 \u00B7 \uAE00\uB85C\uBC8C \uAC70\uB798\u00B7\uC218\uC8FC \uAD00\uACC4',
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
      thPartners: '\uAE00\uB85C\uBC8C \uC218\uC8FC\u00B7\uAC70\uB798\uCC98',
      note: '\u26A0 \uC885\uBAA9\uCF54\uB4DC\u00B7\uAC70\uB798 \uAD00\uACC4\uB294 \uACF5\uAC1C \uC815\uBCF4 \uAE30\uC900\uC785\uB2C8\uB2E4. \uC2DC\uAC00\uCD1D\uC561\u00B7\uC2DC\uC7A5\uC740 \uC0C1\uB2E8 \uAE30\uC900\uC77C\uC758 KRX \uACF5\uC2DC\uC5D0 \uB9DE\uCD94\uC5C8\uC73C\uBA70, \uC138\uBD80 \uBD84\uB958\uB294 \uC5ED\uC0AC\uC801 \uC0B0\uC5C5 \uAD6C\uBD84\uC785\uB2C8\uB2E4. \uD55C\uAD6D\uC5B4 \uC5F4\uC740 \uC2DC\uCD1D\uC744 \uC870(\u5146)\uC6D0 \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC601\uBB38 \uC5F4\uC740 \uB124\uC774\uBC84 \uAE08\uC735 USD/KRW \uACE0\uC2DC \uD658\uC728(/api/fx)\uC744 \uC801\uC6A9\uD574 B(\uC2ED\uC5B5 \uB2EC\uB7EC) \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD658\uC0B0\uD55C \uCC38\uACE0\uCE58\uC785\uB2C8\uB2E4.',
      sbKorean: '\uAD6D\uB0B4 \uC0C1\uC7A5 (\uBCA8\uB958\uCCB4\uC778)',
      sbGlobal: '\uAE00\uB85C\uBC8C \uC218\uC8FC\u00B7\uC5D0\uB108\uC9C0',
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
        '\u2022 \uB178\uB4DC \uD074\uB9AD: \uAD00\uACC4 \uAC15\uC870\n\u2022 \uB4DC\uB798\uADF8: \uC774\uB3D9\n\u2022 \uC2A4\uD06C\uB864: \uD655\uB300/\uCD95\uC18C\n\u2022 \uBE48 \uAC74: \uC120\uD0DD \uD574\uC81C\n\u2022 \uBC94\uB840: \uADF8\uB8F9 \uD558\uC774\uB77C\uC774\uD2B8\n\u2022 \uCD95: \uBE483\uC870\uC120\uC0AC\u2190\uAE30\uC790\uC7AC \uB0A9\uD488 \uC5D4\uC9C0(\uB77C\uBE14\u00B7\uBE44\uC911 \uCC38\uACE0); \uC810\uC120=\uC120\uC885 \uD14C\uB9C8',
      graphHint: '\uB178\uB4DC\uB97C \uD074\uB9AD\uD558\uBA74 \uC870\uC120\uC0AC\u00B7\uAE30\uC790\uC7AC\u00B7\uD14C\uB9C8 \uAD00\uACC4\uAC00 \uAC15\uC870\uB429\uB2C8\uB2E4',
      ttChain: '\uBCA8\uB958',
      ttSemType: '\uC138\uBD80',
      ttProducts: '\uC81C\uD488',
      ttRevenue: '\uC2DC\uAC00\uCD1D\uC561',
      ttPartners: '\uC218\uC8FC\u00B7\uAC70\uB798',
      ttSuppliers: '\uAD6D\uB0B4 \uAE30\uC5C5',
      ttCountry: '\uAD6D\uAC00',
      ttSector: '\uBD84\uC57C',
      ttTags: '\uBCF5\uC218 \uCD95',
      fieldSemType: 'semType',
      fieldProducts: 'products',
    },
    en: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 Korea Shipbuilding & Marine Equipment Map',
      subtitle: 'Listed Korean shipyards, offshore, equipment, shipping & defense marine links',
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
      thPartners: 'Global customers',
      note: '\u26A0 Public information only. Market cap and segment follow KRX disclosures as of the date shown above. Value chain labels are editorial groupings. English table shows market cap in USD billions (two decimals) using the USD/KRW spot from Naver Finance (/api/fx, illustrative).',
      sbKorean: 'Korean listed (value chain)',
      sbGlobal: 'Global shipping & energy',
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
        '\u2022 Click: highlight\n\u2022 Drag\n\u2022 Scroll: zoom\n\u2022 Background: clear\n\u2022 Legend: group\n\u2022 Backbone: Big-3 yards \u2190 equipment supply (labels/weights illustrative); dashed = order-cycle themes',
      graphHint: 'Click a node to highlight supply links to yards and themes',
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

function shipAngleLiteral() {
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
      id: s.id || `ship_${i}`,
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
    '\uD55C\uAD6D \uC870\uC120\u00B7\uC870\uC120\uAE30\uC790\uC7AC \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4 / Korea Shipbuilding Map';
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
    "{ \uD339\uB9AC\uC2A4: 0, \uD30C\uC6B4\uB4DC\uB9AC: 45, \uC18C\uC7AC: 90, '\uC804\uACF5\uC815 \uC7A5\uBE44': 135, '\uD6C4\uACF5\uC815 \uC7A5\uBE44': 180, '\uBD80\uD488/\uAE30\uD310': 225, '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8': 270, '\uBC18\uB3C4\uCCB4 \uC720\uD1B5': 315 }";
  const semiAngleRe = new RegExp(reEsc(semiAngleNeedle), 'g');
  const shipAngle = shipAngleLiteral();
  const angleMatches = html.match(semiAngleRe);
  if (angleMatches && angleMatches.length >= 2) {
    html = html.replace(semiAngleRe, shipAngle);
  } else {
    const shipAngleRe = new RegExp(reEsc(shipAngle), 'g');
    const shipAngleMatches = html.match(shipAngleRe);
    if (!shipAngleMatches || shipAngleMatches.length < 2) {
      throw new Error('forceX/Y: expected semiconductor or ship angle snippet');
    }
  }

  const semiChainsAll =
    "const chains = ['all', '\uC804\uACF5\uC815', '\uD6C4\uACF5\uC815', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC804\uACF5\uC815 \uC7A5\uBE44', '\uD6C4\uACF5\uC815 \uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8', '\uBC18\uB3C4\uCCB4 \uC720\uD1B5'];";
  const semiChainsNoAll =
    "const chains = ['\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC804\uACF5\uC815 \uC7A5\uBE44', '\uD6C4\uACF5\uC815 \uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8', '\uBC18\uB3C4\uCCB4 \uC720\uD1B5'];";
  const shipChainsAll = `const chains = ['all', ${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;
  const shipChainsNoAll = `const chains = [${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;

  if (html.includes(semiChainsAll)) {
    html = html.replace(semiChainsAll, shipChainsAll);
    html = html.replace(semiChainsNoAll, shipChainsNoAll);
  } else if (!html.includes(shipChainsAll)) {
    let allReplaced = false;
    html = html.replace(/const chains = \['all'[, ][^\]]+\];/, () => {
      allReplaced = true;
      return shipChainsAll;
    });
    html = html.replace(/const chains = \[(?!'all')[^\]]+\];/, shipChainsNoAll);
    if (!allReplaced) throw new Error('chains lines not found');
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
    '<h1 id="hdr-title">\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D \uC870\uC120\u00B7\uC870\uC120\uAE30\uC790\uC7AC \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">\uAD6D\uB0B4 \uC0C1\uC7A5 \uC870\uC120\u00B7\uD574\uC591\u00B7\uAE30\uC790\uC7AC \u00B7 \uBCA8\uB958\uCCB4\uC778 \u00B7 \uAE00\uB85C\uBC8C \uC218\uC8FC\u00B7\uC5D0\uB108\uC9C0 \uAD00\uACC4</p>',
  );

  fs.writeFileSync(join(__dirname, 'ship', 'korea_ship_map.html'), html, 'utf8');
  console.log('Wrote ship/korea_ship_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
