/**
 * Browser legacy adapter — mirrors lib/relation_network/legacy_adapter.mjs
 */
(function (global) {
  'use strict';

  var LEGACY_KIND_MAP = {
    supplier: 'supplies_to',
    customer: 'customer_of',
    peer: 'peer',
    member: 'member_of',
    backing: 'equity_investment',
    theme: 'end_market_exposure',
    export: 'export_contract',
  };

  function partnerRef(p) {
    if (typeof p === 'string') return { id: p };
    return p;
  }

  function toNetwork(ctx) {
    var sectorId = ctx.sectorId || 'unknown';
    var koreanCompanies = ctx.koreanCompanies || [];
    var globalCompanies = ctx.globalCompanies || [];
    var asOf = new Date().toISOString().slice(0, 10);
    var nodes = [];
    var nodeIds = {};
    var edges = [];
    var edgeKeys = {};

    function addNode(n) {
      if (nodeIds[n.id]) return;
      nodeIds[n.id] = 1;
      nodes.push(n);
    }

    koreanCompanies.forEach(function (c) {
      addNode({
        id: c.ticker ? 'krx:' + c.ticker : c.id,
        type: 'listed_company',
        ticker: c.ticker || '',
        nameKo: c.name,
        nameEn: c.nameEn || c.name,
        market: c.market || '',
        role: c.semType || c.chain || '',
        group: c.chain || '',
        mcapWon: c.mcapWon != null ? c.mcapWon : null,
        isListedKorea: true,
        legacyId: c.id,
      });
    });

    var globalById = {};
    globalCompanies.forEach(function (g) { globalById[g.id] = g; });

    koreanCompanies.forEach(function (c) {
      var sourceId = c.ticker ? 'krx:' + c.ticker : c.id;
      (c.partners || []).forEach(function (p) {
        var pr = partnerRef(p);
        var gid = pr.id;
        var g = globalById[gid];
        if (g) {
          addNode({
            id: 'global:' + gid,
            type: 'global_company',
            nameKo: g.name,
            nameEn: g.nameEn || g.name,
            role: g.sector || '',
            region: g.region || '',
            isListedKorea: !!(g.ticker && g.countryCode === 'KR'),
            ticker: g.ticker || '',
            legacyId: gid,
          });
        } else if (gid.indexOf('prog_') === 0 || gid.indexOf('exp_') === 0) {
          addNode({
            id: 'program:' + gid,
            type: 'program',
            nameKo: pr.edgeLabel || gid,
            nameEn: pr.edgeLabelEn || pr.edgeLabel || gid,
            legacyId: gid,
          });
        }
        var targetId = g && g.ticker && (g.countryCode === 'KR' || g.isKR) ? 'krx:' + g.ticker
          : (gid.indexOf('prog_') === 0 || gid.indexOf('exp_') === 0) ? 'program:' + gid
          : 'global:' + gid;
        var legacyKind = pr.kind || 'peer';
        var edgeType = LEGACY_KIND_MAP[legacyKind] || 'peer';
        var key = sourceId + '|' + targetId + '|' + edgeType;
        if (edgeKeys[key]) return;
        edgeKeys[key] = 1;
        var status = legacyKind === 'export' || legacyKind === 'theme' ? 'reference' : 'inferred';
        edges.push({
          id: 'legacy-' + edges.length,
          source: sourceId,
          target: targetId,
          type: edgeType,
          direction: edgeType === 'peer' ? 'undirected' : 'source_to_target',
          status: status,
          labelKo: pr.edgeLabel || '',
          labelEn: pr.edgeLabelEn || '',
          evidence: [],
          confidence: status === 'reference' ? 'low' : 'medium',
          lastVerifiedAt: asOf,
          noteKo: '레거시 partners 폴백',
          noteEn: 'Legacy partners fallback',
          _legacy: true,
        });
      });
    });

    return {
      sectorId: sectorId,
      model: 'legacy_fallback',
      asOf: asOf,
      _legacyFallback: true,
      nodes: nodes,
      edges: edges,
    };
  }

  global.RelationNetworkLegacyAdapter = { toNetwork: toNetwork };
})(typeof window !== 'undefined' ? window : globalThis);
