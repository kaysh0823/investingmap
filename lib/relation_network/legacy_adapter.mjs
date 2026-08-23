/**
 * Convert legacy koreanCompanies[].partners + globalCompanies into structured graph.
 * Used when no data/networks/{sector}.json exists.
 */
import { LEGACY_KIND_MAP, allowedEdgeTypes, isUndirectedEdgeType } from './schema.mjs';

function partnerRef(p) {
  if (typeof p === 'string') return { id: p };
  return p;
}

/**
 * @param {object} opts
 * @param {string} opts.sectorId
 * @param {object[]} opts.koreanCompanies
 * @param {object[]} opts.globalCompanies
 * @param {Record<string,string>} [opts.chainColors]
 * @returns {object}
 */
export function legacyPartnersToNetwork({ sectorId, koreanCompanies, globalCompanies, chainColors = {} }) {
  const asOf = new Date().toISOString().slice(0, 10);
  const nodes = [];
  const nodeIds = new Set();
  const edges = [];
  const edgeKeys = new Set();

  const addNode = (node) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  for (const c of koreanCompanies) {
    addNode({
      id: c.ticker ? `krx:${c.ticker}` : c.id,
      type: 'listed_company',
      ticker: c.ticker || '',
      nameKo: c.name,
      nameEn: c.nameEn || c.name,
      market: c.market || '',
      role: c.semType || c.chain || '',
      group: c.chain || '',
      mcapWon: c.mcapWon ?? null,
      isListedKorea: true,
      legacyId: c.id,
    });
  }

  const globalById = new Map(globalCompanies.map((g) => [g.id, g]));

  for (const c of koreanCompanies) {
    const sourceId = c.ticker ? `krx:${c.ticker}` : c.id;
    for (const p of c.partners || []) {
      const pr = partnerRef(p);
      const gid = pr.id;
      const g = globalById.get(gid);
      if (g) {
        addNode({
          id: `global:${gid}`,
          type: 'global_company',
          nameKo: g.name,
          nameEn: g.nameEn || g.name,
          role: g.sector || '',
          region: g.region || '',
          isListedKorea: !!(g.ticker && g.countryCode === 'KR'),
          ticker: g.ticker || '',
          legacyId: gid,
        });
      } else if (gid.startsWith('prog_') || gid.startsWith('exp_') || gid.startsWith('project_')) {
        addNode({
          id: `program:${gid}`,
          type: 'program',
          nameKo: pr.edgeLabel || gid,
          nameEn: pr.edgeLabelEn || pr.edgeLabel || gid,
          legacyId: gid,
        });
      }

      let targetId;
      if (g?.ticker && (g.countryCode === 'KR' || g.isKR)) {
        targetId = `krx:${g.ticker}`;
      } else if (gid.startsWith('prog_') || gid.startsWith('exp_') || gid.startsWith('project_')) {
        targetId = `program:${gid}`;
      } else {
        targetId = `global:${gid}`;
      }

      const legacyKind = pr.kind || 'peer';
      const edgeType = LEGACY_KIND_MAP[legacyKind] || 'peer';
      const allowed = allowedEdgeTypes(sectorId);
      const type = allowed.includes(edgeType) ? edgeType : 'peer';
      const status = legacyKind === 'export' || legacyKind === 'theme' ? 'reference' : 'inferred';
      const key = `${sourceId}|${targetId}|${type}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);

      edges.push({
        id: `legacy-${edgeKeys.size}`,
        source: sourceId,
        target: targetId,
        type,
        direction: isUndirectedEdgeType(type) ? 'undirected' : 'source_to_target',
        status,
        labelKo: pr.edgeLabel || '',
        labelEn: pr.edgeLabelEn || '',
        evidence: [],
        confidence: status === 'reference' ? 'low' : 'medium',
        lastVerifiedAt: asOf,
        noteKo: status === 'reference' ? '레거시 참고 관계(출처 미확인)' : '레거시 partners 폴백',
        noteEn: status === 'reference' ? 'Legacy reference link (unverified)' : 'Legacy partners fallback',
        _legacy: true,
      });
    }
  }

  // Auto peer chain edges (marked reference — same as old graph behavior)
  const byChain = new Map();
  for (const c of koreanCompanies) {
    const ch = c.chain || '_';
    if (!byChain.has(ch)) byChain.set(ch, []);
    byChain.get(ch).push(c);
  }
  for (const [, arr] of byChain) {
    const sorted = [...arr].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const sourceId = a.ticker ? `krx:${a.ticker}` : a.id;
      const targetId = b.ticker ? `krx:${b.ticker}` : b.id;
      const key = `${sourceId}|${targetId}|peer`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        id: `legacy-peer-${edgeKeys.size}`,
        source: sourceId,
        target: targetId,
        type: 'peer',
        direction: 'undirected',
        status: 'reference',
        labelKo: '동일 밸류체인 내 참고 peer',
        labelEn: 'Reference peer within value chain',
        evidence: [],
        confidence: 'low',
        lastVerifiedAt: asOf,
        noteKo: '시가총액 순 연결(레거시 렌더러 동작)',
        noteEn: 'Mcap-sorted chain peer (legacy renderer behavior)',
        _legacyPeerChain: true,
      });
    }
  }

  return {
    sectorId,
    model: 'legacy_fallback',
    asOf,
    _legacyFallback: true,
    nodes,
    edges,
  };
}
