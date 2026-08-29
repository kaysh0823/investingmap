/**
 * Canonical entity ID rules — Phase 2.7
 * krx:{ticker} | kr:{slug} | global:{slug} | anchor:{ticker} | program:{slug} ...
 */
export const DOMESTIC_ANCHOR_TICKERS = {
  '005930': {
    nameKo: '삼성전자',
    nameEn: 'Samsung Electronics',
    market: 'KOSPI',
    legacySlugs: ['samsung_d', 'samsung_electronics'],
    legacyGlobalIds: ['global:samsung_d'],
    bigchipPath: '../bigchip/korea_bigchip_map.html?tab=graph&ticker=005930',
    panelNoteKo: '반도체 지도 기업 목록에는 없는 국내 앵커(IDM). 상세·시세는 삼성전자/하이닉스 지도 참고.',
    panelNoteEn: 'Domestic anchor (IDM) — not in this sector table. See chip leaders map for quotes.',
  },
  '000660': {
    nameKo: 'SK하이닉스',
    nameEn: 'SK hynix',
    market: 'KOSPI',
    legacySlugs: ['skhynix_d', 'sk_hynix'],
    legacyGlobalIds: ['global:skhynix_d'],
    bigchipPath: '../bigchip/korea_bigchip_map.html?tab=graph&ticker=000660',
    panelNoteKo: '반도체 지도 기업 목록에는 없는 국내 앵커(IDM). 상세·시세는 삼성전자/하이닉스 지도 참고.',
    panelNoteEn: 'Domestic anchor (IDM) — not in this sector table. See chip leaders map for quotes.',
  },
};

/** @param {string} name */
export function normalizeNameKey(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\(주\)|co\.?,?\s*ltd\.?|inc\.?|corp\.?|plc\.?/gi, '')
    .replace(/[^a-z0-9가-힣]+/g, '')
    .trim();
}

/**
 * Build id remap for semiconductor domestic anchors mislabeled as global.
 * @returns {Map<string,string>}
 */
export function buildSemiconductorAnchorRemap() {
  const map = new Map();
  for (const [ticker, meta] of Object.entries(DOMESTIC_ANCHOR_TICKERS)) {
    const canonical = `anchor:${ticker}`;
    for (const gid of meta.legacyGlobalIds) map.set(gid, canonical);
  }
  return map;
}

/**
 * @param {object} node
 * @param {string} canonicalId
 * @param {object} meta
 */
export function toDomesticAnchorNode(node, canonicalId, meta) {
  const ticker = canonicalId.replace(/^anchor:/, '');
  return {
    ...node,
    id: canonicalId,
    type: 'domestic_anchor',
    ticker,
    nameKo: meta.nameKo || node.nameKo,
    nameEn: meta.nameEn || node.nameEn,
    market: meta.market || 'KOSPI',
    region: 'kr',
    isListedKorea: true,
    isDomesticAnchor: true,
    excludeFromGlobalCount: true,
    graphOnly: true,
    bigchipPath: meta.bigchipPath,
    panelNoteKo: meta.panelNoteKo,
    panelNoteEn: meta.panelNoteEn,
    aliases: [...new Set([...(node.aliases || []), ...(meta.legacyGlobalIds || []), ...(meta.legacySlugs || [])])],
    role: node.role || 'IDM/앵커',
  };
}

/**
 * Normalize network nodes/edges in place.
 * @param {object} network
 * @param {{ sectorId?: string }} opts
 * @returns {{ remap: Map<string,string>, removed: string[], merged: string[] }}
 */
export function normalizeNetworkEntities(network, opts = {}) {
  const sector = network.sectorId || opts.sectorId || '';
  const remap = new Map();
  const removed = [];
  const merged = [];

  if (sector === 'semiconductor') {
    for (const [oldId, newId] of buildSemiconductorAnchorRemap()) {
      remap.set(oldId, newId);
    }
    for (const [ticker] of Object.entries(DOMESTIC_ANCHOR_TICKERS)) {
      remap.set(`krx:${ticker}`, `anchor:${ticker}`);
    }
  }

  // Nuclear / cross-sector: KEPCO listed canonical
  remap.set('public:kepco', 'krx:015760');
  remap.set('operator:khnp', 'kr:khnp');

  const nodes = network.nodes || [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Merge duplicate tickers on listed + anchor
  const tickerOwners = new Map();
  for (const n of nodes) {
    if (!n.ticker) continue;
    const t = String(n.ticker);
    if (!tickerOwners.has(t)) tickerOwners.set(t, []);
    tickerOwners.get(t).push(n.id);
  }
  for (const [ticker, ids] of tickerOwners) {
    if (ids.length < 2) continue;
    const listed = ids.find((id) => nodeById.get(id)?.type === 'listed_company' || id.startsWith('krx:'));
    const anchor = ids.find((id) => nodeById.get(id)?.type === 'domestic_anchor' || id.startsWith('anchor:'));
    if (listed && anchor) {
      if (DOMESTIC_ANCHOR_TICKERS[ticker]) {
        remap.set(listed, anchor);
        removed.push(listed);
      } else {
        remap.set(anchor, listed);
        removed.push(anchor);
      }
    }
  }

  // Transform anchor globals
  const newNodes = [];
  for (const n of nodes) {
    const targetId = remap.get(n.id);
    if (targetId && targetId !== n.id && removed.includes(n.id)) continue;

    if (sector === 'semiconductor') {
      const anchorEntry = Object.entries(DOMESTIC_ANCHOR_TICKERS).find(([ticker, meta]) =>
        n.id === `anchor:${ticker}` || n.id === `krx:${ticker}` || meta.legacyGlobalIds.includes(n.id));
      if (anchorEntry) {
        const [ticker, meta] = anchorEntry;
        const canonical = `anchor:${ticker}`;
        if (n.id !== canonical) {
          merged.push(`${n.id} → ${canonical}`);
          remap.set(n.id, canonical);
        }
        newNodes.push(toDomesticAnchorNode(n, canonical, meta));
        continue;
      }
    }

    if (n.type === 'global_company' && n.ticker && /^[0-9A-Z]{6}$/.test(String(n.ticker))) {
      merged.push(`${n.id} → krx:${n.ticker} (KR ticker on global_company)`);
      const fixed = { ...n, id: `krx:${n.ticker}`, type: 'listed_company', isListedKorea: true };
      remap.set(n.id, fixed.id);
      newNodes.push(fixed);
      continue;
    }

    const aliases = [...new Set([...(n.aliases || []), ...(remap.has(n.id) ? [] : [])])];
    newNodes.push(aliases.length ? { ...n, aliases } : n);
  }

  // Remap edges
  for (const e of network.edges || []) {
    if (remap.has(e.source)) e.source = remap.get(e.source);
    if (remap.has(e.target)) e.target = remap.get(e.target);
    if (e.source === e.target) e._invalidSelfLoop = true;
  }

  network.nodes = newNodes.filter((n) => !removed.includes(n.id));
  const deduped = [];
  const seenIds = new Set();
  for (const n of network.nodes) {
    if (seenIds.has(n.id)) continue;
    seenIds.add(n.id);
    deduped.push(n);
  }
  network.nodes = deduped;
  network.edges = (network.edges || []).filter((e) => !e._invalidSelfLoop);

  return { remap, removed, merged };
}

/**
 * Validation helpers for entity audit
 * @param {object} network
 */
export function auditEntityIssues(network) {
  const issues = [];
  const nodes = network.nodes || [];
  const nameKeys = new Map();
  const tickers = new Map();

  for (const n of nodes) {
    if (n.type === 'global_company' && n.ticker && /^[0-9A-Z]{6}$/.test(String(n.ticker))) {
      issues.push({ kind: 'kr_ticker_on_global', nodeId: n.id, ticker: n.ticker });
    }
    if (n.ticker) {
      const t = String(n.ticker);
      if (!tickers.has(t)) tickers.set(t, []);
      tickers.get(t).push(n.id);
    }
    const nk = normalizeNameKey(n.nameKo || n.nameEn);
    if (nk) {
      if (!nameKeys.has(nk)) nameKeys.set(nk, []);
      nameKeys.get(nk).push(n.id);
    }
    for (const a of n.aliases || []) {
      if (nodes.some((x) => x.id === a)) {
        issues.push({ kind: 'alias_canonical_collision', nodeId: n.id, alias: a });
      }
    }
  }

  for (const [t, ids] of tickers) {
    if (ids.length > 1) issues.push({ kind: 'duplicate_ticker', ticker: t, nodeIds: ids });
  }
  for (const [k, ids] of nameKeys) {
    if (ids.length > 1 && ids.every((id) => !id.startsWith('group:'))) {
      issues.push({ kind: 'duplicate_name', nameKey: k, nodeIds: ids });
    }
  }

  for (const e of network.edges || []) {
    const src = nodes.find((n) => n.id === e.source);
    const tgt = nodes.find((n) => n.id === e.target);
    if (!src) issues.push({ kind: 'dangling_edge_source', edgeId: e.id, source: e.source });
    if (!tgt) issues.push({ kind: 'dangling_edge_target', edgeId: e.id, target: e.target });
  }

  return issues;
}
