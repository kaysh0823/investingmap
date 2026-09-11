/**
 * Migrate data/semi_relations.json hubs from legacy 9 chains → 13 leaf groups.
 * Partners are copied from the nearest legacy hub; members are refilled by apply_semi_relation_network.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { LEGEND_CHAINS } from '../lib/semi_chain_ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATH = join(ROOT, 'data', 'semi_relations.json');

const LABELS = {
  '팹리스·IP': { ko: '팹리스·IP', en: 'Fabless & IP' },
  디자인하우스: { ko: '디자인하우스', en: 'Design house' },
  파운드리: { ko: '파운드리', en: 'Foundry' },
  '전공정 장비': { ko: '전공정 장비', en: 'Front-end equipment' },
  '패키징 장비': { ko: '패키징 장비', en: 'Packaging equipment' },
  '검사·계측 장비': { ko: '검사·계측 장비', en: 'Inspection & metrology' },
  '공정 소재': { ko: '공정 소재', en: 'Process materials' },
  '공정 부품·유지관리': { ko: '공정 부품·유지관리', en: 'Process parts & MRO' },
  '기판·패키징 소재': { ko: '기판·패키징 소재', en: 'Substrate & packaging materials' },
  '테스트 부품·인터페이스': { ko: '테스트 부품·인터페이스', en: 'Test parts & interface' },
  '패키징·테스트 서비스': { ko: '패키징·테스트 서비스', en: 'Packaging & test services' },
  '팹 인프라·지원설비': { ko: '팹 인프라·지원설비', en: 'Fab infrastructure' },
  '반도체 유통': { ko: '반도체 유통', en: 'Semiconductor distribution' },
};

const IDS = {
  '팹리스·IP': 'fabless_ip',
  디자인하우스: 'design_house',
  파운드리: 'foundry',
  '전공정 장비': 'front_equip',
  '패키징 장비': 'pack_equip',
  '검사·계측 장비': 'inspect_metro',
  '공정 소재': 'process_mat',
  '공정 부품·유지관리': 'process_parts',
  '기판·패키징 소재': 'substrate_pack_mat',
  '테스트 부품·인터페이스': 'test_parts',
  '패키징·테스트 서비스': 'osat',
  '팹 인프라·지원설비': 'fab_infra',
  '반도체 유통': 'distribution',
};

/** New leaf → legacy hub chain whose suppliers/customers/peers to reuse. */
const PARTNER_FROM = {
  '팹리스·IP': '팹리스',
  디자인하우스: '디자인하우스',
  파운드리: '파운드리',
  '전공정 장비': '전공정 장비',
  '패키징 장비': '후공정 장비',
  '검사·계측 장비': '후공정 장비',
  '공정 소재': '소재',
  '공정 부품·유지관리': '소재',
  '기판·패키징 소재': '부품/기판',
  '테스트 부품·인터페이스': '패키징/테스트',
  '패키징·테스트 서비스': '패키징/테스트',
  '팹 인프라·지원설비': '전공정 장비',
  '반도체 유통': '반도체 유통',
};

const data = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const byOld = new Map((data.hubs || []).map((h) => [h.chain, h]));

data.asOf = new Date().toISOString().slice(0, 10);
data.hubs = LEGEND_CHAINS.map((chain) => {
  const src = byOld.get(PARTNER_FROM[chain]) || byOld.get(chain) || {};
  return {
    id: IDS[chain],
    chain,
    label: LABELS[chain],
    members: [],
    suppliers: structuredClone(src.suppliers || []),
    customers: structuredClone(src.customers || []),
    peers: structuredClone(src.peers || []),
  };
});

fs.writeFileSync(PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('OK migrated semi_relations hubs', data.hubs.map((h) => h.chain).join(', '));
