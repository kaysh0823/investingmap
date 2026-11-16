import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMergedKrxMap, resolveLatestCsv } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';
import {
  extractChainColors, extractCompaniesFromHtml, fmtMcap, mcapTier, patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';
import { HUB_MAP_PATHS } from '../lib/sector_meta.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATA = path.join(ROOT, 'data');
const AUDIT_DATE = '20261113';
// Exact KRX closing market caps for the seven approved additions.
const admissions = [
  {
    sector: 'chemical', id: 'sk_chemicals', ticker: '285130', name: 'SK케미칼',
    nameEn: 'SK Chemicals', market: 'KOSPI', chain: '합성수지·고무',
    semType: '코폴리에스터', semTypeEn: 'Copolyester',
    products: '코폴리에스터·재활용 폴리에스터', productsEn: 'Copolyester and recycled polyester',
    mcapWon: 671192120800,
  },
  {
    sector: 'ship', id: 'stx_corp', ticker: '011810', name: 'STX',
    nameEn: 'STX Corporation', market: 'KOSPI', chain: '유지보수·개조',
    semType: '선박 투자·관리', semTypeEn: 'Ship investment and management',
    products: '선박 투자 및 계열사를 통한 선박 관리·기자재 공급',
    productsEn: 'Ship investment, plus ship management and marine equipment supply through affiliates',
    mcapWon: 526303849320,
  },
  {
    sector: 'software', id: 'hyundai_futurenet', ticker: '126560', name: '현대퓨처넷',
    nameEn: 'Hyundai Futurenet', market: 'KOSPI', chain: 'IT서비스·SI',
    semType: '디지털 미디어·IT서비스', semTypeEn: 'Digital media and IT services',
    products: '디지털 사이니지, 기업 메시징, IT 시스템 구축·운영',
    productsEn: 'Digital signage, enterprise messaging and IT systems integration and operations',
    mcapWon: 343983276000,
  },
  {
    sector: 'auto', id: 'nexen', ticker: '005720', name: '넥센', nameEn: 'Nexen',
    market: 'KOSPI', chain: '지주회사', semType: '타이어 사업형 지주',
    semTypeEn: 'Tire holding company', products: '넥센타이어 지배 및 고무제품 제조',
    productsEn: 'Ownership of Nexen Tire and manufacturing of rubber products',
    mcapWon: 327874416480,
  },
  {
    sector: 'chemical', id: 'korea_alcohol', ticker: '017890', name: '한국알콜',
    nameEn: 'Korea Alcohol Industrial', market: 'KOSDAQ', chain: '정밀·특수화학',
    semType: '주정·정밀화학', semTypeEn: 'Ethanol and fine chemicals',
    products: '주정·용제·정밀화학', productsEn: 'Ethanol, solvents and fine chemicals',
    mcapWon: 316304641800,
  },
  {
    sector: 'bio', id: 'hlb_pharm', ticker: '047920', name: 'HLB제약',
    nameEn: 'HLB Pharmaceutical', market: 'KOSDAQ', chain: '종합 제약',
    sectorId: 'pharma_integrated', semType: '전문·일반의약품',
    semTypeEn: 'Prescription and OTC pharmaceuticals',
    products: '전문·일반의약품 제조·판매', productsEn: 'Manufacture and sale of prescription and OTC medicines',
    mcapWon: 309723601680,
  },
  {
    sector: 'battery', id: 'sangsin_edp', ticker: '091580', name: '상신이디피',
    nameEn: 'Sangsin EDP', market: 'KOSDAQ', chain: '모듈·팩·시스템 부품',
    semType: '이차전지 캔·케이스', semTypeEn: 'Battery cans and cases',
    products: '원통형·각형 이차전지 캔 및 케이스',
    productsEn: 'Cylindrical and prismatic battery cans and cases',
    mcapWon: 309214680800,
  },
];

// Allow subsequent full-market CSVs to supersede the audit per market.
const krx = loadMergedKrxMap(DATA);
const latestByMarket = {
  KOSPI: path.basename(resolveLatestCsv(DATA, 'data_4937_')),
  KOSDAQ: path.basename(resolveLatestCsv(DATA, 'data_4848_')),
};
const tickers = new Set(admissions.map(({ ticker }) => ticker));
const reset = process.argv.includes('--reset');

for (const [sector, rel] of HUB_MAP_PATHS) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  const original = extractCompaniesFromHtml(html);
  if (reset) {
    const base = original.filter((company) => !tickers.has(company.ticker) || !company.mcapAsOf);
    if (base.length !== original.length) fs.writeFileSync(file, patchKoreanCompaniesHtml(html, base));
    continue;
  }
  const rows = admissions.filter((row) => row.sector === sector);
  if (!rows.length && !original.some((company) => tickers.has(company.ticker))) continue;

  const companies = original.filter((company) => !tickers.has(company.ticker));
  const chains = extractChainColors(html);
  const admitted = [];
  for (const row of rows) {
    const { sector: admissionSector, ...company } = row;
    if (!chains.includes(company.chain)) throw new Error(`${admissionSector}: unknown chain ${company.chain}`);
    const latest = latestByMarket[company.market].slice(-12, -4);
    if (latest >= AUDIT_DATE) {
      const current = krx.get(company.ticker);
      if (!current) continue;
      company.mcapWon = current.mcap;
      company.market = current.market;
      company.name = current.name || company.name;
    }
    if (!passesMcapFloor(company)) continue;
    const existing = original.find((entry) => entry.ticker === company.ticker);
    const session = latest >= AUDIT_DATE ? latest : AUDIT_DATE;
    const date = session.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    companies.push({
      ...existing, ...company,
      id: existing?.id || company.id,
      mcapAsOf: `${date}T15:30:00+09:00`,
      revenue: fmtMcap(company.mcapWon),
      revTier: mcapTier(company.mcapWon),
    });
    admitted.push(company);
  }
  fs.writeFileSync(file, patchKoreanCompaniesHtml(html, companies));

  if (!admitted.length) continue;
  const graphFile = path.join(DATA, 'netmap', `${sector}.json`);
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
  for (const company of admitted) {
    const id = `krx:${company.ticker}`;
    if (graph.nodes.some((node) => node.id === id || node.ticker === company.ticker)) continue;
    const chain = Object.keys(graph.chains).find((key) => graph.chains[key] === company.chain);
    if (!chain) throw new Error(`${sector} network map: unknown chain ${company.chain}`);
    graph.nodes.push({
      id, ticker: company.ticker, type: 'kr_listed', country: 'kr', market: company.market,
      nameKo: company.name, nameEn: company.nameEn, chain, role: company.semType,
    });
  }
  fs.writeFileSync(graphFile, JSON.stringify(graph, null, 2) + '\n');
}

console.log(reset ? 'OK cleared previously generated admissions' : 'OK KRX 2026-11-13 approved company admissions');
