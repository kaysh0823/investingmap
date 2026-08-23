/**
 * Apply curated value-chain-group relation network onto semiconductor map
 * (mirrors apply_bigchip_relation_network, hub = 밸류체인 그룹).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SEMI_VALUE_CHAIN_ORDER } from '../lib/curated_sector_configs.mjs';
import { applyCuratedRelationPatches } from '../lib/curated_relation_network.mjs';
import {
  extractCompaniesFromHtml,
  patchKoreanCompaniesHtml,
} from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = join(ROOT, 'semiconductor', 'korea_semiconductor_map.html');
const RELATIONS_PATH = join(ROOT, 'data', 'semi_relations.json');

const COUNTRY_META = {
  KR: { countryLabel: '한국/Korea', region: 'kr', countryCode: 'KR' },
  US: { countryLabel: '미국/USA', region: 'us', countryCode: 'US' },
  TW: { countryLabel: '대만/Taiwan', region: 'tw', countryCode: 'TW' },
  JP: { countryLabel: '일본/Japan', region: 'jp', countryCode: 'JP' },
  NL: { countryLabel: '네덜란드/Netherlands', region: 'eu', countryCode: 'NL' },
  DE: { countryLabel: '독일/Germany', region: 'eu', countryCode: 'DE' },
  FR: { countryLabel: '프랑스/France', region: 'eu', countryCode: 'FR' },
  CN: { countryLabel: '중국/China', region: 'cn', countryCode: 'CN' },
  SG: { countryLabel: '싱가포르/Singapore', region: 'eu', countryCode: 'SG' },
  GB: { countryLabel: '영국/UK', region: 'gb', countryCode: 'GB' },
  AT: { countryLabel: '오스트리아/Austria', region: 'eu', countryCode: 'AT' },
  EU: { countryLabel: '유럽/Europe', region: 'eu', countryCode: 'EU' },
};

const ROLE_SECTOR = {
  supplier: 'Upstream supplier',
  peer: 'Global peer',
  customer: 'Downstream customer',
};

const FALLBACK_ANGLE = {
  팹리스: 0,
  디자인하우스: 40,
  파운드리: 80,
  소재: 120,
  '전공정 장비': 160,
  '후공정 장비': 200,
  '부품/기판': 240,
  '패키징/테스트': 280,
  '반도체 유통': 320,
};

const TRANSLATION_PATCHES = {
  ko: {
    thPartners: '공급사·peer·고객',
    sbKorean: '밸류체인',
    sbGlobal: '공급사·peer·고객',
    peerNetworkDesc:
      '밸류체인 그룹(허브)을 중심으로 국내 멤버, 후방 공급사, 글로벌 peer, 전방 고객을 공개자료 기준으로 연결합니다. 반도체 전 밸류체인 그룹(장비·소재·파운드리·팹리스·디자인하우스·부품/기판·패키징/테스트·유통)을 큐레이션했습니다.',
    graphHint:
      '공개자료 기반 공급망·고객·peer 관계이며 계약 조건을 의미하지 않습니다. “보도” 관계는 공식 확인 건과 구분해 표시합니다.',
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
    peerNetworkDesc:
      'Value-chain group hubs link domestic members with upstream suppliers, global peers and downstream customers from public sources. All semiconductor value-chain groups are curated (equipment, materials, foundry, fabless, design house, substrate, packaging/test, distribution).',
    graphHint:
      'Public-source supply-chain, customer and peer relationships; they do not assert contract terms. Reported links are distinguished from confirmed disclosures.',
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

function escJs(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function relationToPartner(rel, role) {
  return {
    id: rel.id,
    edgeLabel: rel.note,
    edgeLabelEn: rel.noteEn,
    kind: role,
    evidence: rel.evidence || 'confirmed',
    source: rel.source || '',
  };
}

function fillMembers(hub, companies) {
  const members = companies
    .filter((c) => c.chain === hub.chain)
    .map((c) => ({
      ticker: c.ticker,
      name: c.name,
      nameEn: c.nameEn || c.name,
    }));
  if (!members.length) throw new Error(`semi relations: no members for chain ${hub.chain}`);
  hub.members = members;
  return members;
}

function patchTranslations(html) {
  let out = html;
  const replaceOnce = (source, langIdx, key, value) => {
    const re = new RegExp(`${key}: '[^']*'`, 'g');
    let seen = 0;
    return source.replace(re, (full) => {
      if (seen++ !== langIdx) return full;
      return `${key}: '${escJs(value)}'`;
    });
  };
  for (const [lang, keys] of Object.entries(TRANSLATION_PATCHES)) {
    const langIdx = lang === 'ko' ? 0 : 1;
    for (const [key, value] of Object.entries(keys)) {
      if (new RegExp(`${key}: '`).test(out)) {
        out = replaceOnce(out, langIdx, key, value);
      }
    }
  }
  // Insert keys that did not exist (relation filters / evidence).
  const insertAfter = {
    ko: `peerNetworkDesc: '${escJs(TRANSLATION_PATCHES.ko.peerNetworkDesc)}',\n        relationSupplier: '${escJs(TRANSLATION_PATCHES.ko.relationSupplier)}', relationPeer: '${escJs(TRANSLATION_PATCHES.ko.relationPeer)}', relationCustomer: '${escJs(TRANSLATION_PATCHES.ko.relationCustomer)}',\n        filterRole: '${escJs(TRANSLATION_PATCHES.ko.filterRole)}', filterCountry: '${escJs(TRANSLATION_PATCHES.ko.filterCountry)}', filterReset: '${escJs(TRANSLATION_PATCHES.ko.filterReset)}', filterActive: '${escJs(TRANSLATION_PATCHES.ko.filterActive)}', edgeLegend: '${escJs(TRANSLATION_PATCHES.ko.edgeLegend)}',\n        reportedEvidence: '${escJs(TRANSLATION_PATCHES.ko.reportedEvidence)}', confirmedEvidence: '${escJs(TRANSLATION_PATCHES.ko.confirmedEvidence)}',`,
    en: `peerNetworkDesc: '${escJs(TRANSLATION_PATCHES.en.peerNetworkDesc)}',\n        relationSupplier: '${escJs(TRANSLATION_PATCHES.en.relationSupplier)}', relationPeer: '${escJs(TRANSLATION_PATCHES.en.relationPeer)}', relationCustomer: '${escJs(TRANSLATION_PATCHES.en.relationCustomer)}',\n        filterRole: '${escJs(TRANSLATION_PATCHES.en.filterRole)}', filterCountry: '${escJs(TRANSLATION_PATCHES.en.filterCountry)}', filterReset: '${escJs(TRANSLATION_PATCHES.en.filterReset)}', filterActive: '${escJs(TRANSLATION_PATCHES.en.filterActive)}', edgeLegend: '${escJs(TRANSLATION_PATCHES.en.edgeLegend)}',\n        reportedEvidence: '${escJs(TRANSLATION_PATCHES.en.reportedEvidence)}', confirmedEvidence: '${escJs(TRANSLATION_PATCHES.en.confirmedEvidence)}',`,
  };
  if (!out.includes('relationSupplier:')) {
    let n = 0;
    out = out.replace(/peerNetworkDesc: '[^']*',/g, (full) => {
      const block = n++ === 0 ? insertAfter.ko : insertAfter.en;
      return block;
    });
  }
  // Expand region labels for jp/gb.
  out = out.replace(
    "regionLabel: { us: '미국', tw: '대만', cn: '중국', eu: '유럽', kr: '한국(비상장)' }",
    "regionLabel: { us: '미국', tw: '대만', cn: '중국', eu: '유럽', kr: '한국(비상장)', jp: '일본', gb: '영국' }",
  );
  out = out.replace(
    "regionLabel: { us: 'USA', tw: 'Taiwan', cn: 'China', eu: 'Europe', kr: 'Korea (non-listed)' }",
    "regionLabel: { us: 'USA', tw: 'Taiwan', cn: 'China', eu: 'Europe', kr: 'Korea (non-listed)', jp: 'Japan', gb: 'UK' }",
  );
  return out;
}

function objLiteral(obj) {
  return (
    '{ ' +
    Object.entries(obj)
      .map(([k, v]) => {
        const key = /[^a-zA-Z0-9_$]/.test(k) ? `'${k}'` : k;
        return `${key}: ${typeof v === 'number' ? v : `'${escJs(v)}'`}`;
      })
      .join(', ') +
    ' }'
  );
}

function serializeGlobals(globals) {
  const lines = globals.map((g) => {
    const bits = [
      `id: '${escJs(g.id)}'`,
      `name: '${escJs(g.name)}'`,
      `nameEn: '${escJs(g.nameEn || g.name)}'`,
      `country: '${escJs(g.country)}'`,
      `region: '${escJs(g.region)}'`,
      `sector: '${escJs(g.sector || '')}'`,
    ];
    if (g.countryCode) bits.push(`countryCode: '${escJs(g.countryCode)}'`);
    if (g.ticker) bits.push(`ticker: '${escJs(g.ticker)}'`);
    if (g.market) bits.push(`market: '${escJs(g.market)}'`);
    if (g.chain) bits.push(`chain: '${escJs(g.chain)}'`);
    if (g.isKR) bits.push('isKR: true');
    if (g.targetUrl) bits.push(`targetUrl: '${escJs(g.targetUrl)}'`);
    return `      { ${bits.join(', ')} }`;
  });
  return `[\n${lines.join(',\n')}\n    ]`;
}

function patchGlobalCompanies(html, globals) {
  const start = 'const globalCompanies = ';
  const i0 = html.indexOf(start);
  if (i0 < 0) throw new Error('globalCompanies not found');
  const after = html.indexOf('\n\n', i0);
  const endMarker = html.indexOf('\n    // ═══════════════════════════════════════════════════════', i0);
  const i1 = endMarker > 0 ? endMarker : after;
  if (i1 < 0) throw new Error('globalCompanies end not found');
  return html.slice(0, i0) + start + serializeGlobals(globals) + ';' + html.slice(i1);
}

function hubsRuntimeLiteral(hubs) {
  const parts = hubs.map((hub) => {
    const partners = [];
    for (const [plural, role] of [
      ['suppliers', 'supplier'],
      ['customers', 'customer'],
      ['peers', 'peer'],
    ]) {
      for (const rel of hub[plural] || []) {
        partners.push(relationToPartner(rel, role));
      }
    }
    const partnerLit = partners
      .map(
        (p) =>
          `{ id: '${escJs(p.id)}', edgeLabel: '${escJs(p.edgeLabel)}', edgeLabelEn: '${escJs(p.edgeLabelEn)}', kind: '${p.kind}', evidence: '${escJs(p.evidence)}', source: '${escJs(p.source)}' }`,
      )
      .join(', ');
    return `{ id: 'hub_${hub.id}', chain: '${escJs(hub.chain)}', label: '${escJs(hub.label.ko)}', labelEn: '${escJs(hub.label.en)}', partners: [${partnerLit}] }`;
  });
  return `[\n      ${parts.join(',\n      ')}\n    ]`;
}

function hubAngleLiteral(hubs) {
  const angle = {};
  hubs.forEach((hub, i) => {
    angle[hub.chain] = hubs.length ? Math.round((360 / hubs.length) * i) : 0;
  });
  return objLiteral(angle);
}

function partnerCellPatch(html) {
  if (html.includes('bigchipRelationTags(c)')) return html;
  const re =
    /const partnerHtml = c\.partners\.slice\(0, 6\)\.map\(p => \{[\s\S]*?\}\)\.join\(''\) \+ \(c\.partners\.length > 6 \? `<span class="partner-tag">\+\$\{c\.partners\.length - 6\}<\/span>` : ''\);/;
  const next = html.replace(re, 'const partnerHtml = bigchipRelationTags(c);');
  if (next === html) throw new Error('semi relation patch: partnerHtml block not found');
  return next.replace(
    '<td><div class="partners-list">${partnerHtml}</div></td>',
    '<td class="bigchip-relations-cell"><div class="bigchip-relation-tags">${partnerHtml}</div></td>',
  );
}

export function applySemiRelationNetwork() {
  const relations = JSON.parse(fs.readFileSync(RELATIONS_PATH, 'utf8'));
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  const companies = extractCompaniesFromHtml(html);
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));

  if (!relations.hubs?.length) throw new Error('semi_relations.json: hubs required');

  const globalMap = new Map();
  // Keep existing globals as base (id → row).
  const existingMatch = html.match(/const globalCompanies = (\[[\s\S]*?\n    \]);/);
  if (existingMatch) {
    const existing = Function(`"use strict"; return ${existingMatch[1]}`)();
    for (const g of existing) globalMap.set(g.id, g);
  }

  for (const hub of relations.hubs) {
    fillMembers(hub, companies);
    const partners = [];
    for (const [plural, role] of [
      ['suppliers', 'supplier'],
      ['customers', 'customer'],
      ['peers', 'peer'],
    ]) {
      for (const rel of hub[plural] || []) {
        partners.push(relationToPartner(rel, role));
        const meta = COUNTRY_META[rel.country] || {
          countryLabel: rel.country,
          region: 'eu',
          countryCode: rel.country,
        };
        const prev = globalMap.get(rel.id) || {};
        globalMap.set(rel.id, {
          ...prev,
          id: rel.id,
          name: rel.name,
          nameEn: rel.nameEn || rel.name,
          country: meta.countryLabel,
          countryCode: meta.countryCode,
          region: meta.region,
          sector: ROLE_SECTOR[role],
          isKR: meta.countryCode === 'KR' || prev.isKR,
        });
      }
    }
    for (const member of hub.members) {
      const company = byTicker.get(member.ticker);
      if (!company) throw new Error(`semi relations member missing on map: ${member.ticker}`);
      company.partners = partners.map((p) => ({ ...p }));
    }
  }

  // Persist filled members back to JSON for B2 continuity / verify.
  fs.writeFileSync(RELATIONS_PATH, JSON.stringify(relations, null, 2) + '\n', 'utf8');

  html = patchKoreanCompaniesHtml(html, companies);
  html = patchGlobalCompanies(html, [...globalMap.values()]);
  html = patchTranslations(html);

  const hubsLit = hubsRuntimeLiteral(relations.hubs);
  const hubAngle = hubAngleLiteral(relations.hubs);

  const v2Active = html.includes('RelationNetwork v2') || html.includes('relation_network.js');
  if (!v2Active) {
    html = applyCuratedRelationPatches(html, {
      mode: 'chainGroup',
      chainOrder: SEMI_VALUE_CHAIN_ORDER.filter((c) => c !== 'IDM/종합반도체'),
      hubsLiteral: hubsLit,
      hubAngleLiteral: hubAngle,
      fallbackAngleLiteral: objLiteral(FALLBACK_ANGLE),
      skipChainChips: true,
      sidebarTitleKo: '밸류체인',
      i18nVer: '8',
      heatmapVer: '14',
      patchPartnerCell: false,
    });
    html = partnerCellPatch(html);
  } else {
    console.log('apply_semi_relation_network: skip curated inline graph (RelationNetwork v2 active)');
  }

  html = html.replace(
    /const REGION_COLORS = \{[^}]+\};/,
    "const REGION_COLORS = { us: '#90A4AE', tw: '#80CBC4', eu: '#B0BEC5', cn: '#F48FB1', kr: '#A5D6A7', jp: '#F472B6', gb: '#A5B4FC' };",
  );
  html = html.replace(
    /const regions = \['us', 'tw', 'cn', 'eu', 'kr'(?:, 'jp', 'gb')?\];/,
    "const regions = ['us', 'tw', 'cn', 'eu', 'kr', 'jp', 'gb'];",
  );

  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log(
    'OK apply_semi_relation_network hubs=',
    relations.hubs.map((h) => `${h.chain}(${h.members.length})`).join(', '),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applySemiRelationNetwork();
}
