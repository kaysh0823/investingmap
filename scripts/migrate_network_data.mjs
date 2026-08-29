/**
 * Generate / refresh Phase 2 pilot network JSON (Phase 2.5 quality pass).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { auditEvidence } from '../lib/relation_network/evidence_audit.mjs';
import { extractCompaniesFromHtml } from '../lib/map_company_serialize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'networks');

const COUNTRY_REGION = {
  KR: 'kr', US: 'us', TW: 'tw', JP: 'jp', NL: 'eu', DE: 'eu', FR: 'eu',
  CN: 'cn', GB: 'gb', SG: 'eu', EU: 'eu', AT: 'eu',
};

function mkEvidence(rel, accessedAt, titleOverride) {
  if (!rel.source || !/^https?:\/\//.test(rel.source)) return [];
  const sourceType = rel.source.includes('dart') || rel.source.includes('opendart')
    ? 'dart'
    : rel.source.includes('fss.or.kr') ? 'dart'
      : rel.source.includes('ftc.go.kr') ? 'ftc'
        : rel.source.includes('dapa.go.kr') ? 'official'
          : 'official';
  return [{
    sourceType,
    title: titleOverride || rel.note || rel.name || 'Public disclosure',
    url: rel.source,
    publishedAt: rel.publishedAt || null,
    accessedAt,
    reviewStatus: 'needs_human_review',
  }];
}

function applyEvidenceAudit(edge) {
  for (const ev of edge.evidence || []) {
    const a = auditEvidence(ev, edge);
    ev.reviewStatus = a.reviewStatus;
    if (a.issues.includes('homepage_only_url') || a.issues.includes('generic_ftc_portal')) {
      if (edge.status === 'confirmed') edge.status = 'reported';
    }
  }
  edge.reviewStatus = (edge.evidence || [])[0]?.reviewStatus || 'needs_human_review';
  return edge;
}

function migrateSemiRelations() {
  const relations = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'semi_relations.json'), 'utf8'));
  const html = fs.readFileSync(join(ROOT, 'semiconductor', 'korea_semiconductor_map.html'), 'utf8');
  const companies = extractCompaniesFromHtml(html);
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));
  const accessedAt = relations.asOf || '2026-08-22';

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeKeys = new Set();

  const addNode = (n) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };

  const roleMap = { supplier: 'supplies_to', customer: 'customer_of', peer: 'peer' };

  for (const hub of relations.hubs) {
    addNode({
      id: `group:${hub.id}`,
      type: 'group',
      nameKo: hub.label.ko,
      nameEn: hub.label.en,
      role: hub.chain,
      group: hub.chain,
    });

    for (const m of hub.members || []) {
      const c = byTicker.get(m.ticker);
      addNode({
        id: `krx:${m.ticker}`,
        type: 'listed_company',
        ticker: m.ticker,
        nameKo: m.name,
        nameEn: m.nameEn || m.name,
        market: c?.market || '',
        role: c?.semType || hub.chain,
        group: hub.chain,
        mcapWon: c?.mcapWon ?? null,
        isListedKorea: true,
      });
      const mk = `krx:${m.ticker}|group:${hub.id}|member_of`;
      if (!edgeKeys.has(mk)) {
        edgeKeys.add(mk);
        edges.push({
          id: `member-${hub.id}-${m.ticker}`,
          source: `krx:${m.ticker}`,
          target: `group:${hub.id}`,
          type: 'member_of',
          direction: 'source_to_target',
          status: 'reference',
          labelKo: `${hub.label.ko} 밸류체인 분류`,
          labelEn: `${hub.label.en} value-chain grouping`,
          evidence: [],
          confidence: 'high',
          lastVerifiedAt: accessedAt,
          noteKo: '동일 밸류체인 그룹 분류이며 기업 간 거래를 의미하지 않습니다.',
          noteEn: 'Value-chain category only; not a trade relationship.',
        });
      }
    }

    for (const [plural, role] of [['suppliers', 'supplier'], ['customers', 'customer'], ['peers', 'peer']]) {
      for (const rel of hub[plural] || []) {
        const isDomesticAnchor = rel.entityRole === 'domestic_anchor'
          || (rel.country === 'KR' && { samsung_d: '005930', skhynix_d: '000660' }[rel.id]);
        const anchorTicker = isDomesticAnchor
          ? (rel.ticker || { samsung_d: '005930', skhynix_d: '000660' }[rel.id])
          : null;
        const isKrListed = rel.country === 'KR' && rel.ticker && !isDomesticAnchor;
        let nodeId;
        let nodeType;
        if (isDomesticAnchor && anchorTicker) {
          nodeId = `anchor:${anchorTicker}`;
          nodeType = 'domestic_anchor';
        } else if (isKrListed) {
          nodeId = `krx:${rel.ticker}`;
          nodeType = 'listed_company';
        } else {
          nodeId = `global:${rel.id}`;
          nodeType = 'global_company';
        }
        addNode({
          id: nodeId,
          type: nodeType,
          ticker: rel.ticker || anchorTicker || '',
          nameKo: rel.name,
          nameEn: rel.nameEn || rel.name,
          role: role === 'peer' ? 'Global peer' : role,
          region: rel.country === 'KR' ? 'kr' : (COUNTRY_REGION[rel.country] || 'eu'),
          isListedKorea: !!(isKrListed || anchorTicker),
          isDomesticAnchor: !!anchorTicker,
          excludeFromGlobalCount: !!anchorTicker,
          graphOnly: !!anchorTicker,
        });

        if (role === 'peer') {
          const pk = `group:${hub.id}|${nodeId}|peer`;
          if (edgeKeys.has(pk)) continue;
          edgeKeys.add(pk);
          edges.push({
            id: `hub-${hub.id}-${rel.id}-peer`,
            source: `group:${hub.id}`,
            target: nodeId,
            type: 'peer',
            direction: 'undirected',
            status: 'peer',
            labelKo: rel.note || '글로벌 peer',
            labelEn: rel.noteEn || 'Global peer',
            evidence: [],
            confidence: 'low',
            lastVerifiedAt: accessedAt,
            defaultHidden: true,
          });
          continue;
        }

        const edgeType = roleMap[role];
        const ek = `group:${hub.id}|${nodeId}|${edgeType}`;
        if (edgeKeys.has(ek)) continue;
        edgeKeys.add(ek);

        let status = 'reported';
        if (rel.evidence === 'confirmed') {
          status = 'reported';
        }
        const edge = {
          id: `hub-${hub.id}-${rel.id}-${role}`,
          source: role === 'supplier' ? nodeId : `group:${hub.id}`,
          target: role === 'supplier' ? `group:${hub.id}` : nodeId,
          type: edgeType,
          direction: 'source_to_target',
          status,
          labelKo: rel.note || '',
          labelEn: rel.noteEn || '',
          evidence: mkEvidence(rel, accessedAt),
          confidence: status === 'confirmed' ? 'high' : 'medium',
          lastVerifiedAt: accessedAt,
        };
        edges.push(applyEvidenceAudit(edge));
      }
    }
  }

  return { sectorId: 'semiconductor', model: 'supply_chain', asOf: accessedAt, nodes, edges };
}

function migrateHoldings() {
  const html = fs.readFileSync(join(ROOT, 'holdings', 'korea_holdings_map.html'), 'utf8');
  const companies = extractCompaniesFromHtml(html);
  const accessedAt = '2026-08-22';
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  const addNode = (n) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };

  for (const c of companies) {
    addNode({
      id: `krx:${c.ticker}`,
      type: 'listed_company',
      ticker: c.ticker,
      nameKo: c.name,
      nameEn: c.nameEn || c.name,
      market: c.market || '',
      role: c.chain || '지주회사',
      group: c.chain || '',
      mcapWon: c.mcapWon ?? null,
      isListedKorea: true,
    });
  }

  const affiliates = [
    { ticker: '096770', nameKo: 'SK이노베이션', nameEn: 'SK Innovation', parent: '034730' },
    { ticker: '017670', nameKo: 'SK텔레콤', nameEn: 'SK Telecom', parent: '034730' },
    { ticker: '066570', nameKo: 'LG전자', nameEn: 'LG Electronics', parent: '003550' },
    { ticker: '051910', nameKo: 'LG화학', nameEn: 'LG Chem', parent: '003550' },
  ];
  for (const s of affiliates) {
    addNode({
      id: `krx:${s.ticker}`,
      type: 'major_affiliate',
      ticker: s.ticker,
      nameKo: s.nameKo,
      nameEn: s.nameEn,
      market: 'KOSPI',
      role: '주요 계열 상장사',
      group: '계열사',
      isListedKorea: true,
      graphOnly: true,
      panelNoteKo: '그래프 참고 노드 — 기업 목록(KOSPI/KOSDAQ)에는 포함되지 않습니다.',
      panelNoteEn: 'Graph reference node — not in the company list tab.',
    });
    if (nodeIds.has(`krx:${s.parent}`)) {
      edges.push({
        id: `gm-${s.parent}-${s.ticker}`,
        source: `krx:${s.parent}`,
        target: `krx:${s.ticker}`,
        type: 'group_member',
        direction: 'undirected',
        status: 'reference',
        labelKo: '동일 기업집단 소속(FTC)',
        labelEn: 'Same enterprise group (FTC)',
        evidence: [{
          sourceType: 'ftc',
          title: '공정거래위원회 기업집단 지정',
          url: 'https://www.ftc.go.kr/www/selectReport.do?key=211&rptdocCd=100&rptdocSeq=1',
          publishedAt: '2025-01-01',
          accessedAt,
          reviewStatus: 'needs_human_review',
        }],
        confidence: 'medium',
        lastVerifiedAt: accessedAt,
        noteKo: '기업집단 소속 ≠ 지배·지분 관계',
        noteEn: 'Group membership ≠ control or ownership stake',
      });
    }
  }

  if (nodeIds.has('krx:034730') && nodeIds.has('krx:402340')) {
    edges.push({
      id: 'controls-sk-sksquare',
      source: 'krx:034730',
      target: 'krx:402340',
      type: 'controls',
      direction: 'source_to_target',
      status: 'reported',
      labelKo: 'SK스퀘어 지배',
      labelEn: 'Controls SK Square',
      stakePct: null,
      asOf: accessedAt,
      evidence: [{
        sourceType: 'dart',
        title: 'SK Inc. consolidated subsidiaries disclosure',
        url: 'https://dart.fss.or.kr/',
        publishedAt: null,
        accessedAt,
        reviewStatus: 'needs_human_review',
      }],
      confidence: 'medium',
      lastVerifiedAt: accessedAt,
    });
  }

  const gm = html.match(/const globalCompanies = (\[[\s\S]*?\n    \]);/);
  const globals = gm ? Function(`"use strict"; return ${gm[1]}`)() : [];
  for (const g of globals) {
    addNode({
      id: `global:${g.id}`,
      type: 'global_company',
      nameKo: g.name,
      nameEn: g.nameEn || g.name,
      role: g.sector || 'Global holding peer',
      region: g.region || 'us',
      legacyId: g.id,
    });
  }

  const peerSeen = new Set();
  for (const c of companies) {
    for (const p of c.partners || []) {
      const pid = typeof p === 'string' ? p : p.id;
      const key = `${c.ticker}|${pid}`;
      if (peerSeen.has(key)) continue;
      peerSeen.add(key);
      const targetId = `global:${pid}`;
      if (!nodeIds.has(targetId)) continue;
      edges.push({
        id: `peer-${c.ticker}-${pid}`,
        source: `krx:${c.ticker}`,
        target: targetId,
        type: 'peer',
        direction: 'undirected',
        status: 'peer',
        labelKo: '글로벌 지주 peer 비교',
        labelEn: 'Global holding peer comparison',
        evidence: [],
        confidence: 'low',
        lastVerifiedAt: accessedAt,
        defaultHidden: true,
      });
    }
  }

  return { sectorId: 'holdings', model: 'ownership_structure', asOf: accessedAt, nodes, edges };
}

function migrateDefense() {
  const html = fs.readFileSync(join(ROOT, 'defense', 'korea_defense_map.html'), 'utf8');
  const companies = extractCompaniesFromHtml(html);
  const accessedAt = '2026-08-22';
  const nodes = [];
  const edges = [];

  const addNode = (n) => {
    if (nodes.some((x) => x.id === n.id)) return;
    nodes.push(n);
  };

  for (const c of companies) {
    addNode({
      id: `krx:${c.ticker}`,
      type: 'listed_company',
      ticker: c.ticker,
      nameKo: c.name,
      nameEn: c.nameEn || c.name,
      market: c.market || '',
      role: c.chain || '',
      group: c.chain || '',
      mcapWon: c.mcapWon ?? null,
      isListedKorea: true,
      legacyId: c.id,
    });
  }

  addNode({
    id: 'program:kf21',
    type: 'program',
    nameKo: 'KF-21 Boramae',
    nameEn: 'KF-21 Boramae fighter program',
    role: '무기체계',
  });
  addNode({
    id: 'program:k9',
    type: 'program',
    nameKo: 'K9 자주포',
    nameEn: 'K9 Thunder self-propelled howitzer',
    role: '무기체계',
  });
  addNode({
    id: 'program:cheongung_ii',
    type: 'program',
    nameKo: '천궁-II',
    nameEn: 'Cheongung II (KM-SAM)',
    role: '무기체계',
  });

  edges.push({
    id: 'prime-kf21-kai',
    source: 'krx:047810',
    target: 'program:kf21',
    type: 'prime_contractor',
    direction: 'source_to_target',
    status: 'reported',
    labelKo: 'KF-21 체계종합',
    labelEn: 'KF-21 prime contractor',
    evidence: [{
      sourceType: 'official',
      title: 'KAI KF-21 business overview',
      url: 'https://www.koreaaero.com/ENG/Business/KF21.aspx',
      publishedAt: '2024-01-01',
      accessedAt,
      reviewStatus: 'needs_human_review',
    }],
    confidence: 'medium',
    lastVerifiedAt: accessedAt,
  });

  edges.push({
    id: 'prime-k9-rotem',
    source: 'krx:064350',
    target: 'program:k9',
    type: 'prime_contractor',
    direction: 'source_to_target',
    status: 'reported',
    labelKo: 'K9 체계종합',
    labelEn: 'K9 prime contractor',
    evidence: [{
      sourceType: 'official',
      title: 'Hyundai Rotem defense products — K9',
      url: 'https://www.hyundai-rotem.co.kr/Eng/Business/Defense/Product/K9',
      publishedAt: '2024-01-01',
      accessedAt,
      reviewStatus: 'needs_human_review',
    }],
    confidence: 'medium',
    lastVerifiedAt: accessedAt,
  });

  edges.push({
    id: 'sub-cheongung-lig',
    source: 'krx:079550',
    target: 'program:cheongung_ii',
    type: 'subsystem_supplier',
    direction: 'source_to_target',
    status: 'reported',
    labelKo: '천궁-II 하위체계',
    labelEn: 'Cheongung II subsystem',
    evidence: [{
      sourceType: 'official',
      title: 'LIG Nex1 air & missile defense',
      url: 'https://www.lignex1.com/eng/business/air-defense.do',
      publishedAt: '2024-01-01',
      accessedAt,
      reviewStatus: 'needs_human_review',
    }],
    confidence: 'medium',
    lastVerifiedAt: accessedAt,
  });

  return { sectorId: 'defense', model: 'program_ecosystem', asOf: accessedAt, nodes, edges };
}

function migrateBio() {
  const inline = fs.readFileSync(join(ROOT, 'bio', 'korea_bio_map.inline.js'), 'utf8');
  const km = inline.match(/const koreanCompanies = (\[[\s\S]*?\]);/);
  const companies = km ? Function(`"use strict"; return ${km[1]}`)() : [];
  const accessedAt = '2026-08-22';
  const nodes = [];
  const edges = [];

  const addNode = (n) => {
    if (nodes.some((x) => x.id === n.id)) return;
    nodes.push(n);
  };

  for (const c of companies) {
    if (!c.ticker || c.ticker === 'UNLISTED') continue;
    addNode({
      id: `krx:${c.ticker}`,
      type: 'listed_company',
      ticker: c.ticker,
      nameKo: c.name,
      nameEn: c.nameEn || c.name,
      market: c.market || '',
      role: c.chain || '',
      group: c.sectorId || c.chain || '',
      mcapWon: c.mcapWon ?? null,
      isListedKorea: true,
      legacyId: c.id,
    });
  }

  addNode({
    id: 'global:gsk',
    type: 'global_company',
    nameKo: 'GSK plc',
    nameEn: 'GSK plc',
    role: 'Global pharma',
    region: 'gb',
  });

  if (nodes.some((n) => n.id === 'krx:302440')) {
    edges.push({
      id: 'bio-sk-gsk-covid19',
      source: 'krx:302440',
      target: 'global:gsk',
      type: 'co_develops',
      direction: 'source_to_target',
      status: 'reported',
      labelKo: '코로나19 백신 위탁생산·기술협력',
      labelEn: 'COVID-19 vaccine manufacturing collaboration',
      agreementDate: '2021-07-01',
      agreementStatus: 'active',
      territory: 'Global',
      evidence: [{
        sourceType: 'official',
        title: 'SK bioscience and GSK COVID-19 vaccine collaboration (company IR)',
        url: 'https://www.skbioscience.co.kr/en/pr/press',
        publishedAt: '2021-07-01',
        accessedAt,
        reviewStatus: 'needs_human_review',
      }],
      confidence: 'medium',
      lastVerifiedAt: accessedAt,
      noteKo: '계약 총액·마일스톤은 잠재가치이며 확정 매출이 아닙니다.',
      noteEn: 'Contract milestones are potential value, not recognized revenue.',
    });
  }

  return { sectorId: 'bio', model: 'pipeline_licensing', asOf: accessedAt, nodes, edges };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = {
    semiconductor: migrateSemiRelations(),
    holdings: migrateHoldings(),
    defense: migrateDefense(),
    bio: migrateBio(),
  };

  let exitCode = 0;
  for (const [name, network] of Object.entries(files)) {
    const fp = join(OUT, `${name}.json`);
    fs.writeFileSync(fp, JSON.stringify(network, null, 2) + '\n', 'utf8');
    const report = validateNetworkReport(network);
    console.log(`\n${name}:`);
    console.log(JSON.stringify(report.summary, null, 2));
    if (report.failures.length) {
      report.failures.slice(0, 10).forEach((f) => console.log('  FAIL:', f));
      exitCode = 1;
    }
    report.warnings.slice(0, 8).forEach((w) => console.log('  WARN:', w));
  }
  console.log('\nOK migrate_network_data');
  process.exit(exitCode);
}

main();
