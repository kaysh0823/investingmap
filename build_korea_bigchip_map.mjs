import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildCuratedSectorMap } from './lib/build_curated_sector_map.mjs';
import {
  BIGCHIP_CONFIG,
  SEMI_VALUE_CHAIN_ORDER,
} from './lib/curated_sector_configs.mjs';
import { loadMergedKrxMap } from './lib/krx_data_sources.mjs';
import { mcapTier } from './lib/map_company_serialize.mjs';
import { applyBigchipRelationNetwork } from './scripts/apply_bigchip_relation_network.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const relations = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'bigchip_relations.json'), 'utf8'));
const krx = loadMergedKrxMap(join(ROOT, 'data'));
const hubIds = new Map(BIGCHIP_CONFIG.companies.map((c) => [c.ticker, c.id]));
const relationNodes = new Map();
const rolePriority = { supplier: 3, customer: 2, peer: 1 };
const ROLE_SECTOR = {
  supplier: 'Upstream supplier',
  peer: 'Global peer',
  customer: 'Downstream customer',
};
const countryMeta = {
  KR: { countryLabel: '한국/Korea', region: 'kr' },
  US: { countryLabel: '미국/USA', region: 'us' },
  TW: { countryLabel: '대만/Taiwan', region: 'tw' },
  JP: { countryLabel: '일본/Japan', region: 'jp' },
  NL: { countryLabel: '네덜란드/Netherlands', region: 'eu' },
  DE: { countryLabel: '독일/Germany', region: 'eu' },
  FR: { countryLabel: '프랑스/France', region: 'eu' },
  CN: { countryLabel: '중국/China', region: 'cn' },
  EU: { countryLabel: '유럽/Europe', region: 'eu' },
};

/** Hubs are exclusive to bigchip; source labels normalize into the semi taxonomy. */
const HUB_CHAIN_BY_TICKER = {
  '005930': 'IDM/종합반도체',
  // Source classification "메모리[HBM]" → IDM/종합반도체 (memory IDM).
  '000660': 'IDM/종합반도체',
};

function loadSemiChainByTicker() {
  const html = fs.readFileSync(join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');
  const map = new Map();
  const re = /ticker: '([^']+)', market: '[^']*', chain: '([^']+)'/g;
  let match;
  while ((match = re.exec(html))) {
    map.set(match[1], match[2]);
  }
  return map;
}

function resolveDomesticChain(ticker, semiChains) {
  if (!ticker) return '';
  if (HUB_CHAIN_BY_TICKER[ticker]) return HUB_CHAIN_BY_TICKER[ticker];
  // Name always comes from relations JSON; chain/color is optional semi lookup.
  return semiChains.get(ticker) || '';
}

const semiChains = loadSemiChainByTicker();

if (relations.expansion) {
  const catalog = new Map((relations.expansion.nodes || []).map((node) => [node.id, node]));
  for (const edge of relations.expansion.edges || []) {
    const hub = relations.hubs.find((item) => item.ticker === edge.hub);
    const node = catalog.get(edge.node);
    const plural = `${edge.role}s`;
    if (!hub) throw new Error(`bigchip expansion hub missing: ${edge.hub}`);
    if (!node) throw new Error(`bigchip expansion node missing: ${edge.node}`);
    if (!['suppliers', 'customers', 'peers'].includes(plural)) {
      throw new Error(`bigchip expansion role invalid: ${edge.role}`);
    }
    hub[plural].push({ ...node, ...edge, id: node.id });
  }
}

for (const seed of BIGCHIP_CONFIG.companies) seed.partners = [];

for (const hub of relations.hubs) {
  const seed = BIGCHIP_CONFIG.companies.find((c) => c.ticker === hub.ticker);
  if (!seed) throw new Error(`bigchip relation hub missing from config: ${hub.ticker}`);
  for (const [plural, role] of [['suppliers', 'supplier'], ['customers', 'customer'], ['peers', 'peer']]) {
    for (const relation of hub[plural] || []) {
      const targetId = hubIds.get(relation.ticker) || relation.id;
      seed.partners.push({
        id: targetId,
        edgeLabel: relation.note,
        edgeLabelEn: relation.noteEn,
        kind: role,
        evidence: relation.evidence,
        source: relation.source,
      });
      if (hubIds.has(relation.ticker)) continue;
      const meta = countryMeta[relation.country] || { countryLabel: relation.country, region: 'eu' };
      const row = relation.ticker ? krx.get(relation.ticker) : null;
      const existing = relationNodes.get(relation.id);
      const primaryRole = !existing || rolePriority[role] > rolePriority[existing.primaryRole]
        ? role
        : existing.primaryRole;
      const chain = relation.ticker ? resolveDomesticChain(relation.ticker, semiChains) : '';
      const mcapWon = row?.mcap || existing?.mcapWon || 0;
      relationNodes.set(relation.id, {
        ...(existing || {}),
        id: relation.id,
        name: relation.name,
        nameEn: relation.nameEn || relation.name,
        country: meta.countryLabel,
        countryCode: relation.country,
        region: meta.region,
        sector: ROLE_SECTOR[primaryRole],
        primaryRole,
        ticker: relation.ticker || '',
        market: row?.market || '',
        chain,
        mcapWon,
        revTier: mcapWon ? mcapTier(mcapWon) : 1,
        targetUrl: relation.ticker
          ? `../semiconductor/korea_semiconductor_map.html?tab=table&ticker=${relation.ticker}`
          : '',
      });
    }
  }
}

BIGCHIP_CONFIG.globals = [...relationNodes.values()];
BIGCHIP_CONFIG.subtitleKo = '삼성전자·SK하이닉스 중심의 후방 공급사, 글로벌 peer, 전방 고객 관계';
BIGCHIP_CONFIG.subtitleEn = 'Supplier, global-peer and customer relationships centered on Samsung Electronics and SK hynix';
BIGCHIP_CONFIG.translations = {
  ko: {
    thPartners: '공급사·peer·고객',
    sbKorean: '밸류체인',
    sbGlobal: '공급사·peer·고객',
    peerNetworkDesc: '삼성전자·SK하이닉스와 후방 공급사, 글로벌 peer, 전방 고객의 공개자료 기반 관계입니다. 국내 상장 노드는 반도체 섹터 밸류체인 분류로 색을 둡니다.',
    graphHint: '공개자료 기반 공급망·고객·peer 관계이며 계약 조건을 의미하지 않습니다. “보도” 관계는 공식 확인 건과 구분해 표시합니다.',
    ttPartners: '관계',
    ttSuppliers: '연결 허브',
    relationSupplier: '후방 공급사',
    relationPeer: '글로벌 peer',
    relationCustomer: '전방 고객',
    filterRole: '관계 역할',
    filterCountry: '국가',
    filterReset: '전체 초기화',
    filterActive: '선택됨',
    edgeLegend: '연결선',
    reportedEvidence: '보도',
    confirmedEvidence: '확인',
  },
  en: {
    thPartners: 'Suppliers, peers & customers',
    sbKorean: 'Value chain',
    sbGlobal: 'Suppliers, peers & customers',
    peerNetworkDesc: 'Public-source relationships between Samsung Electronics, SK hynix and their suppliers, global peers and customers. Domestic listed nodes use the semiconductor value-chain palette.',
    graphHint: 'Public-source supply-chain, customer and peer relationships; they do not assert contract terms. Reported links are distinguished from confirmed disclosures.',
    ttPartners: 'Relationships',
    ttSuppliers: 'Connected hubs',
    relationSupplier: 'Upstream supplier',
    relationPeer: 'Global peer',
    relationCustomer: 'Downstream customer',
    filterRole: 'Relationship role',
    filterCountry: 'Country',
    filterReset: 'Reset all',
    filterActive: 'Selected',
    edgeLegend: 'Edges',
    reportedEvidence: 'Reported',
    confirmedEvidence: 'Confirmed',
  },
};

buildCuratedSectorMap(BIGCHIP_CONFIG);
applyBigchipRelationNetwork({ chainOrder: SEMI_VALUE_CHAIN_ORDER });
