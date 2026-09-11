/**
 * P3: admit mcap≥3천억 unmapped tickers into §0-4 leaf groups.
 * Updates exclusive / chain_overrides / field overrides / sector additions + reports.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadMergedKrxMap, loadListedEnglish3557Map } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

/** @type {Array<{ticker:string,sector:string,chain:string,semType:string,semTypeEn:string,products:string,productsEn:string,tags?:string[],note:string}>} */
const ADMISSIONS = [
  // semi
  { ticker: '323280', sector: 'semi', chain: '전공정 장비', semType: '습식세정·식각장비', semTypeEn: 'Wet clean / etch tools', products: 'PCB·반도체 습식세정·식각장비', productsEn: 'PCB/semiconductor wet clean and etch equipment', note: 'PCB·반도체 습식세정·식각장비' },
  { ticker: '127120', sector: 'semi', chain: '공정 부품·유지관리', semType: '장비 부품·기술서비스', semTypeEn: 'Tool parts & tech service', products: '반도체 장비 부품·기술서비스', productsEn: 'Semiconductor equipment parts and technical service', note: '반도체 장비 부품·기술서비스' },
  { ticker: '388210', sector: 'semi', chain: '공정 부품·유지관리', semType: 'SiC 포커스링', semTypeEn: 'SiC focus rings', products: '반도체 SiC 포커스링 소재', productsEn: 'SiC focus-ring materials for semiconductors', note: 'SiC 포커스링' },
  { ticker: '159010', sector: 'semi', chain: '공정 부품·유지관리', semType: '고순도 가스배관', semTypeEn: 'UHP gas tubing', products: '반도체 고순도 가스배관 부품', productsEn: 'Ultra-high-purity gas tubing parts', note: '고순도 가스배관' },
  { ticker: '031330', sector: 'semi', chain: '반도체 유통', semType: '반도체·IT 유통', semTypeEn: 'Semi/IT distribution', products: '삼성전자 반도체·IT 유통', productsEn: 'Samsung Electronics semiconductor and IT distribution', note: '반도체·IT 유통' },
  { ticker: '024850', sector: 'semi', chain: '기판·패키징 소재', semType: '리드프레임', semTypeEn: 'Lead frames', products: '반도체 리드프레임·관련소재', productsEn: 'Semiconductor lead frames and related materials', note: '리드프레임', tags: ['바이오'] },
  { ticker: '383310', sector: 'semi', chain: '팹 인프라·지원설비', semType: '클린룸 필터', semTypeEn: 'Cleanroom filters', products: '반도체 클린룸 필터·친환경 소재', productsEn: 'Semiconductor cleanroom filters and eco materials', note: '클린룸 필터' },
  { ticker: '029460', sector: 'semi', chain: '팹 인프라·지원설비', semType: '가스공급장치', semTypeEn: 'Gas delivery systems', products: '반도체 가스공급장치·화학소재', productsEn: 'Semiconductor gas delivery systems and chemicals', note: '가스공급장치' },
  { ticker: '015360', sector: 'semi', chain: '전공정 장비', semType: '건식식각장비', semTypeEn: 'Dry etch tools', products: '디스플레이·반도체 건식식각장비', productsEn: 'Display/semiconductor dry etch equipment', note: '건식식각장비' },
  { ticker: '170920', sector: 'semi', chain: '공정 소재', semType: '세정·박리액', semTypeEn: 'Cleaners/strippers', products: '반도체 세정/박리액 케미컬', productsEn: 'Semiconductor cleaners and strippers', note: '세정·박리액' },
  // nuclear
  { ticker: '032820', sector: 'nuclear', chain: '계측·제어', semType: '원전 MMIS', semTypeEn: 'Nuclear I&C / MMIS', products: '원전 제어계측시스템(MMIS)', productsEn: 'Nuclear plant MMIS / I&C systems', note: '원전 MMIS — 빈 그룹 계측·제어 충원' },
  { ticker: '126720', sector: 'nuclear', chain: '정비·운영지원', semType: '발전설비 정비', semTypeEn: 'Plant maintenance', products: '원전·발전설비 경상정비', productsEn: 'Nuclear and power-plant maintenance', note: '경상정비' },
  // auto
  { ticker: '089860', sector: 'auto', chain: '유통·모빌리티 서비스', semType: '렌터카·모빌리티', semTypeEn: 'Car rental & mobility', products: '렌터카·기기렌탈 모빌리티 서비스', productsEn: 'Car and equipment rental mobility services', note: '롯데렌탈' },
  { ticker: '046070', sector: 'auto', chain: '차체·내외장', semType: '알루미늄 다이캐스팅', semTypeEn: 'Al die-casting', products: '차량용 알루미늄 다이캐스팅 부품', productsEn: 'Automotive aluminum die-cast parts', note: '다이캐스팅' },
  { ticker: '004700', sector: 'auto', chain: '차체·내외장', semType: '카시트 가죽', semTypeEn: 'Seat leather', products: '자동차 카시트용 천연가죽', productsEn: 'Automotive seat leather', note: '카시트 가죽' },
  { ticker: '448900', sector: 'auto', chain: '섀시·안전', semType: 'MIM 정밀부품', semTypeEn: 'MIM precision parts', products: '차량용 MIM 정밀부품', productsEn: 'Automotive MIM precision parts', note: 'MIM' },
  // battery / elec / machinery
  { ticker: '033790', sector: 'battery', chain: '제조·검사 장비', semType: '전지 자동화 장비', semTypeEn: 'Battery automation tools', products: '2차전지 소재·자동화 장비', productsEn: 'Battery materials and automation equipment', note: '전지 장비' },
  { ticker: '009450', sector: 'elec', chain: '가전·생활기기', semType: '보일러·온수기', semTypeEn: 'Boilers & water heaters', products: '콘덴싱 보일러·온수기', productsEn: 'Condensing boilers and water heaters', note: '보일러' },
  { ticker: '025320', sector: 'elec', chain: '전자부품·기판', semType: 'FPCB·필터', semTypeEn: 'FPCB & filters', products: 'FPCB·반도체 필터·의료필터', productsEn: 'FPCB, semiconductor and medical filters', note: 'FPCB·필터' },
  { ticker: '079900', sector: 'machinery', chain: '건설기계', semType: '콘크리트 펌프카', semTypeEn: 'Concrete pump trucks', products: '콘크리트 펌프카·건설로봇', productsEn: 'Concrete pump trucks and construction robots', note: '펌프카', tags: ['건설로봇'] },
  // chemical
  { ticker: '014830', sector: 'chemical', chain: '정밀·특수화학', semType: '가성칼륨·탄산칼륨', semTypeEn: 'KOH / K2CO3', products: '가성칼륨·탄산칼륨', productsEn: 'Potassium hydroxide and carbonate', note: '칼륨화학' },
  { ticker: '001390', sector: 'chemical', chain: '비료·농화학', semType: '비료·정밀화학', semTypeEn: 'Fertilizer & specialty chem', products: '비료·정밀화학소재', productsEn: 'Fertilizers and specialty chemicals', note: '비료' },
  // bio / medtech
  { ticker: '950260', sector: 'bio', chain: '신약개발', semType: '망막질환 신약', semTypeEn: 'Retinal disease therapeutics', products: '망막질환 신약개발', productsEn: 'Retinal disease drug development', note: '망막 신약' },
  { ticker: '187660', sector: 'bio', chain: '신약개발', semType: '세포·유전자 신약', semTypeEn: 'Cell/gene therapeutics', products: '세포·유전자 신약개발', productsEn: 'Cell and gene therapy development', note: '세포·유전자' },
  { ticker: '386380', sector: 'medtech', chain: '생체측정·모니터링', semType: '웨어러블 생체측정', semTypeEn: 'Wearable biomonitoring', products: '반지형 혈압·심방세동 웨어러블', productsEn: 'Ring-type BP/AFib wearable', note: '웨어러블' },
  // defense
  { ticker: '484870', sector: 'defense', chain: '소재·핵심부품', semType: '방산 유압구동', semTypeEn: 'Defense hydraulics', products: '방산 유압구동장치·기계', productsEn: 'Defense hydraulic actuators and machinery', note: '유압구동' },
  { ticker: '368770', sector: 'defense', chain: '방산전자·센서', semType: '광섬유 자이로', semTypeEn: 'Fiber-optic gyros', products: '광섬유 자이로·항공방산 관성센서', productsEn: 'Fiber-optic gyros and aerospace inertial sensors', note: 'FOG' },
  // kconsume / travel
  { ticker: '452260', sector: 'kconsume', chain: '유통', semType: '백화점·리테일', semTypeEn: 'Department retail', products: '백화점·명품 리테일', productsEn: 'Department store and luxury retail', note: '백화점' },
  { ticker: '194370', sector: 'kconsume', chain: '의류 제조', semType: '핸드백·의류 ODM', semTypeEn: 'Bag/apparel ODM', products: '글로벌 핸드백·의류 ODM', productsEn: 'Global handbag and apparel ODM', note: '의류 ODM' },
  { ticker: '006730', sector: 'travel', chain: '호텔·리조트', semType: '호텔·복합몰', semTypeEn: 'Hotels & mixed-use', products: '호텔(드래곤시티)·복합쇼핑몰', productsEn: 'Hotels (Dragon City) and mixed-use malls', note: '호텔' },
  // software
  { ticker: '064260', sector: 'software', chain: '결제·데이터 인프라', semType: '모바일 PG', semTypeEn: 'Mobile payments PG', products: '모바일 결제·전자금융(PG)', productsEn: 'Mobile payments and e-finance (PG)', note: 'PG — finance 교차 근거 부족으로 software만', tags: ['핀테크'] },
  { ticker: '234340', sector: 'software', chain: '결제·데이터 인프라', semType: '간편현금·가상계좌', semTypeEn: 'Cash/virtual-account fintech', products: '간편현금결제·가상계좌 핀테크', productsEn: 'Cash payment and virtual-account fintech', note: '핀테크 — finance 교차 근거 부족으로 software만', tags: ['핀테크'] },
  // holdings
  { ticker: '499790', sector: 'holdings', chain: '에너지·화학', semType: '에너지·물류 지주', semTypeEn: 'Energy/logistics holding', products: 'GS그룹 에너지·물류 지주', productsEn: 'GS group energy and logistics holding', note: 'GS피앤엘', tags: ['사업형'] },
  { ticker: '034310', sector: 'holdings', chain: '금융', semType: '금융정보 지주', semTypeEn: 'Financial-info holding', products: 'NICE그룹 순수지주', productsEn: 'NICE group pure holding', note: 'NICE', tags: ['투자중심'] },
  { ticker: '008060', sector: 'holdings', chain: 'IT·전자', semType: '전자 지주', semTypeEn: 'Electronics holding', products: '대덕그룹 순수지주', productsEn: 'Daeduck group pure holding', note: '대덕', tags: ['투자중심'] },
  { ticker: '035810', sector: 'holdings', chain: '소비·유통', semType: '사료·축산 지주', semTypeEn: 'Feed/livestock holding', products: '사료·축산·바이오 지주', productsEn: 'Feed, livestock and bio holding', note: '이지홀딩스', tags: ['사업형'] },
];

const GAPS = [
  { ticker: '016590', name: '신대양제지', status: 'taxonomy_gap', notes: '제지 그룹 부재 — 억지편입 금지. 그룹 신설은 별도 승인 후' },
  { ticker: '078130', name: '국일제지', status: 'taxonomy_gap', notes: '제지 그룹 부재 — 억지편입 금지. 그룹 신설은 별도 승인 후' },
  { ticker: '002310', name: '아세아제지', status: 'taxonomy_gap', notes: '제지 그룹 부재 — 억지편입 금지. 그룹 신설은 별도 승인 후' },
  { ticker: '012750', name: '에스원', status: 'taxonomy_gap', notes: '물리보안·시설관리 — 수용 그룹 부재. 미편입 유지' },
  { ticker: '002900', name: 'TYM', status: 'taxonomy_gap', notes: '농기계 — 수용 그룹 부재. 미편입 유지' },
  { ticker: '900290', name: 'GRT', status: 'taxonomy_gap', notes: '중국상장(외국기업) — 국내 지도 편입 보류' },
  { ticker: '204620', name: '글로벌텍스프리', status: 'taxonomy_gap', notes: '택스리펀드 대행 — 수용 그룹 부재. 미편입 유지' },
];

const ALREADY = [
  { ticker: '033780', name: 'KT&G', notes: '이미 kconsume 담배·건강소비재 편입 — P3 재편입 제외' },
  { ticker: '285130', name: 'SK케미칼', notes: '이미 renewable exclusive — P3 재편입 제외(감사 additions에 잔존해도 스킵)' },
];

const ADDITION_FILES = {
  semi: 'semiconductor/cp_list_semi_additions.json',
  nuclear: 'nuclear/cp_list_nuclear_additions.json',
  auto: 'auto/cp_list_auto_additions.json',
  battery: 'battery/cp_list_battery_additions.json',
  elec: 'elec/cp_list_elec_additions.json',
  machinery: 'machinery/cp_list_machinery_additions.json',
  chemical: 'chemical/cp_list_chemical_additions.json',
  bio: 'bio/cp_list_bio_additions.json',
  medtech: 'medtech/cp_list_medtech_additions.json',
  defense: 'defense/cp_list_defense_additions.json',
  kconsume: 'kconsume/cp_list_kconsume_additions.json',
  travel: 'travel/cp_list_travel_additions.json',
  software: 'software/cp_list_software_additions.json',
  holdings: 'holdings/cp_list_holdings_additions.json',
};

const krx = loadMergedKrxMap(join(ROOT, 'data'));
const enMap = loadListedEnglish3557Map(join(ROOT, 'data')) || new Map();

const admitted = [];
const skippedFloor = [];
for (const row of ADMISSIONS) {
  const t = pad(row.ticker);
  const k = krx.get(t);
  if (!k || !passesMcapFloor({ mcapWon: k.mcap })) {
    skippedFloor.push({ ticker: t, name: row.note, mcap: k?.mcap || 0 });
    continue;
  }
  admitted.push({
    ...row,
    ticker: t,
    name: k.name || row.note,
    nameEn: enMap.get(t)?.nameEn || k.nameEn || k.name || t,
    market: k.market || 'KOSPI',
    mcapWon: k.mcap,
  });
}

// --- chain_overrides ---
const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
for (const a of admitted) {
  if (!overrides[a.sector]) overrides[a.sector] = {};
  overrides[a.sector][a.ticker] = a.chain;
}
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides', admitted.length);

// --- field overrides ---
const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
for (const a of admitted) {
  fields[a.ticker] = fields[a.ticker] || {};
  fields[a.ticker].name = a.name;
  fields[a.ticker].nameEn = a.nameEn;
  fields[a.ticker].semType = a.semType;
  fields[a.ticker].semTypeEn = a.semTypeEn;
  fields[a.ticker].products = a.products;
  fields[a.ticker].productsEn = a.productsEn;
  if (a.tags?.length) {
    const tags = Array.isArray(fields[a.ticker].tags) ? fields[a.ticker].tags : [];
    for (const tag of a.tags) if (!tags.includes(tag)) tags.push(tag);
    fields[a.ticker].tags = tags;
  }
  fields[a.ticker].byIndustry = fields[a.ticker].byIndustry || {};
  fields[a.ticker].byIndustry[a.sector] = {
    chain: a.chain,
    needs_review: false,
    evidence: `P3 mcap admission: ${a.note}`,
    semType: a.semType,
    products: a.products,
  };
}
fields._policy = fields._policy || {};
fields._policy.p3_mcap_admissions = `2026-09 P3: admitted ${admitted.length} tickers (≥3천억). Gaps=${GAPS.length}. Excluded already-mapped ${ALREADY.map((x) => x.ticker).join(',')}.`;
fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

// --- exclusive ---
const exclusivePath = join(ROOT, 'lib', 'sector_exclusive.mjs');
let exclusiveSrc = fs.readFileSync(exclusivePath, 'utf8');
const newLines = admitted
  .filter((a) => !exclusiveSrc.includes(`'${a.ticker}':`))
  .map((a) => `  '${a.ticker}': '${a.sector}', // ${a.name} (P3 mcap admission → ${a.chain})`)
  .join('\n');
if (newLines) {
  exclusiveSrc = exclusiveSrc.replace(
    'export const SECTOR_EXCLUSIVE = {\n',
    `export const SECTOR_EXCLUSIVE = {\n${newLines}\n`,
  );
  fs.writeFileSync(exclusivePath, exclusiveSrc, 'utf8');
}
console.log('OK sector_exclusive +', admitted.filter((a) => true).length);

// --- additions ---
function upsertAddition(fileRel, row) {
  const fp = join(ROOT, fileRel);
  const dir = dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const arr = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : [];
  const i = arr.findIndex((r) => pad(r.ticker) === pad(row.ticker));
  if (i >= 0) arr[i] = { ...arr[i], ...row };
  else arr.push(row);
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

for (const a of admitted) {
  const rel = ADDITION_FILES[a.sector];
  if (!rel) throw new Error(`no addition file for ${a.sector}`);
  upsertAddition(rel, {
    ticker: a.ticker,
    name: a.name,
    nameEn: a.nameEn,
    chain: a.chain,
    semType: a.semType,
    semTypeEn: a.semTypeEn,
    products: a.products,
    productsEn: a.productsEn,
    partners: [],
    subSector: a.chain,
    level: 'core',
  });
}
console.log('OK additions');

// --- reports ---
const reportDir = join(ROOT, 'docs', 'reports');
fs.mkdirSync(reportDir, { recursive: true });

const bySector = {};
for (const a of admitted) {
  bySector[a.sector] = (bySector[a.sector] || 0) + 1;
}

const admissionCsv = [
  'ticker,name,sector,chain,mcap_eok,tags,evidence,status',
  ...admitted.map((a) =>
    [
      a.ticker,
      JSON.stringify(a.name),
      a.sector,
      JSON.stringify(a.chain),
      (a.mcapWon / 1e8).toFixed(2),
      JSON.stringify((a.tags || []).join('|')),
      JSON.stringify(a.note),
      'admitted',
    ].join(','),
  ),
].join('\n');
fs.writeFileSync(join(reportDir, 'p3_mcap_admissions.csv'), admissionCsv + '\n', 'utf8');

fs.writeFileSync(
  join(reportDir, 'p3_taxonomy_gaps.csv'),
  ['ticker,name,status,notes', ...GAPS.map((g) => `${g.ticker},${JSON.stringify(g.name)},${g.status},${JSON.stringify(g.notes)}`)].join('\n') +
    '\n',
  'utf8',
);

const auditAdds = fs.existsSync(join(reportDir, 'mcap_audit_additions.csv'))
  ? fs
      .readFileSync(join(reportDir, 'mcap_audit_additions.csv'), 'utf8')
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(',')[0])
  : [];
const admitSet = new Set(admitted.map((a) => a.ticker));
const gapSet = new Set(GAPS.map((g) => g.ticker));
const alreadySet = new Set(ALREADY.map((a) => a.ticker));
const auditFresh = auditAdds.filter((t) => t && !alreadySet.has(t));

fs.writeFileSync(
  join(reportDir, 'p3_mcap_audit_diff.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      auditAdditionsCount: auditAdds.length,
      admitted: admitted.map((a) => a.ticker),
      admittedBySector: bySector,
      skippedFloor,
      alreadyExcluded: ALREADY,
      taxonomyGaps: GAPS,
      auditTickersNotInAdmitOrGap: auditFresh.filter((t) => !admitSet.has(t) && !gapSet.has(t)).slice(0, 40),
      note: 'Prefer shares/REITs/SPACs filtered by triage are intentionally not admitted. Boundary tickers rechecked via loadMergedKrxMap.',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('OK reports admitted', admitted.length, 'bySector', bySector, 'skippedFloor', skippedFloor.length);
if (skippedFloor.length) console.warn('WARN skipped floor', skippedFloor);
