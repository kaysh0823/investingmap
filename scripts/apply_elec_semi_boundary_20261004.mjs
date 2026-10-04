/**
 * 2026-10-04 elec/semi boundary: majority chip, packaging, or memory/AI-server
 * demand stays on semi. Everything else keeps its core-business map.
 * Run once; chain overrides and additions are what rebuild reads afterwards.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLIED = '2026-10-04';

const COPY = {
  '078350': {
    sector: 'semi', chain: '메모리 모듈·서버 기판', netChain: 'memory_module_boards',
    semType: '메모리 모듈·SSD 조립',
    semTypeEn: 'Memory module and SSD assembly',
    products: '서버용 DRAM 메모리 모듈·SSD 조립·테스트 (삼성전자향)',
    productsEn: 'Server DRAM memory modules and SSD assembly/test (Samsung Electronics)',
    tags: ['메모리모듈', 'SSD', 'AI·메모리'],
    from: { sector: 'elec', group: '전자부품·기판' },
  },
  '007660': {
    sector: 'semi', chain: '메모리 모듈·서버 기판', netChain: 'memory_module_boards',
    semType: 'AI 서버·네트워크용 고다층 MLB',
    semTypeEn: 'High-layer MLB for AI servers and networks',
    products: 'AI 가속기·서버·네트워크 스위치용 고다층 MLB PCB',
    productsEn: 'High-layer MLB PCBs for AI accelerators, servers and network switches',
    tags: ['AI서버', '네트워크', 'MLB', 'AI·메모리'],
    from: { sector: 'semi', group: '기판·패키징 소재' },
  },
  '356860': {
    sector: 'semi', chain: '메모리 모듈·서버 기판', netChain: 'memory_module_boards',
    semType: '메모리 모듈·SSD PCB',
    semTypeEn: 'Memory-module and SSD PCBs',
    products: 'DDR5 메모리 모듈·SSD·서버용 PCB',
    productsEn: 'PCBs for DDR5 memory modules, SSDs and servers',
    tags: ['메모리모듈', 'SSD', 'AI·메모리'],
    from: { sector: 'semi', group: '기판·패키징 소재' },
  },
  '323280': {
    sector: 'semi', chain: '패키징 장비', netChain: 'pack_equip',
    semType: '기판 습식공정 장비',
    semTypeEn: 'Wet-process equipment for substrates',
    products: 'FC-BGA·고다층 PCB 습식세정·식각 장비, 유리기판 장비',
    productsEn: 'Wet clean and etch tools for FC-BGA and high-layer PCBs, plus glass-substrate equipment',
    tags: ['FC-BGA', '유리기판', 'PCB장비'],
    from: { sector: 'semi', group: '전공정 장비' },
  },
  '272290': {
    sector: 'elec', chain: '디스플레이 소재', netChain: 'display_mat',
    semType: 'OLED·FPCB 소재',
    semTypeEn: 'OLED and FPCB materials',
    products: 'OLED 소재(INNOLED)·FPCB 소재·반도체 패키징 소재',
    productsEn: 'OLED materials (INNOLED), FPCB materials and semiconductor packaging materials',
    tags: ['OLED소재', 'FPCB소재', '반도체패키징소재'],
    from: { sector: 'semi', group: '기판·패키징 소재' },
    review_note: '2026-10-04: reverses semi_needs_review_confirmed “현 그룹 확정”. Semiconductor packaging materials are not a majority of sales.',
  },
  '078600': {
    sector: 'elec', chain: '전자부품·기판', netChain: 'components',
    semType: '전자부품용 페이스트·실리콘 음극재',
    semTypeEn: 'Pastes for electronic components and silicon anodes',
    products: 'MLCC·칩부품·태양전지용 전도성 페이스트, 실리콘 음극재',
    productsEn: 'Conductive pastes for MLCC, chip components and solar cells, plus silicon anode material',
    tags: ['MLCC페이스트', '태양전지페이스트', '실리콘음극재'],
    from: { sector: 'semi', group: '기판·패키징 소재' },
    review_note: '2026-10-04: reverses the “기판·패키징 소재 정정” decision and releases the semi exclusive pin. Core sales are component pastes and silicon anodes.',
  },
  '178920': {
    sector: 'elec', chain: '전자부품·기판', netChain: 'components',
    semType: 'PI 필름',
    semTypeEn: 'PI film',
    products: 'FPCB·방열시트·EV·반도체용 폴리이미드 필름',
    productsEn: 'Polyimide film for FPCB, heat-spreader sheets, EVs and semiconductors',
    tags: ['FPCB', '방열시트', 'EV', '반도체'],
    from: { sector: 'semi', group: '기판·패키징 소재' },
  },
  '098460': {
    sector: 'elec', chain: '전자·SMT 검사장비', netChain: 'smt_inspect',
    semType: '3D SPI·AOI 검사장비',
    semTypeEn: '3D SPI and AOI inspection equipment',
    products: 'SMT 3D SPI·AOI 검사장비, 반도체 패키징 검사, 의료로봇',
    productsEn: 'SMT 3D SPI and AOI inspection, semiconductor packaging inspection, and medical robots',
    tags: ['SMT검사', '반도체패키징검사', '의료로봇'],
    from: { sector: 'semi', group: '검사·계측 장비' },
  },
  '168360': {
    sector: 'elec', chain: '전자·SMT 검사장비', netChain: 'smt_inspect',
    semType: 'SMT·반도체 검사장비',
    semTypeEn: 'SMT and semiconductor inspection equipment',
    products: 'SMT 3D 검사장비, 반도체·HBM 검사장비',
    productsEn: 'SMT 3D inspection and semiconductor/HBM inspection equipment',
    tags: ['SMT검사', '반도체검사', 'HBM'],
    from: { sector: 'semi', group: '검사·계측 장비' },
  },
};

const TAG_ONLY = {
  '353200': ['FC-BGA', '메모리패키지기판', 'MLB'],
  '178320': ['ESS', '통신장비', '반도체장비부품'],
  '009150': ['반도체기판(FC-BGA)', 'AI·메모리'],
  '025320': ['FPCB', '반도체필터'],
};

const COPY_STAY = {
  '004710': {
    semType: '전자부품·EMS',
    semTypeEn: 'Electronic components and EMS',
    products: '가전용 파워보드·스마트폰 EMS·반도체 장비 부품·전장부품',
    productsEn: 'Appliance power boards, smartphone EMS, semiconductor equipment parts and auto-electronics parts',
    tags: ['파워보드', 'EMS', '반도체장비부품', '전장'],
  },
  '089010': {
    semType: '전자 모듈·케미칼',
    semTypeEn: 'Electronic modules and chemicals',
    products: 'Function PBA·카메라모듈·무선충전, 반도체용 케미칼 원료',
    productsEn: 'Function PBA, camera modules, wireless charging, and chemical materials for semiconductors',
    tags: ['PBA모듈', '무선충전', '반도체케미칼', '전장'],
  },
};

const TO_SEMI = ['078350'];
const TO_ELEC = ['272290', '078600', '178920', '098460', '168360'];

function readJson(rel) {
  const fp = path.join(ROOT, rel);
  return { fp, data: JSON.parse(fs.readFileSync(fp, 'utf8')), indent: detectIndent(fp) };
}
function detectIndent(fp) {
  const text = fs.readFileSync(fp, 'utf8');
  const m = text.match(/\n( +)"/);
  return m ? m[1].length : 2;
}
function writeJson(fp, data, indent) {
  fs.writeFileSync(fp, JSON.stringify(data, null, indent) + '\n', 'utf8');
}
function pad(t) {
  return String(t).padStart(6, '0');
}
function mergeTags(row, tags) {
  const existing = Array.isArray(row.tags) ? row.tags : [];
  const merged = [...existing];
  for (const tag of tags) if (!merged.includes(tag)) merged.push(tag);
  row.tags = merged;
}
function setIndustry(row, sector, chain, extra) {
  row.byIndustry = row.byIndustry || {};
  const prev = row.byIndustry[sector] || {};
  row.byIndustry[sector] = { ...prev, chain, ...(extra || {}) };
}

const fields = readJson('data/ticker_field_overrides.json');
const chains = readJson('data/chain_overrides.json');

for (const [ticker, spec] of Object.entries(COPY)) {
  const row = fields.data[ticker] || {};
  fields.data[ticker] = row;
  row.semType = spec.semType;
  row.semTypeEn = spec.semTypeEn;
  row.products = spec.products;
  row.productsEn = spec.productsEn;
  row.tags = [...spec.tags];
  const other = spec.sector === 'semi' ? 'elec' : 'semi';
  if (row.byIndustry?.[other]?.chain) delete row.byIndustry[other].chain;
  setIndustry(row, spec.sector, spec.chain, {
    admittedOn: spec.from.sector === spec.sector ? undefined : APPLIED,
    review_note: spec.review_note,
  });
  if (row.byIndustry[spec.sector].admittedOn === undefined) delete row.byIndustry[spec.sector].admittedOn;
  chains.data[spec.sector] = chains.data[spec.sector] || {};
  chains.data[spec.sector][ticker] = spec.chain;
  const src = spec.from.sector;
  if (src !== spec.sector && chains.data[src]) delete chains.data[src][ticker];
}

for (const [ticker, tags] of Object.entries(TAG_ONLY)) {
  const row = fields.data[ticker] || {};
  fields.data[ticker] = row;
  mergeTags(row, tags);
}
for (const [ticker, spec] of Object.entries(COPY_STAY)) {
  const row = fields.data[ticker] || {};
  fields.data[ticker] = row;
  Object.assign(row, spec);
  row.tags = [...spec.tags];
  setIndustry(row, 'elec', '전자부품·기판');
}

writeJson(fields.fp, fields.data, fields.indent);
writeJson(chains.fp, chains.data, chains.indent);

function loadAdditions(rel) {
  return readJson(rel);
}
const elecAdd = loadAdditions('elec/cp_list_elec_additions.json');
const semiAdd = loadAdditions('semiconductor/cp_list_semi_additions.json');
function additionRow(ticker) {
  const spec = COPY[ticker];
  const prev = [...elecAdd.data, ...semiAdd.data].find((r) => pad(r.ticker) === ticker) || {};
  const row = {
    ticker,
    name: prev.name,
    nameEn: prev.nameEn,
    chain: spec.chain,
    semType: spec.semType,
    semTypeEn: spec.semTypeEn,
    products: spec.products,
    productsEn: spec.productsEn,
    subSector: spec.semType,
    level: prev.level || 'core',
  };
  if (!row.name) {
    const names = {
      '272290': ['이녹스첨단소재', 'INNOX Advanced Materials'],
      '078600': ['대주전자재료', 'Daejoo Electronic Materials'],
      '178920': ['PI첨단소재', 'PI Advanced Materials'],
      '098460': ['고영', 'Koh Young Technology'],
      '168360': ['펨트론', 'Pemtron'],
      '078350': ['한양디지텍', 'Hanyang Digitech'],
    };
    row.name = names[ticker][0];
    row.nameEn = names[ticker][1];
  }
  return row;
}
elecAdd.data = elecAdd.data.filter((r) => pad(r.ticker) !== '078350');
for (const ticker of TO_ELEC) {
  elecAdd.data = elecAdd.data.filter((r) => pad(r.ticker) !== ticker);
  elecAdd.data.push(additionRow(ticker));
}
semiAdd.data = semiAdd.data.filter((r) => !TO_ELEC.includes(pad(r.ticker)));
semiAdd.data = semiAdd.data.filter((r) => pad(r.ticker) !== '078350');
semiAdd.data.push(additionRow('078350'));
writeJson(elecAdd.fp, elecAdd.data, elecAdd.indent);
writeJson(semiAdd.fp, semiAdd.data, semiAdd.indent);

function relocate(fromDoc, toDoc, tickers, chainOf, log, fromLabel, toLabel) {
  const moving = new Set(tickers);
  const movedNodes = [];
  const movedEdges = [];
  const unmoved = [];
  const missing = [];
  for (const ticker of tickers) {
    const idx = fromDoc.nodes.findIndex((n) => n.ticker === ticker || n.id === `krx:${ticker}`);
    if (idx < 0) {
      missing.push({ ticker, from: fromLabel });
      continue;
    }
    const node = fromDoc.nodes.splice(idx, 1)[0];
    node.chain = chainOf(ticker);
    if (node.group && COPY[ticker]) node.group = COPY[ticker].chain;
    if (node.role && COPY[ticker]) node.role = COPY[ticker].semType;
    if (!toDoc.nodes.some((n) => n.id === node.id)) toDoc.nodes.push(node);
    movedNodes.push({ id: node.id, from: fromLabel, to: toLabel, chain: node.chain });
  }
  const kept = [];
  for (const edge of fromDoc.edges || []) {
    const ends = [edge.source, edge.target];
    const touched = ends
      .map((id) => (String(id || '').startsWith('krx:') ? String(id).slice(4) : null))
      .filter((t) => t && moving.has(t));
    if (!touched.length) {
      kept.push(edge);
      continue;
    }
    const other = ends.find((id) => {
      const ticker = String(id || '').startsWith('krx:') ? String(id).slice(4) : null;
      return !ticker || !moving.has(ticker);
    });
    const otherTicker = String(other || '').startsWith('krx:') ? String(other).slice(4) : null;
    const bothMoving = touched.length >= 2;
    const otherGlobal = String(other || '').startsWith('global');
    if (bothMoving || otherGlobal) {
      if (otherGlobal) {
        const g = fromDoc.nodes.find((n) => n.id === other);
        if (g && !toDoc.nodes.some((n) => n.id === g.id)) toDoc.nodes.push(JSON.parse(JSON.stringify(g)));
      }
      if (!toDoc.edges.some((e) => e.id && edge.id && e.id === edge.id)) toDoc.edges.push(edge);
      movedEdges.push({ id: edge.id, source: edge.source, target: edge.target, from: fromLabel, to: toLabel });
    } else {
      unmoved.push({
        id: edge.id || null,
        source: edge.source,
        target: edge.target,
        type: edge.type || null,
        evidence: edge.evidence || null,
        from: fromLabel,
        reason: 'counterpart stays outside the moved set; edge recorded and removed so the source graph has no dangling endpoint',
      });
    }
  }
  fromDoc.edges = kept;
  log.movedNodes.push(...movedNodes);
  log.movedEdges.push(...movedEdges);
  log.unmovedEdges.push(...unmoved);
  log.missingNodes.push(...missing);
}

const changelog = {
  appliedOn: APPLIED,
  movedNodes: [],
  movedEdges: [],
  unmovedEdges: [],
  missingNodes: [],
  notes: [
    'networks/elec.json is regenerated by migrate_elec_network_phase5c.mjs from the elec map. Nodes that arrive on elec reappear there as map constituents.',
    'memory_module_boards hub suppliers/customers/peers are the substrate hub arrays copied with their existing evidence URLs. No new company edge was created.',
  ],
};

const netSemi = readJson('data/netmap/semiconductor.json');
const netElec = readJson('data/netmap/elec.json');
netSemi.data.chains.memory_module_boards = '메모리 모듈·서버 기판';
netElec.data.chains.smt_inspect = '전자·SMT 검사장비';
const chainOf = (ticker) => COPY[ticker].netChain;
relocate(netElec.data, netSemi.data, TO_SEMI, chainOf, changelog, 'netmap/elec', 'netmap/semiconductor');
relocate(netSemi.data, netElec.data, TO_ELEC, chainOf, changelog, 'netmap/semiconductor', 'netmap/elec');
for (const ticker of ['007660', '356860', '323280']) {
  const node = netSemi.data.nodes.find((n) => n.ticker === ticker);
  if (!node) changelog.missingNodes.push({ ticker, from: 'netmap/semiconductor' });
  else node.chain = COPY[ticker].netChain;
}
writeJson(netSemi.fp, netSemi.data, netSemi.indent);
writeJson(netElec.fp, netElec.data, netElec.indent);

const nwSemi = readJson('data/networks/semiconductor.json');
const nwElec = readJson('data/networks/elec.json');
if (!nwSemi.data.nodes.some((n) => n.id === 'group:memory_module_boards')) {
  nwSemi.data.nodes.push({
    id: 'group:memory_module_boards',
    type: 'group',
    nameKo: '메모리 모듈·서버 기판',
    nameEn: 'Memory modules & server boards',
    role: '메모리 모듈·서버 기판',
    group: '메모리 모듈·서버 기판',
  });
}
relocate(nwElec.data, nwSemi.data, TO_SEMI, () => '메모리 모듈·서버 기판', changelog, 'networks/elec', 'networks/semiconductor');
relocate(nwSemi.data, nwElec.data, TO_ELEC, (t) => COPY[t].chain, changelog, 'networks/semiconductor', 'networks/elec');
for (const ticker of ['007660', '356860']) {
  const node = nwSemi.data.nodes.find((n) => n.ticker === ticker);
  if (node) {
    node.group = '메모리 모듈·서버 기판';
    node.role = COPY[ticker].semType;
  }
  for (const edge of nwSemi.data.edges || []) {
    if (edge.source === `krx:${ticker}` && edge.type === 'member_of' && String(edge.target).startsWith('group:')) {
      edge.target = 'group:memory_module_boards';
      edge.labelKo = '메모리 모듈·서버 기판 밸류체인 분류';
      edge.labelEn = 'Memory modules & server boards value-chain grouping';
    }
  }
}
const taesung = nwSemi.data.nodes.find((n) => n.ticker === '323280');
if (taesung) {
  taesung.group = '패키징 장비';
  taesung.role = COPY['323280'].semType;
}
for (const edge of nwSemi.data.edges || []) {
  if (edge.source === 'krx:323280' && edge.type === 'member_of' && String(edge.target).startsWith('group:')) {
    edge.target = 'group:pack_equip';
    edge.labelKo = '패키징 장비 밸류체인 분류';
    edge.labelEn = 'Packaging equipment value-chain grouping';
  }
}
writeJson(nwSemi.fp, nwSemi.data, nwSemi.indent);
writeJson(nwElec.fp, nwElec.data, nwElec.indent);

const relations = readJson('data/semi_relations.json');
if (!relations.data.hubs.some((h) => h.id === 'memory_module_boards')) {
  const substrate = relations.data.hubs.find((h) => h.id === 'substrate_pack_mat');
  const hub = JSON.parse(JSON.stringify(substrate));
  hub.id = 'memory_module_boards';
  hub.chain = '메모리 모듈·서버 기판';
  hub.label = { ko: '메모리 모듈·서버 기판', en: 'Memory modules & server boards' };
  hub.members = [
    { ticker: '007660', name: '이수페타시스', nameEn: 'Isupetasys' },
    { ticker: '356860', name: '티엘비', nameEn: 'TLB' },
    { ticker: '078350', name: '한양디지텍', nameEn: 'Hanyang Digitech' },
  ];
  hub.reusedFrom = 'substrate_pack_mat';
  const idx = relations.data.hubs.findIndex((h) => h.id === 'substrate_pack_mat');
  relations.data.hubs.splice(idx + 1, 0, hub);
  changelog.notes.push('Added semi_relations hub memory_module_boards by copying substrate_pack_mat supplier/customer/peer arrays.');
}
writeJson(relations.fp, relations.data, relations.indent);

const cross = readJson('data/cross_relations.json');
let crossHits = 0;
const walk = (node) => {
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.ticker === '272290' && node.sector === 'semi') {
    node.sector = 'elec';
    crossHits += 1;
  }
  for (const value of Object.values(node)) walk(value);
};
walk(cross.data);
writeJson(cross.fp, cross.data, cross.indent);
changelog.notes.push(`cross_relations 272290 sector semi→elec (${crossHits})`);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
}
function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
const csvPath = path.join(ROOT, 'docs/reports/elec_semi_boundary_mapping_table.csv');
const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const header = csvRows[0];
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const decisions = {
  '007660': ['semi', '메모리 모듈·서버 기판', 'AI서버|네트워크|MLB|AI·메모리', 'group_change', '과반이 AI 서버·네트워크용 MLB. semi 유지, 그룹만 이동'],
  '356860': ['semi', '메모리 모듈·서버 기판', '메모리모듈|SSD|AI·메모리', 'group_change', 'DDR5 모듈·SSD PCB. 메모리 사이클 연동으로 semi 유지. bigchip 관계 유지'],
  '009150': ['elec', '전자부품·기판', 'MLCC|카메라모듈|스마트폰|반도체기판(FC-BGA)|AI·메모리', 'tag_add', '패키지기판은 과반 미만. 태그 반도체기판(FC-BGA), AI·메모리 추가'],
  '078350': ['semi', '메모리 모듈·서버 기판', '메모리모듈|SSD|AI·메모리', 'move', '메모리모듈 64%·SSD 34%. 메모리 사이클 연동으로 elec→semi'],
  '353200': ['semi', '기판·패키징 소재', 'FC-BGA|메모리패키지기판|MLB', 'tag_add', '그룹 유지. 태그 FC-BGA, 메모리패키지기판, MLB'],
  '098460': ['elec', '전자·SMT 검사장비', 'SMT검사|반도체패키징검사|의료로봇', 'move', 'SMT 검사 과반. 신설 elec 그룹. 디스플레이 장비와 분리'],
  '168360': ['elec', '전자·SMT 검사장비', 'SMT검사|반도체검사|HBM', 'move', 'SMT 검사 주력. 신설 elec 그룹. HBM 검사는 태그'],
  '323280': ['semi', '패키징 장비', 'FC-BGA|유리기판|PCB장비', 'group_change', 'FC-BGA·PCB 습식장비. 전공정 장비에서 패키징 장비로. semi 유지'],
  '178920': ['elec', '전자부품·기판', 'FPCB|방열시트|EV|반도체', 'move', 'PI 필름 주력. SECTOR_EXCLUSIVE semi 해제 → elec'],
  '272290': ['elec', '디스플레이 소재', 'OLED소재|FPCB소재|반도체패키징소재', 'move', 'semi_needs_review_confirmed의 그룹 유지를 뒤집음. OLED·FPCB 소재가 주력'],
  '078600': ['elec', '전자부품·기판', 'MLCC페이스트|태양전지페이스트|실리콘음극재', 'move', '기판·패키징 소재 정정과 SECTOR_EXCLUSIVE semi를 뒤집음. 페이스트·음극재가 주력'],
  '178320': ['semi', '공정 부품·유지관리', 'ESS|통신장비|반도체장비부품', 'tag_add', '그룹 유지. 태그 ESS, 통신장비, 반도체장비부품'],
  '004710': ['elec', '전자부품·기판', '파워보드|EMS|반도체장비부품|전장', 'description_fix', '전자·화학 소재와 LED BLU 설명은 둘 다 오류. 파워보드·EMS로 교정'],
  '089010': ['elec', '전자부품·기판', 'PBA모듈|무선충전|반도체케미칼|전장', 'description_fix', '전자 모듈·케미칼 설명으로 교정'],
  '025320': ['elec', '전자부품·기판', 'FPCB|반도체필터', 'tag_add', '그룹 유지. 태그 FPCB, 반도체필터'],
};
for (const row of csvRows.slice(1)) {
  const ticker = pad(row[col.ticker]);
  const decision = decisions[ticker];
  if (decision) {
    row[col.proposed_sector] = decision[0];
    row[col.proposed_group] = decision[1];
    row[col.proposed_tags] = decision[2];
    row[col.action] = decision[3];
    row[col.notes] = decision[4];
  } else if (['046890', '092190', '017900'].includes(ticker)) {
    const note = row[col.notes] || '';
    if (!note.includes('별도 과제')) {
      row[col.notes] = `${note} 이번 작업 범위 밖. LED 그룹은 별도 과제.`.trim();
    }
  }
}
fs.writeFileSync(csvPath, csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n', 'utf8');

const mapping = csvRows.slice(1).filter((r) => decisions[pad(r[col.ticker])]).map((r) => {
  const ticker = pad(r[col.ticker]);
  const spec = COPY[ticker];
  return {
    ticker,
    name: r[col.name],
    from: spec ? spec.from : { sector: r[col.current_sector], group: r[col.current_group] },
    to: { sector: r[col.proposed_sector], group: r[col.proposed_group] },
    tags: String(r[col.proposed_tags] || '').split('|').filter(Boolean),
    evidenceUrl: r[col.evidence_url],
    appliedOn: APPLIED,
    action: r[col.action],
    notes: r[col.notes],
  };
});
fs.writeFileSync(
  path.join(ROOT, 'docs/reports/elec_semi_boundary_reclass_mapping.json'),
  JSON.stringify({ appliedOn: APPLIED, rule: 'majority chip manufacturing, packaging, test, or memory/AI-server demand → semi; otherwise core-business map plus AI·메모리 tag', tickers: mapping }, null, 2) + '\n',
  'utf8',
);
fs.writeFileSync(
  path.join(ROOT, 'data/elec_semi_boundary_relation_changelog.json'),
  JSON.stringify(changelog, null, 2) + '\n',
  'utf8',
);
console.log(JSON.stringify({
  movedNodes: changelog.movedNodes.length,
  movedEdges: changelog.movedEdges.length,
  unmovedEdges: changelog.unmovedEdges.length,
  missingNodes: changelog.missingNodes,
  crossHits,
}, null, 2));
