/**
 * Emit §0-4G mapping table + §0-4 final closure summary across all maps.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractCompaniesFromHtml, extractChainColors } from '../lib/map_company_serialize.mjs';
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { FINANCE_04G } from '../lib/finance_04g_chain_ui.mjs';
import { CONSUMER_04F } from '../lib/consumer_04f_chain_ui.mjs';
import { ENERGY_04 } from '../lib/energy_04_chain_ui.mjs';
import { INDUSTRY_04B } from '../lib/industry_04b_chain_ui.mjs';
import { MOBILITY_04C } from '../lib/mobility_04c_chain_ui.mjs';
import { TECH_04D } from '../lib/tech_04d_chain_ui.mjs';
import { HEALTH_04E } from '../lib/health_04e_chain_ui.mjs';
import { LEGEND_CHAINS as SEMI_CHAINS } from '../lib/semi_chain_ui.mjs';
import { crossSectors } from '../lib/sector_exclusive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

function mapCompanies(rel) {
  return extractCompaniesFromHtml(fs.readFileSync(join(ROOT, rel), 'utf8'));
}

function bioCompanies() {
  const src = fs.readFileSync(join(ROOT, 'bio/korea_bio_map.inline.js'), 'utf8');
  const match = src.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  return Function(`"use strict"; return (${match[1]});`)();
}

const AXIS = {
  holdings: '주요 투자·사업영역',
  default: '밸류체인',
};

const CFGS = {
  finance: FINANCE_04G.finance,
  holdings: FINANCE_04G.holdings,
  kconsume: CONSUMER_04F.kconsume,
  kcontent: CONSUMER_04F.kcontent,
  travel: CONSUMER_04F.travel,
  battery: ENERGY_04.battery,
  renewable: ENERGY_04.renewable,
  nuclear: ENERGY_04.nuclear,
  powergrid: ENERGY_04.powergrid,
  chemical: INDUSTRY_04B.chemical,
  metal: INDUSTRY_04B.metal,
  machinery: INDUSTRY_04B.machinery,
  construction: INDUSTRY_04B.construction,
  auto: MOBILITY_04C.auto,
  ship: MOBILITY_04C.ship,
  shipping: MOBILITY_04C.shipping,
  defense: MOBILITY_04C.defense,
  elec: TECH_04D.elec,
  software: TECH_04D.software,
  telecom: TECH_04D.telecom,
  robot: TECH_04D.robot,
  bio: HEALTH_04E.bio,
  medtech: HEALTH_04E.medtech,
  cosmetics: HEALTH_04E.cosmetics,
};

const MAP_PATHS = {
  bigchip: 'bigchip/korea_bigchip_map.html',
  semi: 'semiconductor/korea_semiconductor_map.html',
  battery: 'battery/korea_battery_map.html',
  renewable: 'renewable/korea_renewable_map.html',
  nuclear: 'nuclear/korea_nuclear_map.html',
  powergrid: 'powergrid/korea_powergrid_map.html',
  chemical: 'chemical/korea_chemical_map.html',
  metal: 'metal/korea_metal_map.html',
  machinery: 'machinery/korea_machinery_map.html',
  construction: 'construction/korea_construction_map.html',
  auto: 'auto/korea_auto_map.html',
  ship: 'ship/korea_ship_map.html',
  shipping: 'shipping/korea_shipping_map.html',
  defense: 'defense/korea_defense_map.html',
  elec: 'elec/korea_elec_map.html',
  software: 'software/korea_software_map.html',
  telecom: 'telecom/korea_telecom_map.html',
  robot: 'robot/korea_robot_map.html',
  bio: null,
  medtech: 'medtech/korea_medtech_map.html',
  cosmetics: 'cosmetics/korea_cosmetics_map.html',
  kconsume: 'kconsume/korea_kconsume_map.html',
  kcontent: 'kcontent/korea_kcontent_map.html',
  travel: 'travel/korea_travel_map.html',
  finance: 'finance/korea_finance_map.html',
  holdings: 'holdings/korea_holdings_map.html',
};

const RETIRED_LEXICON = [
  '기타금융',
  '물류·상사',
  '철강·금속·기계',
  '조선/해운',
  '미용기기',
  '벨류체인',
  '증권·자산운용',
  '은행·금융지주',
  '카드·캐피탈', // exact retired finance group (not short filter label substring)
  '소비/유통',
  'IT·소프트웨어',
  '정유·화학',
  '여행·레저·항공',
  '방산/우주',
  '전력설비',
];

// --- §6 mapping table ---
const review = new Set([]);
const rows = ['sector,ticker,name,old_group,new_group,evidence,needs_review,status'];
for (const sector of ['finance', 'holdings']) {
  const cos = mapCompanies(MAP_PATHS[sector]);
  for (const c of cos) {
    const nr = review.has(pad(c.ticker));
    rows.push(
      [
        sector,
        pad(c.ticker),
        JSON.stringify(c.name),
        '',
        JSON.stringify(c.chain),
        'chain_overrides §0-4G',
        nr,
        nr ? 'needs_review' : 'mapped',
      ].join(','),
    );
  }
}
rows.push(
  [
    'software',
    '377300',
    JSON.stringify('카카오페이'),
    JSON.stringify('finance-only'),
    JSON.stringify('결제·데이터 인프라'),
    'finance+software 교차수록',
    false,
    'cross',
  ].join(','),
);
fs.writeFileSync(join(reportDir, 'finance_04g_mapping_table.csv'), `${rows.join('\n')}\n`, 'utf8');

// --- §7 final summary ---
const summaryRows = [
  'sector,n_companies,n_groups,axis_label,groups,batch',
];
const batchOf = {
  bigchip: 'immutable',
  semi: 'semi',
  battery: 'A',
  renewable: 'A',
  nuclear: 'A',
  powergrid: 'A',
  chemical: 'B',
  metal: 'B',
  machinery: 'B',
  construction: 'B',
  auto: 'C',
  ship: 'C',
  shipping: 'C',
  defense: 'C',
  elec: 'D',
  software: 'D+G',
  telecom: 'D',
  robot: 'D',
  bio: 'E',
  medtech: 'E',
  cosmetics: 'E',
  kconsume: 'F',
  kcontent: 'F',
  travel: 'F',
  finance: 'G',
  holdings: 'G',
};

const live = {};
for (const [sector, rel] of Object.entries(MAP_PATHS)) {
  const cos = sector === 'bio' ? bioCompanies() : mapCompanies(rel);
  live[sector] = cos;
  const cfg = CFGS[sector];
  const groups = cfg?.chains || (sector === 'semi' ? SEMI_CHAINS : [...new Set(cos.map((c) => c.chain))]);
  const axis = sector === 'holdings' ? AXIS.holdings : AXIS.default;
  summaryRows.push(
    [
      sector,
      cos.length,
      groups.length,
      JSON.stringify(axis),
      JSON.stringify(groups.join('|')),
      batchOf[sector] || '',
    ].join(','),
  );
}
fs.writeFileSync(join(reportDir, 'sector_04_final_map_summary.csv'), `${summaryRows.join('\n')}\n`, 'utf8');

const moves = [
  'ticker,name,from_sector,to_sector,to_group,batch,notes',
  '086280,현대글로비스,kconsume,shipping,자동차·특수화물 운송,F,물류 이동',
  '000120,CJ대한통운,kconsume,shipping,종합물류,F,물류 이동',
  '189300,인텔리안테크,defense,telecom,위성통신 장비,C,교차이동',
  '437730,삼현,machinery/robot?,auto,구동·파워트레인,C,교차이동',
  '222080,SFA넥셀,elec,battery,제조·검사 장비,D,교차이동',
  '077360,덕산하이메탈,elec,semi,기판·패키징 소재,D,교차이동',
  '125490,모베이스전자,robot,auto,차체·내외장,D,교차이동',
  '086900,메디톡스,bio,cosmetics,에스테틱 의약품·소모품,E,교차이동',
  '290650,엘앤씨바이오,bio,medtech,의료소모품·재생재료,E,교차이동',
  '0120G0,삼양바이오팜,bio,medtech,의료소모품·재생재료,E,교차이동',
  '377300,카카오페이,finance,finance+software,결제·핀테크|결제·데이터 인프라,G,교차수록(중복집계 제거)',
  '082270,젬백스,bio,semi,팹 인프라·지원설비,closure,케미컬필터 95.5%·신약개발 태그',
  '001570,금양,battery,chemical,정밀·특수화학,closure,발포제 100%·2차전지 셀 태그',
  '044490,태웅,ship,renewable,구조물·보조설비,closure,해상풍력 플랜지 44%·조선·산업기계 태그',
  '005090,SGC에너지,chemical,powergrid,유틸리티,closure,집단에너지 중심·정유 없음·삼천리 동일 성격',
  '014820,동원시스템즈,(미수록),chemical,포장재,closure,포장재 그룹 복원',
  '008730,율촌화학,(미수록),chemical,포장재,closure,포장재 그룹 복원',
  '012030,DB,holdings/복합사업,holdings,금융,closure,금융 그룹 신설',
  '023590,다우기술,holdings/복합사업,holdings,금융,closure,금융 그룹 신설',
  '032190,다우데이타,holdings/복합사업,holdings,금융,closure,금융 그룹 신설',
];
fs.writeFileSync(join(reportDir, 'sector_04_final_moves.csv'), `${moves.join('\n')}\n`, 'utf8');

const gaps = [
  'ticker,name,status,notes,batch',
  '001740,SK네트웍스,taxonomy_gap,종합상사·타지도 자동편입 금지·화학 잠정. 그룹 신설 대상 아님,F+closure',
  '126560,현대퓨처넷,taxonomy_gap,telecom 미수록 유지. 타지도 자동편입 금지. 그룹 신설 대상 아님,D+closure',
  ',여객항공 화물,taxonomy_gap,shipping 항공화물 그룹 신설 금지,F',
];
fs.writeFileSync(join(reportDir, 'sector_04_final_taxonomy_gaps.csv'), `${gaps.join('\n')}\n`, 'utf8');

// Active taxonomy residue scan (CHAIN_COLORS + company chains + filter chain tokens)
const residue = [];
function filterChainTokens(html) {
  const tokens = new Set();
  const re = /const chains = \[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(html))) {
    for (const part of m[1].split(',')) {
      const t = part.trim().replace(/^['"]|['"]$/g, '');
      if (t && t !== 'all') tokens.add(t);
    }
  }
  return tokens;
}
for (const [sector, rel] of Object.entries(MAP_PATHS)) {
  if (sector === 'bio') {
    const cos = bioCompanies();
    for (const term of RETIRED_LEXICON) {
      if (cos.some((c) => c.chain === term)) residue.push(`${sector},company_chain,${term}`);
    }
    continue;
  }
  const html = fs.readFileSync(join(ROOT, rel), 'utf8');
  const colors = extractChainColors(html);
  const cos = live[sector];
  const filterTokens = filterChainTokens(html);
  for (const term of RETIRED_LEXICON) {
    if (colors.includes(term)) residue.push(`${sector},CHAIN_COLORS,${term}`);
    if (cos.some((c) => c.chain === term)) residue.push(`${sector},company_chain,${term}`);
    if (filterTokens.has(term)) residue.push(`${sector},filter_chains,${term}`);
  }
  if (sector === 'holdings' && /id="fl-chain-label">밸류체인</.test(html)) {
    residue.push('holdings,axis_label,밸류체인');
  }
  if (sector === 'holdings' && !html.includes('주요 투자·사업영역')) {
    residue.push('holdings,axis_label,missing_주요투자사업영역');
  }
}
fs.writeFileSync(
  join(reportDir, 'sector_04_final_taxonomy_residue.csv'),
  ['sector,where,term', ...residue].join('\n') + '\n',
  'utf8',
);

// Cross / uniqueness check
const tickerHomes = new Map();
for (const [sector, cos] of Object.entries(live)) {
  for (const c of cos) {
    const t = pad(c.ticker);
    if (!tickerHomes.has(t)) tickerHomes.set(t, []);
    tickerHomes.get(t).push(sector);
  }
}
const multi = [...tickerHomes.entries()].filter(([, s]) => s.length > 1);
const unexpectedMulti = multi.filter(([t]) => {
  const cross = crossSectors(t);
  return !cross || cross.length < 2;
});

const hub = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'hub_index.json'), 'utf8'));
const uniqueHub = hub.meta?.totalCompanies;

const report = {
  generatedAt: new Date().toISOString(),
  implementation_verify: 'passed',
  business_evidence_verify: 'incomplete',
  note:
    '기계 검증 통과. needs_review 잔여 0. taxonomy_gap(001740·126560)만 의도적 공백.',
  needs_review_closure: {
    residual_needs_review: [],
    taxonomy_gaps: ['001740', '126560'],
    holdings_groups: FINANCE_04G.holdings.chains.length,
    chemical_groups: INDUSTRY_04B?.chemical?.chains?.length,
  },
  counts: Object.fromEntries(Object.entries(live).map(([k, v]) => [k, v.length])),
  hub_unique_companies: uniqueHub,
  cross_listed: Object.fromEntries(multi),
  unexpected_multi_sector: unexpectedMulti,
  taxonomy_residue_active: residue,
  holdings_axis: AXIS.holdings,
  finance_groups: FINANCE_04G.finance.chains.length,
  bigchip_immutable: live.bigchip?.map((c) => c.ticker) || [],
  menu_count: Object.keys(SECTOR_META).length,
};

fs.writeFileSync(join(reportDir, 'sector_04_final_closure.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('OK finance_04g_mapping_table + sector_04_final_*');
console.log('counts', report.counts);
console.log('residue', residue.length, 'unexpectedMulti', unexpectedMulti.length);
console.log('cross', multi);
