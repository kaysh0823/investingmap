/**
 * Global header stock search — autocomplete + sector map navigation.
 * SECTOR_MAP must stay in sync with lib/sector_meta.mjs map paths.
 * Bump ?v= when changed (see scripts/patch_global_search.mjs GLOBAL_SEARCH_V).
 */
(function (global) {
  'use strict';

  /** sid → map HTML path (mirror lib/sector_meta.mjs SECTOR_META[*].map) */
  var SECTOR_MAP = {
    bigchip: 'bigchip/korea_bigchip_map.html',
    semi: 'semiconductor/korea_semiconductor_map.html',
    bio: 'bio/korea_bio_map.html',
    ship: 'ship/korea_ship_map.html',
    defense: 'defense/korea_defense_map.html',
    robot: 'robot/korea_robot_map.html',
    auto: 'auto/korea_auto_map.html',
    medtech: 'medtech/korea_medtech_map.html',
    kconsume: 'kconsume/korea_kconsume_map.html',
    cosmetics: 'cosmetics/korea_cosmetics_map.html',
    kcontent: 'kcontent/korea_kcontent_map.html',
    battery: 'battery/korea_battery_map.html',
    renewable: 'renewable/korea_renewable_map.html',
    nuclear: 'nuclear/korea_nuclear_map.html',
    powergrid: 'powergrid/korea_powergrid_map.html',
    finance: 'finance/korea_finance_map.html',
    construction: 'construction/korea_construction_map.html',
    software: 'software/korea_software_map.html',
    holdings: 'holdings/korea_holdings_map.html',
    telecom: 'telecom/korea_telecom_map.html',
    chemical: 'chemical/korea_chemical_map.html',
    travel: 'travel/korea_travel_map.html',
    elec: 'elec/korea_elec_map.html',
    metal: 'metal/korea_metal_map.html',
  };

  var SECTOR_LABELS = {
    bigchip: { ko: '삼성전자/하이닉스', en: 'Samsung/SK hynix' },
    semi: { ko: '반도체', en: 'Semi' },
    bio: { ko: '바이오', en: 'Bio' },
    ship: { ko: '조선/해운', en: 'Shipbuilding/Shipping' },
    defense: { ko: '방산/우주', en: 'Defense & Space' },
    robot: { ko: '로봇', en: 'Robot' },
    auto: { ko: '자동차', en: 'Auto' },
    medtech: { ko: '의료기기/헬스케어', en: 'MedTech' },
    kconsume: { ko: 'K-소비/유통', en: 'K-Consume' },
    cosmetics: { ko: '화장품/미용기기', en: 'Cosmetics' },
    kcontent: { ko: 'K-콘텐츠', en: 'K-Content' },
    battery: { ko: '2차전지', en: 'Battery' },
    renewable: { ko: '신재생', en: 'Renewable' },
    nuclear: { ko: '원전', en: 'Nuclear' },
    powergrid: { ko: '전력설비', en: 'Power Equip.' },
    finance: { ko: '금융', en: 'Finance' },
    construction: { ko: '건설', en: 'Construction' },
    software: { ko: 'IT·소프트웨어', en: 'IT & Software' },
    holdings: { ko: '지주회사', en: 'Holdings' },
    telecom: { ko: '통신', en: 'Telecom' },
    chemical: { ko: '화학·정유', en: 'Chemicals & Refining' },
    travel: { ko: '여행·레저·항공', en: 'Travel & Airlines' },
    elec: { ko: '전기·전자', en: 'Electrical & Electronics' },
    metal: { ko: '철강·금속·기계', en: 'Steel, Metals & Machinery' },
  };

  var COPY = {
    ko: {
      placeholder: '종목명·티커 검색',
      modalTitle: '이동할 화면 선택',
      heatmap: '섹터히트맵',
      momentum: '모멘텀매트릭스',
      volatility: '변동성 분포',
      table: '기업목록',
      noResults: '검색 결과 없음',
      coverageHint: '시총 2천억원 이상 종목만 커버하고 있습니다.',
      shortcutHint: '/ 또는 Ctrl+K',
    },
    en: {
      placeholder: 'Search name or ticker',
      modalTitle: 'Choose a view',
      heatmap: 'Sector Heatmap',
      momentum: 'Momentum Matrix',
      volatility: 'Volatility',
      table: 'Company List',
      noResults: 'No matches',
      coverageHint: 'Only names with market cap ≥ KRW 200B are covered.',
      shortcutHint: '/ or Ctrl+K',
    },
  };

  var indexCache = null;
  var indexLoading = null;
  var ui = null;
  var modal = null;
  var modalItem = null;
  var highlightIdx = -1;
  var lastResults = [];

  function pathPrefix() {
    var p = window.location.pathname.replace(/\\/g, '/');
    if (/\/(bigchip|semiconductor|bio|ship|defense|robot|auto|medtech|energy|battery|ess|renewable|nuclear|powergrid|kculture|kconsume|cosmetics|kcontent|finance|construction|software|holdings|telecom|chemical|travel|elec|metal)\//i.test(p)) {
      return '../';
    }
    return '';
  }

  function pageLang(lang) {
    if (lang === 'en' || lang === 'ko') return lang;
    var l = document.documentElement.getAttribute('lang');
    if (l === 'en' || l === 'ko') return l;
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) {}
    return 'ko';
  }

  function copy(lang) {
    return COPY[pageLang(lang)] || COPY.ko;
  }

  function sectorLabel(sid, lang) {
    var block = SECTOR_LABELS[sid];
    if (!block) return sid;
    return pageLang(lang) === 'en' ? block.en : block.ko;
  }

  function normalizeQuery(q) {
    return String(q || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function loadIndex() {
    if (indexCache) return Promise.resolve(indexCache);
    if (indexLoading) return indexLoading;
    indexLoading = fetch(pathPrefix() + 'data/search_index.json')
      .then(function (res) {
        if (!res.ok) throw new Error('search_index HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        indexCache = Array.isArray(rows) ? rows : [];
        return indexCache;
      })
      .catch(function () {
        indexCache = [];
        return indexCache;
      });
    return indexLoading;
  }

  function scoreItem(item, raw, norm) {
    if (!norm) return -1;
    var ticker = String(item.t || '').toLowerCase();
    var nameKo = normalizeQuery(item.k);
    var nameEn = normalizeQuery(item.e);
    var rawLower = raw.toLowerCase();

    if (ticker === norm || nameKo === norm || nameEn === norm) return 1000;
    if (ticker === rawLower) return 950;
    if (ticker.indexOf(norm) === 0) return 900 - ticker.length;
    if (nameKo.indexOf(norm) === 0) return 800 - nameKo.length;
    if (nameEn.indexOf(norm) === 0) return 780 - nameEn.length;
    if (ticker.indexOf(norm) >= 0) return 700 - ticker.indexOf(norm);
    if (nameKo.indexOf(norm) >= 0) return 600 - nameKo.indexOf(norm);
    if (nameEn.indexOf(norm) >= 0) return 580 - nameEn.indexOf(norm);
    return -1;
  }

  function search(query, lang) {
    var raw = String(query || '').trim();
    var norm = normalizeQuery(raw);
    if (!norm || norm.length < 1) return [];
    if (!indexCache) return [];
    var ranked = [];
    for (var i = 0; i < indexCache.length; i++) {
      var item = indexCache[i];
      if (!SECTOR_MAP[item.s]) continue;
      var score = scoreItem(item, raw, norm);
      if (score < 0) continue;
      ranked.push({ item: item, score: score });
    }
    ranked.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.item.m || 0) - (a.item.m || 0);
    });
    var out = [];
    for (var j = 0; j < ranked.length && out.length < 8; j++) out.push(ranked[j].item);
    return out;
  }

  function displayName(item, lang) {
    return pageLang(lang) === 'en' && item.e ? item.e : item.k || item.e || item.t;
  }

  function buildNavUrl(item, tab, lang) {
    var mapPath = SECTOR_MAP[item.s];
    if (!mapPath) return '#';
    try {
      var u = new URL(pathPrefix() + mapPath, window.location.href);
      u.searchParams.set('tab', tab);
      u.searchParams.set('ticker', item.t);
      if (pageLang(lang) === 'en') u.searchParams.set('lang', 'en');
      else u.searchParams.delete('lang');
      return u.pathname + u.search + u.hash;
    } catch (e) {
      var q = '?tab=' + encodeURIComponent(tab) + '&ticker=' + encodeURIComponent(item.t);
      if (pageLang(lang) === 'en') q += '&lang=en';
      return pathPrefix() + mapPath + q;
    }
  }

  function injectStyles() {
    if (document.getElementById('im-global-search-css')) return;
    var el = document.createElement('style');
    el.id = 'im-global-search-css';
    el.textContent =
      '.im-gs-wrap{position:relative;flex:1 1 200px;max-width:min(360px,42vw);min-width:140px;margin-right:8px}' +
      '.im-gs-input{width:100%;box-sizing:border-box;padding:7px 10px 7px 30px;border-radius:8px;' +
      'border:1px solid var(--border,#30363d);background:var(--surface2,#21262d);color:var(--text,#e6edf3);' +
      'font-size:13px;line-height:1.3;outline:none}' +
      '.im-gs-input:focus{border-color:var(--accent,#58a6ff);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#58a6ff) 25%,transparent)}' +
      '.im-gs-input::placeholder{color:var(--text-muted,#8b949e)}' +
      '.im-gs-icon{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:13px;opacity:.65;pointer-events:none}' +
      '.im-gs-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:10020;margin:0;padding:4px 0;list-style:none;' +
      'background:var(--surface2,#21262d);border:1px solid var(--border,#30363d);border-radius:10px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.35);max-height:min(320px,50vh);overflow:auto;display:none}' +
      '.im-gs-list.is-open{display:block}' +
      '.im-gs-item{padding:8px 12px;font-size:12px;line-height:1.35;cursor:pointer;color:var(--text,#e6edf3)}' +
      '.im-gs-item:hover,.im-gs-item.is-active{background:color-mix(in srgb,var(--accent,#58a6ff) 12%,var(--surface2,#21262d))}' +
      '.im-gs-item strong{font-weight:700}' +
      '.im-gs-item span{color:var(--text-muted,#8b949e)}' +
      '.im-gs-empty{padding:10px 12px 0;font-size:12px;color:var(--text-muted,#8b949e)}' +
      '.im-gs-hint{padding:0 12px 10px;font-size:11px;line-height:1.35;color:var(--text-muted,#8b949e);margin-top:4px}' +
      '.im-gs-topbar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface,#161b22);' +
      'border-bottom:1px solid var(--border,#30363d);position:sticky;top:0;z-index:900}' +
      '.im-gs-topbar .hub-brand,.im-gs-topbar .hdr-brand{flex-shrink:0}' +
      '.im-gs-topbar .header-actions,.im-gs-topbar .im-gs-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}' +
      '.im-gs-modal-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.im-gs-modal{width:min(420px,100%);background:var(--surface,#161b22);border:1px solid var(--border,#30363d);' +
      'border-radius:12px;padding:18px 16px 14px;box-shadow:0 12px 40px rgba(0,0,0,.45)}' +
      '.im-gs-modal h2{margin:0 0 6px;font-size:16px;color:var(--text,#e6edf3)}' +
      '.im-gs-modal p{margin:0 0 14px;font-size:13px;color:var(--text-muted,#8b949e)}' +
      '.im-gs-modal-actions{display:flex;flex-direction:column;gap:8px}' +
      '.im-gs-modal-actions button{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border,#30363d);' +
      'background:var(--surface2,#21262d);color:var(--text,#e6edf3);font-size:13px;font-weight:600;cursor:pointer;text-align:left}' +
      '.im-gs-modal-actions button:hover{border-color:var(--accent,#58a6ff);color:var(--accent,#58a6ff)}' +
      '@media(max-width:768px){.im-gs-wrap{max-width:none;flex:1 1 120px;min-width:0;margin-right:4px}.im-gs-input{font-size:12px;padding:8px 8px 8px 28px}}';
    document.head.appendChild(el);
  }

  function closeDropdown() {
    if (!ui || !ui.list) return;
    ui.list.classList.remove('is-open');
    highlightIdx = -1;
    syncHighlight();
  }

  function syncHighlight() {
    if (!ui || !ui.list) return;
    var items = ui.list.querySelectorAll('.im-gs-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-active', i === highlightIdx);
    }
  }

  function renderDropdown(results, lang) {
    if (!ui) return;
    lastResults = results;
    highlightIdx = results.length ? 0 : -1;
    ui.list.innerHTML = '';
    var c = copy(lang);
    if (!results.length) {
      var empty = document.createElement('li');
      empty.className = 'im-gs-empty';
      empty.textContent = c.noResults;
      ui.list.appendChild(empty);
      if (c.coverageHint) {
        var hint = document.createElement('li');
        hint.className = 'im-gs-hint';
        hint.textContent = c.coverageHint;
        ui.list.appendChild(hint);
      }
      ui.list.classList.add('is-open');
      return;
    }
    results.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.className = 'im-gs-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-idx', String(idx));
      var nm = displayName(item, lang);
      li.innerHTML = '<strong>' + nm + '</strong> (' + item.t + ') · <span>' + sectorLabel(item.s, lang) + '</span>';
      li.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        selectItem(item);
      });
      ui.list.appendChild(li);
    });
    ui.list.classList.add('is-open');
    syncHighlight();
  }

  function selectItem(item) {
    closeDropdown();
    if (ui && ui.input) ui.input.value = displayName(item, pageLang());
    openViewModal(item);
  }

  function trapFocus(container) {
    var focusable = container.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    container.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Tab') return;
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    });
  }

  function closeModal() {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    modal = null;
    modalItem = null;
  }

  function openViewModal(item) {
    closeModal();
    modalItem = item;
    var lang = pageLang();
    var c = copy(lang);
    var nm = displayName(item, lang);
    var backdrop = document.createElement('div');
    backdrop.className = 'im-gs-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    var panel = document.createElement('div');
    panel.className = 'im-gs-modal';
    var title = document.createElement('h2');
    title.textContent = c.modalTitle;
    var sub = document.createElement('p');
    sub.textContent = nm + ' (' + item.t + ' · ' + sectorLabel(item.s, lang) + ')';
    var actions = document.createElement('div');
    actions.className = 'im-gs-modal-actions';
    [
      { tab: 'heatmap', label: c.heatmap },
      { tab: 'momentum', label: c.momentum },
      { tab: 'volatility', label: c.volatility },
      { tab: 'table', label: c.table },
    ].forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        window.location.href = buildNavUrl(item, opt.tab, lang);
      });
      actions.appendChild(btn);
    });
    panel.appendChild(title);
    panel.appendChild(sub);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', onModalKey);
    function onModalKey(ev) {
      if (ev.key === 'Escape') {
        document.removeEventListener('keydown', onModalKey);
        closeModal();
      }
    }
    document.body.appendChild(backdrop);
    trapFocus(panel);
    var firstBtn = actions.querySelector('button');
    if (firstBtn) firstBtn.focus();
  }

  function onInput() {
    if (!ui || !ui.input) return;
    var lang = pageLang();
    ui.input.placeholder = copy(lang).placeholder;
    var results = search(ui.input.value, lang);
    renderDropdown(results, lang);
  }

  function onInputKey(ev) {
    if (!ui || !ui.list) return;
    if (ev.key === 'Escape') {
      closeDropdown();
      ui.input.blur();
      return;
    }
    if (!lastResults.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      highlightIdx = Math.min(lastResults.length - 1, highlightIdx + 1);
      syncHighlight();
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      highlightIdx = Math.max(0, highlightIdx - 1);
      syncHighlight();
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      var pick = highlightIdx >= 0 ? lastResults[highlightIdx] : lastResults[0];
      if (pick) selectItem(pick);
    }
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return el.isContentEditable;
  }

  function bindShortcuts() {
    document.addEventListener('keydown', function (ev) {
      if (isTypingTarget(ev.target) && ev.key !== 'Escape') return;
      if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (isTypingTarget(ev.target)) return;
        ev.preventDefault();
        if (ui && ui.input) ui.input.focus();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        if (ui && ui.input) ui.input.focus();
      }
    });
    document.addEventListener('click', function (ev) {
      if (!ui || !ui.wrap) return;
      if (!ui.wrap.contains(ev.target)) closeDropdown();
    });
  }

  function ensureHeaderSlot() {
    var actions = document.querySelector('.header-actions');
    if (actions) return actions;
    var topbar = document.querySelector('.hub-topbar') || document.querySelector('.hdr-top');
    if (topbar) {
      actions = document.createElement('div');
      actions.className = 'header-actions im-gs-actions';
      topbar.appendChild(actions);
      return actions;
    }
    var bar = document.createElement('div');
    bar.className = 'im-gs-topbar';
    var brand = document.querySelector('.hub-brand') || document.querySelector('.hdr-brand');
    if (brand) bar.appendChild(brand.cloneNode(true));
    actions = document.createElement('div');
    actions.className = 'header-actions im-gs-actions';
    bar.appendChild(actions);
    document.body.insertBefore(bar, document.body.firstChild);
    return actions;
  }

  function mountSearch(actions) {
    injectStyles();
    var lang = pageLang();
    var wrap = document.createElement('div');
    wrap.className = 'im-gs-wrap';
    wrap.setAttribute('role', 'combobox');
    wrap.setAttribute('aria-expanded', 'false');
    var icon = document.createElement('span');
    icon.className = 'im-gs-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⌕';
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'im-gs-input';
    input.id = 'im-global-search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = copy(lang).placeholder;
    input.setAttribute('aria-label', copy(lang).placeholder);
    input.setAttribute('aria-controls', 'im-global-search-list');
    var list = document.createElement('ul');
    list.id = 'im-global-search-list';
    list.className = 'im-gs-list';
    list.setAttribute('role', 'listbox');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onInputKey);
    input.addEventListener('focus', function () {
      if (input.value.trim()) onInput();
    });
    wrap.appendChild(icon);
    wrap.appendChild(input);
    wrap.appendChild(list);
    actions.insertBefore(wrap, actions.firstChild);
    ui = { wrap: wrap, input: input, list: list, actions: actions };
  }

  function init() {
    if (ui) return;
    loadIndex().then(function () {
      var actions = ensureHeaderSlot();
      mountSearch(actions);
      bindShortcuts();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.InvestingMapGlobalSearch = {
    pathPrefix: pathPrefix,
    pageLang: pageLang,
    SECTOR_MAP: SECTOR_MAP,
    search: function (q) { return search(q, pageLang()); },
    loadIndex: loadIndex,
  };
})(typeof window !== 'undefined' ? window : globalThis);
