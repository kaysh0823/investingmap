/**
 * Investing Map — unified relation network renderer (graph tab only).
 * Lazy-init on first graph tab open; supports structured JSON + legacy partners fallback.
 */
(function (global) {
  'use strict';

  var RN_WIP = true; // 관계망 개발중. 준비되면 false로.

  var PEER_TYPES = { peer: 1, consortium_member: 1, joint_development: 1, competes_with: 1 };
  var STATE = null;
  var POPSTATE_INSTALLED = false;
  var LOAD_GEN = 0;
  var DIAG = { initCount: 0, renderCount: 0, popstateCount: 0, resizeObsCount: 0 };
  var ANCHOR_SAMSUNG = 'krx:005930';
  var ANCHOR_HYNIX = 'krx:000660';
  var STRUCT_NODE = {
    product_category: 1, technology: 1, equipment_category: 1,
    material_category: 1, end_market: 1, grid_stage: 1, region: 1, group: 1,
    lifecycle_stage: 1, reactor_technology: 1, smr_technology: 1,
    nuclear_project: 1, plant_unit: 1, country: 1, consortium: 1,
    ecosystem: 1, project_stage: 1, renewable_project: 1, project_spv: 1, contract: 1,
    project_portfolio: 1, supply_contract: 1, product: 1, development_pipeline: 1, offtaker: 1,
    brand: 1, artist_or_group: 1, creator: 1, content_ip: 1, franchise_ip: 1,
    studio: 1, label: 1, agency: 1, platform: 1, streaming_service: 1,
    device_category: 1, clinical_specialty: 1, medical_device: 1,
    regulatory_clearance: 1, indication: 1, software_medical_device: 1,
    software_product: 1, software_category: 1, cloud_service: 1,
    customer_industry: 1, telecom_service: 1, network_equipment: 1,
    network_component: 1, network_generation: 1, spectrum_band: 1,
  };

  function isDiagMode() {
    try {
      return global.location && (global.location.hostname === 'localhost' || global.location.search.indexOf('rn_diag=1') >= 0);
    } catch (e) { return false; }
  }

  function diagLog(msg, extra) {
    if (!isDiagMode()) return;
    console.info('[RelationNetwork:diag]', msg, extra || '');
  }

  function $(id) { return document.getElementById(id); }

  function renderWipPlaceholder(lang) {
    var panel = document.getElementById('tab-graph');
    if (!panel) return;
    var ko = (lang !== 'en');
    panel.innerHTML =
      '<div class="rn-wip" style="display:flex;align-items:center;justify-content:center;'
      + 'min-height:320px;padding:48px 24px;text-align:center;color:#8b949e;'
      + 'font-size:15px;line-height:1.6;">'
      + (ko ? '🌐 관계 네트워크는 현재 <b>수정 중</b>입니다.<br>더 정확한 밸류체인·거래 관계로 곧 다시 제공할 예정입니다.'
            : '🌐 The relationship network is <b>under revision</b>.<br>It will return shortly with more accurate value-chain data.')
      + '</div>';
  }

  var WORKSPACE_LAYOUT_READY = false;

  function filterSidebarLabel(lang) {
    return lang === 'en' ? 'Relation network filters' : '관계 네트워크 필터';
  }

  function legendHelpLabel(lang) {
    return lang === 'en' ? 'Legend & help' : '범례·도움말';
  }

  function filterDrawerLabel(lang) {
    return lang === 'en' ? 'Filters' : '필터';
  }

  function moveNode(parent, node, before) {
    if (!parent || !node || node.parentNode === parent) return;
    if (before && before.parentNode === parent) parent.insertBefore(node, before);
    else parent.appendChild(node);
  }

  function setupWorkspaceLayout(state) {
    var container = document.querySelector('#tab-graph .graph-container');
    var graphMain = container && container.querySelector('.graph-main');
    if (!container || !graphMain) return;

    container.classList.add('rn-workspace');
    var legacySidebar = container.querySelector('.graph-sidebar');
    if (legacySidebar) legacySidebar.remove();

    var filterSidebar = $('rn-filter-sidebar');
    if (!filterSidebar) {
      filterSidebar = document.createElement('aside');
      filterSidebar.id = 'rn-filter-sidebar';
      filterSidebar.className = 'rn-filter-sidebar';
      filterSidebar.setAttribute('aria-label', filterSidebarLabel(state.lang));
      var content = document.createElement('div');
      content.id = 'rn-filter-content';
      content.className = 'rn-filter-content';
      filterSidebar.appendChild(content);
      container.insertBefore(filterSidebar, graphMain);
    } else {
      filterSidebar.setAttribute('aria-label', filterSidebarLabel(state.lang));
    }

    var filterContent = $('rn-filter-content');
    var toolbar = document.querySelector('.rn-toolbar');
    if (toolbar && filterContent) moveNode(filterContent, toolbar, filterContent.firstChild);

    var legend = $('rn-legend');
    var legendHelp = $('rn-legend-help');
    if (!legendHelp && filterContent) {
      legendHelp = document.createElement('details');
      legendHelp.id = 'rn-legend-help';
      legendHelp.className = 'rn-legend-help';
      var summary = document.createElement('summary');
      summary.className = 'rn-legend-help-summary';
      summary.textContent = legendHelpLabel(state.lang);
      legendHelp.appendChild(summary);
      if (legend) legendHelp.appendChild(legend);
      var staticEl = document.createElement('div');
      staticEl.id = 'rn-legend-static';
      staticEl.className = 'rn-legend-static';
      legendHelp.appendChild(staticEl);
      filterContent.appendChild(legendHelp);
    } else if (legendHelp) {
      var sum = legendHelp.querySelector('.rn-legend-help-summary');
      if (sum) sum.textContent = legendHelpLabel(state.lang);
      if (legend && !legendHelp.contains(legend)) {
        var staticRef = $('rn-legend-static');
        legendHelp.insertBefore(legend, staticRef || null);
      }
    }

    graphMain.classList.add('rn-graph-main');
    var graphHeader = graphMain.querySelector('.rn-graph-header');
    if (!graphHeader) {
      graphHeader = document.createElement('div');
      graphHeader.className = 'rn-graph-header';
      graphMain.insertBefore(graphHeader, graphMain.firstChild);
    }
    ['rn-sticky-bar', 'rn-model-desc', 'rn-sparse-notice'].forEach(function (id) {
      var el = $(id);
      if (el) moveNode(graphHeader, el, null);
    });

    var drawerToggle = $('rn-filter-drawer-toggle');
    if (!drawerToggle) {
      drawerToggle = document.createElement('button');
      drawerToggle.type = 'button';
      drawerToggle.id = 'rn-filter-drawer-toggle';
      drawerToggle.className = 'rn-filter-drawer-toggle';
      drawerToggle.setAttribute('aria-expanded', 'false');
      drawerToggle.setAttribute('aria-controls', 'rn-filter-sidebar');
      graphHeader.insertBefore(drawerToggle, graphHeader.firstChild);
    }
    drawerToggle.textContent = filterDrawerLabel(state.lang);

    var graphCanvas = graphMain.querySelector('.rn-graph-canvas');
    if (!graphCanvas) {
      graphCanvas = document.createElement('div');
      graphCanvas.className = 'rn-graph-canvas';
      graphMain.appendChild(graphCanvas);
    }
    ['rn-a11y-list', 'rn-detail-panel', 'graph-svg', 'graph-tooltip', 'graph-hint-text', 'graph-hint'].forEach(function (id) {
      var el = $(id) || document.getElementById(id);
      if (!el && id === 'graph-hint') el = document.querySelector('.graph-hint');
      if (el) moveNode(graphCanvas, el, null);
    });
    var graphControls = graphMain.querySelector('.graph-controls');
    if (graphControls) moveNode(graphCanvas, graphControls, null);

    setupMobileFilterDrawer(state);
    WORKSPACE_LAYOUT_READY = true;
  }

  function setupMobileFilterDrawer(state) {
    var sidebar = $('rn-filter-sidebar');
    var toggle = $('rn-filter-drawer-toggle');
    if (!sidebar || !toggle) return;

    var backdrop = $('rn-filter-drawer-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'rn-filter-drawer-backdrop';
      backdrop.className = 'rn-filter-drawer-backdrop';
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }

    function closeDrawer() {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      backdrop.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    function openDrawer() {
      var detail = $('rn-detail-panel');
      if (detail && !detail.hidden) {
        detail.hidden = true;
        detail.setAttribute('aria-hidden', 'true');
      }
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-open');
      backdrop.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      var search = $('rn-search');
      if (search) search.focus();
    }

    if (!state._drawerWired) {
      state._drawerWired = true;
      toggle.addEventListener('click', function () {
        if (sidebar.classList.contains('is-open')) closeDrawer();
        else openDrawer();
      });
      backdrop.addEventListener('click', closeDrawer);
      if (!state._drawerEscWired) {
        state._drawerEscWired = true;
        document.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Escape') return;
          if (sidebar.classList.contains('is-open')) {
            closeDrawer();
            toggle.focus();
          }
        });
      }
    }

    if (global.matchMedia && global.matchMedia('(min-width: 768px)').matches) {
      closeDrawer();
    }
  }

  function collectUsedNodeTypes(state) {
    var types = {};
    (state.nodes || []).forEach(function (n) {
      if (n && n.type) types[n.type] = (types[n.type] || 0) + 1;
    });
    return Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }).slice(0, 12);
  }

  function buildStaticLegendHelp(state) {
    var el = $('rn-legend-static');
    if (!el) return;
    var lang = state.lang;
    var types = collectUsedNodeTypes(state);
    var typeLabels = lang === 'en'
      ? { listed_company: 'Listed company', global_company: 'Global peer', brand: 'Brand', product: 'Product', nuclear_project: 'Project', renewable_project: 'Project', contract: 'Contract' }
      : { listed_company: '상장사', global_company: '글로벌 peer', brand: '브랜드', product: '제품', nuclear_project: '프로젝트', renewable_project: '프로젝트', contract: '계약' };
    var typeHtml = types.length
      ? types.map(function (t) {
        return '<li>' + (typeLabels[t] || t) + '</li>';
      }).join('')
      : '';
    var controls = lang === 'en'
      ? 'Drag to pan · scroll to zoom · click a node for details · use filters in this sidebar'
      : '드래그로 이동 · 스크롤로 확대/축소 · 노드 클릭 시 상세 · 이 사이드바에서 필터 조정';
    var labelPolicy = lang === 'en'
      ? 'Listed names are shown first. Reference/global labels may hide when the view is dense; hover or select a node to see full names and direct relations. Zoom in to reveal more labels. Fit-all may shrink text.'
      : '종목명은 우선 표시됩니다. 화면이 복잡하면 참고·글로벌 노드 이름은 생략됩니다. 마우스를 올리거나 선택하면 전체 이름과 직접 관계가 표시됩니다. 확대하면 더 많은 라벨을 볼 수 있습니다. 전체 맞춤에서는 글자가 작아질 수 있습니다.';
    var nodeSize = lang === 'en'
      ? 'Node size reflects market cap (listed) or editorial weight where applicable.'
      : '노드 크기는 시가총액(상장사) 또는 편집 가중치를 반영합니다.';
    el.innerHTML =
      (typeHtml ? '<p><strong>' + (lang === 'en' ? 'Node types in this map' : '이 지도의 노드 유형') + '</strong></p><ul>' + typeHtml + '</ul>' : '') +
      '<p><strong>' + (lang === 'en' ? 'Labels' : '라벨 표시') + '</strong><br>' + labelPolicy + '</p>' +
      '<p><strong>' + (lang === 'en' ? 'Node size' : '노드 크기') + '</strong><br>' + nodeSize + '</p>' +
      '<p><strong>' + (lang === 'en' ? 'Controls' : '조작') + '</strong><br>' + controls + '</p>';
  }

  function layoutObserveTarget(state) {
    var canvas = document.querySelector('.rn-graph-canvas');
    return canvas || (state.container && state.container.parentElement) || state.container;
  }

  function prependToToolbar(toolbar, wrap) {
    if (!toolbar || !wrap || toolbar.contains(wrap)) return;
    var ref = toolbar.firstChild;
    if (ref && ref.parentNode === toolbar) toolbar.insertBefore(wrap, ref);
    else toolbar.appendChild(wrap);
  }

  function defaultViewFilters(profile) {
    var vf = (profile && profile.defaultViewFilters) || {};
    var hidePeerDefault = !!(profile && (
      profile.sectorId === 'semiconductor' || profile.sectorId === 'holdings' ||
      profile.sectorId === 'bio' || profile.sectorId === 'defense' ||
      profile.sectorId === 'bigchip' || profile.sectorId === 'battery' || profile.sectorId === 'ship' ||
      profile.sectorId === 'powergrid' || profile.sectorId === 'nuclear' || profile.sectorId === 'renewable'
    ));
    return {
      hidePeer: vf.hidePeer !== undefined ? !!vf.hidePeer : hidePeerDefault,
      hideInferred: vf.hideInferred !== undefined ? !!vf.hideInferred : (profile && (profile.sectorId === 'nuclear' || profile.sectorId === 'renewable')),
      hideReference: !!vf.hideReference,
      transactionalOnly: !!vf.transactionalOnly,
      confirmedOnly: false,
      hideGlobal: false,
      hideProgram: false,
      relationType: '',
      showHidden: false,
      showEnded: !!vf.showEnded,
      bigchipScope: 'all',
      batteryStage: 'all',
      shipRole: 'all',
      powergridFilter: 'all',
      financeRole: 'all',
      nuclearScope: 'all',
      nuclearRole: 'all',
      renewableTech: 'all',
      renewableRole: 'all',
      renewableStatus: 'all',
      constructionRole: 'all',
      constructionStatus: 'all',
      vesselType: '',
      projectStatus: '',
      projectId: '',
      reactor: '',
      groupId: '',
      showCompleted: false,
      showHistorical: !!vf.showHistorical,
    };
  }

  function t(key, lang, T) {
    var block = T && T[lang];
    return (block && block[key]) || key;
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function nodeLabel(n, lang) {
    return lang === 'en' ? (n.nameEn || n.nameKo || n.label) : (n.nameKo || n.nameEn || n.label);
  }

  function edgeLabel(e, lang) {
    return lang === 'en' ? (e.labelEn || e.labelKo || e.type) : (e.labelKo || e.labelEn || e.type);
  }

  function statusLabel(status, lang) {
    var ko = {
      confirmed: '공식 원문 확인',
      reported: '공식자료에서 언급',
      inferred: '추가 검토 필요',
      reference: '산업 참고 연결',
      peer: '동종기업 비교',
      ended: '종료된 관계',
    };
    var en = {
      confirmed: 'Verified from primary source',
      reported: 'Mentioned in official materials',
      inferred: 'Needs further review',
      reference: 'Reference relationship',
      peer: 'Peer comparison',
      ended: 'Ended relationship',
    };
    var m = lang === 'en' ? en : ko;
    return m[status] || status;
  }

  function contractLifecycleLabel(status, lang) {
    var ko = {
      letter_of_award: '낙찰통지(LOA)',
      announced: '공시·발표',
      effective: '진행 중',
      in_delivery: '납품 진행',
      completed: '완료',
      cancelled: '취소',
      terminated: '해지',
      unknown: '상태 확인 필요',
    };
    var en = {
      letter_of_award: 'Letter of Award',
      announced: 'Announced',
      effective: 'In force',
      in_delivery: 'In delivery',
      completed: 'Completed',
      cancelled: 'Cancelled',
      terminated: 'Terminated',
      unknown: 'Status needs review',
    };
    var m = lang === 'en' ? en : ko;
    return m[status] || status;
  }

  function projectStatusLabel(status, lang) {
    var ko = {
      proposed: '제안',
      memorandum: 'MOU',
      feasibility_study: '타당성 조사',
      preferred_bidder: '우선협상',
      selected_bidder: '사업자 선정',
      negotiation: '협상',
      contract_signed: '계약 체결',
      design: '설계',
      licensing: '인허가',
      under_construction: '건설 중',
      commissioning: '시운전',
      operating: '운영 중',
      completed: '완료',
      suspended: '중단',
      cancelled: '취소',
      decommissioning: '해체',
      unknown: '확인 필요',
    };
    var en = {
      proposed: 'Proposed',
      memorandum: 'MOU',
      feasibility_study: 'Feasibility study',
      preferred_bidder: 'Preferred bidder',
      selected_bidder: 'Selected bidder',
      negotiation: 'Negotiation',
      contract_signed: 'Contract signed',
      design: 'Design',
      licensing: 'Licensing',
      under_construction: 'Under construction',
      commissioning: 'Commissioning',
      operating: 'Operating',
      completed: 'Completed',
      suspended: 'Suspended',
      cancelled: 'Cancelled',
      decommissioning: 'Decommissioning',
      unknown: 'Unknown',
    };
    var m = lang === 'en' ? en : ko;
    return m[status] || status;
  }

  function counterpartyStatusLabel(status, lang) {
    var ko = {
      exact: '실명 공개',
      anonymous: '상대방 비공개',
      intermediary_disclosed: '중간 계약 법인만 공개',
      partially_disclosed: '일부 정보만 공개',
      needs_review: '상대방 확인 필요',
    };
    var en = {
      exact: 'Named exactly',
      anonymous: 'Counterparty undisclosed',
      intermediary_disclosed: 'Intermediary only disclosed',
      partially_disclosed: 'Partially disclosed',
      needs_review: 'Counterparty needs review',
    };
    var m = lang === 'en' ? en : ko;
    return m[status] || status;
  }

  function nodeRadius(n) {
    if (n.type === 'program' || n.type === 'pipeline' || n.type === 'group') return 10;
    if (n.type === 'major_affiliate' || n.type === 'unlisted_affiliate' || n.type === 'subsidiary') return 11;
    if (n.type === 'domestic_anchor') return 14;
    if (n.type === 'product_category' || n.type === 'technology') return 9;
    if (n.type === 'end_market') return 8;
    if (n.type === 'global_company') return 7;
    if (n.isAnchor || n.id === ANCHOR_SAMSUNG || n.id === ANCHOR_HYNIX) {
      // Cap anchor size so Samsung mcap does not dominate the dual layout
      return 18;
    }
    var tier = n.revTier || (n.mcapWon > 5e12 ? 3 : n.mcapWon > 1e12 ? 2 : 1);
    return tier === 3 ? 16 : tier === 2 ? 12 : 9;
  }

  function mergeCompanyMeta(nodes, koreanCompanies, globalCompanies) {
    var byTicker = {};
    var byLegacy = {};
    (koreanCompanies || []).forEach(function (c) {
      if (c.ticker) byTicker[c.ticker] = c;
      byLegacy[c.id] = c;
    });
    (globalCompanies || []).forEach(function (g) { byLegacy[g.id] = g; });

    return nodes.map(function (n) {
      var c = (n.ticker && byTicker[n.ticker]) || (n.legacyId && byLegacy[n.legacyId]);
      if (!c) return n;
      return Object.assign({}, n, {
        mcapWon: n.mcapWon != null ? n.mcapWon : c.mcapWon,
        revTier: c.revTier,
        market: n.market || c.market,
        chain: n.group || c.chain,
        data: c,
      });
    });
  }

  function buildLegacyNetwork(ctx) {
    if (!global.RelationNetworkLegacyAdapter) {
      console.warn('[RelationNetwork] legacy fallback unavailable');
      return { sectorId: ctx.sectorId, model: 'legacy_fallback', asOf: new Date().toISOString().slice(0, 10), nodes: [], edges: [], _legacyFallback: true };
    }
    return global.RelationNetworkLegacyAdapter.toNetwork(ctx);
  }

  function parseUrlState() {
    var sp = new URLSearchParams(global.location.search);
    return {
      tab: sp.get('tab') || '',
      ticker: sp.get('ticker') || '',
      relation: sp.get('relation') || '',
      depth: Math.min(3, Math.max(1, parseInt(sp.get('depth') || '1', 10) || 1)),
      anchor: sp.get('anchor') || '',
      stage: sp.get('stage') || '',
      equipment: sp.get('equipment') || '',
      market: sp.get('market') || '',
      relation: sp.get('relation') || '',
      role: sp.get('role') || '',
      group: sp.get('group') || '',
      business: sp.get('business') || '',
      vesselType: sp.get('vesselType') || '',
      projectStatus: sp.get('projectStatus') || '',
      project: sp.get('project') || '',
      reactor: sp.get('reactor') || '',
      scope: sp.get('scope') || '',
      technology: sp.get('technology') || '',
      showEnded: sp.get('showEnded') === '1',
      showCompleted: sp.get('showCompleted') === '1',
      showPeer: sp.get('showPeer') === '1',
      showHistorical: sp.get('showHistorical') === '1',
    };
  }

  function allowedRelationTypes(state) {
    var types = (state.profile && state.profile.defaultEdgeTypes) || [];
    return types;
  }

  function sanitizeRelationFilter(state, relation) {
    if (!relation) return '';
    var allowed = allowedRelationTypes(state);
    if (allowed.length && allowed.indexOf(relation) < 0) return '';
    return relation;
  }

  function pushUrlState(state) {
    if (!global.history || !global.history.replaceState) return;
    var sp = new URLSearchParams(global.location.search);
    sp.set('tab', 'graph');
    if (state.selectedTicker) sp.set('ticker', state.selectedTicker);
    else sp.delete('ticker');
    if (state.filters.relationType) sp.set('relation', state.filters.relationType);
    else sp.delete('relation');
    if (state.depth && state.depth !== 1) sp.set('depth', String(state.depth));
    else sp.delete('depth');
    if (state.filters.bigchipScope && state.filters.bigchipScope !== 'all') {
      sp.set('anchor', state.filters.bigchipScope);
    } else sp.delete('anchor');
    if (state.filters.batteryStage && state.filters.batteryStage !== 'all') {
      sp.set('stage', state.filters.batteryStage);
    } else if (state.profileKey !== 'ship') sp.delete('stage');
    if (state.filters.shipRole && state.filters.shipRole !== 'all') {
      sp.set('role', state.filters.shipRole);
    } else if (state.filters.financeRole && state.filters.financeRole !== 'all') {
      sp.set('role', state.filters.financeRole);
    } else if (state.filters.nuclearRole && state.filters.nuclearRole !== 'all') {
      sp.set('role', state.filters.nuclearRole);
    } else if (state.filters.renewableRole && state.filters.renewableRole !== 'all') {
      sp.set('role', state.filters.renewableRole);
    } else if (state.profileKey !== 'ship' && state.profileKey !== 'finance' && state.profileKey !== 'nuclear' && state.profileKey !== 'renewable') {
      sp.delete('role');
    }
    if (state.filters.renewableTech && state.filters.renewableTech !== 'all') {
      sp.set('technology', state.filters.renewableTech);
    } else if (state.profileKey === 'renewable') sp.delete('technology');
    if (state.filters.nuclearScope && state.filters.nuclearScope !== 'all') {
      sp.set('scope', state.filters.nuclearScope);
    } else if (state.profileKey === 'nuclear') sp.delete('scope');
    if (state.filters.projectId) sp.set('project', state.filters.projectId);
    else if (state.profileKey === 'nuclear' || state.profileKey === 'renewable') sp.delete('project');
    if (state.filters.reactor) sp.set('reactor', state.filters.reactor);
    else if (state.profileKey === 'nuclear') sp.delete('reactor');
    if (state.filters.powergridFilter && state.filters.powergridFilter !== 'all') {
      var pgf = state.filters.powergridFilter;
      if (/^(transmission|substation|distribution|generation)$/.test(pgf)) sp.set('stage', pgf);
      else if (/^(power_transformer|cable|switchgear|grid_automation|hvdc|epc)$/.test(pgf)) sp.set('equipment', pgf);
      else if (/^(data_center|renewable_interconnection|overseas)$/.test(pgf)) sp.set('market', pgf);
      else if (pgf === 'direct') sp.set('relation', 'awarded_contract');
      else if (pgf === 'peer') sp.set('showPeer', '1');
      else if (pgf === 'ended') sp.set('showEnded', '1');
    } else if (state.profileKey === 'powergrid') {
      sp.delete('equipment');
      sp.delete('market');
      if (!state.filters.batteryStage || state.filters.batteryStage === 'all') sp.delete('stage');
    }
    if (state.filters.groupId) sp.set('group', state.filters.groupId);
    else sp.delete('group');
    if (state.filters.business) sp.set('business', state.filters.business);
    else sp.delete('business');
    if (state.filters.vesselType) sp.set('vesselType', state.filters.vesselType);
    else sp.delete('vesselType');
    if (state.filters.projectStatus) sp.set('projectStatus', state.filters.projectStatus);
    else if (state.filters.renewableStatus && state.filters.renewableStatus !== 'all') {
      sp.set('projectStatus', state.filters.renewableStatus);
    } else if (state.filters.constructionStatus && state.filters.constructionStatus !== 'all') {
      sp.set('projectStatus', state.filters.constructionStatus);
    } else sp.delete('projectStatus');
    if (state.filters.constructionRole && state.filters.constructionRole !== 'all') sp.set('role', state.filters.constructionRole);
    else if (state.profileKey === 'construction') sp.delete('role');
    if (state.filters.showEnded) sp.set('showEnded', '1');
    else sp.delete('showEnded');
    if (state.filters.showCompleted) sp.set('showCompleted', '1');
    else sp.delete('showCompleted');
    if (state.filters.showHistorical) sp.set('showHistorical', '1');
    else sp.delete('showHistorical');
    if (state.filters.showHidden && (state.profileKey === 'finance' || state.profileKey === 'nuclear' || state.profileKey === 'renewable')) sp.set('showPeer', '1');
    else if (state.profileKey !== 'powergrid') sp.delete('showPeer');
    global.history.replaceState({ rn: true }, '', '?' + sp.toString());
  }

  function refreshFinanceGroupMembers(state) {
    if (!state || !state.filters) return;
    var gidRaw = state.filters.groupId;
    if (!gidRaw) {
      state.filters._groupMemberIds = null;
      return;
    }
    var gid = String(gidRaw).indexOf('group:') === 0 ? String(gidRaw) : ('group:' + gidRaw);
    var ids = new Set([gid]);
    (state.edges || []).forEach(function (e) {
      if (e.type !== 'group_member') return;
      if (e.target === gid) ids.add(e.source);
      if (e.source === gid) ids.add(e.target);
    });
    state.filters._groupMemberIds = ids;
  }

  function resolveNodeFromUrlTicker(nodes, ticker, profileKey) {
    if (!ticker || !nodes || !nodes.length) return null;
    var direct = nodes.find(function (x) { return x.ticker === ticker; });
    if (direct) return direct;
    if (profileKey === 'bigchip') {
      return nodes.find(function (x) { return x.id === 'krx:' + ticker; }) || null;
    }
    if (profileKey === 'semiconductor') {
      return nodes.find(function (x) { return x.id === 'anchor:' + ticker; }) || null;
    }
    return nodes.find(function (x) { return x.id === 'krx:' + ticker; })
      || nodes.find(function (x) { return x.id === 'anchor:' + ticker; })
      || null;
  }

  function applyUrlToState(state) {
    var url = parseUrlState();
    if (url.tab === 'graph' || url.ticker || url.relation || url.anchor) {
      if (url.ticker && state.nodes) {
        var n = resolveNodeFromUrlTicker(state.nodes, url.ticker, state.profileKey);
        if (n) {
          state.selectedId = n.id;
          state.selectedTicker = n.ticker || url.ticker;
          state.overviewMode = false;
        }
      }
      state.filters.relationType = sanitizeRelationFilter(state, url.relation);
      state.depth = url.depth || state.depth || 1;
      if (url.anchor) state.filters.bigchipScope = url.anchor;
      if (url.stage && state.profileKey === 'battery') state.filters.batteryStage = url.stage;
      if (url.stage && state.profileKey === 'powergrid') state.filters.powergridFilter = url.stage;
      if (url.equipment && state.profileKey === 'powergrid') state.filters.powergridFilter = url.equipment;
      if (url.market && state.profileKey === 'powergrid') state.filters.powergridFilter = url.market;
      if (url.role && state.profileKey === 'ship') state.filters.shipRole = url.role;
      if (url.role && state.profileKey === 'finance') state.filters.financeRole = url.role;
      if (url.role && state.profileKey === 'nuclear') state.filters.nuclearRole = sanitizeNuclearRole(url.role);
      if (url.role && state.profileKey === 'renewable') state.filters.renewableRole = url.role;
      if (url.role && state.profileKey === 'construction') state.filters.constructionRole = url.role;
      if (url.technology && state.profileKey === 'renewable') state.filters.renewableTech = url.technology;
      if (url.scope && state.profileKey === 'nuclear') state.filters.nuclearScope = sanitizeNuclearScope(url.scope);
      if (url.project && (state.profileKey === 'nuclear' || state.profileKey === 'renewable' || state.profileKey === 'construction')) state.filters.projectId = url.project;
      if (url.reactor && state.profileKey === 'nuclear') state.filters.reactor = url.reactor;
      if (url.group && state.profileKey === 'finance') state.filters.groupId = url.group;
      else if (state.profileKey === 'finance' && !url.group) state.filters.groupId = '';
      if (url.business && state.profileKey === 'finance') state.filters.business = url.business;
      else if (state.profileKey === 'finance' && !url.business) state.filters.business = '';
      if (url.vesselType && state.profileKey === 'ship') state.filters.vesselType = url.vesselType;
      if (url.projectStatus && (state.profileKey === 'ship' || state.profileKey === 'nuclear' || state.profileKey === 'renewable' || state.profileKey === 'construction')) {
        state.filters.projectStatus = url.projectStatus;
        if (state.profileKey === 'renewable') state.filters.renewableStatus = url.projectStatus;
        if (state.profileKey === 'construction') state.filters.constructionStatus = url.projectStatus;
      }
      state.filters.showEnded = !!url.showEnded;
      state.filters.showCompleted = !!url.showCompleted;
      state.filters.showHistorical = !!url.showHistorical;
      if (url.showPeer && (state.profileKey === 'finance' || state.profileKey === 'nuclear' || state.profileKey === 'renewable' || state.profileKey === 'construction')) {
        state.filters.showHidden = true;
        state.filters.hidePeer = false;
      }
      refreshFinanceGroupMembers(state);
    }
    syncFilterUi(state);
  }

  function syncFilterUi(state) {
    var confirmed = $('rn-filter-confirmed');
    if (confirmed) confirmed.checked = !!state.filters.confirmedOnly;
    var peer = $('rn-filter-peer');
    if (peer) peer.checked = !state.filters.hidePeer;
    var inferred = $('rn-filter-inferred');
    if (inferred) inferred.checked = !state.filters.hideInferred;
    var d1 = $('rn-depth-1');
    var d2 = $('rn-depth-2');
    if (d1) d1.classList.toggle('active', state.depth === 1);
    if (d2) d2.classList.toggle('active', state.depth === 2);
  }

  function getConnectedIds(edges, startId, depth, edgeFilter) {
    var adj = {};
    edges.forEach(function (e) {
      if (edgeFilter && !edgeFilter(e)) return;
      if (!adj[e.source]) adj[e.source] = [];
      if (!adj[e.target]) adj[e.target] = [];
      adj[e.source].push(e.target);
      adj[e.target].push(e.source);
    });
    var seen = new Set([startId]);
    var frontier = [startId];
    for (var d = 0; d < depth; d++) {
      var next = [];
      frontier.forEach(function (id) {
        (adj[id] || []).forEach(function (nb) {
          if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
        });
      });
      frontier = next;
    }
    return seen;
  }

  var READABILITY = {
    MIN_ZOOM_DESKTOP: 0.78,
    MIN_ZOOM_TABLET: 0.82,
    MIN_ZOOM_MOBILE: 0.92,
    MIN_ZOOM_FIT_ALL: 0.42,
    ZOOM_LOW: 0.92,
    ZOOM_MED: 1.12,
    ZOOM_HIGH: 1.38,
    LANE_NODE_SPACING: 34,
    LANE_MIN_GRAPH_H: 540,
    FONT_LISTED: 13,
    FONT_LISTED_MOBILE: 12,
    FONT_SELECTED: 15,
    FONT_COUNTERPARTY: 11,
    FONT_LOW: 10,
  };

  function isMobileViewport() {
    return global.innerWidth <= 768;
  }

  function isTabletViewport() {
    return global.innerWidth > 768 && global.innerWidth <= 1024;
  }

  function isMapListedConstituent(n) {
    return !!(n && n.type === 'listed_company' && n.isMapConstituent !== false);
  }

  function isAnchorNode(n) {
    return !!(n && (n.isAnchor || n.type === 'domestic_anchor' || n.id === ANCHOR_SAMSUNG || n.id === ANCHOR_HYNIX));
  }

  function isGlobalOrReferenceNode(n) {
    if (!n) return false;
    if (n.type === 'global_company') return true;
    if (n.entityRole === 'listed_reference_company') return true;
    if (n.type === 'listed_company' && n.isMapConstituent === false) return true;
    return !!STRUCT_NODE[n.type];
  }

  function nodeDisplayLabel(n, lang, maxLen) {
    var raw = nodeLabel(n, lang);
    if (!maxLen || raw.length <= maxLen) return raw;
    return raw.slice(0, Math.max(1, maxLen - 1)) + '…';
  }

  function estimateLabelWidth(text, fontSize) {
    return Math.max(28, String(text || '').length * fontSize * 0.58);
  }

  function boxesOverlap(x, y, w, h, occupied) {
    var x2 = x + w;
    var y2 = y + h;
    for (var i = 0; i < occupied.length; i++) {
      var o = occupied[i];
      if (x2 < o.x1 || x > o.x2 || y2 < o.y1 || y > o.y2) continue;
      return true;
    }
    return false;
  }

  function getSimNeighborIds(simEdges, nodeId) {
    var ids = new Set();
    (simEdges || []).forEach(function (e) {
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      if (s === nodeId) ids.add(t);
      if (t === nodeId) ids.add(s);
    });
    return ids;
  }

  function labelPriorityForNode(n, state, neighborOfSelected) {
    if (!n) return 99;
    if (state.selectedId === n.id || state.hoveredId === n.id || state.focusedId === n.id) return 1;
    if (neighborOfSelected && neighborOfSelected.has(n.id)) return 1;
    if (isMapListedConstituent(n)) return 2;
    if (n.type === 'listed_company' || n.type === 'domestic_unlisted_company' || n.type === 'major_affiliate') return 2;
    if (n.type === 'nuclear_project' || n.type === 'renewable_project' || n.type === 'construction_project'
      || n.type === 'order_contract' || n.type === 'vessel_project' || n.type === 'offshore_project') return 2;
    if (isAnchorNode(n) || n.type === 'brand' || n.type === 'artist_or_group' || n.type === 'content_ip') return 2;
    if (STRUCT_NODE[n.type] || n.type === 'product_category') return 3;
    if (isGlobalOrReferenceNode(n)) return 4;
    return 3;
  }

  function labelFontSize(n, state, priority, scale) {
    var mobile = isMobileViewport();
    if (priority <= 1) return mobile ? READABILITY.FONT_SELECTED : READABILITY.FONT_SELECTED;
    if (isMapListedConstituent(n) || n.type === 'listed_company') {
      return mobile ? READABILITY.FONT_LISTED_MOBILE : READABILITY.FONT_LISTED;
    }
    if (priority === 2) return READABILITY.FONT_COUNTERPARTY;
    return READABILITY.FONT_LOW;
  }

  function shouldShowLabelByZoom(priority, scale, force) {
    if (force) return true;
    if (priority <= 2) return true;
    if (priority === 3) return scale >= READABILITY.ZOOM_MED;
    return scale >= READABILITY.ZOOM_HIGH;
  }

  function getMinZoom(state, mode) {
    if (mode === 'fit-all') return READABILITY.MIN_ZOOM_FIT_ALL;
    if (isMobileViewport()) return READABILITY.MIN_ZOOM_MOBILE;
    if (isTabletViewport()) return READABILITY.MIN_ZOOM_TABLET;
    return READABILITY.MIN_ZOOM_DESKTOP;
  }

  function computeExpandedGraphHeight(simNodes, profile, baseH) {
    var spacing = READABILITY.LANE_NODE_SPACING;
    var maxLane = 1;
    var byLane = {};
    (simNodes || []).forEach(function (n) {
      var lane = n.lane || n.layer || n.group || n.chain || '_';
      if (!byLane[lane]) byLane[lane] = 0;
      byLane[lane] += 1;
      if (byLane[lane] > maxLane) maxLane = byLane[lane];
    });
    var listedCount = (simNodes || []).filter(function (n) { return isMapListedConstituent(n); }).length;
    var dense = Math.max(maxLane, Math.ceil(listedCount / 4));
    return Math.max(baseH, READABILITY.LANE_MIN_GRAPH_H, dense * spacing + 160);
  }

  function pruneOrphanVisibleNodes(visibleNodeIds, visibleEdges, state) {
    var degree = {};
    visibleEdges.forEach(function (e) {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    });
    var remove = [];
    visibleNodeIds.forEach(function (id) {
      if (degree[id]) return;
      var n = state.nodeById[id];
      if (!n) { remove.push(id); return; }
      if (state.selectedId === id) return;
      if (isMapListedConstituent(n)) return;
      if (isAnchorNode(n)) return;
      if (n.type === 'corporate_group' || n.type === 'nuclear_project' || n.type === 'renewable_project') return;
      if (n.excludedFromLayout) { remove.push(id); return; }
      remove.push(id);
    });
    remove.forEach(function (id) { visibleNodeIds.delete(id); });
  }

  function computeVisibleGraph(state) {
    var filters = state.filters;
    var visibleEdges = state.edges.filter(function (e) { return edgeVisible(e, filters, state.nodeById); });
    var visibleNodeIds = new Set();
    visibleEdges.forEach(function (e) {
      visibleNodeIds.add(e.source);
      visibleNodeIds.add(e.target);
    });

    state.nodes.forEach(function (n) {
      if (isMapListedConstituent(n)) visibleNodeIds.add(n.id);
    });
    if (state.selectedId) visibleNodeIds.add(state.selectedId);

    if (state.selectedId) {
      var conn = getConnectedIds(visibleEdges, state.selectedId, state.depth, function (e) {
        return edgeVisible(e, filters, state.nodeById);
      });
      visibleNodeIds = conn;
      visibleEdges = visibleEdges.filter(function (e) { return conn.has(e.source) && conn.has(e.target); });
      visibleNodeIds.add(state.selectedId);
    } else if (state.profileKey === 'bigchip' || (state.profile && state.profile.layout === 'dualAnchor')) {
      visibleNodeIds.add(ANCHOR_SAMSUNG);
      visibleNodeIds.add(ANCHOR_HYNIX);
      visibleEdges.forEach(function (e) { visibleNodeIds.add(e.source); visibleNodeIds.add(e.target); });
      if (global.innerWidth <= 768 && state.filters.bigchipScope === 'samsung') {
        visibleNodeIds = new Set([ANCHOR_SAMSUNG]);
        visibleEdges.filter(function (e) { return edgeTouchesAnchor(e, ANCHOR_SAMSUNG); })
          .forEach(function (e) { visibleNodeIds.add(e.source); visibleNodeIds.add(e.target); });
        visibleEdges = visibleEdges.filter(function (e) { return visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target); });
      } else if (global.innerWidth <= 768 && (state.filters.bigchipScope === 'skhynix' || state.filters.bigchipScope === '000660')) {
        visibleNodeIds = new Set([ANCHOR_HYNIX]);
        visibleEdges.filter(function (e) { return edgeTouchesAnchor(e, ANCHOR_HYNIX); })
          .forEach(function (e) { visibleNodeIds.add(e.source); visibleNodeIds.add(e.target); });
        visibleEdges = visibleEdges.filter(function (e) { return visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target); });
      } else if (state.filters.bigchipScope === 'shared') {
        var toS = new Set();
        var toH = new Set();
        state.edges.forEach(function (e) {
          if (edgeTouchesAnchor(e, ANCHOR_SAMSUNG)) toS.add(e.source === ANCHOR_SAMSUNG ? e.target : e.source);
          if (edgeTouchesAnchor(e, ANCHOR_HYNIX)) toH.add(e.source === ANCHOR_HYNIX ? e.target : e.source);
        });
        visibleNodeIds = new Set([ANCHOR_SAMSUNG, ANCHOR_HYNIX]);
        toS.forEach(function (id) { if (toH.has(id)) visibleNodeIds.add(id); });
        visibleEdges = visibleEdges.filter(function (e) { return visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target); });
      }
    } else if (state.overviewMode && isMobileViewport()) {
      var top = state.nodes.filter(function (n) { return isMapListedConstituent(n); })
        .sort(function (a, b) { return (b.mcapWon || 0) - (a.mcapWon || 0); }).slice(0, 8);
      top.forEach(function (n) { visibleNodeIds.add(n.id); });
      visibleEdges = visibleEdges.filter(function (e) { return visibleNodeIds.has(e.source) || visibleNodeIds.has(e.target); });
      visibleEdges.forEach(function (e) { visibleNodeIds.add(e.source); visibleNodeIds.add(e.target); });
    } else if (state.overviewMode) {
      var topDesk = state.nodes.filter(function (n) { return isMapListedConstituent(n); })
        .sort(function (a, b) { return (b.mcapWon || 0) - (a.mcapWon || 0); });
      topDesk.forEach(function (n) { visibleNodeIds.add(n.id); });
    }

    pruneOrphanVisibleNodes(visibleNodeIds, visibleEdges, state);

    var simNodes = state.nodes.filter(function (n) { return visibleNodeIds.has(n.id); }).map(function (n) {
      return Object.assign({}, n);
    });
    var simNodeIds = new Set(simNodes.map(function (n) { return n.id; }));
    var simEdges = visibleEdges.filter(function (e) {
      return simNodeIds.has(e.source) && simNodeIds.has(e.target);
    }).map(function (e) { return Object.assign({}, e); });

    return { visibleEdges: visibleEdges, visibleNodeIds: visibleNodeIds, simNodes: simNodes, simEdges: simEdges };
  }

  function nodeBounds(nodes, pad) {
    pad = pad || 40;
    var x1 = Infinity;
    var y1 = Infinity;
    var x2 = -Infinity;
    var y2 = -Infinity;
    nodes.forEach(function (n) {
      if (n.x == null || n.y == null) return;
      var r = nodeRadius(n) + pad;
      x1 = Math.min(x1, n.x - r);
      y1 = Math.min(y1, n.y - r);
      x2 = Math.max(x2, n.x + r);
      y2 = Math.max(y2, n.y + r);
    });
    if (!Number.isFinite(x1)) return { x1: 0, y1: 0, x2: 100, y2: 100 };
    return { x1: x1, y1: y1, x2: x2, y2: y2 };
  }

  function applyGraphTransform(state, mode, animate) {
    var d3 = global.d3;
    if (!d3 || !state.svgEl || !state.zoomBehavior || !state.simNodes || !state.simNodes.length) return;
    mode = mode || state._viewMode || 'initial';
    var w = state.W;
    var h = state.container && state.container.clientHeight ? state.container.clientHeight : state.H;
    var minZoom = getMinZoom(state, mode);
    var focus = state.simNodes;
    if ((mode === 'selection' || mode === 'filter') && state.selectedId) {
      var nb = getSimNeighborIds(state.simEdges, state.selectedId);
      nb.add(state.selectedId);
      focus = state.simNodes.filter(function (n) { return nb.has(n.id); });
      if (!focus.length) focus = state.simNodes.filter(function (n) { return n.id === state.selectedId; });
    }
    var b = nodeBounds(focus, 48);
    var dx = Math.max(1, b.x2 - b.x1);
    var dy = Math.max(1, b.y2 - b.y1);
    var cx = (b.x1 + b.x2) / 2;
    var cy = (b.y1 + b.y2) / 2;
    var scale = Math.min(1.65, 0.88 / Math.max(dx / w, dy / h));
    if (mode === 'fit-all') {
      scale = Math.min(0.95 / Math.max(dx / w, dy / h), minZoom);
      scale = Math.max(READABILITY.MIN_ZOOM_FIT_ALL, scale);
    } else {
      scale = Math.max(minZoom, scale);
    }
    var tx = w / 2 - scale * cx;
    var ty = h / 2 - scale * cy;
    var t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    var sel = d3.select(state.container);
    if (animate) {
      sel.transition().duration(350).call(state.zoomBehavior.transform, t);
    } else {
      sel.call(state.zoomBehavior.transform, t);
    }
    state._graphTransform = t;
    state._viewMode = mode;
    finalizeGraphLabels(state);
  }

  function finalizeGraphLabels(state) {
    if (!state.labelSel || !state.simNodes) return;
    var d3 = global.d3;
    var transform = (d3 && state.svgEl) ? d3.zoomTransform(state.svgEl.node()) : { k: 1 };
    var scale = transform.k || 1;
    var neighborOfSelected = state.selectedId ? getSimNeighborIds(state.simEdges, state.selectedId) : new Set();
    var mobile = isMobileViewport();
    var candidates = state.simNodes.map(function (n) {
      return { node: n, priority: labelPriorityForNode(n, state, neighborOfSelected) };
    }).sort(function (a, b) { return a.priority - b.priority; });
    var occupied = [];
    var showIds = new Set();

    candidates.forEach(function (c) {
      var n = c.node;
      var force = c.priority <= 1;
      if (!force && mobile && c.priority >= 4) return;
      if (!shouldShowLabelByZoom(c.priority, scale, force)) return;
      if (n.x == null || n.y == null) return;
      var fs = labelFontSize(n, state, c.priority, scale);
      if (fs < READABILITY.FONT_LOW && !force) return;
      var maxLen = c.priority >= 4 ? 12 : (c.priority === 2 ? 22 : 18);
      var text = nodeDisplayLabel(n, state.lang, maxLen);
      var w = estimateLabelWidth(text, fs);
      var h = fs * 1.3;
      var x = n.x - w / 2;
      var y = n.y + nodeRadius(n) + 5;
      if (!force && boxesOverlap(x, y, w, h, occupied)) {
        if (c.priority >= 3) return;
        if (!isMapListedConstituent(n)) return;
      }
      showIds.add(n.id);
      occupied.push({ x1: x - 2, y1: y - 2, x2: x + w + 2, y2: y + h + 2 });
    });

    state.labelSel.each(function (d) {
      var pr = labelPriorityForNode(d, state, neighborOfSelected);
      var force = pr <= 1;
      var visible = force || showIds.has(d.id);
      var fs = labelFontSize(d, state, pr, scale);
      var el = d3.select(this);
      el.attr('opacity', visible ? 1 : 0)
        .attr('display', visible ? null : 'none')
        .attr('font-size', fs)
        .classed('rn-label-selected', d.id === state.selectedId || d.id === state.hoveredId)
        .classed('rn-label-listed', isMapListedConstituent(d))
        .classed('rn-label-low', pr >= 4);
    });
  }

  function layoutLayered(nodes, edges, W, H, layers) {
    var layerIndex = {};
    (layers || []).forEach(function (ch, i) { layerIndex[ch] = i; });
    var maxLayer = Math.max(1, (layers || []).length - 1);
    var byLayer = {};
    nodes.forEach(function (n) {
      var key = n.layer || n.group || n.chain || '';
      var li = layerIndex[key] != null ? layerIndex[key] : Math.floor(maxLayer / 2);
      n._layerIdx = li;
      if (!byLayer[li]) byLayer[li] = [];
      byLayer[li].push(n);
    });
    Object.keys(byLayer).forEach(function (liStr) {
      var list = byLayer[liStr];
      var li = Number(liStr);
      var layerName = (layers || [])[li] || '';
      list.sort(function (a, b) {
        var mc = (b.mcapWon || 0) - (a.mcapWon || 0);
        if (mc) return mc;
        return nodeLabel(a, 'ko').localeCompare(nodeLabel(b, 'ko'), 'ko');
      });
      var spacing = Math.max(READABILITY.LANE_NODE_SPACING, Math.min(44, (H * 0.55) / Math.max(1, list.length)));
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 70 + (W - 140) * (li / Math.max(1, maxLayer));
        if (layerName === '재활용' || n.type === 'recycling_process') {
          n.fx = 90 + (W - 180) * (1 - t * 0.85);
          n.fy = H * 0.82 + (i % 3) * spacing * 0.55;
        } else if (layerName === '수요시장' || n.type === 'end_market') {
          n.fx = W - 100;
          n.fy = H * (0.18 + t * 0.58);
        } else if (n.type === 'joint_venture') {
          n.fx = 70 + (W - 140) * (layerIndex['셀'] != null ? layerIndex['셀'] / maxLayer : 0.55);
          n.fy = H * 0.16 + i * spacing;
        } else if (n.type === 'equipment_category' || layerName === '장비') {
          n.fy = H * 0.12 + i * spacing * 0.85;
        } else if (n.type === 'global_company') {
          n.fx = (n.fx || W * 0.5) + ((i % 5) - 2) * 36;
          n.fy = H * 0.72 + Math.floor(i / 5) * spacing;
        } else {
          n.fy = H * 0.18 + i * spacing;
        }
      });
    });
  }

  function layoutOwnershipTree(nodes, edges, W, H) {
    var ownsTypes = { owns: 1, controls: 1, equity_investment: 1, subsidiary_of: 1 };
    var childrenOf = {};
    var parentOf = {};
    edges.forEach(function (e) {
      if (!ownsTypes[e.type]) return;
      // Phase 3D.1: only confirmed/reported owns drive ownershipTree parents
      if (e.status !== 'confirmed' && e.status !== 'reported') return;
      if (e.defaultHidden) return;
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      if (e.type === 'subsidiary_of') { var tmp = s; s = t; t = tmp; }
      if (!childrenOf[s]) childrenOf[s] = [];
      childrenOf[s].push(t);
      parentOf[t] = s;
    });

    var holdings = nodes.filter(function (n) {
      return n.financeRole === 'financial_holding_company' || n.role === 'financial_holding_company'
        || (n.type === 'listed_company' && childrenOf[n.id] && childrenOf[n.id].length);
    }).sort(function (a, b) { return (b.mcapWon || 0) - (a.mcapWon || 0); });

    var groups = nodes.filter(function (n) { return n.type === 'corporate_group'; });
    var independents = nodes.filter(function (n) {
      return n.type === 'listed_company' && !parentOf[n.id] && holdings.indexOf(n) < 0
        && (n.lane === 'independent' || n.lane === 'securities' || n.lane === 'insurance' || n.lane === 'card_capital');
    });

    var colCount = Math.max(1, holdings.length);
    var colW = (W * 0.72) / colCount;
    holdings.forEach(function (h, i) {
      h.fx = 40 + colW * i + colW * 0.5;
      h.fy = H * 0.14;
      var kids = (childrenOf[h.id] || []).map(function (id) {
        return nodes.find(function (n) { return n.id === id; });
      }).filter(Boolean);
      kids.forEach(function (k, ki) {
        k.fx = h.fx + ((ki - (kids.length - 1) / 2) * Math.min(70, colW * 0.35));
        k.fy = H * 0.42;
      });
    });

    groups.forEach(function (g, i) {
      g.fx = W * 0.82;
      g.fy = H * (0.18 + i * 0.12);
    });

    // Place group members near their group
    edges.forEach(function (e) {
      if (e.type !== 'group_member') return;
      var company = nodes.find(function (n) { return n.id === (typeof e.source === 'object' ? e.source.id : e.source); });
      var group = nodes.find(function (n) { return n.id === (typeof e.target === 'object' ? e.target.id : e.target); });
      if (!company || !group || company.fx != null) return;
      var siblings = edges.filter(function (x) {
        return x.type === 'group_member' && (typeof x.target === 'object' ? x.target.id : x.target) === group.id;
      });
      var idx = siblings.findIndex(function (x) {
        return (typeof x.source === 'object' ? x.source.id : x.source) === company.id;
      });
      company.fx = (group.fx || W * 0.82) - 90;
      company.fy = (group.fy || H * 0.4) + ((idx - (siblings.length - 1) / 2) * 36);
    });

    independents.sort(function (a, b) { return (b.mcapWon || 0) - (a.mcapWon || 0); });
    independents.forEach(function (n, i) {
      if (n.fx != null) return;
      n.fx = 50 + (i % 8) * ((W * 0.7) / 8);
      n.fy = H * 0.72 + Math.floor(i / 8) * 48;
    });

    nodes.forEach(function (n) {
      if (n.fx != null) return;
      if (n.type === 'category') {
        n.fx = W * 0.08;
        n.fy = H * 0.08;
        return;
      }
      n.fx = W * 0.5 + (Math.random() - 0.5) * 80;
      n.fy = H * 0.85;
    });
  }

  function layoutDualAnchor(nodes, edges, W, H, anchors) {
    var left = W * 0.22;
    var right = W * 0.78;
    var cy = H * 0.48;
    var samsung = nodes.find(function (x) { return x.id === ANCHOR_SAMSUNG || x.ticker === '005930'; });
    var hynix = nodes.find(function (x) { return x.id === ANCHOR_HYNIX || x.ticker === '000660'; });
    // Left = SK hynix, Right = Samsung (per Phase 3A spec)
    if (hynix) { hynix.fx = left; hynix.fy = cy; hynix.isAnchor = true; }
    if (samsung) { samsung.fx = right; samsung.fy = cy; samsung.isAnchor = true; }

    var linkedTo = { samsung: new Set(), hynix: new Set() };
    edges.forEach(function (e) {
      var s = typeof e.source === 'object' ? e.source.id : e.source;
      var t = typeof e.target === 'object' ? e.target.id : e.target;
      if (s === ANCHOR_SAMSUNG) linkedTo.samsung.add(t);
      if (t === ANCHOR_SAMSUNG) linkedTo.samsung.add(s);
      if (s === ANCHOR_HYNIX) linkedTo.hynix.add(t);
      if (t === ANCHOR_HYNIX) linkedTo.hynix.add(s);
    });

    var shared = [];
    var onlyS = [];
    var onlyH = [];
    var products = [];
    var markets = [];
    nodes.forEach(function (n) {
      if (n.fx != null) return;
      if (n.type === 'product_category' || n.type === 'technology') { products.push(n); return; }
      if (n.type === 'end_market') { markets.push(n); return; }
      var toS = linkedTo.samsung.has(n.id);
      var toH = linkedTo.hynix.has(n.id);
      if (toS && toH) shared.push(n);
      else if (toS) onlyS.push(n);
      else if (toH) onlyH.push(n);
      else shared.push(n);
    });

    function placeColumn(list, x0, x1, y0, y1) {
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = x0 + (x1 - x0) * (0.35 + 0.3 * Math.sin(i * 1.7));
        n.fy = y0 + (y1 - y0) * t;
      });
    }
    placeColumn(onlyH, W * 0.05, W * 0.32, H * 0.12, H * 0.88);
    placeColumn(onlyS, W * 0.68, W * 0.95, H * 0.12, H * 0.88);
    placeColumn(shared, W * 0.38, W * 0.62, H * 0.18, H * 0.82);
    products.forEach(function (n, i) {
      var toS = linkedTo.samsung.has(n.id);
      var toH = linkedTo.hynix.has(n.id);
      if (toS && toH) { n.fx = W * 0.5; n.fy = H * 0.1 + (i % 4) * 22; }
      else if (toH) { n.fx = left; n.fy = H * 0.12 + i * 28; }
      else { n.fx = right; n.fy = H * 0.12 + i * 28; }
    });
    markets.forEach(function (n, i) {
      n.fx = W * (0.25 + (i % 4) * 0.16);
      n.fy = H * 0.9;
    });
  }

  function sanitizeNuclearScope(scope) {
    var ok = { all: 1, large_nuclear: 1, smr: 1, domestic: 1, overseas: 1, om: 1 };
    return ok[scope] ? scope : 'all';
  }

  function sanitizeNuclearRole(role) {
    var ok = {
      all: 1, operator: 1, architect_engineer: 1, nsss_supplier: 1, turbine_generator: 1,
      construction: 1, instrumentation_control: 1, maintenance: 1, nuclear_fuel: 1,
      decommissioning: 1, epc: 1, direct: 1, peer: 1, mou: 1, contract: 1, selection: 1,
      operating: 1, historical: 1,
    };
    return ok[role] ? role : 'all';
  }

  function applyInitialLayout(state) {
    var W = state.W, H = state.H;
    var nodes = state.simNodes || state.nodes;
    var edges = state.simEdges || state.edges;
    nodes.forEach(function (n) { delete n.fx; delete n.fy; });
    var layout = (state.profile && state.profile.layout) || 'forceGraph';
    if (layout === 'layeredSupplyChain') layoutLayered(nodes, edges, W, H, state.profile.layers);
    else if (layout === 'ownershipTree') layoutOwnershipTree(nodes, edges, W, H);
    else if (layout === 'dualAnchor') layoutDualAnchor(nodes, edges, W, H, state.profile.anchors);
    else if (layout === 'projectEcosystem') layoutProjectEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'gridInfrastructureEcosystem') layoutGridInfrastructure(nodes, edges, W, H, state.profile);
    else if (layout === 'nuclearProjectEcosystem') layoutNuclearProjectEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'renewableProjectEcosystem') layoutRenewableProjectEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'constructionProjectEcosystem') layoutConstructionProjectEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'automotiveValueChainEcosystem') layoutAutomotiveValueChain(nodes, edges, W, H, state.profile);
    else if (layout === 'electronicsValueChainEcosystem') layoutElectronicsValueChain(nodes, edges, W, H, state.profile);
    else if (layout === 'metalsValueChainEcosystem') layoutMetalsValueChain(nodes, edges, W, H, state.profile);
    else if (layout === 'beautyValueChainEcosystem') layoutBeautyValueChain(nodes, edges, W, H, state.profile);
    else if (layout === 'consumerBrandDistributionEcosystem') layoutConsumerBrandDistribution(nodes, edges, W, H, state.profile);
    else if (layout === 'contentIpDistributionEcosystem') layoutContentIpDistribution(nodes, edges, W, H, state.profile);
    else if (layout === 'medicalDeviceEcosystem') layoutMedicalDeviceEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'softwarePlatformEcosystem') layoutSoftwarePlatformEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'telecomNetworkServiceEcosystem') layoutTelecomNetworkServiceEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'chemicalRefiningValueChainEcosystem') layoutChemicalRefiningValueChain(nodes, edges, W, H, state.profile);
    else if (layout === 'travelLeisureValueChainEcosystem') layoutTravelLeisureValueChain(nodes, edges, W, H, state.profile);
    else if (layout === 'roboticsValueChainEcosystem') layoutRoboticsValueChainEcosystem(nodes, edges, W, H, state.profile);
    else if (layout === 'assetLicensing' || layout === 'platformEcosystem' || layout === 'technologyStack') {
      nodes.filter(function (n) { return n.type === 'program' || n.type === 'pipeline'; }).forEach(function (n, i) {
        n.fx = W / 2; n.fy = 100 + i * 70;
      });
    }
  }

  function layoutNuclearProjectEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'owner_operator', 'export_epc_design', 'nsss_reactor', 'turbine_balance',
      'construction_ic', 'fuel_maintenance', 'smr_development', 'overseas_project',
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.06 + (i / Math.max(1, laneOrder.length - 1)) * 0.88);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferNuclearLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isStruct = n.type === 'lifecycle_stage' || n.type === 'equipment_category'
        || n.type === 'reactor_technology' || n.type === 'country';
      var isProject = n.type === 'nuclear_project' || n.type === 'consortium' || n.type === 'smr_technology'
        || n.type === 'plant_unit' || n.type === 'contract';
      if (isStruct) {
        n.fy = H * (n.type === 'lifecycle_stage' ? 0.1 : 0.88);
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 22;
      } else if (isProject) {
        n.fy = H * (0.68 + (idx % 4) * 0.05);
      } else {
        n.fy = H * (0.28 + (idx % 7) * 0.07);
      }
    });
  }

  function inferNuclearLane(n) {
    if (n.type === 'smr_technology' || n.scope === 'smr') return 'smr_development';
    if (n.type === 'nuclear_project') {
      if (n.scope === 'om') return 'fuel_maintenance';
      if (n.scope === 'overseas') return 'overseas_project';
      return 'owner_operator';
    }
    if (n.type === 'operator' || n.type === 'government' || n.type === 'organization') return 'owner_operator';
    if (n.role === 'architect_engineer' || n.role === 'epc' || n.role === 'export_lead') return 'export_epc_design';
    if (n.role === 'nsss_supplier' || n.role === 'reactor_supplier') return 'nsss_reactor';
    if (n.role === 'turbine_generator') return 'turbine_balance';
    if (n.role === 'maintenance' || n.role === 'nuclear_fuel') return 'fuel_maintenance';
    if (n.role === 'instrumentation_control' || n.role === 'pump_valve' || n.role === 'heat_exchanger'
      || n.role === 'electrical_equipment' || n.role === 'construction') return 'construction_ic';
    return 'nsss_reactor';
  }

  function layoutRenewableProjectEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'solar', 'onshore_wind', 'offshore_wind', 'fuel_cell', 'hydrogen', 'renewable_operator',
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.06 + (i / Math.max(1, laneOrder.length - 1)) * 0.88);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferRenewableLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isStruct = n.type === 'technology' || n.type === 'equipment_category' || n.type === 'project_stage'
        || n.type === 'ecosystem' || n.type === 'end_market' || n.type === 'product' || n.type === 'development_pipeline';
      var isProject = n.type === 'renewable_project' || n.type === 'project_spv' || n.type === 'contract'
        || n.type === 'project_portfolio' || n.type === 'supply_contract' || n.type === 'offtaker';
      if (isStruct) {
        n.fy = H * (n.type === 'technology' || n.type === 'project_stage' ? 0.1 : 0.88);
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 22;
      } else if (isProject) {
        n.fy = H * (0.66 + (idx % 4) * 0.05);
      } else {
        n.fy = H * (0.28 + (idx % 7) * 0.07);
      }
    });
  }

  function inferRenewableLane(n) {
    if (n.technology === 'solar' || n.lane === 'solar') return 'solar';
    if (n.technology === 'offshore_wind' || n.lane === 'offshore_wind') return 'offshore_wind';
    if (n.technology === 'onshore_wind' || n.lane === 'onshore_wind') return 'onshore_wind';
    if (n.technology === 'fuel_cell' || n.lane === 'fuel_cell') return 'fuel_cell';
    if (n.technology === 'hydrogen' || n.lane === 'hydrogen') return 'hydrogen';
    if (n.type === 'renewable_project') return n.technology || 'renewable_operator';
    return 'renewable_operator';
  }

  function layoutConstructionProjectEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'developer_housing', 'general_contractor', 'plant_infra', 'overseas_epc', 'machinery', 'finance_trust',
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.06 + (i / Math.max(1, laneOrder.length - 1)) * 0.88);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferConstructionLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isStruct = n.type === 'building_type' || n.type === 'infrastructure_type' || n.type === 'equipment_category'
        || n.type === 'ecosystem' || n.type === 'end_market' || n.type === 'apartment_brand';
      var isProject = n.type === 'construction_project' || n.type === 'overseas_epc_project'
        || n.type === 'spc' || n.type === 'pfv' || n.type === 'reit' || n.type === 'consortium' || n.type === 'contract';
      if (isStruct) {
        n.fy = H * (n.type === 'ecosystem' || n.type === 'building_type' || n.type === 'infrastructure_type' ? 0.1 : 0.88);
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 22;
      } else if (isProject) {
        n.fy = H * (0.66 + (idx % 4) * 0.05);
      } else {
        n.fy = H * (0.28 + (idx % 7) * 0.07);
      }
    });
  }

  function layoutAutomotiveValueChain(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'vehicle_oem', 'powertrain', 'electrification', 'thermal_management',
      'chassis_braking_steering', 'body_exterior', 'interior', 'lighting',
      'electronics_adas', 'tire', 'materials', 'aftermarket', 'end_market',
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.05 + (i / Math.max(1, laneOrder.length - 1)) * 0.9);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferAutoLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isStruct = n.type === 'business_category' || n.type === 'product' || n.type === 'technology'
        || n.type === 'end_market' || n.type === 'group';
      var isVehicle = n.type === 'vehicle_model' || n.type === 'vehicle_platform';
      if (isStruct) {
        n.fy = H * (n.type === 'business_category' || n.type === 'group' ? 0.12 : 0.86);
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 18;
      } else if (isVehicle) {
        n.fy = H * (0.68 + (idx % 3) * 0.06);
      } else if (n.type === 'global_company') {
        n.fy = H * (0.78 + (idx % 2) * 0.05);
      } else {
        n.fy = H * (0.28 + (idx % 6) * 0.07);
      }
    });
  }

  function inferAutoLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'end_market' || n.type === 'global_company') return 'end_market';
    if (n.type === 'technology' || n.type === 'product') return 'end_market';
    if (n.type === 'group') return 'vehicle_oem';
    return 'materials';
  }

  function layoutElectronicsValueChain(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'home_appliance', 'display', 'camera_module', 'electronic_component', 'end_market',
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.06 + (i / Math.max(1, laneOrder.length - 1)) * 0.88);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferElecLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isStruct = n.type === 'business_category' || n.type === 'product' || n.type === 'component'
        || n.type === 'technology' || n.type === 'end_market' || n.type === 'cross_sector_anchor';
      if (isStruct) {
        n.fy = H * (n.type === 'business_category' || n.type === 'cross_sector_anchor' ? 0.12 : 0.86);
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 16;
      } else if (n.type === 'global_company') {
        n.fy = H * (0.78 + (idx % 2) * 0.05);
      } else {
        n.fy = H * (0.28 + (idx % 6) * 0.07);
      }
    });
  }

  function layoutMetalsValueChain(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'raw_material', 'smelting_refining', 'steelmaking', 'nonferrous_metal',
      'rolling_processing', 'specialty_alloy', 'metal_products', 'recycling',
      'distribution_trading', 'end_market',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferMetalLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.15 + t * 0.65);
      });
    });
  }

  function inferMetalLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'commodity' || String(n.id || '').startsWith('commodity:')) return 'raw_material';
    if (n.type === 'end_market' || String(n.id || '').startsWith('end_market:')) return 'end_market';
    if (n.type === 'cross_sector_anchor') return 'end_market';
    if (n.type === 'global_company') return 'end_market';
    if (n.type === 'metal_product') return 'metal_products';
    if (n.type === 'business_category') return n.lane || 'steelmaking';
    return 'steelmaking';
  }

  function layoutBeautyValueChain(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'odm_oem', 'brand_owner', 'beauty_device', 'distributor',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferBeautyLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.15 + t * 0.65);
      });
    });
  }

  function inferBeautyLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'brand') return 'brand_owner';
    if (n.type === 'manufacturing_service') return 'odm_oem';
    if (n.type === 'retail_channel' || n.type === 'distributor') return 'distributor';
    if (n.type === 'beauty_device' || n.type === 'product_category') return 'beauty_device';
    if (n.type === 'cross_sector_anchor') return 'beauty_device';
    if (n.type === 'global_company') return 'beauty_device';
    if (n.type === 'group') return n.lane || 'brand_owner';
    return 'brand_owner';
  }

  function layoutConsumerBrandDistribution(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'brand_owner', 'manufacturing', 'retail_channel', 'leisure_lifestyle',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferConsumerLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.15 + t * 0.65);
      });
    });
  }

  function inferConsumerLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'brand' || n.type === 'consumer_product') return 'brand_owner';
    if (n.type === 'retail_channel' || n.type === 'distributor' || n.type === 'ecommerce_platform') return 'retail_channel';
    if (n.type === 'franchise') return 'retail_channel';
    if (n.type === 'product_category') return 'brand_owner';
    if (n.type === 'cross_sector_anchor') return 'brand_owner';
    if (n.type === 'global_company') return 'brand_owner';
    return 'brand_owner';
  }

  function layoutContentIpDistribution(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'label_agency', 'production_studio', 'ip_rights', 'distributor', 'platform',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferContentLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.12 + t * 0.7);
      });
    });
  }

  function inferContentLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'artist_or_group' || n.type === 'creator' || n.type === 'label' || n.type === 'agency') return 'label_agency';
    if (n.type === 'studio' || n.type === 'production') return 'production_studio';
    if (n.type === 'content_ip' || n.type === 'franchise_ip') return 'ip_rights';
    if (n.type === 'platform' || n.type === 'streaming_service') return 'platform';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'platform';
    return 'label_agency';
  }

  function layoutMedicalDeviceEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'in_vitro_diagnostics', 'digital_health_samd', 'patient_monitoring', 'surgical_device', 'dental_device',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferMedtechLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.14 + t * 0.68);
      });
    });
  }

  function inferMedtechLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'software_medical_device') return 'digital_health_samd';
    if (n.type === 'device_category' || n.type === 'medical_device') return 'in_vitro_diagnostics';
    if (n.type === 'clinical_specialty' || n.type === 'indication') return 'in_vitro_diagnostics';
    if (n.type === 'regulatory_clearance' || n.type === 'regulator') return 'in_vitro_diagnostics';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'in_vitro_diagnostics';
    return 'in_vitro_diagnostics';
  }

  function layoutSoftwarePlatformEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'data_ai', 'managed_service', 'cloud_infrastructure', 'cybersecurity',
      'enterprise_software', 'commerce_platform', 'industrial_software',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferSoftwareLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.12 + t * 0.7);
      });
    });
  }

  function inferSoftwareLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'platform') return 'data_ai';
    if (n.type === 'cloud_service') return 'cloud_infrastructure';
    if (n.type === 'customer_industry') return 'industrial_software';
    if (n.type === 'software_category' || n.type === 'software_product') return 'enterprise_software';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'data_ai';
    return 'managed_service';
  }

  function layoutTelecomNetworkServiceEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'network_operator', 'network_equipment', 'optical_wireless_component',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferTelecomLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.14 + t * 0.68);
      });
    });
  }

  function inferTelecomLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'telecom_service' || n.type === 'network_operator') return 'network_operator';
    if (n.type === 'network_equipment') return 'network_equipment';
    if (n.type === 'network_component') return 'optical_wireless_component';
    if (n.type === 'network_generation') return 'network_operator';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'network_operator';
    return 'network_equipment';
  }

  function layoutChemicalRefiningValueChain(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'petrochemical', 'specialty_chemical', 'refining_gas', 'chemical_materials',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferChemicalLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.14 + t * 0.68);
      });
    });
  }

  function inferChemicalLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'refining_product') return 'refining_gas';
    if (n.type === 'chemical_product') return 'specialty_chemical';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'petrochemical';
    if (n.type === 'group') return n.lane || 'petrochemical';
    return 'petrochemical';
  }

  function layoutTravelLeisureValueChain(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'airlines', 'casino', 'hotel_resort', 'travel_duty_free',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferTravelLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.14 + t * 0.68);
      });
    });
  }

  function inferTravelLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'travel_service') return 'travel_duty_free';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'airlines';
    if (n.type === 'group') return n.lane || 'airlines';
    return 'airlines';
  }

  function layoutRoboticsValueChainEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'precision_component', 'actuator_drive', 'robot_software', 'industrial_robot',
      'collaborative_robot', 'logistics_robot', 'system_integration', 'end_market',
    ];
    var byLane = {};
    laneOrder.forEach(function (l) { byLane[l] = []; });
    nodes.forEach(function (n) {
      if (n.excludedFromLayout === true) return;
      var lane = n.lane || inferRobotLane(n);
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(n);
    });
    var colW = (W - 120) / Math.max(1, laneOrder.length - 1);
    laneOrder.forEach(function (lane, li) {
      var list = byLane[lane] || [];
      list.forEach(function (n, i) {
        var t = list.length <= 1 ? 0.5 : i / (list.length - 1);
        n.fx = 60 + colW * li;
        n.fy = H * (0.12 + t * 0.7);
      });
    });
  }

  function inferRobotLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'reducer' || n.type === 'robot_component') return 'precision_component';
    if (n.type === 'actuator' || n.type === 'motor_drive') return 'actuator_drive';
    if (n.type === 'sensor' || n.type === 'vision_system') return 'sensor_vision';
    if (n.type === 'controller') return 'controller';
    if (n.type === 'robot_software') return 'robot_software';
    if (n.type === 'application' || n.type === 'end_market') return 'end_market';
    if (n.type === 'robot_category' || n.type === 'robot_product') return 'industrial_robot';
    if (n.type === 'cross_sector_anchor' || n.type === 'global_company') return 'industrial_robot';
    return 'industrial_robot';
  }

  function inferElecLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'end_market' || n.type === 'global_company' || n.type === 'cross_sector_anchor') return 'end_market';
    if (n.type === 'technology' || n.type === 'product' || n.type === 'component') return 'electronic_component';
    if (n.role === '가전') return 'home_appliance';
    if (n.role === '디스플레이') return 'display';
    if (n.role === '카메라·모듈') return 'camera_module';
    return 'electronic_component';
  }

  function inferConstructionLane(n) {
    if (n.lane) return n.lane;
    if (n.type === 'overseas_epc_project') return 'overseas_epc';
    if (n.type === 'equipment_category' || n.role === 'machinery_supplier') return 'machinery';
    if (n.type === 'pfv' || n.type === 'spc' || n.type === 'reit' || n.role === 'reit_manager') return 'finance_trust';
    if (n.projectCategory === 'housing' || n.role === 'project_developer') return 'developer_housing';
    if (n.projectCategory === 'plant' || n.projectCategory === 'infrastructure') return 'plant_infra';
    return 'general_contractor';
  }

  function layoutGridInfrastructure(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'generation_utility', 'transmission_hvdc', 'substation_protection',
      'distribution_power_electronics', 'demand_overseas', 'epc_services'
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.07 + (i / Math.max(1, laneOrder.length - 1)) * 0.86);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferPowergridLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isStruct = n.type === 'grid_stage' || n.type === 'equipment_category' || n.type === 'end_market'
        || n.type === 'region' || n.type === 'group';
      var isProject = n.type === 'contract' || n.type === 'project' || n.type === 'utility'
        || n.type === 'organization';
      if (isStruct) {
        n.fy = H * (n.type === 'grid_stage' ? 0.1 : (n.type === 'end_market' || n.type === 'region' ? 0.9 : 0.86));
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 26;
      } else if (isProject) {
        n.fy = H * (0.72 + (idx % 4) * 0.05);
      } else {
        n.fy = H * (0.28 + (idx % 7) * 0.07);
      }
    });
  }

  function inferPowergridLane(n) {
    if (n.type === 'grid_stage') {
      if (/generation/.test(n.id)) return 'generation_utility';
      if (/transmission/.test(n.id)) return 'transmission_hvdc';
      if (/substation/.test(n.id)) return 'substation_protection';
      if (/distribution/.test(n.id)) return 'distribution_power_electronics';
      return 'demand_overseas';
    }
    if (n.type === 'equipment_category') {
      if (/cable|hvdc|transformer/.test(n.id)) return 'transmission_hvdc';
      if (/switch|breaker|relay|automation/.test(n.id)) return 'substation_protection';
      if (/inverter|distribution|storage/.test(n.id)) return 'distribution_power_electronics';
      return 'transmission_hvdc';
    }
    if (n.type === 'end_market' || n.type === 'region' || n.type === 'contract' || n.type === 'project'
      || n.type === 'utility' || n.type === 'organization' || n.type === 'global_company') {
      return 'demand_overseas';
    }
    if (n.layer === '발전설비' || n.role === 'utility_operator') return 'generation_utility';
    if (n.layer === '전선·케이블' || n.role === 'cable') return 'transmission_hvdc';
    if (n.layer === '전력설비' || n.role === 'transformer_switchgear') return 'substation_protection';
    if (n.layer === '송배전') return 'transmission_hvdc';
    return 'substation_protection';
  }

  function layoutProjectEcosystem(nodes, edges, W, H, profile) {
    var laneOrder = (profile && profile.lanes) || [
      'shipowner', 'order_contract', 'shipyard', 'engine_propulsion',
      'steel_material', 'equipment', 'electrical_automation', 'classification', 'delivery_mro'
    ];
    var laneX = {};
    laneOrder.forEach(function (lane, i) {
      laneX[lane] = W * (0.08 + (i / Math.max(1, laneOrder.length - 1)) * 0.84);
    });
    var counts = {};
    nodes.forEach(function (n) {
      var lane = n.lane || inferShipLane(n);
      n.lane = lane;
      var idx = counts[lane] || 0;
      counts[lane] = idx + 1;
      n.fx = laneX[lane] != null ? laneX[lane] : W * 0.5;
      var isAux = n.type === 'vessel_type' || n.type === 'end_market' || n.type === 'material_category'
        || n.type === 'equipment_category' || n.type === 'engine_product' || n.type === 'mro_service'
        || n.type === 'group';
      if (isAux) {
        n.fy = H * (n.type === 'vessel_type' || n.type === 'group' ? 0.12 : 0.88);
        n.fx = (n.fx || W * 0.5) + ((idx % 3) - 1) * 28;
      } else {
        n.fy = H * (0.28 + (idx % 8) * 0.07);
      }
    });
  }

  function inferShipLane(n) {
    if (n.type === 'order_contract' || n.type === 'vessel_project' || n.type === 'naval_program' || n.type === 'offshore_project') return 'order_contract';
    if (n.type === 'shipowner' || n.type === 'classification_society') return n.type === 'classification_society' ? 'classification' : 'shipowner';
    if (n.layer === '종합조선') return 'shipyard';
    if (n.layer === '엔진') return 'engine_propulsion';
    if (n.layer === '선체·보냉·구조재') return 'steel_material';
    if (n.layer === '의장/배관') return 'equipment';
    if (n.layer === '서비스·해양플랜트') return 'delivery_mro';
    if (n.layer === '해운물류') return 'shipowner';
    if (n.type === 'global_company') return 'shipowner';
    return 'shipyard';
  }

  function edgeTouchesAnchor(e, anchorId) {
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    return s === anchorId || t === anchorId;
  }

  function bigchipScopeAllows(e, filters, nodeById) {
    var scope = filters.bigchipScope || 'all';
    if (!scope || scope === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    if (scope === 'samsung' || scope === '005930') return edgeTouchesAnchor(e, ANCHOR_SAMSUNG);
    if (scope === 'skhynix' || scope === '000660') return edgeTouchesAnchor(e, ANCHOR_HYNIX);
    if (scope === 'shared') {
      // Keep only edges involving nodes linked to both — handled at node filter stage;
      // here allow edges that touch either anchor or structural nodes between them.
      return edgeTouchesAnchor(e, ANCHOR_SAMSUNG) || edgeTouchesAnchor(e, ANCHOR_HYNIX)
        || (STRUCT_NODE[sn && sn.type] && STRUCT_NODE[tn && tn.type]);
    }
    if (scope === 'products') {
      return e.type === 'produces' || e.type === 'used_in_market' || e.type === 'exposed_to'
        || !!(sn && STRUCT_NODE[sn.type]) || !!(tn && STRUCT_NODE[tn.type]);
    }
    if (scope === 'equipment') {
      return e.type === 'equipment_for' || e.type === 'material_for' || e.type === 'packages_or_tests_for';
    }
    if (scope === 'customers') {
      return e.type === 'supplies_to' || e.type === 'customer_of';
    }
    if (scope === 'ownership') {
      return e.type === 'owns' || e.type === 'subsidiary_of' || e.type === 'joint_venture';
    }
    if (scope === 'ended') return e.status === 'ended';
    return true;
  }

  function edgeVisible(e, filters, nodeById) {
    if (e.status === 'ended' || e.contractStatus === 'delivered' || e.contractStatus === 'completed' || e.contractStatus === 'cancelled') {
      var showDone = filters.showEnded || filters.showCompleted || filters.bigchipScope === 'ended' || filters.shipRole === 'completed';
      if (!showDone) return false;
    } else if (e.defaultHidden && !filters.showHidden) {
      return false;
    }
    if (filters.transactionalOnly && e.status !== 'confirmed' && e.status !== 'reported') return false;
    if (filters.hidePeer && (e.type === 'peer' || e.status === 'peer' || e.type === 'competes_with')) return false;
    if (filters.hideInferred && e.status === 'inferred') return false;
    if (filters.hideReference && (e.status === 'reference' || e.type === 'member_of' || e.type === 'used_in_market')) return false;
    if (filters.confirmedOnly && e.status !== 'confirmed') return false;
    if (filters.relationType && e.type !== filters.relationType) return false;
    if (filters.hideGlobal && (String(e.source).indexOf('global:') === 0 || String(e.target).indexOf('global:') === 0)) return false;
    if (filters.hideProgram && (String(e.source).indexOf('program:') === 0 || String(e.target).indexOf('program:') === 0)) return false;
    if (filters.bigchipScope && filters.bigchipScope !== 'all') {
      if (!bigchipScopeAllows(e, filters, nodeById)) return false;
    }
    if (filters.batteryStage && filters.batteryStage !== 'all') {
      if (!batteryStageAllows(e, filters, nodeById, filters._batteryProfile)) return false;
    }
    if (filters.shipRole && filters.shipRole !== 'all') {
      if (!shipRoleAllows(e, filters, nodeById, filters._shipProfile)) return false;
    }
    if (filters.financeRole && filters.financeRole !== 'all') {
      if (!financeRoleAllows(e, filters, nodeById, filters._financeProfile)) return false;
    }
    if (filters.powergridFilter && filters.powergridFilter !== 'all') {
      if (!powergridFilterAllows(e, filters, nodeById)) return false;
    }
    if (filters.nuclearScope && filters.nuclearScope !== 'all') {
      if (!nuclearScopeAllows(e, filters, nodeById)) return false;
    }
    if (filters.nuclearRole && filters.nuclearRole !== 'all') {
      if (!nuclearRoleAllows(e, filters, nodeById)) return false;
    }
    if (filters.renewableTech && filters.renewableTech !== 'all') {
      if (!renewableTechAllows(e, filters, nodeById)) return false;
    }
    if (filters.renewableRole && filters.renewableRole !== 'all') {
      if (!renewableRoleAllows(e, filters, nodeById)) return false;
    }
    if (filters.renewableStatus && filters.renewableStatus !== 'all') {
      if (!renewableStatusAllows(e, filters, nodeById)) return false;
    }
    if (filters.constructionStatus && filters.constructionStatus !== 'all') {
      if (!constructionStatusAllows(e, filters, nodeById)) return false;
    }
    if (filters.constructionRole && filters.constructionRole !== 'all') {
      if (!constructionRoleAllows(e, filters, nodeById)) return false;
    }
    if (filters.projectId) {
      var pid = filters.projectId;
      if (pid.indexOf('nuclear-project:') !== 0 && pid.indexOf('renewable-project:') !== 0) {
        if (nodeById['renewable-project:' + pid]) pid = 'renewable-project:' + pid;
        else if (nodeById['nuclear-project:' + pid]) pid = 'nuclear-project:' + pid;
      }
      if (e.source !== pid && e.target !== pid
        && !(nodeById[e.source] && nodeById[e.source].projectId === pid)
        && !(nodeById[e.target] && nodeById[e.target].projectId === pid)) {
        return false;
      }
    }
    if (filters.reactor) {
      var rid = filters.reactor.indexOf('reactor:') === 0 ? filters.reactor : ('reactor:' + filters.reactor);
      var rs = nodeById[e.source];
      var rt = nodeById[e.target];
      if (e.source !== rid && e.target !== rid
        && !(rs && rs.reactorTechnologyId === rid) && !(rt && rt.reactorTechnologyId === rid)) {
        return false;
      }
    }
    if (filters.groupId) {
      var gid = String(filters.groupId).indexOf('group:') === 0
        ? String(filters.groupId)
        : ('group:' + filters.groupId);
      var sid = typeof e.source === 'object' ? e.source.id : e.source;
      var tid = typeof e.target === 'object' ? e.target.id : e.target;
      var memberIds = filters._groupMemberIds;
      if (memberIds && memberIds.size) {
        if (!memberIds.has(sid) && !memberIds.has(tid)) return false;
      } else if (sid !== gid && tid !== gid) {
        return false;
      }
    }
    if (filters.business) {
      var biz = filters.business;
      var bs = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
      var bt = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
      var bizHit = function (n) {
        if (!n) return false;
        var fr = n.financeRole || n.role || '';
        var lane = n.lane || '';
        if (biz === 'bank') return fr === 'bank' || lane === 'bank' || n.id === 'category:bank';
        if (biz === 'holding') return fr === 'financial_holding_company' || lane === 'holding';
        if (biz === 'securities') return fr === 'securities_company' || fr === 'asset_manager' || lane === 'securities';
        if (biz === 'insurance') return /insurer|insurance/.test(fr) || lane === 'insurance';
        if (biz === 'card' || biz === 'capital') return fr === 'card_company' || fr === 'capital_company' || lane === 'card_capital';
        return fr === biz || lane === biz || n.id === ('category:' + biz);
      };
      if (!bizHit(bs) && !bizHit(bt)) return false;
    }
    if (filters.vesselType) {
      var vt = 'vessel-type:' + filters.vesselType;
      if (e.source !== vt && e.target !== vt && e.vesselType !== filters.vesselType) {
        var sn = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
        var tn = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
        if (!(sn && sn.vesselType === filters.vesselType) && !(tn && tn.vesselType === filters.vesselType)
          && !(sn && sn.id === vt) && !(tn && tn.id === vt)) return false;
      }
    }
    if (filters.projectStatus) {
      var sn2 = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
      var tn2 = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
      var st = e.projectStatus || e.contractStatus
        || (sn2 && (sn2.projectStatus || sn2.contractStatus))
        || (tn2 && (tn2.projectStatus || tn2.contractStatus));
      if (st !== filters.projectStatus) return false;
    }
    // Nuclear: hide completed/cancelled/suspended project edges unless historical
    if (!filters.showHistorical && !filters.showEnded && !filters.showCompleted) {
      var sn3 = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
      var tn3 = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
      var psHide = e.projectStatus
        || (sn3 && (sn3.type === 'nuclear_project' || sn3.type === 'renewable_project') && sn3.projectStatus)
        || (tn3 && (tn3.type === 'nuclear_project' || tn3.type === 'renewable_project') && tn3.projectStatus);
      if (psHide === 'completed' || psHide === 'cancelled' || psHide === 'suspended') return false;
    }
    return true;
  }

  function nuclearScopeAllows(e, filters, nodeById) {
    var f = filters.nuclearScope;
    if (!f || f === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    function scopeOf(n) {
      if (!n) return '';
      if (n.scope) return n.scope;
      if (n.type === 'smr_technology' || (n.scopeTags && n.scopeTags.indexOf('smr') >= 0)) return 'smr';
      if (n.countryCode === 'KR' || n.scope === 'domestic') return 'domestic';
      if (n.scope === 'overseas' || (n.countryCode && n.countryCode !== 'KR')) return 'overseas';
      if (n.role === 'maintenance' || n.lane === 'fuel_maintenance') return 'om';
      return 'large_nuclear';
    }
    if (f === 'smr') {
      return e.scope === 'smr' || String(s).indexOf('smr:') === 0 || String(t).indexOf('smr:') === 0
        || (sn && (sn.type === 'smr_technology' || (sn.scopeTags && sn.scopeTags.indexOf('smr') >= 0)))
        || (tn && (tn.type === 'smr_technology' || (tn.scopeTags && tn.scopeTags.indexOf('smr') >= 0)));
    }
    if (f === 'large_nuclear') {
      return e.scope !== 'smr' && String(s).indexOf('smr:') !== 0 && String(t).indexOf('smr:') !== 0
        && !(sn && sn.type === 'smr_technology') && !(tn && tn.type === 'smr_technology');
    }
    if (f === 'domestic') return scopeOf(sn) === 'domestic' || scopeOf(tn) === 'domestic' || (sn && sn.countryCode === 'KR') || (tn && tn.countryCode === 'KR');
    if (f === 'overseas') return scopeOf(sn) === 'overseas' || scopeOf(tn) === 'overseas';
    if (f === 'om') {
      return e.type === 'maintains' || e.type === 'supplies_service_to' || e.type === 'operates'
        || scopeOf(sn) === 'om' || scopeOf(tn) === 'om'
        || (sn && sn.role === 'maintenance') || (tn && tn.role === 'maintenance');
    }
    return true;
  }

  function nuclearRoleAllows(e, filters, nodeById) {
    var f = filters.nuclearRole;
    if (!f || f === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    if (f === 'direct') {
      return (e.status === 'confirmed' || e.status === 'reported')
        && (e.relationClass === 'business' || e.relationClass === 'business');
    }
    if (f === 'peer') return e.type === 'peer' || e.status === 'reference' || e.type === 'reference';
    if (f === 'mou') return e.type === 'memorandum_with' || e.projectStatus === 'memorandum';
    if (f === 'contract') return e.projectStatus === 'contract_signed' || e.contractSigned === true || /supplies_.*_to|epc_for/.test(e.type || '');
    if (f === 'selection') return e.type === 'preferred_bidder_for' || e.type === 'selected_for' || e.projectStatus === 'selected_bidder' || e.projectStatus === 'preferred_bidder';
    if (f === 'operating') return e.projectStatus === 'operating' || (tn && tn.projectStatus === 'operating') || (sn && sn.projectStatus === 'operating');
    if (f === 'historical') return e.projectStatus === 'completed' || e.projectStatus === 'cancelled' || e.projectStatus === 'suspended';
    function roleHit(n, role) {
      if (!n) return false;
      return n.role === role || n.lane && (
        (role === 'operator' && /owner_operator/.test(n.lane))
        || (role === 'architect_engineer' && /export_epc/.test(n.lane))
        || (role === 'nsss_supplier' && /nsss/.test(n.lane))
        || (role === 'maintenance' && /fuel_maintenance/.test(n.lane))
        || (role === 'instrumentation_control' && /construction_ic/.test(n.lane))
      );
    }
    if (f === 'operator') return e.type === 'operates' || e.type === 'project_operator' || roleHit(sn, 'operator') || roleHit(tn, 'operator');
    if (f === 'architect_engineer' || f === 'epc') {
      return /architect_engineer_for|designs_for|epc_for|export_lead/.test(e.type || '')
        || roleHit(sn, 'architect_engineer') || roleHit(tn, 'architect_engineer');
    }
    if (f === 'nsss_supplier') {
      return /supplies_nsss_to|supplies_reactor_to/.test(e.type || '') || roleHit(sn, 'nsss_supplier') || roleHit(tn, 'nsss_supplier');
    }
    if (f === 'turbine_generator') {
      return e.type === 'supplies_turbine_to' || roleHit(sn, 'turbine_generator') || roleHit(tn, 'turbine_generator');
    }
    if (f === 'instrumentation_control') {
      return e.type === 'supplies_ic_to' || roleHit(sn, 'instrumentation_control') || roleHit(tn, 'instrumentation_control')
        || roleHit(sn, 'pump_valve') || roleHit(sn, 'heat_exchanger');
    }
    if (f === 'maintenance') {
      return e.type === 'maintains' || e.type === 'supplies_service_to' || roleHit(sn, 'maintenance') || roleHit(tn, 'maintenance');
    }
    if (f === 'nuclear_fuel') return e.type === 'supplies_fuel_to' || roleHit(sn, 'nuclear_fuel');
    if (f === 'decommissioning') return e.type === 'decommissions' || /decommission/.test(e.type || '');
    if (f === 'construction') return e.type === 'builds' || e.type === 'commissions';
    return true;
  }

  function renewableTechAllows(e, filters, nodeById) {
    var tech = filters.renewableTech;
    if (!tech || tech === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    function hit(n) {
      if (!n) return false;
      return n.technology === tech || n.lane === tech || n.id === ('technology:' + tech);
    }
    return hit(sn) || hit(tn);
  }

  function renewableRoleAllows(e, filters, nodeById) {
    var f = filters.renewableRole;
    if (!f || f === 'all') return true;
    if (f === 'developer') return e.type === 'project_developer' || e.type === 'development_rights';
    if (f === 'epc') return e.type === 'epc_for' || e.type === 'engineering_for' || e.type === 'constructs';
    if (f === 'equipment') return /supplies_.*_to/.test(e.type || '');
    if (f === 'operator') return e.type === 'operates' || e.type === 'maintains' || e.type === 'project_operator';
    if (f === 'ppa') return e.type === 'power_purchase_agreement' || e.type === 'rec_purchase_agreement' || e.type === 'hydrogen_offtake';
    if (f === 'jv_spv') {
      return e.type === 'owns_stake_in' || e.type === 'spv_shareholder' || e.type === 'joint_venture'
        || e.type === 'consortium_member' || e.type === 'project_owner';
    }
    if (f === 'direct') return e.relationClass === 'business' && e.type !== 'peer' && e.type !== 'reference';
    if (f === 'peer') return e.type === 'peer' || e.type === 'reference' || e.status === 'inferred';
    if (f === 'historical') {
      return e.projectStatus === 'completed' || e.projectStatus === 'cancelled' || e.projectStatus === 'suspended';
    }
    return true;
  }

  function renewableStatusAllows(e, filters, nodeById) {
    var f = filters.renewableStatus;
    if (!f || f === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    var st = e.projectStatus || (tn && tn.projectStatus) || (sn && sn.projectStatus) || '';
    if (f === 'development') {
      return /^(concept|memorandum|site_secured|development|feasibility_study|permit_application|permitted|preferred_bidder|financing|financial_close)$/.test(st);
    }
    if (f === 'construction') {
      return /^(contract_signed|notice_to_proceed|under_construction|commissioning)$/.test(st);
    }
    if (f === 'operating') return st === 'operating' || st === 'repowering';
    if (f === 'historical') return st === 'completed' || st === 'cancelled' || st === 'suspended';
    return st === f;
  }

  function constructionStatusAllows(e, filters, nodeById) {
    var f = filters.constructionStatus;
    if (!f || f === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    var st = e.projectStatus || (tn && tn.projectStatus) || (sn && sn.projectStatus) || '';
    if (f === 'contract') return st === 'contract_signed' || st === 'notice_to_proceed' || st === 'financial_close';
    if (f === 'construction' || f === 'under_construction') {
      return st === 'under_construction' || st === 'commissioning' || st === 'presale';
    }
    if (f === 'presale') return st === 'presale';
    if (f === 'completed') return st === 'completed' || st === 'operating';
    if (f === 'preferred_bidder') return st === 'preferred_bidder';
    return st === f;
  }

  function constructionRoleAllows(e, filters, nodeById) {
    var f = filters.constructionRole;
    if (!f || f === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    if (f === 'developer') {
      return e.type === 'project_developer' || e.type === 'pfv_shareholder' || e.type === 'spc_shareholder'
        || (sn && sn.lane === 'developer_housing') || (tn && tn.lane === 'developer_housing');
    }
    if (f === 'housing') {
      return (tn && (tn.projectCategory === 'housing' || tn.lane === 'developer_housing'))
        || e.type === 'operates_brand';
    }
    if (f === 'plant') {
      return (tn && (tn.projectCategory === 'plant' || tn.projectCategory === 'infrastructure'))
        || (sn && sn.lane === 'plant_infra');
    }
    if (f === 'overseas') {
      return e.type === 'epc_for' || e.type === 'preferred_bidder_for' || e.type === 'consortium_member'
        || (tn && tn.type === 'overseas_epc_project') || (sn && sn.lane === 'overseas_epc');
    }
    if (f === 'machinery') {
      return e.type === 'manufactures' || e.type === 'supplies_machinery_to'
        || (sn && sn.lane === 'machinery') || (tn && tn.type === 'equipment_category');
    }
    if (f === 'spv') {
      return e.type === 'owns_stake_in' || e.type === 'pfv_shareholder' || e.type === 'spc_shareholder'
        || (tn && (tn.type === 'pfv' || tn.type === 'spc' || tn.type === 'reit'));
    }
    if (f === 'consortium') return e.type === 'consortium_member' || (tn && tn.type === 'consortium');
    if (f === 'finance') return e.type === 'finances' || e.type === 'arranges_pf' || e.type === 'guarantees';
    if (f === 'direct') {
      return ['main_contractor', 'epc_for', 'project_owner', 'project_developer', 'owns_stake_in',
        'pfv_shareholder', 'constructs', 'preferred_bidder_for'].indexOf(e.type) >= 0;
    }
    if (f === 'peer') return e.type === 'peer' || e.status === 'peer' || e.status === 'reference';
    return true;
  }

  function powergridFilterAllows(e, filters, nodeById) {
    var f = filters.powergridFilter;
    if (!f || f === 'all') return true;
    var s = typeof e.source === 'object' ? e.source.id : e.source;
    var t = typeof e.target === 'object' ? e.target.id : e.target;
    var sn = nodeById && nodeById[s];
    var tn = nodeById && nodeById[t];
    function hit(n, re) { return !!(n && (re.test(n.id || '') || re.test(n.role || '') || re.test(n.layer || '') || re.test(n.lane || ''))); }
    if (f === 'transmission') {
      return hit(sn, /transmission|cable|hvdc|transformer/) || hit(tn, /transmission|cable|hvdc|transformer/)
        || e.type === 'used_in_grid_stage' && (s === 'grid-stage:transmission' || t === 'grid-stage:transmission');
    }
    if (f === 'substation') {
      return hit(sn, /substation|switch|breaker|relay|automation|전력설비/) || hit(tn, /substation|switch|breaker|relay|automation|전력설비/)
        || s === 'grid-stage:substation' || t === 'grid-stage:substation';
    }
    if (f === 'distribution') {
      return hit(sn, /distribution|inverter|storage|배전/) || hit(tn, /distribution|inverter|storage|배전/)
        || s === 'grid-stage:distribution' || t === 'grid-stage:distribution';
    }
    if (f === 'generation') {
      return hit(sn, /generation|utility_operator|발전/) || hit(tn, /generation|utility_operator|발전/);
    }
    if (f === 'power_transformer') {
      return s === 'equipment:power_transformer' || t === 'equipment:power_transformer'
        || e.type === 'supplies_transformer_to' || hit(sn, /transformer_switchgear|267260|298040|062040|103590/)
        || hit(tn, /transformer/);
    }
    if (f === 'cable') {
      return /cable/.test(s) || /cable/.test(t) || e.type === 'supplies_cable_to'
        || hit(sn, /cable|전선/) || hit(tn, /cable|전선/);
    }
    if (f === 'switchgear') {
      return /switchgear|circuit_breaker/.test(s) || /switchgear|circuit_breaker/.test(t)
        || e.type === 'supplies_switchgear_to';
    }
    if (f === 'grid_automation') {
      return /grid_automation|protection_relay|inverter/.test(s) || /grid_automation|protection_relay|inverter/.test(t);
    }
    if (f === 'hvdc') {
      return /hvdc/.test(s) || /hvdc/.test(t) || hit(sn, /hvdc/) || hit(tn, /hvdc/);
    }
    if (f === 'epc') {
      return e.type === 'epc_for' || e.type === 'project_supplier' || hit(sn, /epc/) || hit(tn, /epc/);
    }
    if (f === 'data_center') {
      return s === 'market:data_center' || t === 'market:data_center';
    }
    if (f === 'renewable_interconnection') {
      return s === 'market:renewable_interconnection' || t === 'market:renewable_interconnection';
    }
    if (f === 'overseas') {
      return e.type === 'located_in' || hit(sn, /overseas|region:|middle_east|north_america|kahramaa|undisclosed/)
        || hit(tn, /overseas|region:|middle_east|north_america|kahramaa|undisclosed/)
        || e.type === 'awarded_contract' || e.type === 'project_supplier' || e.type === 'supplies_cable_to'
        || e.type === 'supplies_transformer_to';
    }
    if (f === 'direct') {
      return e.status === 'confirmed' || e.status === 'reported';
    }
    if (f === 'peer') {
      return e.type === 'peer' || e.status === 'peer' || e.status === 'inferred' || e.status === 'reference';
    }
    if (f === 'ended') {
      return e.status === 'ended' || e.contractStatus === 'completed' || e.contractStatus === 'cancelled';
    }
    return true;
  }

  function shipRoleAllows(e, filters, nodeById, profile) {
    var role = filters.shipRole;
    if (!role || role === 'all') return true;
    var aliases = (profile && profile.roleAliases) || {};
    var mapped = aliases[role] || role;
    var layers = (profile && profile.layers) || [];
    var known = layers.indexOf(mapped) >= 0 || ['direct', 'peer', 'completed', 'active', 'shipyard', 'engine', 'steel', 'ship_equipment', 'offshore', 'shipping', 'mro', 'electrical_automation', 'defense_marine'].indexOf(role) >= 0;
    if (!known) return true; // invalid → ignore
    if (role === 'completed') {
      return e.status === 'ended' || e.contractStatus === 'delivered' || e.contractStatus === 'completed';
    }
    if (role === 'active' || role === 'project') {
      return e.type === 'ordered' || e.type === 'awarded_to' || e.type === 'built_by'
        || String(e.source).indexOf('contract:') === 0 || String(e.target).indexOf('contract:') === 0
        || String(e.source).indexOf('naval:') === 0 || String(e.target).indexOf('naval:') === 0;
    }
    if (role === 'direct') return e.status === 'confirmed' || e.status === 'reported';
    if (role === 'peer') return e.type === 'peer' || e.status === 'peer' || e.status === 'reference';
    var layer = mapped;
    var s = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
    var t = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
    var hit = function (n) {
      if (!n) return false;
      return n.layer === layer || n.group === layer || n.role === layer || n.lane === role
        || (aliases[role] && (n.layer === aliases[role] || n.lane === role));
    };
    return hit(s) || hit(t);
  }

  function financeRoleAllows(e, filters, nodeById, profile) {
    var role = filters.financeRole;
    if (!role || role === 'all') return true;
    var aliases = (profile && profile.roleAliases) || {};
    var known = ['holding', 'bank', 'securities', 'life_insurance', 'nonlife_insurance', 'card_capital', 'fintech', 'owns', 'group', 'jv', 'independent', 'peer', 'ended'].indexOf(role) >= 0;
    if (!known) return true;
    if (role === 'ended') return e.status === 'ended';
    if (role === 'peer') return e.type === 'peer' || e.status === 'peer' || e.status === 'reference';
    if (role === 'owns') return e.type === 'owns' || e.type === 'controls' || e.type === 'equity_investment';
    if (role === 'group') return e.type === 'group_member' || e.type === 'affiliated_with'
      || String(e.source).indexOf('group:') === 0 || String(e.target).indexOf('group:') === 0;
    if (role === 'jv') {
      return e.type === 'joint_venture' || e.type === 'strategic_investment' || e.type === 'strategic_partnership'
        || e.type === 'distribution_partnership' || e.type === 'platform_partnership';
    }
    var s = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
    var t = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
    var matchRole = function (n) {
      if (!n) return false;
      var fr = n.financeRole || n.role || '';
      var lane = n.lane || '';
      if (role === 'holding') return fr === 'financial_holding_company' || lane === 'holding';
      if (role === 'bank') return fr === 'bank' || lane === 'bank' || n.type === 'domestic_unlisted_company' && fr === 'bank';
      if (role === 'securities') return fr === 'securities_company' || fr === 'asset_manager' || lane === 'securities';
      if (role === 'life_insurance') return fr === 'life_insurer';
      if (role === 'nonlife_insurance') return fr === 'nonlife_insurer';
      if (role === 'card_capital') return fr === 'card_company' || fr === 'capital_company' || lane === 'card_capital';
      if (role === 'fintech') return fr === 'fintech_company' || fr === 'payment_company' || lane === 'independent';
      if (role === 'independent') {
        return lane === 'independent' || lane === 'securities' || lane === 'insurance' || lane === 'card_capital';
      }
      var mapped = aliases[role];
      return mapped ? (n.layer === mapped || n.group === mapped) : false;
    };
    return matchRole(s) || matchRole(t);
  }

  function resolveBatteryStage(stage, profile) {
    if (!stage || stage === 'all') return 'all';
    var aliases = (profile && profile.stageAliases) || {};
    if (aliases[stage]) return aliases[stage];
    var layers = (profile && profile.layers) || [];
    if (layers.indexOf(stage) >= 0) return stage;
    return stage; // unknown stages ignored later
  }

  function batteryStageAllows(e, filters, nodeById, profile) {
    var stage = resolveBatteryStage(filters.batteryStage, profile);
    if (!stage || stage === 'all') return true;
    var layers = (profile && profile.layers) || [];
    if (layers.indexOf(stage) < 0 && stage !== 'jv' && stage !== 'direct' && stage !== 'ended') {
      return true; // invalid stage → ignore safely
    }
    if (stage === 'ended') return e.status === 'ended';
    if (stage === 'direct') {
      return e.status === 'confirmed' || e.status === 'reported';
    }
    if (stage === 'jv') {
      return e.type === 'participates_in' || e.type === 'joint_venture' || e.type === 'owns'
        || String(e.source).indexOf('jv:') === 0 || String(e.target).indexOf('jv:') === 0;
    }
    var s = nodeById && nodeById[typeof e.source === 'object' ? e.source.id : e.source];
    var t = nodeById && nodeById[typeof e.target === 'object' ? e.target.id : e.target];
    var hit = function (n) {
      if (!n) return false;
      return n.layer === stage || n.group === stage || n.chain === stage || n.role === stage;
    };
    return hit(s) || hit(t);
  }

  function edgeStrokeStyle(e) {
    if (e.type === 'owns' || e.type === 'controls' || e.type === 'equity_investment') {
      if (e.status === 'confirmed') {
        return { stroke: '#58a6ff', width: 2.4, dash: null, opacity: 0.95 };
      }
      if (e.status === 'reported') {
        return { stroke: '#79c0ff', width: 1.8, dash: null, opacity: 0.85 };
      }
      // reference/inferred owns — weak, not a strong ownership arrow
      return { stroke: '#8b949e', width: 1, dash: '3 4', opacity: 0.35 };
    }
    if (e.type === 'group_member' || e.type === 'affiliated_with') {
      return { stroke: '#8b949e', width: 1.2, dash: '5 4', opacity: 0.55 };
    }
    if (e.type === 'member_of' || e.type === 'operates_in') {
      return { stroke: '#484f58', width: 0.9, dash: '2 3', opacity: 0.3 };
    }
    if (e.type === 'manufactures' || e.type === 'develops' || e.type === 'used_in_grid_stage'
      || e.type === 'exposed_to' || e.type === 'supports_market') {
      return { stroke: '#6e7681', width: 1, dash: '2 3', opacity: 0.4 };
    }
    if (e.type === 'supplies_transformer_to' || e.type === 'supplies_cable_to' || e.type === 'supplies_switchgear_to'
      || e.type === 'supplies_equipment_to' || e.type === 'awarded_contract' || e.type === 'project_supplier'
      || e.type === 'epc_for' || e.type === 'project_owner' || e.type === 'project_operator') {
      if (e.status === 'confirmed') return { stroke: '#58a6ff', width: 2.2, dash: null, opacity: 0.95 };
      if (e.status === 'reported') return { stroke: '#79c0ff', width: 1.6, dash: null, opacity: 0.85 };
      return { stroke: '#8b949e', width: 1, dash: '3 4', opacity: 0.4 };
    }
    if (e.type === 'strategic_partnership' || e.type === 'joint_venture' || e.type === 'strategic_investment'
      || e.type === 'distribution_partnership' || e.type === 'platform_partnership' || e.type === 'bancassurance_partnership') {
      return { stroke: '#3fb950', width: 1.4, dash: '7 3', opacity: 0.7 };
    }
    if (e.status === 'confirmed') {
      return { stroke: '#58a6ff', width: 2.2, dash: null, opacity: 0.95 };
    }
    if (e.status === 'reported') {
      return { stroke: '#58a6ff', width: 1.4, dash: '6 3', opacity: 0.75 };
    }
    if (e.status === 'peer' || e.type === 'peer') {
      return { stroke: '#8b949e', width: 1, dash: '3 5', opacity: 0.4 };
    }
    if (e.status === 'inferred') {
      return { stroke: '#a371f7', width: 1, dash: '4 4', opacity: 0.45 };
    }
    if (e.status === 'reference' || e.type === 'member_of') {
      return { stroke: '#484f58', width: 1, dash: '2 4', opacity: 0.35 };
    }
    if (e.status === 'ended') {
      return { stroke: '#6e7681', width: 1, dash: '1 3', opacity: 0.3 };
    }
    return { stroke: 'var(--text-muted,#8b949e)', width: 1.2, dash: '4 4', opacity: 0.5 };
  }

  function updateLegend(state) {
    var el = $('rn-legend');
    if (!el) return;
    var lang = state.lang;
    var items;
    if (state.profileKey === 'finance') {
      items = lang === 'en'
        ? [
          ['Solid blue', 'Ownership (owns)'],
          ['Gray dashed', 'Group membership (not ownership)'],
          ['Thin dark dashed', 'Sector classification'],
          ['Gray peer dashed', 'Peer (hidden by default)'],
        ]
        : [
          ['파랑 실선', '직접 소유(owns)'],
          ['회색 점선', '기업집단 소속(지분 아님)'],
          ['얇은 어두운 점선', '업종 분류'],
          ['회색 peer 점선', '동종 비교(기본 숨김)'],
        ];
    } else {
      items = lang === 'en'
        ? [
          ['Solid blue (thick)', 'Confirmed (primary source)'],
          ['Blue dashed', 'Reported'],
          ['Gray dashed', 'Peer comparison'],
          ['Purple dashed', 'Inferred'],
          ['Dark dashed', 'Reference / category'],
        ]
        : [
          ['실선(굵게·파랑)', '공식 원문 확인(confirmed)'],
          ['파랑 점선', '공식자료·보도(reported)'],
          ['회색 점선', '동종 peer 비교'],
          ['보라 점선', '추론 관계'],
          ['어두운 점선', '참고·분류'],
        ];
    }
    el.innerHTML = items.map(function (row) {
      return '<span class="rn-legend-item"><span class="rn-legend-key">' + row[0] + '</span> ' + row[1] + '</span>';
    }).join('');
    buildStaticLegendHelp(state);
  }

  function renderDetailPanel(state, target, isEdge) {
    var panel = $('rn-detail-panel');
    if (!panel) return;
    var lang = state.lang;
    var html = '<button type="button" class="rn-detail-close" id="rn-detail-close" aria-label="' + (lang === 'en' ? 'Close' : '닫기') + '">×</button>';
    if (isEdge) {
      html += '<h3>' + edgeLabel(target, lang) + '</h3>';
      html += '<p><strong>' + t('rnType', lang, state.T) + ':</strong> ' + target.type + '</p>';
      html += '<p><strong>' + (lang === 'en' ? 'Editorial verification' : '편집 검증') + ':</strong> ' + statusLabel(target.status, lang) + '</p>';
      if (target.type === 'awarded_contract' || target.contractStatus) {
        var life = target.contractStatus || (state.nodeById[target.target] && state.nodeById[target.target].contractStatus);
        if (life) {
          html += '<p><strong>' + (lang === 'en' ? 'Contract lifecycle' : '계약 상태') + ':</strong> ' + contractLifecycleLabel(life, lang) + '</p>';
        }
        var cpNode = state.nodeById[target.target];
        if (cpNode && cpNode.counterpartyStatus) {
          html += '<p><strong>' + (lang === 'en' ? 'Counterparty disclosure' : '상대방 공개') + ':</strong> ' + counterpartyStatusLabel(cpNode.counterpartyStatus, lang) + '</p>';
        }
      }
      if (target.projectStatus) {
        html += '<p><strong>' + (lang === 'en' ? 'Project stage' : '프로젝트 단계') + ':</strong> '
          + projectStatusLabel(target.projectStatus, lang) + '</p>';
      }
      if (target.companyContractValue != null) {
        html += '<p>' + (lang === 'en' ? 'Company contract value: ' : '기업 계약금액: ')
          + target.companyContractValue + ' ' + (target.currency || '')
          + (target.valueType ? ' (' + target.valueType + ')' : '') + '</p>';
      }
      if (target.type === 'peer' || target.type === 'competes_with' || target.status === 'reference' || target.type === 'member_of' || target.type === 'used_in_market' || target.type === 'exposed_to') {
        html += '<p><em>' + (lang === 'en'
          ? 'This does not represent a verified trade relationship.'
          : '실제 거래 관계를 의미하지 않습니다.') + '</em></p>';
      }
      if (target.type === 'group_member') {
        html += '<p><em>' + (lang === 'en'
          ? 'Corporate-group membership — not direct ownership.'
          : '동일 기업집단 소속이며 직접 지분관계를 의미하지 않습니다.') + '</em></p>';
      }
      if (target.type === 'owns' || target.type === 'controls' || target.type === 'equity_investment') {
        html += '<p><strong>stakePct:</strong> '
          + (target.stakePct == null ? (lang === 'en' ? 'not verified (null)' : '미확인 (null)') : (target.stakePct + '%'))
          + '</p>';
        if (target.ownershipKind || target.directOrIndirect) {
          html += '<p>' + (target.ownershipKind || target.directOrIndirect) + '</p>';
        }
        if (target.asOf || target.sourceDocumentDate) {
          html += '<p>' + (lang === 'en' ? 'As of: ' : '기준일: ') + (target.asOf || target.sourceDocumentDate) + '</p>';
        }
      } else if (target.stakePct != null) {
        html += '<p><strong>' + t('rnStake', lang, state.T) + ':</strong> ' + target.stakePct + '%</p>';
      }
      if (target.validTo) {
        html += '<p><em>' + (lang === 'en' ? 'Valid to: ' : '유효기간: ') + target.validTo + '</em></p>';
      }
      if (target.noteKo || target.noteEn) {
        html += '<p>' + (lang === 'en' ? (target.noteEn || target.noteKo) : (target.noteKo || target.noteEn)) + '</p>';
      }
      var srcN = state.nodeById[target.source];
      var tgtN = state.nodeById[target.target];
      if (srcN && tgtN) {
        html += '<p>' + nodeLabel(srcN, lang) + ' → ' + nodeLabel(tgtN, lang) + '</p>';
      }
      if (target.evidence && target.evidence.length) {
        html += '<ul class="rn-evidence">';
        target.evidence.forEach(function (ev) {
          html += '<li><a href="' + ev.url + '" target="_blank" rel="noopener">' + (ev.title || ev.url) + '</a>';
          if (ev.publishedAt) html += ' <span>(' + ev.publishedAt + ')</span>';
          if (ev.directEvidence === true) html += ' <strong>[' + (lang === 'en' ? 'direct' : '직접') + ']</strong>';
          if (ev.relationshipSupported) {
            html += '<div style="margin-top:4px;color:var(--text-muted)">' + ev.relationshipSupported + '</div>';
          }
          if (ev.reviewStatus === 'needs_human_review') {
            html += ' <em>[' + (lang === 'en' ? 'needs primary source review' : '원문 추가 확인 필요') + ']</em>';
          }
          html += '</li>';
        });
        html += '</ul>';
      }
      if (target.lastVerifiedAt) {
        html += '<p>' + (lang === 'en' ? 'Last reviewed: ' : '마지막 검토: ') + target.lastVerifiedAt + '</p>';
      }
    } else {
      html += '<h3>' + nodeLabel(target, lang) + '</h3>';
      if (target.type === 'contract') {
        html += '<p><strong>' + (lang === 'en' ? 'Contract lifecycle' : '계약 상태') + ':</strong> '
          + contractLifecycleLabel(target.contractStatus || target.status, lang) + '</p>';
        if (target.counterpartyStatus) {
          html += '<p><strong>' + (lang === 'en' ? 'Counterparty disclosure' : '상대방 공개') + ':</strong> '
            + counterpartyStatusLabel(target.counterpartyStatus, lang) + '</p>';
        }
        if (target.statusReview === 'needs_review') {
          html += '<p><em>' + (lang === 'en' ? 'Lifecycle status needs human review' : '계약 생애주기 추가 검토 필요') + '</em></p>';
        }
        if (target.validTo) {
          html += '<p>' + (lang === 'en' ? 'Valid to: ' : '계약 종료일: ') + target.validTo + '</p>';
        }
      }
      if (target.type === 'nuclear_project' || target.type === 'smr_technology' || target.type === 'consortium'
        || target.type === 'renewable_project' || target.type === 'project_spv'
        || target.type === 'project_portfolio' || target.type === 'supply_contract' || target.type === 'product'
        || target.type === 'development_pipeline'
        || target.type === 'construction_project' || target.type === 'overseas_epc_project'
        || target.type === 'pfv' || target.type === 'spc' || target.type === 'apartment_brand') {
        if (target.type === 'apartment_brand') {
          html += '<p class="rn-graph-only-badge">' + (lang === 'en'
            ? 'Apartment brand — not a contracting party.'
            : '아파트 브랜드이며 시공·도급계약 당사자가 아닙니다.') + '</p>';
        }
        if (target.projectStatus === 'preferred_bidder') {
          html += '<p class="rn-graph-only-badge">' + (lang === 'en'
            ? 'Preferred negotiation — may differ from a signed contract.'
            : '우선협상 단계이며 본계약 체결과 다를 수 있습니다.') + '</p>';
        }
        if (target.type === 'pfv' || target.type === 'spc') {
          html += '<p class="rn-graph-only-badge">' + (lang === 'en'
            ? 'Project finance vehicle — equity/guarantee amounts are disclosure-based, not realized loss.'
            : '프로젝트 금융 특수목적법인입니다. 지분·보증은 공시 기준이며 실제 손실을 의미하지 않습니다.') + '</p>';
        }
        if (target.companyContractValue != null || target.constructionContractValue != null
          || target.totalProjectValue != null || target.projectTotalValue != null
          || target.companyShareValue != null || target.financingAmount != null
          || target.guaranteeAmount != null || target.convertedValueKRW != null) {
          const totalPv = target.projectTotalValue != null ? target.projectTotalValue : target.totalProjectValue;
          if (totalPv != null) {
            html += '<p>' + (lang === 'en' ? 'Total project value: ' : '총사업비: ')
              + totalPv + ' ' + (target.currency || '')
              + (target.valueType ? ' (' + target.valueType + ')' : '') + '</p>';
          }
          if (target.constructionContractValue != null) {
            html += '<p>' + (lang === 'en' ? 'Construction contract (award): ' : '회사 도급액: ')
              + target.constructionContractValue + ' ' + (target.currency || '') + '</p>';
          }
          if (target.companyContractValue != null) {
            html += '<p>' + (lang === 'en' ? 'Company contract share: ' : '기업 계약지분: ')
              + target.companyContractValue + ' ' + (target.currency || '')
              + (target.companyParticipationPct != null ? ' (' + target.companyParticipationPct + '%)' : '') + '</p>';
          }
          if (target.companyShareValue != null && target.companyShareValue !== target.companyContractValue) {
            html += '<p>' + (lang === 'en' ? 'Company attributable value: ' : '회사 귀속액: ')
              + target.companyShareValue + ' ' + (target.currency || '') + '</p>';
          }
          if (target.equityStakePct != null) {
            html += '<p>' + (lang === 'en' ? 'Equity stake: ' : '지분율: ')
              + target.equityStakePct + '%</p>';
          }
          if (target.financingAmount != null || target.projectFinanceAmount != null) {
            html += '<p>' + (lang === 'en' ? 'PF / financing (not award): ' : 'PF·금융(수주액 아님): ')
              + (target.financingAmount != null ? target.financingAmount : target.projectFinanceAmount)
              + ' ' + (target.currency || '') + '</p>';
          }
          if (target.guaranteeAmount != null || target.guaranteedAmount != null) {
            html += '<p>' + (lang === 'en' ? 'Guarantee (not award): ' : '지급보증(수주액 아님): ')
              + (target.guaranteeAmount != null ? target.guaranteeAmount : target.guaranteedAmount)
              + ' ' + (target.currency || '') + '</p>';
          }
          if (target.originalCurrency && target.originalContractValue != null) {
            html += '<p>' + (lang === 'en' ? 'Original currency amount: ' : '원문 통화 금액: ')
              + target.originalContractValue + ' ' + target.originalCurrency
              + (target.conversionAsOf ? (lang === 'en' ? ' (FX as of ' : ' (환산기준 ')
                + target.conversionAsOf + ')' : '') + '</p>';
          }
          if (target.convertedValueKRW != null && target.originalCurrency && target.originalCurrency !== 'KRW') {
            html += '<p>' + (lang === 'en' ? 'Converted KRW: ' : '환산 원화: ')
              + target.convertedValueKRW + ' KRW'
              + (target.conversionAsOf ? ' @ ' + target.conversionAsOf : '') + '</p>';
          }
        }
        if (target.counterpartyDisclosure || target.counterpartyStatus) {
          html += '<p>' + (lang === 'en' ? 'Counterparty disclosure: ' : '상대방 공개 수준: ')
            + (target.counterpartyDisclosure || target.counterpartyStatus) + '</p>';
        }
        if (target.contractStatus) {
          html += '<p>' + (lang === 'en' ? 'Contract status: ' : '계약 상태: ')
            + target.contractStatus
            + (target.contractSigned === true ? (lang === 'en' ? ' (signed)' : ' (체결)')
              : (target.contractSigned === false ? (lang === 'en' ? ' (not signed)' : ' (미체결)') : ''))
            + '</p>';
        }
        const ev0 = (target.evidence && target.evidence[0]) || null;
        if (ev0 && (ev0.reviewStatus || target.reviewStatus)) {
          html += '<p>' + (lang === 'en' ? 'Editorial review: ' : '편집 검토 상태: ')
            + (ev0.reviewStatus || target.reviewStatus) + '</p>';
        }
        if (target.type === 'product' || target.type === 'development_pipeline' || target.type === 'project_portfolio') {
          html += '<p class="rn-graph-only-badge">' + (lang === 'en'
            ? (target.type === 'product'
              ? 'Not an actual generation project (product / market).'
              : (target.type === 'project_portfolio'
                ? 'Multi-phase portfolio / EPC-module scope — not a single owned plant.'
                : 'Development pipeline — not a verified generation project.'))
            : (target.type === 'product'
              ? '실제 발전 프로젝트가 아닙니다(제품·시장).'
              : (target.type === 'project_portfolio'
                ? '다단계 단지·EPC/모듈 공급 범위 — 단일 보유 발전소가 아님.'
                : '개발 파이프라인 — 확인된 발전 프로젝트가 아님.'))) + '</p>';
        }
        if (target.capacityDisplayKo || target.capacityDisplayEn) {
          html += '<p><strong>' + (lang === 'en' ? 'Capacity meaning: ' : '용량 의미: ') + '</strong>'
            + (lang === 'en' ? (target.capacityDisplayEn || target.capacityDisplayKo) : (target.capacityDisplayKo || target.capacityDisplayEn))
            + '</p>';
        }
        if (target.projectStatus) {
          html += '<p><strong>' + (lang === 'en' ? 'Project status: ' : '프로젝트 상태: ')
            + projectStatusLabel(target.projectStatus, lang) + '</strong></p>';
        }
        if (target.technology) {
          html += '<p>' + (lang === 'en' ? 'Technology: ' : '기술: ') + target.technology + '</p>';
        }
        if (target.region) {
          html += '<p>' + (lang === 'en' ? 'Region: ' : '지역: ') + target.region + '</p>';
        }
        if (target.projectTotalCapacity != null || (target.capacityType === 'project_total' && target.capacityValue != null)) {
          html += '<p>' + (lang === 'en' ? 'Project total capacity: ' : '프로젝트 총용량: ')
            + (target.projectTotalCapacity != null ? target.projectTotalCapacity : target.capacityValue)
            + ' ' + (target.capacityUnit || 'MW') + '</p>';
        } else if (target.capacityType === 'contracted_supply_volume' || target.contractedSupplyVolume != null) {
          html += '<p>' + (lang === 'en' ? 'Contracted supply volume: ' : '기자재·계약 공급규모: ')
            + (target.contractedSupplyVolume != null ? target.contractedSupplyVolume : target.capacityValue)
            + ' ' + (target.capacityUnit || 'MW') + '</p>';
        } else if (target.epcScopeCapacity != null || target.capacityType === 'epc_scope') {
          html += '<p>' + (lang === 'en' ? 'EPC scope capacity: ' : 'EPC 수행규모: ')
            + (target.epcScopeCapacity != null ? target.epcScopeCapacity : target.capacityValue)
            + ' ' + (target.capacityUnit || 'MW') + '</p>';
        } else if (target.capacityValue != null) {
          html += '<p>' + (lang === 'en' ? 'Capacity figure: ' : '용량 수치: ')
            + target.capacityValue + ' ' + (target.capacityUnit || 'MW')
            + (target.capacityType ? ' (' + target.capacityType + ')' : '') + '</p>';
        }
        if (target.equityCapacity != null) {
          html += '<p>' + (lang === 'en' ? 'Equity-attributable capacity: ' : '기업 귀속용량: ')
            + target.equityCapacity + ' ' + (target.capacityUnit || 'MW') + '</p>';
        }
        if (target.operatingCapacity != null) {
          html += '<p>' + (lang === 'en' ? 'Operating capacity: ' : '운영 용량: ')
            + target.operatingCapacity + ' ' + (target.capacityUnit || 'MW') + '</p>';
        }
        if (target.manufacturingCapacity != null) {
          html += '<p>' + (lang === 'en' ? 'Manufacturing capacity: ' : '생산능력: ')
            + target.manufacturingCapacity + ' ' + (target.capacityUnit || '') + '</p>';
        }
        if (target.hydrogenProductionCapacity != null) {
          html += '<p>' + (lang === 'en' ? 'Hydrogen production: ' : '수소 생산량: ')
            + target.hydrogenProductionCapacity + ' ' + (target.capacityUnit || 'tH2_per_year') + '</p>';
        }
        if (target.targetCommercialOperationDate || target.commercialOperationDate) {
          html += '<p>' + (lang === 'en' ? 'COD / target: ' : '상업운전(목표): ')
            + (target.commercialOperationDate || target.targetCommercialOperationDate) + '</p>';
        }
        if (target.countryCode) {
          html += '<p>' + (lang === 'en' ? 'Country: ' : '국가: ') + target.countryCode + '</p>';
        }
        if (target.reactorTechnologyId) {
          html += '<p>' + (lang === 'en' ? 'Reactor: ' : '원자로 기술: ') + target.reactorTechnologyId.replace(/^reactor:/, '') + '</p>';
        }
        if (target.unitCount) {
          html += '<p>' + (lang === 'en' ? 'Units: ' : '호기: ') + target.unitCount + '</p>';
        }
        if (target.contractSigned === true) {
          html += '<p>' + (lang === 'en' ? 'Contract signed: yes' : '계약 체결: 예') + '</p>';
        } else if (target.contractSigned === false) {
          html += '<p>' + (lang === 'en' ? 'Contract signed: no' : '계약 체결: 아니오') + '</p>';
        }
        if (target.totalProjectValue != null) {
          html += '<p>' + (lang === 'en' ? 'Total project value: ' : '총사업비: ')
            + target.totalProjectValue + ' ' + (target.currency || '')
            + (target.valueType ? ' (' + target.valueType + ')' : '') + '</p>';
        } else if (target.valueType === 'potential_value') {
          html += '<p><em>' + (lang === 'en'
            ? 'Potential / estimate only — not a company contract amount'
            : '잠재·추정치이며 개별 기업 계약금액이 아닙니다') + '</em></p>';
        }
        if (target.designStatus || target.certificationStatus) {
          html += '<p>' + (lang === 'en' ? 'Design/cert: ' : '설계·인증: ')
            + (target.designStatus || '') + ' / ' + (target.certificationStatus || '') + '</p>';
        }
        if (target.noteKo || target.noteEn) {
          html += '<p>' + (lang === 'en' ? (target.noteEn || target.noteKo) : (target.noteKo || target.noteEn)) + '</p>';
        }
        if (target.isStructuralBundle) {
          html += '<p class="rn-graph-only-badge">' + (lang === 'en'
            ? 'Structural bundle — not a unit-level award'
            : '구조 설명용 — 특정 호기 수주가 아님') + '</p>';
        }
      }
      if (target.type === 'public_corporation' || target.type === 'operator' || target.type === 'government'
        || target.type === 'organization' || target.type === 'domestic_unlisted_company') {
        html += '<p class="rn-graph-only-badge">' + (lang === 'en'
          ? 'Public / unlisted entity (not in listed company table)'
          : '공기업·비상장·기관 (상장 기업 목록 제외)') + '</p>';
      }
      if (target.type === 'domestic_anchor') {
        html += '<p class="rn-graph-only-badge">' + (lang === 'en' ? 'Domestic anchor (not in this sector table)' : '국내 앵커(이 섹터 기업 목록 제외)') + '</p>';
        if (target.panelNoteKo || target.panelNoteEn) {
          html += '<p>' + (lang === 'en' ? (target.panelNoteEn || target.panelNoteKo) : (target.panelNoteKo || target.panelNoteEn)) + '</p>';
        }
        if (target.bigchipPath) {
          html += '<p><a href="' + target.bigchipPath + '">' + (lang === 'en' ? 'Open chip leaders map' : '삼성전자/하이닉스 지도에서 보기') + '</a></p>';
        }
      } else if (target.type === 'product_category' || target.type === 'technology' || target.type === 'end_market'
        || target.type === 'category' || target.type === 'corporate_group') {
        html += '<p class="rn-graph-only-badge">' + (lang === 'en'
          ? (target.type === 'corporate_group'
            ? 'Corporate group (membership ≠ ownership)'
            : 'Category / structure node (not a company)')
          : (target.type === 'corporate_group'
            ? '기업집단 노드 (소속 ≠ 직접 지분)'
            : '업종·구조 노드 (기업이 아님)')) + '</p>';
        if (target.noteKo || target.noteEn) {
          html += '<p>' + (lang === 'en' ? (target.noteEn || target.noteKo) : (target.noteKo || target.noteEn)) + '</p>';
        }
      } else if (target.type === 'major_affiliate' || target.type === 'unlisted_affiliate'
        || target.type === 'domestic_unlisted_company' || target.graphOnly) {
        html += '<p class="rn-graph-only-badge">' + (lang === 'en' ? 'Unlisted affiliate (graph reference)' : '비상장 계열사 (그래프 참고 노드)') + '</p>';
        if (target.panelNoteKo || target.panelNoteEn || target.noteKo || target.noteEn) {
          html += '<p>' + (lang === 'en'
            ? (target.panelNoteEn || target.noteEn || target.panelNoteKo || target.noteKo)
            : (target.panelNoteKo || target.noteKo || target.panelNoteEn || target.noteEn)) + '</p>';
        }
      } else if (target.ticker) {
        html += '<p>' + target.ticker + ' · ' + (target.market || '') + '</p>';
      }
      if (target.entityRole === 'listed_reference_company' || (target.type === 'listed_company' && target.isMapConstituent === false)) {
        html += '<p class="rn-graph-only-badge">' + (lang === 'en'
          ? 'Listed reference company — not a sector map constituent'
          : '상장 참고기업·섹터 구성종목 아님') + '</p>';
      }
      if (target.role || target.financeRole) html += '<p>' + (target.financeRole || target.role) + '</p>';
      if (target.mcapWon && global.fmtMcapTableCell && target.data) {
        html += '<p>' + global.fmtMcapTableCell(target.data) + '</p>';
      } else if (target.mcapWon && !STRUCT_NODE[target.type]) {
        html += '<p>' + (lang === 'en' ? 'Market cap data available on table tab' : '시가총액은 기업 목록 탭 참고') + '</p>';
      }
      var related = state.edges.filter(function (e) { return e.source === target.id || e.target === target.id; });
      var verified = related.filter(function (e) { return e.status === 'confirmed' || e.status === 'reported'; }).length;
      var weak = related.filter(function (e) { return e.status === 'reference' || e.status === 'inferred' || e.status === 'peer'; }).length;
      html += '<p><strong>' + t('rnConnections', lang, state.T) + ':</strong> ' + related.length +
        ' (' + (lang === 'en' ? 'verified/reported ' : '확정·보도 ') + verified +
        ', ' + (lang === 'en' ? 'ref/peer ' : '참고·peer ') + weak + ')</p>';
      if (target.isAnchor || target.id === ANCHOR_SAMSUNG || target.id === ANCHOR_HYNIX) {
        html += '<p><a href="?' + (lang === 'en' ? 'lang=en&' : '') + 'tab=table&ticker=' + encodeURIComponent(target.ticker) + '">' +
          (lang === 'en' ? 'View in company table' : '기업 목록에서 보기') + '</a></p>';
        html += '<p><a href="../semiconductor/korea_semiconductor_map.html?' + (lang === 'en' ? 'lang=en&' : '') +
          'tab=graph&ticker=' + encodeURIComponent(target.ticker) + '">' +
          (lang === 'en' ? 'Open semiconductor supply-chain map' : '반도체 공급망 지도로 이동') + '</a></p>';
      } else if (target.ticker && !target.graphOnly && target.type === 'listed_company') {
        html += '<p><a href="?' + (lang === 'en' ? 'lang=en&' : '') + 'tab=table&ticker=' + encodeURIComponent(target.ticker) + '">' + t('rnGoTable', lang, state.T) + '</a></p>';
      }
    }
    panel.innerHTML = html;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('aria-expanded', 'true');
    var closeBtn = $('rn-detail-close');
    if (closeBtn) closeBtn.onclick = function () { hideDetailPanel(state); };
  }

  function hideDetailPanel(state) {
    var panel = $('rn-detail-panel');
    if (panel) {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('aria-expanded', 'false');
    }
    if (state && global.matchMedia && global.matchMedia('(max-width: 768px)').matches) {
      try { global.document.body.style.overflow = ''; } catch (e) {}
    }
  }

  function stopSimulation(state) {
    if (!state || !state.simulation) return;
    state.simulation.stop();
    state.simulation.on('tick', null);
    state.simulation = null;
  }

  function updateSparseNotice(state, visibleEdgeCount) {
    var el = $('rn-sparse-notice');
    if (!el) return;
    var lang = state.lang;
    var asOf = (state.network && (state.network.lastReviewedAt || state.network.asOf)) || '';
    var parts = [];
    if (state.profileKey === 'bigchip') {
      parts.push(lang === 'en'
        ? 'Officially sourced relationships are shown first. Product/market links are not company trade edges. Peer and reference edges are hidden by default.'
        : '공식 출처로 확인된 관계를 우선 표시합니다. 제품·시장 연결은 기업 간 거래 관계와 다릅니다. 참고·peer 관계는 기본적으로 숨겨져 있습니다.');
    } else if (state.profileKey === 'battery') {
      parts.push(lang === 'en'
        ? 'Circular battery value chain: materials → equipment → cells → demand → recycling. Product/market links are not company trades. Peer/inferred edges stay hidden by default.'
        : '배터리 소재·장비·셀·수요시장·재활용으로 이어지는 순환형 밸류체인입니다. 제품·시장 연결은 기업 간 실제 거래와 구분됩니다.');
    } else if (state.profileKey === 'ship') {
      parts.push(lang === 'en'
        ? 'Project-centered shipbuilding ecosystem: owners → contracts → yards → engines/steel/equipment → delivery/MRO. Vessel-type links are not individual orders. Peer/inferred stay hidden by default.'
        : '선주·수주계약·조선소·엔진·철강·기자재·인도/MRO로 이어지는 프로젝트 중심 조선 생태계입니다. 선종·제품 연결은 개별 수주와 구분됩니다.');
    } else if (state.profileKey === 'finance') {
      parts.push(lang === 'en'
        ? 'Financial holding ownership and corporate-group membership are shown separately. Category links are not ownership. Customer relationships are not included. Peer edges stay hidden by default.'
        : '금융지주 소유구조와 기업집단 소속을 구분합니다. 업종 분류는 지분관계가 아닙니다. 고객 관계는 포함하지 않으며 peer는 기본 숨김입니다.');
    } else if (state.profileKey === 'powergrid') {
      parts.push(lang === 'en'
        ? 'Grid stages and equipment categories explain industry structure. Named supply/award edges require disclosure. Market exposure is not a customer contract. Peer edges stay hidden by default.'
        : '전력망 단계·설비 분류는 산업 구조 설명입니다. 수주·공급 선은 공시 근거가 있을 때만 표시합니다. 수요시장 노출은 고객 계약이 아닙니다.');
    } else if (state.profileKey === 'nuclear') {
      parts.push(lang === 'en'
        ? 'Nuclear project lifecycle: owner/operator → design/EPC → NSSS → O&M, with a separate SMR lane. MOU and preferred-bidder stages are not signed contracts. Peer/inferred stay hidden by default.'
        : '발주·운영·설계·EPC·주기기·정비로 이어지는 원전 생애주기이며 SMR은 별도 레인입니다. MOU·우선협상은 본계약이 아닙니다. peer/추론은 기본 숨김입니다.');
    } else {
      parts.push(lang === 'en'
        ? 'Only confirmed/reported relationships with official sources are shown by default. Use “Peer comparison” or “Inferred/reference” to see more.'
        : '공식 출처로 확인된 확정·보도 관계만 기본 표시합니다. “동종 비교”·“추론·참고” 필터로 추가 관계를 볼 수 있습니다.');
    }
    if (asOf) {
      parts.push(lang === 'en' ? ('Data as of / last review: ' + asOf) : ('데이터 기준일·마지막 검토: ' + asOf));
    }
    if (state.selectedId && visibleEdgeCount === 0) {
      var sel = state.nodeById && state.nodeById[state.selectedId];
      if (state.profileKey === 'finance' && sel) {
        var hasOwns = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.type === 'owns' || e.type === 'controls' || e.type === 'equity_investment');
        });
        var hasGroup = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id) && e.type === 'group_member';
        });
        var onlyClass = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id) && (e.type === 'member_of' || e.type === 'operates_in');
        });
        if (!hasOwns && hasGroup) {
          parts.push(lang === 'en'
            ? 'Corporate-group membership only — not direct ownership.'
            : '동일 기업집단 소속 정보이며 직접 지분관계를 의미하지 않습니다.');
        } else if (!hasOwns && onlyClass) {
          parts.push(lang === 'en'
            ? 'Only financial-sector classification is shown.'
            : '금융업종 내 위치만 표시합니다.');
        } else {
          parts.push(lang === 'en'
            ? 'No officially sourced direct ownership or subsidiary relationships for this company.'
            : '현재 공식 출처로 확인된 직접 지분·자회사 관계가 없습니다.');
        }
      } else if (state.profileKey === 'powergrid' && sel) {
        var hasBiz = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.status === 'confirmed' || e.status === 'reported')
            && /supplies_|awarded_|project_|epc_/.test(e.type || '');
        });
        var hasStruct = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.type === 'manufactures' || e.type === 'used_in_grid_stage' || e.type === 'exposed_to' || e.type === 'member_of');
        });
        var anon = sel.isAnonymousCounterparty || sel.id.indexOf('counterparty:undisclosed') === 0;
        if (anon) {
          parts.push(lang === 'en'
            ? 'Counterparty was not named in the disclosure.'
            : '공시에서 계약 상대방이 공개되지 않았습니다.');
        } else if (!hasBiz && hasStruct) {
          parts.push(lang === 'en'
            ? 'Only grid stages and equipment categories are shown. They do not mean a specific customer or trade relationship.'
            : '전력망 단계와 주요 설비만 표시합니다. 특정 고객·거래 관계를 의미하지 않습니다.');
        } else if (!hasBiz) {
          parts.push(lang === 'en'
            ? 'No officially sourced direct award or supply relationships for this company.'
            : '현재 공식 출처로 확인된 직접 수주·공급 관계가 없습니다.');
        }
      } else if (state.profileKey === 'nuclear' && sel) {
        var hasProj = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.status === 'confirmed' || e.status === 'reported')
            && e.relationClass === 'business';
        });
        var hasNucStruct = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.type === 'manufactures' || e.type === 'supports_lifecycle_stage' || e.relationClass === 'structural');
        });
        var hasMou = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id) && e.type === 'memorandum_with';
        });
        var hasPref = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.type === 'preferred_bidder_for' || e.type === 'selected_for');
        });
        if (hasMou && !hasProj) {
          parts.push(lang === 'en'
            ? 'Cooperation is at memorandum stage and does not mean a signed contract or award.'
            : '협력 양해각서 단계이며 본계약 또는 수주를 의미하지 않습니다.');
        } else if (hasPref) {
          parts.push(lang === 'en'
            ? 'Preferred-bidder / selection stage — may differ from a final contract.'
            : '우선협상·사업자 선정 단계이며 최종 계약과 다를 수 있습니다.');
        } else if (!hasProj && hasNucStruct) {
          parts.push(lang === 'en'
            ? 'Only nuclear lifecycle roles and key products are shown. They do not mean a specific project award.'
            : '원전 생애주기 역할과 주요 제품만 표시합니다. 특정 프로젝트 수주를 의미하지 않습니다.');
        } else if (!hasProj) {
          parts.push(lang === 'en'
            ? 'No officially sourced direct nuclear project relationships for this company.'
            : '현재 공식 출처로 확인된 직접 원전 프로젝트 관계가 없습니다.');
        }
      } else if (state.profileKey === 'renewable' && sel) {
        var hasRnBiz = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.status === 'confirmed' || e.status === 'reported' || e.editorialStatus === 'reported')
            && e.relationClass === 'business';
        });
        var hasRnStruct = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.type === 'manufactures' || e.type === 'used_in_technology'
              || e.type === 'supports_project_stage' || e.relationClass === 'structural');
        });
        var hasRnMou = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && (e.type === 'memorandum_with' || e.projectStatus === 'memorandum');
        });
        var hasRnDev = (state.edges || []).some(function (e) {
          return (e.source === sel.id || e.target === sel.id)
            && /^(development|permit|preferred_bidder|financing)/.test(e.projectStatus || '');
        });
        if (hasRnMou && !hasRnBiz) {
          parts.push(lang === 'en'
            ? 'Cooperation is at memorandum stage and does not mean a confirmed project or award.'
            : '협력 양해각서 단계이며 프로젝트 확정 또는 수주를 의미하지 않습니다.');
        } else if (hasRnDev && !hasRnBiz) {
          parts.push(lang === 'en'
            ? 'Development / permitting stage — construction and commercial operation may still change.'
            : '개발·인허가 단계로 착공 및 상업운전 여부가 변경될 수 있습니다.');
        } else if (!hasRnBiz && hasRnStruct) {
          parts.push(lang === 'en'
            ? 'Only technology, equipment, and value-chain roles are shown. They do not mean a specific project award or ownership.'
            : '기술·설비·밸류체인 역할만 표시합니다. 특정 프로젝트 수주나 보유를 의미하지 않습니다.');
        } else if (!hasRnBiz) {
          parts.push(lang === 'en'
            ? 'No officially sourced direct renewable project relationships for this company.'
            : '현재 공식 출처로 확인된 직접 재생에너지 프로젝트 관계가 없습니다.');
        }
      } else {
        parts.push(lang === 'en'
          ? (state.profileKey === 'ship'
            ? 'No officially sourced direct project/supply relationships for this company under current filters.'
            : 'No verified direct relationships for this company under current filters.')
          : (state.profileKey === 'ship'
            ? '현재 공식 출처로 확인된 직접 프로젝트·공급 관계가 없습니다.'
            : '현재 필터에서 이 기업의 확인된 직접 관계가 없습니다.'));
      }
    } else if (visibleEdgeCount <= 3 && (state.profileKey === 'defense' || state.profileKey === 'bio')) {
      parts.push(lang === 'en'
        ? 'This sector intentionally shows only a small set of verified relationships — not a broken graph.'
        : '이 섹터는 확인된 관계만 소수 표시합니다. 그래프 오류가 아닙니다.');
    }
    el.textContent = parts.join(' ');
    el.hidden = false;
  }

  function buildSimulation(state) {
    var d3 = global.d3;
    if (!d3) return;
    applyInitialLayout(state);
    var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var linkForce = d3.forceLink(state.simEdges).id(function (d) { return d.id; })
      .distance(function (l) { return l.type === 'peer' ? 80 : 120; })
      .strength(0.25);
    state.simulation = d3.forceSimulation(state.simNodes)
      .force('link', linkForce)
      .force('charge', d3.forceManyBody().strength(function (d) { return d.type === 'listed_company' ? -220 : -80; }))
      .force('center', d3.forceCenter(state.W / 2, state.H / 2))
      .force('collide', d3.forceCollide(function (d) { return nodeRadius(d) + 8; }));
    if (reducedMotion) state.simulation.alphaTarget(0).alpha(0);
    if ((state.profile && state.profile.layout) === 'layeredSupplyChain' || state.profile && state.profile.layout === 'ownershipTree') {
      state.simulation.force('x', d3.forceX(function (d) { return d.fx || state.W / 2; }).strength(function (d) { return d.fx != null ? 0.12 : 0.02; }));
      state.simulation.force('y', d3.forceY(function (d) { return d.fy || state.H / 2; }).strength(function (d) { return d.fy != null ? 0.12 : 0.02; }));
    }
    if (state.profile && state.profile.layout === 'dualAnchor') {
      state.simulation.force('charge', d3.forceManyBody().strength(function (d) {
        return d.isAnchor ? -40 : -60;
      }));
      state.simulation.force('x', d3.forceX(function (d) { return d.fx != null ? d.fx : state.W / 2; }).strength(function (d) {
        return d.fx != null ? 0.55 : 0.08;
      }));
      state.simulation.force('y', d3.forceY(function (d) { return d.fy != null ? d.fy : state.H / 2; }).strength(function (d) {
        return d.fy != null ? 0.55 : 0.08;
      }));
      state.simulation.force('center', null);
    }
  }

  function renderGraph(state) {
    var d3 = global.d3;
    if (!d3 || !state.container) {
      markFirstRenderComplete(state);
      return;
    }
    stopSimulation(state);
    DIAG.renderCount += 1;
    diagLog('renderGraph', { n: DIAG.renderCount, sector: state.sectorId });

    var renderKey = state.sectorId + '|' + (state.selectedId || '') + '|' + state.depth + '|' + !!state.overviewMode + '|' + JSON.stringify(state.filters);
    if (state._lastRenderKey != null && state._lastRenderKey !== renderKey) state._forceViewReset = true;
    state._lastRenderKey = renderKey;

    var W = state.container.clientWidth || 900;
    var baseH = state.container.clientHeight || (global.innerWidth <= 768 ? Math.round(global.innerHeight * 0.68) : 700);
    state.W = W;

    var savedTransform = state._graphTransform;
    var preserveZoom = !!(savedTransform && state._preserveZoomOnResize && !state._forceViewReset);

    var graphPack = computeVisibleGraph(state);
    state.simNodes = graphPack.simNodes;
    state.simEdges = graphPack.simEdges;
    state.layoutH = computeExpandedGraphHeight(state.simNodes, state.profile, baseH);
    state.H = state.layoutH;

    var svg = d3.select(state.container);
    svg.selectAll('*').remove();
    var zoomMin = READABILITY.MIN_ZOOM_FIT_ALL;
    state.zoomBehavior = d3.zoom().scaleExtent([zoomMin, 4]).on('zoom', function (ev) {
      state._graphTransform = ev.transform;
      if (state.g) state.g.attr('transform', ev.transform);
      if (state._labelRaf) return;
      state._labelRaf = global.requestAnimationFrame(function () {
        state._labelRaf = 0;
        finalizeGraphLabels(state);
      });
    });
    svg.call(state.zoomBehavior);
    state.g = svg.append('g');
    state.svgEl = svg;

    svg.append('defs').append('marker')
      .attr('id', 'rn-arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 14)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'var(--text-muted, #8b949e)');

    buildSimulation(state);

    var neighborSel = state.selectedId ? getSimNeighborIds(state.simEdges, state.selectedId) : new Set();

    var link = state.g.append('g').attr('class', 'rn-edges').attr('role', 'list').selectAll('line')
      .data(state.simEdges).join('line')
      .attr('role', 'listitem')
      .attr('stroke', function (e) { return edgeStrokeStyle(e).stroke; })
      .attr('stroke-opacity', function (e) {
        var st = edgeStrokeStyle(e);
        if (!state.selectedId && !state.hoveredId) return st.opacity;
        var s = typeof e.source === 'object' ? e.source.id : e.source;
        var t = typeof e.target === 'object' ? e.target.id : e.target;
        var focusId = state.selectedId || state.hoveredId;
        var touches = s === focusId || t === focusId;
        if (touches) return Math.min(1, st.opacity + 0.3);
        return st.opacity * 0.18;
      })
      .attr('stroke-width', function (e) {
        var w = edgeStrokeStyle(e).width;
        if (!state.selectedId) return w;
        var s = typeof e.source === 'object' ? e.source.id : e.source;
        var t = typeof e.target === 'object' ? e.target.id : e.target;
        return (s === state.selectedId || t === state.selectedId) ? w + 0.6 : w;
      })
      .attr('stroke-dasharray', function (e) { return edgeStrokeStyle(e).dash; })
      .attr('marker-end', function (e) {
        if (PEER_TYPES[e.type] || e.status === 'peer' || e.status === 'reference' || e.type === 'member_of') return null;
        if (e.status !== 'confirmed' && e.status !== 'reported') return null;
        return 'url(#rn-arrow)';
      })
      .style('cursor', 'pointer')
      .on('click', function (ev, e) {
        ev.stopPropagation();
        renderDetailPanel(state, e, true);
      });

    var node = state.g.append('g').attr('class', 'rn-nodes').selectAll('g')
      .data(state.simNodes).join('g')
      .attr('class', function (d) {
        var cls = 'rn-node rn-node-' + d.type;
        if (d.id === state.selectedId) cls += ' rn-node-selected';
        if (neighborSel.has(d.id)) cls += ' rn-node-neighbor';
        return cls;
      })
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', function (d) { return nodeLabel(d, state.lang); })
      .style('cursor', 'pointer')
      .on('click', function (ev, d) {
        ev.stopPropagation();
        state._forceViewReset = true;
        state.selectedId = state.selectedId === d.id ? null : d.id;
        if (d.ticker) state.selectedTicker = d.ticker;
        state.overviewMode = !state.selectedId;
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        if (state.selectedId) renderDetailPanel(state, d, false);
        else hideDetailPanel(state);
      })
      .on('mouseenter', function (ev, d) {
        state.hoveredId = d.id;
        finalizeGraphLabels(state);
        if (state.linkSel) {
          state.linkSel.attr('stroke-opacity', function (e) {
            var st = edgeStrokeStyle(e);
            var s = typeof e.source === 'object' ? e.source.id : e.source;
            var t = typeof e.target === 'object' ? e.target.id : e.target;
            var touches = s === d.id || t === d.id;
            if (touches) return Math.min(1, st.opacity + 0.3);
            return state.selectedId ? st.opacity * 0.18 : st.opacity * 0.45;
          });
        }
      })
      .on('mouseleave', function () {
        state.hoveredId = null;
        finalizeGraphLabels(state);
        if (state.linkSel) {
          state.linkSel.attr('stroke-opacity', function (e) {
            var st = edgeStrokeStyle(e);
            if (!state.selectedId) return st.opacity;
            var s = typeof e.source === 'object' ? e.source.id : e.source;
            var t = typeof e.target === 'object' ? e.target.id : e.target;
            var touches = s === state.selectedId || t === state.selectedId;
            return touches ? Math.min(1, st.opacity + 0.3) : st.opacity * 0.18;
          });
        }
      })
      .on('focus', function (ev, d) { state.focusedId = d.id; finalizeGraphLabels(state); })
      .on('blur', function () { state.focusedId = null; finalizeGraphLabels(state); })
      .on('keydown', function (ev, d) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.currentTarget.click(); }
        if (ev.key === 'Escape') { resetView(state); }
      })
      .call(d3.drag()
        .on('start', function (ev, d) {
          if (ev.sourceEvent && ev.sourceEvent.type === 'touchstart') ev.sourceEvent.preventDefault();
          if (!ev.active) state.simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', function (ev, d) { d.fx = ev.x; d.fy = ev.y; })
        .on('end', function (ev, d) { if (!ev.active) state.simulation.alphaTarget(0); }));

    node.filter(function (d) { return d.type === 'listed_company' || d.type === 'group' || d.type === 'domestic_anchor'; })
      .append('circle')
      .attr('r', nodeRadius)
      .attr('fill', function (d) {
        if (d.type === 'domestic_anchor') return '#238636';
        if (d.id === ANCHOR_HYNIX) return '#238636';
        if (d.id === ANCHOR_SAMSUNG) return '#1f6feb';
        return (state.chainColors && state.chainColors[d.group || d.chain]) || '#58a6ff';
      })
      .attr('fill-opacity', 0.85)
      .attr('stroke', function (d) {
        if (d.id === state.selectedId) return '#f0a44b';
        return (d.isAnchor || d.type === 'domestic_anchor') ? '#f0a44b' : 'var(--graph-stroke,#0d1117)';
      })
      .attr('stroke-width', function (d) {
        if (d.id === state.selectedId) return 3;
        return (d.isAnchor || d.type === 'domestic_anchor') ? 2.5 : 1.5;
      })
      .attr('stroke-dasharray', function (d) { return d.type === 'domestic_anchor' ? '4 2' : null; });

    node.filter(function (d) {
      return d.type === 'material_category' || d.type === 'component_category' ||
        d.type === 'equipment_category' || d.type === 'battery_cell' || d.type === 'battery_platform' ||
        d.type === 'product_category' || d.type === 'technology';
    })
      .append('rect')
      .attr('x', function (d) { return -nodeRadius(d) - 2; })
      .attr('y', function (d) { return -nodeRadius(d); })
      .attr('width', function (d) { return (nodeRadius(d) + 2) * 2; })
      .attr('height', function (d) { return nodeRadius(d) * 2; })
      .attr('rx', 6)
      .attr('fill', function (d) {
        if (d.type === 'equipment_category') return '#a371f7';
        if (d.type === 'battery_cell' || d.type === 'battery_platform') return '#58a6ff';
        return '#3fb950';
      })
      .attr('fill-opacity', 0.75)
      .attr('stroke', '#d2a8ff')
      .attr('stroke-width', 1);

    node.filter(function (d) { return d.type === 'recycling_process'; })
      .append('polygon')
      .attr('points', function (d) {
        var r = nodeRadius(d) + 1;
        return '0,' + (-r) + ' ' + r + ',0 0,' + r + ' ' + (-r) + ',0';
      })
      .attr('fill', '#d29922')
      .attr('fill-opacity', 0.75)
      .attr('stroke', '#f0a44b')
      .attr('stroke-width', 1);

    node.filter(function (d) { return d.type === 'end_market'; })
      .append('rect')
      .attr('x', function (d) { return -nodeRadius(d) - 6; })
      .attr('y', function (d) { return -nodeRadius(d) * 0.7; })
      .attr('width', function (d) { return (nodeRadius(d) + 6) * 2; })
      .attr('height', function (d) { return nodeRadius(d) * 1.4; })
      .attr('rx', 999)
      .attr('fill', '#6e7681')
      .attr('fill-opacity', 0.65)
      .attr('stroke', '#8b949e')
      .attr('stroke-width', 1);

    node.filter(function (d) { return d.type === 'subsidiary' || d.type === 'joint_venture'; })
      .append('rect')
      .attr('x', function (d) { return -nodeRadius(d); })
      .attr('y', function (d) { return -nodeRadius(d); })
      .attr('width', function (d) { return nodeRadius(d) * 2; })
      .attr('height', function (d) { return nodeRadius(d) * 2; })
      .attr('rx', 2)
      .attr('fill', '#f0a44b')
      .attr('fill-opacity', 0.7)
      .attr('stroke', '#d29922')
      .attr('stroke-width', 1.5);

    node.filter(function (d) { return d.type === 'major_affiliate' || d.type === 'unlisted_affiliate' || d.type === 'domestic_unlisted_company'; })
      .append('rect')
      .attr('x', function (d) { return -nodeRadius(d); })
      .attr('y', function (d) { return -nodeRadius(d); })
      .attr('width', function (d) { return nodeRadius(d) * 2; })
      .attr('height', function (d) { return nodeRadius(d) * 2; })
      .attr('rx', 3)
      .attr('fill', '#6e7681')
      .attr('fill-opacity', 0.7)
      .attr('stroke', '#f0a44b')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3 2');

    node.filter(function (d) { return d.type === 'global_company'; })
      .append('polygon')
      .attr('points', function (d) { var r = nodeRadius(d) + 2; return '0,' + (-r) + ' ' + r + ',0 0,' + r + ' ' + (-r) + ',0'; })
      .attr('fill', function (d) { return (state.regionColors && state.regionColors[d.region]) || '#888'; })
      .attr('fill-opacity', 0.8);

    node.filter(function (d) { return d.type === 'program' || d.type === 'pipeline'; })
      .append('rect')
      .attr('x', -10).attr('y', -10).attr('width', 20).attr('height', 20)
      .attr('rx', 3)
      .attr('fill', '#f0a44b')
      .attr('fill-opacity', 0.75);

    state.labelSel = state.g.append('g').attr('class', 'rn-labels').selectAll('text')
      .data(state.simNodes).join('text')
      .text(function (d) { return nodeDisplayLabel(d, state.lang, 22); })
      .attr('text-anchor', 'middle')
      .attr('dy', function (d) { return nodeRadius(d) + 14; })
      .attr('font-size', function (d) {
        return labelFontSize(d, state, labelPriorityForNode(d, state, neighborSel), 1);
      })
      .attr('fill', 'var(--graph-label,#e6edf3)')
      .attr('stroke', 'var(--graph-label-stroke, rgba(13,17,23,0.88))')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke fill')
      .attr('pointer-events', 'none')
      .attr('class', function (d) {
        var pr = labelPriorityForNode(d, state, neighborSel);
        var cls = 'rn-label';
        if (isMapListedConstituent(d)) cls += ' rn-label-listed';
        if (pr >= 4) cls += ' rn-label-low';
        if (d.id === state.selectedId) cls += ' rn-label-selected';
        return cls;
      });

    var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var layoutSettled = false;
    state.simulation.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });
      node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      state.labelSel
        .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    });
    state.simulation.on('end', function () {
      if (layoutSettled) return;
      layoutSettled = true;
      finalizeGraphLabels(state);
      if (preserveZoom && savedTransform) {
        svg.call(state.zoomBehavior.transform, savedTransform);
        state._graphTransform = savedTransform;
      } else {
        var mode = state.selectedId ? 'selection' : (state._viewMode === 'fit-all' ? 'fit-all' : 'filter');
        applyGraphTransform(state, mode, false);
      }
      state._preserveZoomOnResize = true;
      state._forceViewReset = false;
    });
    if (reducedMotion) {
      for (var i = 0; i < 40; i++) state.simulation.tick();
      state.simulation.stop();
      layoutSettled = true;
      finalizeGraphLabels(state);
      if (preserveZoom && savedTransform) {
        svg.call(state.zoomBehavior.transform, savedTransform);
        state._graphTransform = savedTransform;
      } else {
        var modeRm = state.selectedId ? 'selection' : 'filter';
        applyGraphTransform(state, modeRm, false);
      }
      state._preserveZoomOnResize = true;
      state._forceViewReset = false;
    } else {
      global.setTimeout(function () {
        if (layoutSettled || !state || state._loadGen !== LOAD_GEN) return;
        layoutSettled = true;
        finalizeGraphLabels(state);
        if (preserveZoom && savedTransform) {
          svg.call(state.zoomBehavior.transform, savedTransform);
        } else {
          applyGraphTransform(state, state.selectedId ? 'selection' : 'filter', false);
        }
        state._preserveZoomOnResize = true;
        state._forceViewReset = false;
      }, 2500);
    }

    state.svgEl = svg;
    state.linkSel = link;
    state.nodeSel = node;
    updateLegend(state);
    updateSparseNotice(state, state.simEdges.length);
    markFirstRenderComplete(state);
  }

  function markFirstRenderComplete(state) {
    if (!state || state.firstRenderComplete) return;
    state.firstRenderComplete = true;
  }

  function updateStickyBar(state) {
    var bar = $('rn-sticky-bar');
    if (!bar) return;
    var lang = state.lang;
    if (state.selectedId) {
      var n = state.nodes.find(function (x) { return x.id === state.selectedId; });
      bar.innerHTML = '<span>' + (n ? nodeLabel(n, lang) : '') + '</span><button type="button" id="rn-reset-view">' + t('rnResetView', lang, state.T) + '</button>';
      var btn = $('rn-reset-view');
      if (btn) btn.onclick = function () { resetView(state); };
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }

  function resetView(state) {
    state.selectedId = null;
    state.selectedTicker = '';
    state.hoveredId = null;
    state.focusedId = null;
    state.overviewMode = true;
    state._forceViewReset = true;
    hideDetailPanel(state);
    pushUrlState(state);
    updateStickyBar(state);
    renderGraph(state);
  }

  function fitAllView(state) {
    if (!state) return;
    state._forceViewReset = true;
    state._viewMode = 'fit-all';
    renderGraph(state);
  }

  function fitSelectionView(state) {
    if (!state || !state.selectedId) return fitFilterView(state);
    state._forceViewReset = true;
    state._viewMode = 'selection';
    applyGraphTransform(state, 'selection', true);
  }

  function fitFilterView(state) {
    if (!state) return;
    state._forceViewReset = true;
    state._viewMode = 'filter';
    applyGraphTransform(state, 'filter', true);
  }

  function buildA11yList(state) {
    var list = $('rn-a11y-list');
    if (!list) return;
    var lang = state.lang;
    var items = state.edges.filter(function (e) { return edgeVisible(e, state.filters, state.nodeById); }).slice(0, 200).map(function (e) {
      var src = state.nodeById[e.source];
      var tgt = state.nodeById[e.target];
      return '<li>' + (src ? nodeLabel(src, lang) : e.source) + ' → ' + edgeLabel(e, lang) + ' (' + e.status + ') → ' + (tgt ? nodeLabel(tgt, lang) : e.target) + '</li>';
    });
    list.innerHTML = items.join('');
  }

  function ensureNuclearToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'nuclear') return;
    if ($('rn-nuclear-filters')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-nuclear-filters';
    wrap.className = 'rn-nuclear-filters';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-stack';

    var scopeRow = document.createElement('div');
    scopeRow.className = 'rn-filter-row';
    var scopes = [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['large_nuclear', lang === 'en' ? 'Large nuclear' : '대형 원전'],
      ['smr', 'SMR'],
      ['domestic', lang === 'en' ? 'Domestic' : '국내'],
      ['overseas', lang === 'en' ? 'Overseas' : '해외'],
      ['om', lang === 'en' ? 'O&M' : '운영·정비'],
    ];
    scopes.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.nuclearScope || 'all') === row[0] ? ' active' : '');
      btn.dataset.scope = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.nuclearScope = row[0];
        scopeRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.scope === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      scopeRow.appendChild(btn);
    });

    var roleRow = document.createElement('div');
    roleRow.className = 'rn-filter-row';
    var roles = [
      ['all', lang === 'en' ? 'All roles' : '전체 역할'],
      ['operator', lang === 'en' ? 'Operator' : '운영'],
      ['architect_engineer', lang === 'en' ? 'Design/EPC' : 'EPC·설계'],
      ['nsss_supplier', lang === 'en' ? 'NSSS' : '원자로·주기기'],
      ['instrumentation_control', lang === 'en' ? 'I&C/aux' : '계측제어'],
      ['maintenance', lang === 'en' ? 'Maintenance' : '정비'],
      ['mou', 'MOU'],
      ['selection', lang === 'en' ? 'Selection' : '협상·선정'],
      ['contract', lang === 'en' ? 'Contracted' : '계약 체결'],
      ['operating', lang === 'en' ? 'Operating' : '운영 중'],
      ['historical', lang === 'en' ? 'Ended' : '완료·중단'],
      ['direct', lang === 'en' ? 'Direct only' : '직접 관계만'],
      ['peer', lang === 'en' ? 'Peer/ref' : 'peer/참고'],
    ];
    roles.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.nuclearRole || 'all') === row[0] ? ' active' : '');
      btn.dataset.role = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.nuclearRole = row[0];
        state.filters.showHistorical = row[0] === 'historical';
        state.filters.showEnded = row[0] === 'historical';
        state.filters.showHidden = row[0] === 'peer' || row[0] === 'historical';
        state.filters.hidePeer = row[0] !== 'peer';
        state.filters.hideInferred = row[0] !== 'peer';
        state.filters.transactionalOnly = row[0] === 'direct';
        roleRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.role === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      roleRow.appendChild(btn);
    });

    wrap.appendChild(scopeRow);
    wrap.appendChild(roleRow);
    prependToToolbar(toolbar, wrap);
  }

  function ensureRenewableToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'renewable') return;
    if ($('rn-renewable-filters')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-renewable-filters';
    wrap.className = 'rn-renewable-filters';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-stack';

    function makeRow(id) {
      var row = document.createElement('div');
      row.id = id;
      row.className = 'rn-filter-row';
      return row;
    }

    var techRow = makeRow('rn-renewable-tech');
    var statusRow = makeRow('rn-renewable-status');
    var roleRow = makeRow('rn-renewable-role');

    [
      ['all', lang === 'en' ? 'All tech' : '전체 기술'],
      ['solar', lang === 'en' ? 'Solar' : '태양광'],
      ['onshore_wind', lang === 'en' ? 'Onshore wind' : '육상풍력'],
      ['offshore_wind', lang === 'en' ? 'Offshore wind' : '해상풍력'],
      ['fuel_cell', lang === 'en' ? 'Fuel cell' : '연료전지'],
      ['hydrogen', lang === 'en' ? 'Hydrogen' : '수소'],
    ].forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.renewableTech || 'all') === row[0] ? ' active' : '');
      btn.dataset.tech = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.renewableTech = row[0];
        techRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.tech === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      techRow.appendChild(btn);
    });

    [
      ['all', lang === 'en' ? 'All stages' : '전체 단계'],
      ['development', lang === 'en' ? 'Development' : '개발·인허가'],
      ['construction', lang === 'en' ? 'Construction' : '건설 중'],
      ['operating', lang === 'en' ? 'Operating' : '운영 중'],
      ['historical', lang === 'en' ? 'Ended' : '완료·중단'],
    ].forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.renewableStatus || 'all') === row[0] ? ' active' : '');
      btn.dataset.status = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.renewableStatus = row[0];
        state.filters.projectStatus = row[0] === 'all' ? '' : row[0];
        state.filters.showHistorical = row[0] === 'historical';
        state.filters.showEnded = row[0] === 'historical';
        state.filters.showHidden = row[0] === 'historical';
        statusRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.status === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      statusRow.appendChild(btn);
    });

    [
      ['all', lang === 'en' ? 'All roles' : '전체 역할'],
      ['developer', lang === 'en' ? 'Developer' : '개발사'],
      ['epc', 'EPC'],
      ['equipment', lang === 'en' ? 'Equipment' : '기자재'],
      ['operator', lang === 'en' ? 'Operator' : '운영사'],
      ['ppa', lang === 'en' ? 'PPA/offtake' : 'PPA·전력판매'],
      ['jv_spv', lang === 'en' ? 'JV/SPV' : 'JV·SPV'],
      ['direct', lang === 'en' ? 'Direct only' : '직접 관계만'],
      ['peer', lang === 'en' ? 'Peer/ref' : 'peer/참고'],
    ].forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.renewableRole || 'all') === row[0] ? ' active' : '');
      btn.dataset.role = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.renewableRole = row[0];
        state.filters.showHidden = row[0] === 'peer' || row[0] === 'historical';
        state.filters.hidePeer = row[0] !== 'peer';
        state.filters.hideInferred = row[0] !== 'peer';
        state.filters.transactionalOnly = row[0] === 'direct';
        roleRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.role === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      roleRow.appendChild(btn);
    });

    wrap.appendChild(techRow);
    wrap.appendChild(statusRow);
    wrap.appendChild(roleRow);
    prependToToolbar(toolbar, wrap);
  }

  function ensureConstructionToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'construction') return;
    if ($('rn-construction-filters')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-construction-filters';
    wrap.className = 'rn-construction-filters';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-stack';
    function makeRow(id) {
      var row = document.createElement('div');
      row.id = id;
      row.className = 'rn-filter-row';
      return row;
    }
    var roleRow = makeRow('rn-construction-role');
    var statusRow = makeRow('rn-construction-status');
    [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['developer', lang === 'en' ? 'Developer' : '개발'],
      ['housing', lang === 'en' ? 'Housing' : '주택'],
      ['plant', lang === 'en' ? 'Plant/infra' : '플랜트'],
      ['overseas', lang === 'en' ? 'Overseas' : '해외'],
      ['machinery', lang === 'en' ? 'Machinery' : '기계'],
      ['spv', 'SPC/PFV'],
      ['consortium', lang === 'en' ? 'Consortium' : '공동도급'],
      ['direct', lang === 'en' ? 'Direct' : '직접'],
      ['peer', 'Peer'],
    ].forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.constructionRole || 'all') === row[0] ? ' active' : '');
      btn.dataset.role = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.constructionRole = row[0];
        state.filters.showHidden = row[0] === 'peer';
        state.filters.hidePeer = row[0] !== 'peer';
        state.filters.hideInferred = row[0] !== 'peer';
        state.filters.transactionalOnly = row[0] === 'direct';
        roleRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.role === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      roleRow.appendChild(btn);
    });
    [
      ['all', lang === 'en' ? 'All stages' : '전체 상태'],
      ['preferred_bidder', lang === 'en' ? 'Preferred' : '우선협상'],
      ['contract', lang === 'en' ? 'Contract' : '계약'],
      ['construction', lang === 'en' ? 'Building' : '건설'],
      ['presale', lang === 'en' ? 'Presale' : '분양'],
      ['completed', lang === 'en' ? 'Done' : '완료'],
    ].forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.constructionStatus || 'all') === row[0] ? ' active' : '');
      btn.dataset.status = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.constructionStatus = row[0];
        state.filters.projectStatus = row[0] === 'all' ? '' : row[0];
        state.filters.showHistorical = row[0] === 'completed';
        state.filters.showEnded = row[0] === 'completed';
        state.filters.showHidden = row[0] === 'completed';
        statusRow.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.status === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      statusRow.appendChild(btn);
    });
    wrap.appendChild(roleRow);
    wrap.appendChild(statusRow);
    prependToToolbar(toolbar, wrap);
  }

  function ensurePowergridToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'powergrid') return;
    if ($('rn-powergrid-filters')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-powergrid-filters';
    wrap.className = 'rn-powergrid-filters';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-row';
    var roles = [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['transmission', lang === 'en' ? 'Transmission' : '송전'],
      ['substation', lang === 'en' ? 'Substation' : '변전'],
      ['distribution', lang === 'en' ? 'Distribution' : '배전'],
      ['power_transformer', lang === 'en' ? 'Transformers' : '변압기'],
      ['cable', lang === 'en' ? 'Cable' : '전선·케이블'],
      ['switchgear', lang === 'en' ? 'Switchgear' : '차단기·개폐기'],
      ['grid_automation', lang === 'en' ? 'Automation' : '전력자동화'],
      ['hvdc', 'HVDC'],
      ['epc', 'EPC'],
      ['data_center', lang === 'en' ? 'Data center' : '데이터센터'],
      ['renewable_interconnection', lang === 'en' ? 'Renewables' : '신재생 연계'],
      ['overseas', lang === 'en' ? 'Overseas' : '해외 프로젝트'],
      ['direct', lang === 'en' ? 'Direct only' : '직접 관계만'],
      ['peer', lang === 'en' ? 'Peer/ref' : 'peer/참고'],
      ['ended', lang === 'en' ? 'Ended' : '종료 관계'],
    ];
    roles.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.powergridFilter || 'all') === row[0] ? ' active' : '');
      btn.dataset.role = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.powergridFilter = row[0];
        state.filters.showEnded = row[0] === 'ended';
        state.filters.showHidden = row[0] === 'peer' || row[0] === 'ended';
        state.filters.hidePeer = row[0] !== 'peer';
        state.filters.hideInferred = row[0] !== 'peer';
        state.filters.transactionalOnly = row[0] === 'direct';
        wrap.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.role === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      wrap.appendChild(btn);
    });
    prependToToolbar(toolbar, wrap);
  }

  function ensureFinanceToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'finance') return;
    if ($('rn-finance-roles')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-finance-roles';
    wrap.className = 'rn-finance-roles';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-row';
    var roles = [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['holding', lang === 'en' ? 'Holdings' : '금융지주'],
      ['bank', lang === 'en' ? 'Banks' : '은행'],
      ['securities', lang === 'en' ? 'Securities/AM' : '증권·운용'],
      ['life_insurance', lang === 'en' ? 'Life' : '생명보험'],
      ['nonlife_insurance', lang === 'en' ? 'Non-life' : '손해보험'],
      ['card_capital', lang === 'en' ? 'Card/Capital' : '카드·캐피탈'],
      ['fintech', lang === 'en' ? 'Fintech' : '핀테크·결제'],
      ['owns', lang === 'en' ? 'Ownership' : '직접 소유'],
      ['group', lang === 'en' ? 'Corp. groups' : '기업집단'],
      ['jv', lang === 'en' ? 'JV/Invest' : 'JV·전략투자'],
      ['independent', lang === 'en' ? 'Independents' : '독립 금융사'],
      ['peer', lang === 'en' ? 'Peer/ref' : 'peer/참고'],
      ['ended', lang === 'en' ? 'Ended' : '종료'],
    ];
    roles.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.financeRole || 'all') === row[0] ? ' active' : '');
      btn.dataset.role = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.financeRole = row[0];
        state.filters._financeProfile = state.profile;
        state.filters.showEnded = row[0] === 'ended';
        state.filters.showHidden = row[0] === 'peer' || row[0] === 'ended';
        state.filters.hidePeer = row[0] !== 'peer';
        wrap.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.role === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      wrap.appendChild(btn);
    });
    prependToToolbar(toolbar, wrap);
  }

  function ensureShipToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'ship') return;
    if ($('rn-ship-roles')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-ship-roles';
    wrap.className = 'rn-ship-roles';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-row';
    var roles = [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['shipyard', lang === 'en' ? 'Yards' : '조선소'],
      ['engine', lang === 'en' ? 'Engines' : '엔진·추진'],
      ['steel', lang === 'en' ? 'Steel' : '철강·소재'],
      ['ship_equipment', lang === 'en' ? 'Equipment' : '기자재'],
      ['offshore', lang === 'en' ? 'Offshore' : '해양플랜트'],
      ['shipping', lang === 'en' ? 'Owners' : '해운·선주'],
      ['mro', 'MRO'],
      ['active', lang === 'en' ? 'Active projects' : '진행 프로젝트'],
      ['completed', lang === 'en' ? 'Completed' : '완료 프로젝트'],
      ['direct', lang === 'en' ? 'Direct only' : '직접 관계만'],
      ['peer', lang === 'en' ? 'Peer/ref' : '참고/peer'],
    ];
    roles.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.shipRole || 'all') === row[0] ? ' active' : '');
      btn.dataset.role = row[0];
      btn.textContent = row[1];
      btn.style.minHeight = '44px';
      btn.onclick = function () {
        state.filters.shipRole = row[0];
        state.filters._shipProfile = state.profile;
        state.filters.showCompleted = row[0] === 'completed';
        state.filters.showEnded = row[0] === 'completed';
        state.filters.showHidden = row[0] === 'peer' || row[0] === 'completed';
        state.filters.hidePeer = row[0] !== 'peer';
        state.filters.hideInferred = row[0] !== 'peer';
        wrap.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.role === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      wrap.appendChild(btn);
    });
    prependToToolbar(toolbar, wrap);
  }

  function ensureBatteryToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'battery') return;
    if ($('rn-battery-stages')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-battery-stages';
    wrap.className = 'rn-battery-stages';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-row';
    var stages = [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['소재', lang === 'en' ? 'Materials' : '원재료·소재'],
      ['부품', lang === 'en' ? 'Components' : '부품'],
      ['장비', lang === 'en' ? 'Equipment' : '제조장비'],
      ['셀', lang === 'en' ? 'Cells' : '셀'],
      ['ESS', 'ESS'],
      ['수요시장', lang === 'en' ? 'Demand' : '완성차·수요'],
      ['재활용', lang === 'en' ? 'Recycling' : '재활용'],
      ['jv', 'JV'],
      ['direct', lang === 'en' ? 'Direct only' : '직접 관계만'],
      ['ended', lang === 'en' ? 'Ended' : '종료된 관계'],
    ];
    stages.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.batteryStage || 'all') === row[0] ? ' active' : '');
      btn.dataset.stage = row[0];
      btn.textContent = row[1];
      btn.onclick = function () {
        state.filters.batteryStage = row[0];
        state.filters._batteryProfile = state.profile;
        state.filters.showEnded = row[0] === 'ended';
        if (row[0] === 'ended') state.filters.showHidden = true;
        wrap.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.stage === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      wrap.appendChild(btn);
    });
    prependToToolbar(toolbar, wrap);
  }

  function ensureBigchipToolbar(state) {
    var toolbar = document.querySelector('.rn-toolbar');
    if (!toolbar || state.profileKey !== 'bigchip') return;
    if ($('rn-bigchip-scopes')) return;
    var lang = state.lang;
    var wrap = document.createElement('div');
    wrap.id = 'rn-bigchip-scopes';
    wrap.className = 'rn-bigchip-scopes';
    wrap.className = (wrap.className ? wrap.className + ' ' : '') + 'rn-filter-row';
    var scopes = [
      ['all', lang === 'en' ? 'All' : '전체'],
      ['skhynix', 'SK hynix'],
      ['shared', lang === 'en' ? 'Shared' : '공통'],
      ['samsung', lang === 'en' ? 'Samsung' : '삼성전자'],
      ['products', lang === 'en' ? 'Products' : '제품·기술'],
      ['equipment', lang === 'en' ? 'Equip/Materials' : '장비·소재'],
      ['customers', lang === 'en' ? 'Demand' : '고객·수요'],
      ['ownership', lang === 'en' ? 'Ownership' : '지분·자회사'],
      ['ended', lang === 'en' ? 'Ended' : '종료된 관계'],
    ];
    scopes.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rn-chip' + ((state.filters.bigchipScope || 'all') === row[0] ? ' active' : '');
      btn.dataset.scope = row[0];
      btn.textContent = row[1];
      btn.onclick = function () {
        state.filters.bigchipScope = row[0];
        state.filters.showEnded = row[0] === 'ended';
        if (row[0] === 'ended') state.filters.showHidden = true;
        if (row[0] === 'samsung') {
          state.selectedId = ANCHOR_SAMSUNG;
          state.selectedTicker = '005930';
          state.overviewMode = false;
        } else if (row[0] === 'skhynix') {
          state.selectedId = ANCHOR_HYNIX;
          state.selectedTicker = '000660';
          state.overviewMode = false;
        } else if (row[0] === 'all' || row[0] === 'shared') {
          state.selectedId = null;
          state.selectedTicker = '';
          state.overviewMode = true;
        }
        wrap.querySelectorAll('.rn-chip').forEach(function (b) {
          b.classList.toggle('active', b.dataset.scope === row[0]);
        });
        pushUrlState(state);
        updateStickyBar(state);
        renderGraph(state);
        buildA11yList(state);
      };
      wrap.appendChild(btn);
    });
    prependToToolbar(toolbar, wrap);

    var ended = document.createElement('label');
    ended.className = 'rn-chip';
    ended.innerHTML = '<input type="checkbox" id="rn-filter-ended" style="margin-right:4px" />' +
      (lang === 'en' ? 'Show ended' : '종료 관계');
    toolbar.appendChild(ended);
    var endedCb = $('rn-filter-ended');
    if (endedCb) {
      endedCb.checked = !!state.filters.showEnded;
      endedCb.onchange = function () {
        state.filters.showEnded = endedCb.checked;
        pushUrlState(state);
        renderGraph(state);
        buildA11yList(state);
      };
    }
  }

  function wireControls(state) {
    setupWorkspaceLayout(state);
    if (state._controlsWired) return;
    state._controlsWired = true;

    ensureBigchipToolbar(state);
    ensureBatteryToolbar(state);
    ensureShipToolbar(state);
    ensureFinanceToolbar(state);
    ensurePowergridToolbar(state);
    ensureNuclearToolbar(state);
    ensureRenewableToolbar(state);
    ensureConstructionToolbar(state);

    var search = $('rn-search');
    if (search) {
      search.oninput = debounce(function () {
        var q = search.value.trim().toLowerCase();
        if (!q) { resetView(state); return; }
        var hit = state.nodes.find(function (n) {
          return (n.ticker && n.ticker.indexOf(q) >= 0) ||
            (n.nameKo && n.nameKo.toLowerCase().indexOf(q) >= 0) ||
            (n.nameEn && n.nameEn.toLowerCase().indexOf(q) >= 0);
        });
        if (hit) {
          state._forceViewReset = true;
          state.selectedId = hit.id;
          state.selectedTicker = hit.ticker || '';
          state.overviewMode = false;
          pushUrlState(state);
          updateStickyBar(state);
          renderGraph(state);
          renderDetailPanel(state, hit, false);
        }
      }, 120);
    }

    var confirmed = $('rn-filter-confirmed');
    if (confirmed) confirmed.onchange = function () {
      state.filters.confirmedOnly = confirmed.checked;
      renderGraph(state);
      buildA11yList(state);
    };

    var peer = $('rn-filter-peer');
    if (peer) peer.onchange = function () {
      state.filters.hidePeer = !peer.checked;
      state.filters.showHidden = peer.checked;
      renderGraph(state);
      buildA11yList(state);
    };

    var inferred = $('rn-filter-inferred');
    if (inferred) inferred.onchange = function () {
      state.filters.hideInferred = !inferred.checked;
      state.filters.hideReference = !inferred.checked;
      state.filters.showHidden = inferred.checked;
      renderGraph(state);
      buildA11yList(state);
    };

    var depth1 = $('rn-depth-1');
    var depth2 = $('rn-depth-2');
    if (depth1) depth1.onclick = function () { state.depth = 1; pushUrlState(state); syncFilterUi(state); renderGraph(state); };
    if (depth2) depth2.onclick = function () { state.depth = 2; pushUrlState(state); syncFilterUi(state); renderGraph(state); };

    if (!state._escHandler) {
      state._escHandler = function (ev) {
        if (ev.key === 'Escape' && state.initialized) resetView(state);
      };
      document.addEventListener('keydown', state._escHandler);
    }
  }

  function installPopstate(state) {
    if (POPSTATE_INSTALLED) return;
    POPSTATE_INSTALLED = true;
    global.addEventListener('popstate', function () {
      DIAG.popstateCount += 1;
      if (!STATE || !STATE.initialized) return;
      var graphTab = document.getElementById('tab-graph');
      if (!graphTab || !graphTab.classList.contains('active')) return;
      applyUrlToState(STATE);
      updateStickyBar(STATE);
      renderGraph(STATE);
      buildA11yList(STATE);
    });
  }

  function loadNetwork(state) {
    var path = state.profile && state.profile.networkPath;
    if (!path) {
      state.network = buildLegacyNetwork(state.ctx);
      state.usingLegacy = true;
      console.info('[RelationNetwork] legacy fallback for', state.sectorId, state.network.edges.length, 'edges');
      return Promise.resolve(state.network);
    }
    return fetch('../' + path.replace(/^data\//, 'data/') + '?v=' + (state.networkVersion || 1))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('network fetch')); })
      .then(function (json) {
        state.network = json;
        state.usingLegacy = false;
        return json;
      })
      .catch(function () {
        state.network = buildLegacyNetwork(state.ctx);
        state.usingLegacy = true;
        console.warn('[RelationNetwork] fetch failed, legacy fallback', state.sectorId);
        return state.network;
      });
  }

  function initNetworkData(state) {
    setupWorkspaceLayout(state);
    var net = state.network;
    state.nodes = mergeCompanyMeta(net.nodes || [], state.ctx.koreanCompanies, state.ctx.globalCompanies);
    state.edges = (net.edges || []).map(function (e) {
      return Object.assign({}, e, { source: e.source, target: e.target });
    });
    state.nodeById = {};
    state.nodes.forEach(function (n) { state.nodeById[n.id] = n; });

    applyUrlToState(state);

    var modelEl = $('rn-model-desc');
    if (modelEl && state.profile) {
      modelEl.textContent = state.lang === 'en' ? state.profile.modelDescEn : state.profile.modelDescKo;
    }

    ensureBigchipToolbar(state);
    ensureBatteryToolbar(state);
    ensureShipToolbar(state);
    ensureFinanceToolbar(state);
    ensurePowergridToolbar(state);
    ensureNuclearToolbar(state);
    ensureRenewableToolbar(state);
    ensureConstructionToolbar(state);
    if (state.profile) {
      state.filters._batteryProfile = state.profile;
      state.filters._shipProfile = state.profile;
      state.filters._financeProfile = state.profile;
    }
    buildA11yList(state);
    updateStickyBar(state);
    renderGraph(state);
  }

  function ensureInit(ctx) {
    if (RN_WIP) { renderWipPlaceholder(ctx && ctx.lang); return STATE; }
    if (STATE && STATE.sectorId === ctx.sectorId && STATE.initialized) {
      STATE.lang = ctx.lang;
      STATE.ctx = ctx;
      STATE.T = ctx.T;
      applyUrlToState(STATE);
      updateStickyBar(STATE);
      renderGraph(STATE);
      buildA11yList(STATE);
      return STATE;
    }

    if (STATE && STATE.sectorId === ctx.sectorId && !STATE.initialized) {
      STATE.lang = ctx.lang;
      STATE.ctx = ctx;
      STATE.T = ctx.T;
      if (ctx.container) STATE.container = ctx.container;
      return STATE;
    }

    if (STATE && STATE.sectorId !== ctx.sectorId) destroy();

    var loadGen = ++LOAD_GEN;
    var profiles = global.NETWORK_PROFILES || {};
    var profile = profiles[ctx.profileKey] || profiles[ctx.sectorId] || null;
    var filters = defaultViewFilters(profile);
    var url = parseUrlState();
    filters.relationType = sanitizeRelationFilter({ profile: profile }, url.relation);

    STATE = {
      sectorId: ctx.sectorId,
      profileKey: ctx.profileKey || ctx.sectorId,
      profile: profile,
      ctx: ctx,
      lang: ctx.lang,
      T: ctx.T,
      chainColors: ctx.CHAIN_COLORS || {},
      regionColors: ctx.REGION_COLORS || {},
      container: ctx.container || $('graph-svg'),
      filters: filters,
      depth: (profile && profile.defaultDepth) || url.depth || 1,
      overviewMode: !url.ticker,
      selectedId: null,
      selectedTicker: '',
      hoveredId: null,
      focusedId: null,
      _preserveZoomOnResize: false,
      _forceViewReset: true,
      _viewMode: 'filter',
      networkVersion: ctx.networkVersion || 1,
      initialized: false,
      dataLoaded: false,
      urlStateApplied: false,
      firstRenderComplete: false,
      _controlsWired: false,
      _loadGen: loadGen,
      _initError: null,
    };

    DIAG.initCount += 1;
    diagLog('ensureInit', { n: DIAG.initCount, sector: ctx.sectorId, loadGen: loadGen });

    wireControls(STATE);
    installPopstate(STATE);

    loadNetwork(STATE).then(function () {
      if (!STATE || STATE._loadGen !== loadGen) return;
      try {
        STATE.dataLoaded = true;
        initNetworkData(STATE);
        applyUrlToState(STATE);
        STATE.urlStateApplied = true;
        STATE.initialized = true;
        if (STATE.usingLegacy) {
          console.info('[RelationNetwork] legacyFallback=true sector=' + STATE.sectorId);
        }
      } catch (err) {
        STATE._initError = err;
        console.warn('[RelationNetwork] init failed', STATE.sectorId, err);
      }
    }).catch(function (err) {
      if (!STATE || STATE._loadGen !== loadGen) return;
      STATE._initError = err;
      console.warn('[RelationNetwork] load failed', STATE.sectorId, err);
    });

    if (!STATE._resizeObs && global.ResizeObserver && STATE.container) {
      var obsTarget = layoutObserveTarget(STATE);
      STATE._resizeObs = new ResizeObserver(debounce(function () {
        if (STATE.initialized && document.getElementById('tab-graph') && document.getElementById('tab-graph').classList.contains('active')) {
          renderGraph(STATE);
        }
      }, 180));
      if (obsTarget) STATE._resizeObs.observe(obsTarget);
      DIAG.resizeObsCount += 1;
    }

    return STATE;
  }

  function onTabHidden() {
    if (STATE && STATE.simulation) stopSimulation(STATE);
  }

  function onTabVisible(ctx) {
    if (RN_WIP) { renderWipPlaceholder(ctx && ctx.lang); return; }
    if (!STATE || !STATE.initialized || STATE.sectorId !== ctx.sectorId) {
      ensureInit(ctx);
      return;
    }
    STATE.lang = ctx.lang;
    STATE.ctx = ctx;
    STATE.T = ctx.T;
    setupWorkspaceLayout(STATE);
    setupMobileFilterDrawer(STATE);
    renderGraph(STATE);
  }

  function destroy() {
    LOAD_GEN += 1;
    if (STATE && STATE._escHandler) document.removeEventListener('keydown', STATE._escHandler);
    if (STATE && STATE._resizeObs) { STATE._resizeObs.disconnect(); DIAG.resizeObsCount = Math.max(0, DIAG.resizeObsCount - 1); }
    stopSimulation(STATE);
    STATE = null;
  }

  function getInitializationError() {
    return STATE && STATE._initError ? STATE._initError : null;
  }

  function isDestroyed() {
    return STATE === null;
  }

  function whenReady(requiredStages) {
    var err = getInitializationError();
    if (err) return Promise.reject(err);
    if (STATE && STATE.initialized && STATE.firstRenderComplete) {
      return Promise.resolve(STATE);
    }
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + 60000;
      (function tick() {
        var initErr = getInitializationError();
        if (initErr) {
          reject(initErr);
          return;
        }
        if (STATE && STATE.initialized && STATE.firstRenderComplete) {
          resolve(STATE);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('RelationNetwork whenReady timeout'));
          return;
        }
        global.setTimeout(tick, 20);
      })();
    });
  }

  function getReadiness() {
    if (!STATE) {
      return {
        dataLoaded: false,
        initialized: false,
        urlStateApplied: false,
        firstRenderComplete: false,
        layoutReady: false,
      };
    }
    return {
      dataLoaded: !!STATE.dataLoaded,
      initialized: !!STATE.initialized,
      urlStateApplied: !!STATE.urlStateApplied,
      firstRenderComplete: !!STATE.firstRenderComplete,
      layoutReady: !!(STATE.initialized && STATE.firstRenderComplete),
      sectorId: STATE.sectorId,
    };
  }

  global.RelationNetwork = {
    ensureInit: ensureInit,
    onTabHidden: onTabHidden,
    onTabVisible: onTabVisible,
    resetView: function () { if (STATE) resetView(STATE); },
    fitAll: function () { if (STATE) fitAllView(STATE); },
    fitSelection: function () { if (STATE) fitSelectionView(STATE); },
    fitFilter: function () { if (STATE) fitFilterView(STATE); },
    destroy: destroy,
    getState: function () { return STATE; },
    getReadiness: getReadiness,
    whenReady: whenReady,
    getInitializationError: getInitializationError,
    isDestroyed: isDestroyed,
    _diag: function () { return isDiagMode() ? DIAG : null; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
