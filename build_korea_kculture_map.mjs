/**
 * Builds korea_kculture_map.html from semiconductor/korea_semiconductor_map.html template
 * (K-culture: food/ramen, travel, cosmetics, drama/webtoon/media, K-pop).
 * ASCII-only (\\u escapes) for Korean literals in this file.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPerPbrMap, mergePerPbrIntoCompanies } from './lib/krx_per_pbr.mjs';
import { loadMergedKrxMap, loadListedEnglish3557Map, mergeListedEnglishIntoCompanies } from './lib/krx_data_sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const S = {
  C1: '\uC74C\uC2DD\u00B7\uB77C\uBA74\u00B7\uC2DD\uD488',
  C2: '\uC5EC\uD589\u00B7\uB808\uC800\u00B7\uD56D\uACF5',
  C3: '\uD654\uC7A5\uD488\u00B7\uBDF0\uD2F0\uCF00\uC5B4',
  C4: '\uB4DC\uB77C\uB9C8\u00B7\uBBF8\uB514\uC5B4\u00B7\uC6F9\uD230\u00B7\uCEE8\uD150\uCE20',
  C5: 'K-pop\u00B7\uC5D4\uD130\uD14C\uC778\uBA3C\uD2B8',
};

const SECTOR_ORDER = [S.C1, S.C2, S.C3, S.C4, S.C5];

const CHAIN_COLORS = {
  [S.C1]: '#FF8A65',
  [S.C2]: '#4FC3F7',
  [S.C3]: '#F48FB1',
  [S.C4]: '#BA68C8',
  [S.C5]: '#FFD54F',
};

const CHAIN_ANGLE = {
  [S.C1]: 0,
  [S.C2]: 72,
  [S.C3]: 144,
  [S.C4]: 216,
  [S.C5]: 288,
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
    id: 'nongshim',
    name: '\uB18D\uC2EC',
    nameEn: 'Nongshim',
    ticker: '004370',
    chain: S.C1,
    semType: '\uC2DD\uD488\u00B7\uB77C\uBA74\u00B7\uC2A4\uB0B5',
    semTypeEn: 'Food, instant noodles, snacks',
    products: '\uC2E0\uB77C\uBA74, \uCAB5\uB77C\uBA74, \uC2A4\uB0B5',
    productsEn: 'Shin Ramyun, Chapaguri, snacks',
    partners: [
      'nestle', 'pepsico',
      { id: 'hwave_flow', kind: 'theme', edgeLabel: '\uD55C\uB958 \uC2DD\uD488 \uC218\uC694', edgeLabelEn: 'K-wave food pull', weight: 0.05 },
    ],
  },
  {
    id: 'samyang',
    name: '\uC0BC\uC591\uC2DD\uD488',
    nameEn: 'Samyang Foods',
    ticker: '003230',
    chain: S.C1,
    semType: '\uB77C\uBA74\u00B7\uC2A4\uB0B5\u00B7\uC218\uCD9C',
    semTypeEn: 'Noodles, snacks, export',
    products: '\uBD88\uB2E5\uC18D\uB77C\uBA74, \uD654\uC774\uD2B8\uC2DD\uD488',
    productsEn: 'Buldak line, overseas brands',
    partners: ['nestle', 'pepsico'],
  },
  {
    id: 'ottogi',
    name: '\uC624\uB69C\uAE30',
    nameEn: 'Ottogi',
    ticker: '007310',
    chain: S.C1,
    semType: '\uC2DD\uD488\u00B7\uC870\uBBF8\uC2DD',
    semTypeEn: 'Packaged foods & condiments',
    products: '\uC989\uC11D\uC2DD\uD488, \uCEE4\uB9AC\u00B7\uC2A4\uD504',
    productsEn: 'Ready meals, curry, soup',
    partners: ['nestle'],
  },
  {
    id: 'cj_jeil',
    name: 'CJ\uC81C\uC77C\uC81C\uB2F9',
    nameEn: 'CJ CheilJedang',
    ticker: '097950',
    chain: S.C1,
    semType: '\uC2DD\uD488\u00B7\uB77C\uBA74\u00B7\uC2A4\uB0B5',
    semTypeEn: 'Food & instant noodles',
    products: '\uBE44\uBE44\uACE0, \uD5C8\uB2C8\uACE0, \uC2A4\uB0B5',
    productsEn: 'Bibigo, Hetbahn, snacks',
    partners: ['nestle', 'costco'],
  },
  {
    id: 'hanatour',
    name: '\uD558\uB098\uD22C\uC5B4',
    nameEn: 'Hana Tour',
    ticker: '039130',
    chain: S.C2,
    semType: '\uD328\uD0A4\uC9C0\u00B7\uADF8\uB8F9\uC5EC\uD589',
    semTypeEn: 'Package & group travel',
    products: '\uD574\uC678\uC5EC\uD589, \uC778\uBC84\uD2B8\uC5EC\uD589',
    productsEn: 'Outbound tours, incentives',
    partners: [
      'booking', 'marriott',
      { id: 'hwave_flow', kind: 'theme', edgeLabel: '\uCF58\uD150\uCE20\u2192\uC5EC\uD589\u00B7\uBA74\uC138', edgeLabelEn: 'Content \u2192 travel/tax-free', weight: 0.05 },
    ],
  },
  {
    id: 'modetour',
    name: '\uBAA8\uB450\uD22C\uC5B4',
    nameEn: 'Modetour Network',
    ticker: '080160',
    chain: S.C2,
    semType: '\uC5EC\uD589\uC0AC\u00B7\uC628\uB77C\uC778',
    semTypeEn: 'Travel agency & online',
    products: '\uADF8\uB8F9\uC5EC\uD589, \uC790\uC720\uC5EC\uD589',
    productsEn: 'Group travel, FIT',
    partners: ['booking', 'expedia'],
  },
  {
    id: 'lotte_dev',
    name: '\uB86F\uB370\uAD00\uAD11\uAC1C\uBC1C',
    nameEn: 'Lotte Tour Development',
    ticker: '032350',
    chain: S.C2,
    semType: '\uB808\uC800\u00B7\uD638\uD154\u00B7\uC5EC\uD589\uC9C0',
    semTypeEn: 'Resort, hotel, leisure RE',
    products: '\uB86F\uB370\uC6D4\uB4DC\u00B7\uB808\uC800\uC790\uC0B0',
    productsEn: 'Lotte World, resort assets',
    partners: ['marriott', 'disney'],
  },
  {
    id: 'jejuair',
    name: '\uC81C\uC8FC\uD56D\uACF5',
    nameEn: 'Jeju Air',
    ticker: '089590',
    chain: S.C2,
    semType: 'LCC\u00B7\uB0B4\uC218\uC120',
    semTypeEn: 'LCC & domestic routes',
    products: '\uB0B4\uC218\uC120, \uC77C\uBCF8\u00B7\uB3D9\uB0A8\uC544',
    productsEn: 'Domestic, Japan & SE Asia',
    partners: ['boeing', 'airbus'],
  },
  {
    id: 'jinair',
    name: '\uC9C4\uC5D0\uC5B4',
    nameEn: 'Jin Air',
    ticker: '272450',
    chain: S.C2,
    semType: 'LCC\u00B7\uADF8\uB8F9\uAD00\uB828',
    semTypeEn: 'LCC & group affiliate',
    products: '\uC911\uC7A5\uAC70\uB9AC\u00B7\uCCAD\uC18C\uAE30',
    productsEn: 'Medium haul, young fleet',
    partners: ['boeing', 'airbus'],
  },
  {
    id: 'korean_air',
    name: '\uB300\uD55C\uD56D\uACF5',
    nameEn: 'Korean Air',
    ticker: '003490',
    chain: S.C2,
    semType: 'FSC\u00B7\uAE00\uB85C\uBC8C\uB124\uD2B8\uC6CC\uD06C',
    semTypeEn: 'Full-service global network',
    products: '\uC5EC\uAC1D\u00B7\uD654\uBB3C\u00B7\uBBF8\uC8C4',
    productsEn: 'Passenger, cargo, MICE',
    partners: ['boeing', 'airbus', 'delta'],
  },
  {
    id: 'amore',
    name: '\uC544\uBAA8\uB808\uD37C\uC2DC\uD53D',
    nameEn: 'Amorepacific',
    ticker: '090430',
    chain: S.C3,
    semType: '\uD654\uC7A5\uD488\u00B7\uBF55\uCF00\uC5B4',
    semTypeEn: 'Beauty & skincare',
    products: '\uC124\uB77C\uD6FC, \uD5C8\uBC14, \uC5D0\uD504\uB9AC',
    productsEn: 'Sulwhasoo, Hera, innisfree',
    partners: [
      'lvmh', 'estee',
      { id: 'hwave_flow', kind: 'theme', edgeLabel: '\uCF58\uD150\uCE20 \uC218\uC694\u2192\uBD00\uD2F0', edgeLabelEn: 'Content \u2192 beauty demand', weight: 0.06 },
    ],
  },
  {
    id: 'lg_hh',
    name: 'LG\uC0DD\uD65C\uAC74\uAC15',
    nameEn: 'LG H&H',
    ticker: '051900',
    chain: S.C3,
    semType: '\uD654\uC7A5\uD488\u00B7\uC77C\uC0C1\uD488',
    semTypeEn: 'Beauty & household',
    products: '\uD6C4\u00B7\uC624\uAC00\uB2C8\uC2A4\uD2B8, \uBC24\uD2F1',
    productsEn: 'The History of Whoo, O Hui',
    partners: ['estee', 'lvmh'],
  },
  {
    id: 'kolmar',
    name: '\uD55C\uAD6D\uCF5C\uB9C8',
    nameEn: 'Kolmar Korea',
    ticker: '161890',
    chain: S.C3,
    semType: 'ODM\u00B7\uC81C\uC870\uC704\uD0C1',
    semTypeEn: 'ODM / contract manufacturing',
    products: 'K-\uBF55\uCF00\uC5B4 ODM, \uC548\uC804',
    productsEn: 'K-beauty ODM, safety testing',
    partners: [
      'estee', 'lvmh',
      { id: 'amore', edgeLabel: 'ODM \uC81C\uC870\u2192\uBE0C\uB79C\uB4DC', edgeLabelEn: 'ODM \u2192 Amore brands', weight: 0.32 },
      { id: 'lg_hh', edgeLabel: 'ODM \uC81C\uC870\u2192LG H&H', edgeLabelEn: 'ODM \u2192 LG H&H brands', weight: 0.24 },
    ],
  },
  {
    id: 'clio',
    name: '\uD074\uB9AC\uC624',
    nameEn: 'Clio',
    ticker: '237880',
    chain: S.C3,
    semType: '\uBA54\uC774\uD06C\uC5C5\u00B7\uCE5C\uC218\uC785',
    semTypeEn: 'Makeup & color cosmetics',
    products: '\uD0AC\uC77C\uCE74\uBCA4, \uD37C\uD504\uB808\uD06C',
    productsEn: 'Kill Cover, Peripera',
    partners: ['lvmh', 'estee'],
  },
  {
    id: 'apr',
    name: '\uC5D0\uC774\uD53C\uC54C',
    nameEn: 'APR',
    ticker: '278470',
    chain: S.C3,
    semType: '\uC758\uB8CC\uBBF8\uC6A9\u00B7RF \uBBF8\uC5EC\uB4C0\uB9C1',
    semTypeEn: 'Med-aesthetic devices & RF microneedling',
    products: '\uC5D4\uD130\uD2F0\uBE0C, \uC5D8\uC5B4\uD2F0\uBE0C, \uAE00\uB85C\uBC8C K-\uBDF0\uD2F0',
    productsEn: 'Intensive, Airjet; global K-beauty device exports',
    partners: ['estee', 'lvmh'],
  },
  {
    id: 'dalba_global',
    name: '\uB2EC\uBC14\uAE00\uB85C\uBC8C',
    nameEn: "d'Alba Global",
    ticker: '483650',
    chain: S.C3,
    semType: '\uD504\uB9AC\uBBF8\uC5C4 \uC2A4\uD0A8\uCF00\uC5B4\u00B7\uBE0C\uB79C\uB4DC d\u2019Alba',
    semTypeEn: 'Premium skincare & d\u2019Alba brand',
    products: '\uD654\uC774\uD2B8 \uD2B8\uB7EC\uD50C \uC2A4\uD504\uB808\uC774 \uC138\uB7FC \uBBF8\uC2A4\uD2B8 \uB4F1',
    productsEn: 'White truffle first spray serum, sun care, global omnichannel',
    partners: ['lvmh', 'estee'],
  },
  {
    id: 'cjenm',
    name: 'CJ ENM',
    nameEn: 'CJ ENM',
    ticker: '035760',
    chain: S.C4,
    semType: '\uB4DC\uB77C\uB9C8\u00B7\uC601\uD654\u00B7\uC74C\uC545',
    semTypeEn: 'Drama, film & music',
    products: 'tvN, Mnet, \uC601\uD654\uC0B0\uC5C5',
    productsEn: 'tvN, Mnet, film production',
    partners: [
      'netflix', 'disney', 'spotify',
      { id: 'hwave_flow', kind: 'theme', edgeLabel: '\uD55C\uB958 \uC218\uC694 \uC804\uD30C(\uCC38\uACE0)', edgeLabelEn: 'K-wave demand spillover (illus.)', weight: 0.08 },
    ],
  },
  {
    id: 'studio_dragon',
    name: '\uC2A4\uD29C\uB514\uC624\uB4DC\uB798\uACE4',
    nameEn: 'Studio Dragon',
    ticker: '253450',
    chain: S.C4,
    semType: '\uB4DC\uB77C\uB9C8\u00B7\uC624\uB9AC\uC9C0\uB110',
    semTypeEn: 'Drama production',
    products: 'K-\uB4DC\uB77C\uB9C8 \uC81C\uC791, \uAE00\uB85C\uBC8C \uC218\uCD9C',
    productsEn: 'K-drama production, global sales',
    partners: ['netflix', 'disney', 'warner'],
  },
  {
    id: 'kakao_ent',
    name: '\uCE74\uCE74\uC624\uC5D4\uD130\uD14C\uC778\uBA3C\uD2B8',
    nameEn: 'Kakao Entertainment',
    ticker: '293490',
    chain: S.C4,
    semType: '\uC6F9\uD230\u00B7\uC74C\uC545\u00B7\uBBF8\uB514\uC5B4',
    semTypeEn: 'Webtoon, music & media',
    products: '\uCE74\uCE74\uC6F9\uD230\u00B7\uC194\uB9DB\u00B7\uBA5C\uB860',
    productsEn: 'Kakao Webtoon, Melon, story IP',
    partners: ['netflix', 'tencent', 'spotify'],
  },
  {
    id: 'naver',
    name: '\uB124\uC774\uBC84',
    nameEn: 'NAVER',
    ticker: '035420',
    chain: S.C4,
    semType: '\uC6F9\uD230\u00B7\uB514\uC9C0\uD138\uCEE8\uD150\uCE20',
    semTypeEn: 'Webtoon & digital content',
    products: '\uB124\uC774\uBC84 \uC6F9\uD230, \uC2DC\uB9AC\uC988',
    productsEn: 'NAVER Webtoon, Series',
    partners: ['netflix', 'tencent', 'youtube'],
  },
  {
    id: 'nhn',
    name: 'NHN',
    nameEn: 'NHN',
    ticker: '181710',
    chain: S.C4,
    semType: '\uC6F9\uD230\u00B7\uAC8C\uC784\u00B7\uD074\uB77C\uC6B0\uB4DC',
    semTypeEn: 'Webtoon, games & cloud',
    products: '\uCEF4\uD1A0\uC988, \uC6F9\uD230 \uD50C\uB7AB\uD3FC',
    productsEn: 'Comics, webtoon platform',
    partners: ['tencent', 'youtube'],
  },
  {
    id: 'sm',
    name: 'SM\uC5D4\uD130\uD14C\uC778\uBA3C\uD2B8',
    nameEn: 'SM Entertainment',
    ticker: '041510',
    chain: S.C5,
    semType: 'K-pop\u00B7\uB9C8\uB2E4\uB9D0',
    semTypeEn: 'K-pop labels & artists',
    products: 'aespa, NCT, \uAE00\uB85C\uBC8C \uACF5\uC5F0',
    productsEn: 'aespa, NCT, global tours',
    partners: ['spotify', 'youtube', 'umg'],
  },
  {
    id: 'jyp',
    name: 'JYP Ent.',
    nameEn: 'JYP Entertainment',
    ticker: '035900',
    chain: S.C5,
    semType: 'K-pop\u00B7\uC5D4\uC774\uC804\uC2A4',
    semTypeEn: 'K-pop & artist IP',
    products: 'Stray Kids, TWICE, ITZY',
    productsEn: 'Stray Kids, TWICE, ITZY',
    partners: ['spotify', 'youtube', 'umg'],
  },
  {
    id: 'yg',
    name: 'YG\uC5D4\uD130\uD14C\uC778\uBA3C\uD2B8',
    nameEn: 'YG Entertainment',
    ticker: '122870',
    chain: S.C5,
    semType: 'K-pop\u00B7\uD788\uD551',
    semTypeEn: 'K-pop & hip-hop',
    products: 'BLACKPINK, BABYMONSTER',
    productsEn: 'BLACKPINK, BABYMONSTER',
    partners: ['spotify', 'youtube', 'warner'],
  },
  {
    id: 'hybe',
    name: 'HYBE',
    nameEn: 'HYBE',
    ticker: '352820',
    chain: S.C5,
    semType: 'K-pop\u00B7\uAE00\uB85C\uBC8C\uB79C\uB4DC',
    semTypeEn: 'K-pop & global fandom',
    products: 'BTS, SEVENTEEN, NewJeans',
    productsEn: 'BTS, SEVENTEEN, NewJeans',
    partners: ['spotify', 'youtube', 'umg'],
  },
];

const GLOBALS = [
  { id: 'netflix', name: 'Netflix', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Streaming' },
  { id: 'disney', name: 'Disney', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Film & streaming' },
  { id: 'warner', name: 'Warner Bros. Discovery', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'TV & film' },
  { id: 'spotify', name: 'Spotify', country: '\uC2A4\uC6E8\uB374/Sweden', region: 'eu', sector: 'Music streaming' },
  { id: 'youtube', name: 'YouTube (Google)', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Video & music' },
  { id: 'umg', name: 'Universal Music Group', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Music distribution' },
  { id: 'lvmh', name: 'LVMH', country: '\uD504\uB791\uC2A4/France', region: 'eu', sector: 'Luxury beauty' },
  { id: 'estee', name: 'Est\u00E9e Lauder', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Beauty' },
  { id: 'nestle', name: 'Nestl\u00E9', country: '\uC2A4\uC704\uC2A4/Switzerland', region: 'eu', sector: 'F&B global' },
  { id: 'pepsico', name: 'PepsiCo', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'F&B global' },
  { id: 'costco', name: 'Costco', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Retail' },
  { id: 'booking', name: 'Booking.com', country: '\uB124\uB35C\uB780\uB4DC/NL', region: 'eu', sector: 'OTA' },
  { id: 'expedia', name: 'Expedia', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'OTA' },
  { id: 'marriott', name: 'Marriott', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Hotels' },
  { id: 'boeing', name: 'Boeing', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Aircraft' },
  { id: 'airbus', name: 'Airbus', country: '\uC720\uB7FD/Europe', region: 'eu', sector: 'Aircraft' },
  { id: 'delta', name: 'Delta Air Lines', country: '\uBBF8\uAD6D/USA', region: 'us', sector: 'Airline alliance' },
  { id: 'tencent', name: 'Tencent', country: '\uC911\uAD6D/China', region: 'cn', sector: 'Digital content' },
  { id: 'hwave_flow', name: '\uD55C\uB958 \uC218\uC694 \uD750\uB984(\uCC38\uACE0)', country: '\uD14C\uB9C8/Korea', region: 'kr', sector: 'Cross-sector K-demand (illus.)' },
];

function chainLabelKo() {
  return {
    [S.C1]: '\uB77C\uBA74\u00B7\uC2DD\uD488\u00B7\uC2A4\uB0B5',
    [S.C2]: '\uC5EC\uD589\uC0AC\u00B7\uD56D\uACF5\u00B7\uD638\uD154',
    [S.C3]: '\uD654\uC7A5\uD488\u00B7\uBDF0\uD2F0 ODM',
    [S.C4]: '\uB4DC\uB77C\uB9C8\u00B7\uC6F9\uD230\u00B7\uC2A4\uD2B8\uB9AC\uBC0D',
    [S.C5]: 'K-pop\u00B7\uC74C\uC545\u00B7\uAE00\uB85C\uBC8C \uACF5\uC5F0',
  };
}

function chainLabelEn() {
  return {
    [S.C1]: 'Ramen, packaged food & snacks',
    [S.C2]: 'Travel agencies, airlines & leisure',
    [S.C3]: 'Beauty brands & cosmetics ODM',
    [S.C4]: 'Drama, webtoons & streaming IP',
    [S.C5]: 'K-pop labels & live entertainment',
  };
}

function chainFilterKo() {
  return {
    [S.C1]: '\uC74C\uC2DD\u00B7\uB77C\uBA74',
    [S.C2]: '\uC5EC\uD589\u00B7\uB808\uC800',
    [S.C3]: '\uD654\uC7A5\uD488',
    [S.C4]: '\uBBF8\uB514\uC5B4\u00B7\uC6F9\uD230',
    [S.C5]: 'K-pop',
  };
}

function chainFilterEn() {
  return {
    [S.C1]: 'Food & ramen',
    [S.C2]: 'Travel',
    [S.C3]: 'Beauty',
    [S.C4]: 'Media & webtoon',
    [S.C5]: 'K-pop',
  };
}

function buildT(n, kospi, kosdaq) {
  const clk = chainLabelKo();
  const cle = chainLabelEn();
  const cfk = chainFilterKo();
  const cfe = chainFilterEn();
  return {
    ko: {
      title: '\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D K\uCEEC\uCC98 \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4',
      subtitle:
        '\uB77C\uBA74\u00B7\uC2DD\uD488, \uC5EC\uD589\u00B7\uB808\uC800, \uD654\uC7A5\uD488, \uB4DC\uB77C\uB9C8\u00B7\uC6F9\uD230\u00B7\uBBF8\uB514\uC5B4, K-pop \uAD00\uB828 \uC0C1\uC7A5\uC0AC\u00B7\uAE00\uB85C\uBC8C \uB124\uD2B8\uC6CC\uD06C',
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
      note: '\u26A0 \uC885\uBAA9\uCF54\uB4DC\u00B7\uCC38\uACE0 \uAD00\uACC4\uB294 \uC5D0\uB514\uD130\uB9AC\uC5BC \uADF8\uB8F9\uC774\uBA70 \uACF5\uC2DD \uC815\uBCF4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uC2DC\uAC00\uCD1D\uC561\u00B7\uC2DC\uC7A5\uC740 \uC0C1\uB2E8 \uAE30\uC900\uC77C\uC758 KRX \uACF5\uC2DC\uC5D0 \uB9DE\uCD94\uC5C8\uC73C\uBA70, \uD55C\uAD6D\uC5B4 \uC5F4\uC740 \uC2DC\uCD1D\uC744 \uC870(\u5146)\uC6D0 \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC601\uBB38 \uC5F4\uC740 \uB124\uC774\uBC84 \uAE08\uC735 USD/KRW \uACE0\uC2DC \uD658\uC728(data/fx_usdkrw.json)\uC744 \uC801\uC6A9\uD574 B(\uC2ED\uC5B5 \uB2EC\uB7EC) \uB2E8\uC704\uB85C \uC18C\uC218 \uB458\uC9F8 \uC790\uB9AC\uAE4C\uC9C0 \uD658\uC0B0\uD55C \uCC38\uACE0\uCE58\uC785\uB2C8\uB2E4.',
      sbKorean: '\uAD6D\uB0B4 \uC0C1\uC7A5 (\uBCA8\uB958\uCCB4\uC778)',
      sbGlobal: '\uAE00\uB85C\uBC8C \uBBF8\uB514\uC5B4\u00B7\uC720\uD1B5\u00B7\uC5EC\uD589',
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
        '\u2022 \uB178\uB4DC \uD074\uB9AD: \uAD00\uACC4 \uAC15\uC870\n\u2022 \uB4DC\uB798\uADF8: \uC774\uB3D9\n\u2022 \uC2A4\uD06C\uB864: \uD655\uB300/\uCD95\uC18C\n\u2022 \uBE48 \uAC74: \uC120\uD0DD \uD574\uC81C\n\u2022 \uBC94\uB840: \uADF8\uB8F9 \uD558\uC774\uB77C\uC774\uD2B8\n\u2022 \uCD95: IP\u2192\uC81C\uC791(ODM)\u2192\uC720\uD1B5; \uC810\uC120=\uD55C\uB958 \uC218\uC694 \uC804\uD30C(\uCC38\uACE0)',
      graphHint: 'ODM\u00B7\uBE0C\uB79C\uB4DC, OTT, K-pop \uC5F0\uACB0\uACFC \uD55C\uB958 \uC218\uC694 \uD14C\uB9C8 \uB178\uB4DC\uB97C \uD568\uAED8 \uBCF4\uC138\uC694',
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
      title: '\uD83C\uDDF0\uD83C\uDDF7 Korea K-Culture Industry Map',
      subtitle:
        'Listed Korean names in ramen & food, travel, beauty, drama/webtoon/media, and K-pop, with illustrative global links',
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
      thPartners: 'Global reference links',
      note: '\u26A0 Public information only. Tickers and reference links are editorial groupings, not official filings. Market cap follows KRX as of the date shown. English table shows market cap in billions USD (two decimals) using the USD/KRW spot from Naver Finance (data/fx_usdkrw.json, illustrative).',
      sbKorean: 'Korean listed (value chain)',
      sbGlobal: 'Global media, travel & distribution',
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
        '\u2022 Click: highlight\n\u2022 Drag\n\u2022 Scroll: zoom\n\u2022 Background: clear\n\u2022 Legend: group\n\u2022 Backbone: IP \u2192 production (ODM) \u2192 distribution; dashed = K-wave spillover',
      graphHint: 'See ODM-to-brand links and the K-demand flow node (illustrative)',
      ttChain: 'Chain',
      ttSemType: 'Segment',
      ttProducts: 'Products',
      ttRevenue: 'Market cap',
      ttPartners: 'Reference',
      ttSuppliers: 'Korean cos.',
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

function kcultureAngleLiteral() {
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
      id: s.id || `kculture_${i}`,
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
    '\uD55C\uAD6D K\uCEEC\uCC98 \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4 / Korea K-Culture Map';
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
  const kcAngle = kcultureAngleLiteral();
  const angleMatches = html.match(semiAngleRe);
  if (angleMatches && angleMatches.length >= 2) {
    html = html.replace(semiAngleRe, kcAngle);
  } else {
    const kcRe = new RegExp(reEsc(kcAngle), 'g');
    const kcMatches = html.match(kcRe);
    if (!kcMatches || kcMatches.length < 2) {
      throw new Error('kculture map: angle snippet not found');
    }
  }

  const semiChainsAll =
    "const chains = ['all', 'IDM', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8'];";
  const semiChainsNoAll =
    "const chains = ['IDM', '\uD339\uB9AC\uC2A4', '\uD30C\uC6B4\uB4DC\uB9AC', '\uC18C\uC7AC', '\uC7A5\uBE44', '\uBD80\uD488/\uAE30\uD310', '\uD328\uD0A4\uC9D5/\uD14C\uC2A4\uD2B8'];";
  const kcChainsAll = `const chains = ['all', ${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;
  const kcChainsNoAll = `const chains = [${SECTOR_ORDER.map((c) => `'${c}'`).join(', ')}];`;

  if (html.includes(semiChainsAll)) {
    html = html.replace(semiChainsAll, kcChainsAll);
    html = html.replace(semiChainsNoAll, kcChainsNoAll);
  } else if (!html.includes(kcChainsAll)) {
    throw new Error('kculture map: chains lines not found');
  }

  html = html.replace(
    /const regions = \['us', 'tw', 'cn', 'eu', 'kr'\];/,
    "const regions = ['us', 'tw', 'cn', 'eu', 'kr', 'jp', 'gb'];",
  );

  html = html.replace(/const T = \{[\s\S]*?\n    \};/, `const T = ${JSON.stringify(T, null, 4)};`);

  html = html.replace(
    /const koreanCompanies = \[[\s\S]*?\n    \];\n\n    const globalCompanies/,
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
    '<h1 id="hdr-title">\uD83C\uDDF0\uD83C\uDDF7 \uD55C\uAD6D K\uCEEC\uCC98 \uC0B0\uC5C5 \uD22C\uC790 \uC9C0\uB3C4</h1>',
  );
  html = html.replace(
    /<p id="hdr-subtitle">[^<]+<\/p>/,
    '<p id="hdr-subtitle">\uB77C\uBA74\u00B7\uC2DD\uD488, \uC5EC\uD589\u00B7\uB808\uC800, \uD654\uC7A5\uD488, \uB4DC\uB77C\uB9C8\u00B7\uC6F9\uD230\u00B7\uBBF8\uB514\uC5B4, K-pop \uAD00\uB828 \uC0C1\uC7A5\uC0AC\u00B7\uAE00\uB85C\uBC8C \uCC38\uACE0 \uB124\uD2B8\uC6CC\uD06C</p>',
  );

  fs.writeFileSync(join(__dirname, 'kculture', 'korea_kculture_map.html'), html, 'utf8');
  console.log('Wrote kculture/korea_kculture_map.html', 'n=', n, 'kospi', kospi, 'kosdaq', kosdaq);
}

main();
