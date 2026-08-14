/**
 * Split legacy energy into battery (incl. ESS), renewable, and nuclear maps.
 *
 * Source pattern follows split_energy_powergrid.mjs / split_kculture_sectors.mjs:
 * clone existing map HTML, replace koreanCompanies, patch chain metadata, then
 * leave the old /energy/ URL as an explainer page because user intent is split
 * across successor sectors.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCpListUniverse } from '../lib/cp_list_universe.mjs';
import {
  esc,
  fmtMcap,
  mcapTier,
  patchKoreanCompaniesHtml,
  extractCompaniesFromHtml,
  slugId,
} from '../lib/map_company_serialize.mjs';
import {
  loadMergedKrxMap,
  loadListedEnglish3557Map,
  formatListedEnglishName,
} from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';
import { passesMcapFloor, filterCompaniesByMcap } from '../lib/mcap_policy.mjs';
import { exclusiveSector } from '../lib/sector_exclusive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CP_LIST_DIR = path.resolve(ROOT, '..', 'cp_list');
const ENERGY_HTML = path.join(ROOT, 'energy', 'korea_energy_map.html');
const POWERGRID_HTML = path.join(ROOT, 'powergrid', 'korea_powergrid_map.html');
const SUCCESSOR_HTML = [
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
];

const SECTORS = {
  battery: {
    folder: 'battery',
    file: 'korea_battery_map.html',
    titleKo: '한국 2차전지·배터리 투자 지도',
    titleEn: 'Korea Battery Value Chain Map',
    subtitleKo: '셀·소재·장비·부품 — 상장사와 글로벌 참고 관계',
    subtitleEn: 'Cells, materials, equipment, and parts — listed companies and reference relationships',
    descriptionKo: '2차전지 셀·소재·장비·부품 관련 상장사와 글로벌 참고 관계를 정리합니다.',
    descriptionEn: 'Listed Korean battery cell, material, equipment, and parts companies with illustrative global relationships.',
    dataSector: 'battery',
    chains: ['셀', '소재', '장비', '부품', 'ESS'],
    colors: { '셀': '#42A5F5', '소재': '#26A69A', '장비': '#AB47BC', '부품': '#FF8A65', 'ESS': '#7E57C2' },
    chainLabelKo: { '셀': '배터리 셀', '소재': '양극재·음극재·전해질', '장비': '제조·검사 장비', '부품': '분리막·동박·BMS·부품', 'ESS': 'ESS·PCS·연료전지' },
    chainLabelEn: { '셀': 'Battery cells', '소재': 'Cathode, anode & electrolyte materials', '장비': 'Manufacturing & inspection equipment', '부품': 'Separators, copper foil, BMS & parts', 'ESS': 'ESS, PCS & fuel cells' },
    keywordsKo: '2차전지, 배터리, ESS, 양극재, 음극재, 전해질, 배터리 장비',
    keywordsEn: 'Korean battery stocks, ESS, cathode, anode, electrolyte, battery equipment',
    template: 'energy',
  },
  renewable: {
    folder: 'renewable',
    file: 'korea_renewable_map.html',
    titleKo: '한국 신재생에너지 투자 지도',
    titleEn: 'Korea Renewable Energy Map',
    subtitleKo: '태양광·풍력·수소·신재생 운영 — 상장사와 글로벌 참고 관계',
    subtitleEn: 'Solar, wind, hydrogen, and renewable operators — listed companies and reference relationships',
    descriptionKo: '태양광·풍력·수소 등 신재생에너지 관련 상장사와 글로벌 참고 관계를 정리합니다.',
    descriptionEn: 'Listed Korean solar, wind, hydrogen, and renewable-energy companies with illustrative global relationships.',
    dataSector: 'renewable',
    chains: ['태양광', '풍력', '수소', '신재생 운영'],
    colors: { '태양광': '#FFCA28', '풍력': '#66BB6A', '수소': '#4FC3F7', '신재생 운영': '#26A69A' },
    chainLabelKo: { '태양광': '태양광 소재·모듈', '풍력': '풍력 타워·기자재', '수소': '수소 저장·모빌리티', '신재생 운영': '신재생 개발·운영' },
    chainLabelEn: { '태양광': 'Solar materials & modules', '풍력': 'Wind towers & equipment', '수소': 'Hydrogen storage & mobility', '신재생 운영': 'Renewable development & operations' },
    keywordsKo: '신재생에너지, 태양광, 풍력, 수소, 재생에너지 관련주',
    keywordsEn: 'Korean renewable stocks, solar, wind, hydrogen',
    template: 'energy',
  },
  nuclear: {
    folder: 'nuclear',
    file: 'korea_nuclear_map.html',
    titleKo: '한국 원전 투자 지도',
    titleEn: 'Korea Nuclear Power Map',
    subtitleKo: '원자로·기자재·운영·정비·SMR — 상장사와 글로벌 참고 관계',
    subtitleEn: 'Reactors, components, operations, maintenance, and SMR — listed companies and reference relationships',
    descriptionKo: '원자로·원전 기자재·운영·정비·SMR 관련 상장사와 글로벌 참고 관계를 정리합니다.',
    descriptionEn: 'Listed Korean nuclear reactor, component, O&M, and SMR-related companies with illustrative global relationships.',
    dataSector: 'nuclear',
    chains: ['원자로·주기기', '설계·EPC', '운영·정비', '계측·보조기기'],
    colors: { '원자로·주기기': '#78909C', '설계·EPC': '#42A5F5', '운영·정비': '#66BB6A', '계측·보조기기': '#FF8A65' },
    chainLabelKo: { '원자로·주기기': '원자로·주기기·SMR', '설계·EPC': '원전 설계·EPC', '운영·정비': '원전 운영·정비', '계측·보조기기': '계측·보조기기' },
    chainLabelEn: { '원자로·주기기': 'Reactors, major components & SMR', '설계·EPC': 'Nuclear design & EPC', '운영·정비': 'Nuclear operations & maintenance', '계측·보조기기': 'Instrumentation & auxiliary equipment' },
    keywordsKo: '원전, SMR, 원자로, 원전 기자재, 원전 정비',
    keywordsEn: 'Korean nuclear stocks, SMR, reactors, nuclear components, O&M',
    template: 'powergrid',
  },
};

const FORCE = {
  battery: new Set([
    '373220', '006400', '051910', '096770', '003670', '247540', '086520', '011790',
    '066970', '450080', '020150', '093370', '361610', '005070', '137400', '336370',
    '348370', '121600', '001570', '278280', '005420', '393890',
    '336260', '126340',
  ]),
  renewable: new Set(['009830', '010060', '112610', '322000', '475150', '456040', '119850', '271940', '011930']),
  nuclear: new Set(['034020', '052690', '051600', '083650', '105840', '006910', '130660']),
};
// Keep the previously confirmed renewable universe stable; SK케미칼 is not one
// of the sector's approved operating names even if it appears in a stale source.
const SUCCESSOR_DROP = new Set(['285130']);

const CHAIN_FORCE = {
  battery: {
    '051910': '소재',
    '361610': '부품',
    '393890': '부품',
    '373220': '셀',
    '006400': '셀',
    '096770': '셀',
    '336260': 'ESS',
    '126340': 'ESS',
  },
  nuclear: {
    '051600': '운영·정비',
  },
};

function sourceText(c, entry) {
  return `${c?.ticker || ''} ${c?.name || ''} ${c?.nameEn || ''} ${c?.chain || ''} ${c?.semType || ''} ${c?.products || ''} ${entry?.subSector || ''}`.trim();
}

function sectorForCompany(c, entry, origin) {
  const ticker = String(c.ticker || '').padStart(6, '0');
  if (SUCCESSOR_DROP.has(ticker)) return null;
  const exclusive = exclusiveSector(ticker);
  if (exclusive === 'powergrid') return null;
  for (const [sid, set] of Object.entries(FORCE)) {
    if (set.has(ticker)) return sid;
  }

  const text = sourceText(c, entry);
  if (origin === 'powergrid') {
    // Power-equipment names (e.g. LS ELECTRIC, Hyosung Heavy) stay in powergrid.
    return /원전|원자력|SMR|nuclear/i.test(text) ? 'nuclear' : null;
  }
  if (/원전|원자력|SMR|원자로|nuclear/i.test(text)) return 'nuclear';
  if (/풍력|wind|태양|solar|솔라|폴리실리콘|수소|hydrogen|신재생|재생|연료전지|fuel cell/i.test(text)) return 'renewable';
  if (/ESS|에너지저장|PCS|슈퍼커패시터|supercapacitor|피크저감/i.test(text)) return 'battery';
  if (/2차전지|배터리|battery|양극|음극|전해|리튬|분리막|동박|전구체|CNT|도전재|셀|BMS|전고체|전지/i.test(text)) return 'battery';
  return null;
}

function chainForSector(sid, c, entry) {
  const ticker = String(c.ticker || '').padStart(6, '0');
  if (CHAIN_FORCE[sid]?.[ticker]) return CHAIN_FORCE[sid][ticker];
  const text = sourceText(c, entry);
  if (sid === 'battery') {
    if (/셀|cell|에너지솔루션|삼성SDI|SK온|SK이노/i.test(text)) return '셀';
    if (/장비|설비|피엔티|검사|코팅|production/i.test(text)) return '장비';
    if (/분리막|동박|BMS|부품|일진하이솔루스/i.test(text)) return '부품';
    return '소재';
  }
  if (sid === 'renewable') {
    if (/풍력|wind|타워|씨에스윈드/i.test(text)) return '풍력';
    if (/수소|hydrogen|하이솔루스/i.test(text)) return '수소';
    if (/운영|EPC|개발|이터닉스|신재생/i.test(text)) return '신재생 운영';
    return '태양광';
  }
  if (sid === 'nuclear') {
    if (/두산에너빌리티|원자로|SMR|주기기|터빈/i.test(text)) return '원자로·주기기';
    if (/한전기술|설계|EPC/i.test(text)) return '설계·EPC';
    if (/KPS|한전산업|운영|정비|O&M/i.test(text)) return '운영·정비';
    return '계측·보조기기';
  }
  return c.chain || '기타';
}

function updateKrxFields(c, ticker, krx, meta3557, perPbr) {
  const row = krx.get(ticker);
  if (row) {
    c.name = row.name || c.name;
    c.market = row.market || c.market || 'KOSPI';
    c.mcapWon = row.mcap || c.mcapWon || 0;
    c.revenue = fmtMcap(c.mcapWon);
    c.revTier = mcapTier(c.mcapWon);
  }
  const meta = meta3557.get(ticker);
  if (meta?.nameEn) c.nameEn = formatListedEnglishName(meta.nameEn);
  if (meta?.nameKo && (!c.name || c.name.includes('\uFFFD'))) c.name = meta.nameKo;
  const fin = perPbr.get(ticker);
  c.per = fin ? fin.per : c.per ?? null;
  c.pbr = fin ? fin.pbr : c.pbr ?? null;
  return c;
}

function makeStub(ticker, entry, krx, meta3557, perPbr) {
  const row = krx.get(ticker);
  if (!row || !passesMcapFloor({ mcapWon: row.mcap })) return null;
  const meta = meta3557.get(ticker);
  const nameEn = formatListedEnglishName(meta?.nameEn || entry.nameKo || row.name || ticker);
  const c = {
    id: slugId(ticker, nameEn, 'energy'),
    name: row.name || entry.nameKo || ticker,
    nameEn,
    ticker,
    market: row.market || entry.market || 'KOSPI',
    chain: '미분류',
    semType: entry.subSector || '—',
    semTypeEn: entry.subSector || '—',
    products: entry.subSector ? `${entry.subSector} 관련 제품·서비스` : '—',
    productsEn: 'Related products and services',
    revenue: fmtMcap(row.mcap),
    mcapWon: row.mcap,
    per: null,
    pbr: null,
    revTier: mcapTier(row.mcap),
    partners: [],
  };
  return updateKrxFields(c, ticker, krx, meta3557, perPbr);
}

function stripPrerenderRows(html, keepTickers) {
  const start = '<!-- investingmap-seo-prerender-start -->';
  const end = '<!-- investingmap-seo-prerender-end -->';
  const i0 = html.indexOf(start);
  const i1 = html.indexOf(end);
  if (i0 === -1 || i1 === -1 || i1 <= i0) return html;
  const head = html.slice(0, i0 + start.length);
  const body = html.slice(i0 + start.length, i1);
  const tail = html.slice(i1);
  const stripped = body.replace(/<tr data-ticker="([^"]+)">[\s\S]*?<\/tr>/g, (full, ticker) =>
    keepTickers.has(String(ticker).padStart(6, '0')) ? full : '',
  );
  return head + stripped + tail;
}

function patchChains(html, meta) {
  const all = `['all', ${meta.chains.map((c) => `'${esc(c)}'`).join(', ')}]`;
  const bare = `[${meta.chains.map((c) => `'${esc(c)}'`).join(', ')}]`;
  let out = html
    .replace(/const CHAIN_COLORS = \{[\s\S]*?\};/, `const CHAIN_COLORS = ${JSON.stringify(meta.colors)};`)
    .replace(/const chains = \['all', [^\]]+\];/g, `const chains = ${all};`)
    .replace(/const chains = \[[^\]]+\];(?=\s*\n\s*chainContainer)/g, `const chains = ${bare};`)
    .replace(/(const chainContainer = document\.getElementById\('sb-chain-legend'\);\s*const chains = )(\[[^\]]+\])/, `$1${bare}`);

  const patchLabelBlock = (lang, source) => {
    const block = meta.chains.map((c) => `            "${c}": "${source[c] || c}"`).join(',\n');
    const langRe = new RegExp(`("${lang}":\\s*\\{[\\s\\S]*?"chainLabel":\\s*\\{)[\\s\\S]*?(\\n\\s*\\},)`);
    out = out.replace(langRe, `$1\n${block}$2`);
    const filterRe = new RegExp(`("${lang}":\\s*\\{[\\s\\S]*?"chainFilter":\\s*\\{)[\\s\\S]*?(\\n\\s*\\},)`);
    out = out.replace(filterRe, `$1\n${block}$2`);
  };
  patchLabelBlock('ko', meta.chainLabelKo);
  patchLabelBlock('en', meta.chainLabelEn);
  return out;
}

function patchText(html, meta, from) {
  const url = `https://www.investingmap.kr/${meta.folder}/${meta.file}`;
  let out = html
    .replace(new RegExp(`${from}/korea_${from}_map\\.html`, 'g'), `${meta.folder}/${meta.file}`)
    .replace(new RegExp(`/${from}/`, 'g'), `/${meta.folder}/`)
    .replace(new RegExp(`\\.\\./${from}/`, 'g'), `../${meta.folder}/`)
    .replace(/data-sector="[^"]+"/, `data-sector="${meta.dataSector}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.titleKo}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${meta.descriptionKo}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${meta.titleKo}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${meta.descriptionKo}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${meta.titleKo}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${meta.descriptionKo}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<link rel="alternate" hreflang="ko-KR" href="[^"]*">/, `<link rel="alternate" hreflang="ko-KR" href="${url}?lang=ko">`)
    .replace(/<link rel="alternate" hreflang="en-US" href="[^"]*">/, `<link rel="alternate" hreflang="en-US" href="${url}?lang=en">`)
    .replace(/<link rel="alternate" hreflang="x-default" href="[^"]*">/, `<link rel="alternate" hreflang="x-default" href="${url}">`)
    .replace(/(<h1 id="hdr-title">)[\s\S]*?(<\/h1>)/, `$1🇰🇷 ${meta.titleKo}$2`)
    .replace(/(<p id="hdr-subtitle">)[^<]*(<\/p>)/, `$1${meta.subtitleKo}$2`)
    .replace(/"title":\s*"[^"]*"/, `"title": "🇰🇷 ${meta.titleKo}"`)
    .replace(/"subtitle":\s*"[^"]*"/, `"subtitle": "${meta.subtitleKo}"`)
    .replace(/("en":\s*\{[\s\S]*?"title":\s*")[^"]*(")/, `$1🇰🇷 ${meta.titleEn}$2`)
    .replace(/("en":\s*\{[\s\S]*?"subtitle":\s*")[^"]*(")/, `$1${meta.subtitleEn}$2`);
  out = out.replace(/const ANGLE = \{[\s\S]*?\};/, `const ANGLE = { ${meta.chains.map((c, i) => `'${esc(c)}': ${Math.round((360 / meta.chains.length) * i)}`).join(', ')} };`);
  return out;
}

function writeMap(meta, companies, templates) {
  const template = templates[meta.template];
  const from = meta.template === 'powergrid' ? 'powergrid' : 'energy';
  const keep = new Set(companies.map((c) => String(c.ticker).padStart(6, '0')));
  let html = patchKoreanCompaniesHtml(template, companies);
  html = stripPrerenderRows(html, keep);
  html = patchText(html, meta, from);
  html = patchChains(html, meta);
  fs.mkdirSync(path.join(ROOT, meta.folder), { recursive: true });
  fs.writeFileSync(path.join(ROOT, meta.folder, meta.file), html, 'utf8');
  console.log(`OK ${meta.folder}: ${companies.length} companies`);
}

function writeEnergyLanding() {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>에너지 섹터 안내 | Investing Map</title>
  <meta name="description" content="기존 에너지 지도는 2차전지·배터리(ESS 포함), 신재생에너지, 원전 섹터로 분리되었습니다.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://www.investingmap.kr/energy/korea_energy_map.html">
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3}
    main{max-width:860px;margin:0 auto;padding:56px 22px}
    a{color:#58a6ff} .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:24px}
    .card{display:block;padding:18px;border:1px solid #30363d;border-radius:16px;background:#161b22;text-decoration:none;color:#e6edf3}
    .card strong{display:block;margin-bottom:8px;color:#fff}.muted{color:#8b949e;line-height:1.7}
  </style>
</head>
<body data-sector="energy">
  <main>
    <p><a href="../index.html">← Investing Map Hub</a></p>
    <h1>에너지 섹터가 세부 지도로 분리되었습니다</h1>
    <p class="muted">기존 에너지 지도는 투자자가 더 정확히 비교할 수 있도록 2차전지·배터리(ESS 포함), 신재생에너지로 나누었습니다. 원전은 별도 섹터로 신설했습니다.</p>
    <div class="cards">
      <a class="card" href="../battery/korea_battery_map.html?tab=table"><strong>2차전지·배터리</strong><span class="muted">셀·소재·장비·부품·ESS</span></a>
      <a class="card" href="../renewable/korea_renewable_map.html?tab=table"><strong>신재생에너지</strong><span class="muted">태양광·풍력·수소·운영</span></a>
      <a class="card" href="../nuclear/korea_nuclear_map.html?tab=table"><strong>원전</strong><span class="muted">원자로·기자재·운영·SMR</span></a>
    </div>
  </main>
</body>
</html>
`;
  fs.writeFileSync(ENERGY_HTML, html, 'utf8');
  console.log('OK energy landing page');
}

function main() {
  const energyCurrent = fs.readFileSync(ENERGY_HTML, 'utf8');
  const powergridCurrent = fs.readFileSync(POWERGRID_HTML, 'utf8');
  const fallbackEnergyTemplatePath = path.join(ROOT, 'battery', 'korea_battery_map.html');
  const templates = {
    energy: energyCurrent.includes('const koreanCompanies = ')
      ? energyCurrent
      : fs.readFileSync(fallbackEnergyTemplatePath, 'utf8'),
    powergrid: powergridCurrent,
  };
  const krx = loadMergedKrxMap(path.join(ROOT, 'data'));
  const meta3557 = loadListedEnglish3557Map(path.join(ROOT, 'data'));
  const perPbr = loadPerPbrMap(path.join(ROOT, 'data'));
  const cpEnergy = loadCpListUniverse(CP_LIST_DIR).get('energy') || new Map();

  const candidates = new Map();
  const sourceHtmls = [];
  if (energyCurrent.includes('const koreanCompanies = ')) {
    sourceHtmls.push(['energy', energyCurrent]);
  } else {
    for (const rel of SUCCESSOR_HTML) {
      const p = path.join(ROOT, rel);
      if (fs.existsSync(p)) sourceHtmls.push([rel.split('/')[0], fs.readFileSync(p, 'utf8')]);
    }
  }
  sourceHtmls.push(['powergrid', powergridCurrent]);

  for (const [origin, html] of sourceHtmls) {
    if (!html.includes('const koreanCompanies = ')) continue;
    for (const c0 of extractCompaniesFromHtml(html)) {
      const ticker = String(c0.ticker || '').padStart(6, '0');
      if (!ticker || ticker === 'UNLISTED') continue;
      const c = updateKrxFields({ ...c0 }, ticker, krx, meta3557, perPbr);
      candidates.set(ticker, { c, origin, entry: cpEnergy.get(ticker) || null });
    }
  }
  for (const [ticker, entry] of cpEnergy) {
    if (candidates.has(ticker)) continue;
    const stub = makeStub(ticker, entry, krx, meta3557, perPbr);
    if (stub) candidates.set(ticker, { c: stub, origin: 'cp_list', entry });
  }
  for (const [sid, tickers] of Object.entries(FORCE)) {
    for (const ticker of tickers) {
      if (candidates.has(ticker)) continue;
      const entry = { nameKo: krx.get(ticker)?.name || ticker, subSector: sid === 'renewable' ? '신재생 운영' : '' };
      const stub = makeStub(ticker, entry, krx, meta3557, perPbr);
      if (stub) candidates.set(ticker, { c: stub, origin: 'forced', entry });
    }
  }

  const bySector = { battery: [], renewable: [], nuclear: [] };
  const review = [];
  for (const [ticker, row] of candidates) {
    if (!passesMcapFloor({ mcapWon: row.c.mcapWon || 0 })) continue;
    const sid = sectorForCompany(row.c, row.entry, row.origin);
    if (!sid || !bySector[sid]) continue;
    const c = { ...row.c, chain: chainForSector(sid, row.c, row.entry) };
    bySector[sid].push(c);
    review.push({
      ticker,
      name: c.name,
      sector: sid,
      chain: c.chain,
      origin: row.origin,
      basis: row.entry?.subSector || row.c.semType || row.c.products || '',
      mcapWon: c.mcapWon || 0,
    });
  }

  for (const sid of Object.keys(bySector)) {
    bySector[sid] = filterCompaniesByMcap(bySector[sid])
      .sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
    writeMap(SECTORS[sid], bySector[sid], templates);
  }

  // Remove nuclear names from the legacy power-grid map so the new nuclear map owns them.
  if (templates.powergrid.includes('const koreanCompanies = ')) {
    const nuclearTickers = new Set(bySector.nuclear.map((c) => c.ticker));
    const powergrid = extractCompaniesFromHtml(templates.powergrid)
      .filter((c) => !nuclearTickers.has(String(c.ticker).padStart(6, '0')))
      .map((c) => updateKrxFields({ ...c }, String(c.ticker).padStart(6, '0'), krx, meta3557, perPbr))
      .sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
    let pgHtml = patchKoreanCompaniesHtml(templates.powergrid, powergrid);
    pgHtml = stripPrerenderRows(pgHtml, new Set(powergrid.map((c) => c.ticker)));
    fs.writeFileSync(POWERGRID_HTML, pgHtml, 'utf8');
    console.log(`OK powergrid: ${powergrid.length} companies after nuclear split`);
  }

  writeEnergyLanding();
  fs.writeFileSync(path.join(ROOT, 'data', 'energy_sector_split_review.json'), JSON.stringify(review.sort((a, b) => a.sector.localeCompare(b.sector) || b.mcapWon - a.mcapWon), null, 2) + '\n', 'utf8');
}

main();
