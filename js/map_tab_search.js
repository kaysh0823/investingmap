/**
 * Shared in-tab search UI for heatmap / momentum / volatility / perfcalendar / valuation.
 * URL (?ticker=) is never modified — each tab keeps its own searchQ session state.
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'im-tab-search-css';

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.im-tab-search{display:flex;flex-direction:column;gap:2px;min-width:0;' +
      'flex:1 1 160px;max-width:280px;box-sizing:border-box}' +
      '.im-tab-search input[type=search]{width:100%;box-sizing:border-box;padding:7px 10px;' +
      'border:1px solid var(--border,#30363d);border-radius:8px;background:var(--surface2,#21262d);' +
      'color:var(--text,#e6edf3);font:inherit;font-size:13px;min-height:34px}' +
      '.im-tab-search input[type=search]::placeholder{color:var(--text-muted,#8b949e)}' +
      '.im-tab-search-status{font-size:11px;color:var(--text-muted,#8b949e);margin-top:2px;' +
      'min-height:1.2em;line-height:1.3}' +
      '.im-tab-search-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;' +
      'width:100%;margin:0 0 12px;box-sizing:border-box}' +
      '@media (max-width:640px){' +
      '.im-tab-search{flex:1 1 100%;max-width:none;width:100%}' +
      '.im-tab-search input[type=search]{font-size:16px}' +
      '}';
    document.head.appendChild(style);
  }

  /**
   * Case-insensitive substring match on name / nameKo / nameEn / ticker.
   * @param {object|null} company
   * @param {string} q
   * @returns {boolean}
   */
  function matches(company, q) {
    if (!company || q == null) return false;
    var needle = String(q).trim().toLowerCase();
    if (!needle) return false;
    var fields = [company.name, company.nameKo, company.nameEn, company.ticker];
    for (var i = 0; i < fields.length; i++) {
      var v = fields[i];
      if (v != null && String(v).toLowerCase().indexOf(needle) >= 0) return true;
    }
    return false;
  }

  /**
   * Classify hits against companies currently drawn on the chart.
   * @param {object[]} companies full sector list
   * @param {Set|object|string[]} visibleTickers tickers present on chart
   * @param {string} q
   * @returns {{ query: string, chartHits: object[], nameOnlyHits: object[] }}
   */
  function classifyChartHits(companies, visibleTickers, q) {
    var query = String(q || '').trim();
    var chartHits = [];
    var nameOnlyHits = [];
    if (!query) return { query: '', chartHits: chartHits, nameOnlyHits: nameOnlyHits };

    var vis = visibleTickers;
    if (vis && typeof vis.has !== 'function') {
      if (Array.isArray(vis)) {
        var set = new Set();
        for (var i = 0; i < vis.length; i++) set.add(String(vis[i]));
        vis = set;
      } else {
        var set2 = new Set();
        Object.keys(vis).forEach(function (k) {
          if (vis[k]) set2.add(String(k));
        });
        vis = set2;
      }
    }
    vis = vis || new Set();

    (companies || []).forEach(function (c) {
      if (!matches(c, query)) return;
      var t = c && c.ticker != null ? String(c.ticker) : '';
      if (t && vis.has(t)) chartHits.push(c);
      else nameOnlyHits.push(c);
    });
    return { query: query, chartHits: chartHits, nameOnlyHits: nameOnlyHits };
  }

  function statusText(lang, n, meta) {
    meta = meta || {};
    var q = meta.query != null ? String(meta.query).trim() : '';
    if (!q) return '';
    if (meta.notOnChart) {
      return lang === 'en' ? 'Not shown on chart' : '차트에 표시되지 않는 종목';
    }
    if (!n) return lang === 'en' ? 'No match' : '일치 없음';
    return lang === 'en' ? n + ' matches' : n + '개 일치';
  }

  /**
   * @param {{
   *   container: HTMLElement,
   *   placeholder?: string,
   *   onQuery?: (q: string) => void,
   *   onEnter?: (q: string) => void,
   *   lang?: string
   * }} opts
   * @returns {{ el: HTMLElement, input: HTMLInputElement, setStatus: Function, clear: Function, getQuery: Function, setQuery: Function }}
   */
  function create(opts) {
    opts = opts || {};
    injectStyles();
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var onQuery = typeof opts.onQuery === 'function' ? opts.onQuery : function () {};
    var onEnter = typeof opts.onEnter === 'function' ? opts.onEnter : function () {};

    var el = document.createElement('div');
    el.className = 'im-tab-search';
    var input = document.createElement('input');
    input.type = 'search';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'search');
    input.placeholder =
      opts.placeholder ||
      (lang === 'en' ? 'Search name / ticker' : '이름·티커 검색');
    input.value = opts.value || '';
    var status = document.createElement('div');
    status.className = 'im-tab-search-status';
    status.setAttribute('aria-live', 'polite');
    el.appendChild(input);
    el.appendChild(status);

    if (opts.container && opts.container.appendChild) {
      opts.container.appendChild(el);
    }

    var debounceTimer = null;
    function currentQ() {
      return input.value || '';
    }
    function fireQuery() {
      onQuery(currentQ());
    }
    function onInput() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fireQuery, 120);
    }
    input.addEventListener('input', onInput);
    input.addEventListener('compositionend', function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      fireQuery();
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (debounceTimer) clearTimeout(debounceTimer);
        fireQuery();
        onEnter(currentQ());
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        input.value = '';
        if (debounceTimer) clearTimeout(debounceTimer);
        status.textContent = '';
        onQuery('');
      }
    });

    function setStatus(n, meta) {
      meta = meta || {};
      if (meta.query === undefined) meta.query = currentQ();
      status.textContent = statusText(lang, n, meta);
    }

    function clear() {
      input.value = '';
      if (debounceTimer) clearTimeout(debounceTimer);
      status.textContent = '';
      onQuery('');
    }

    return {
      el: el,
      input: input,
      setStatus: setStatus,
      clear: clear,
      getQuery: currentQ,
      setQuery: function (q) {
        input.value = q == null ? '' : String(q);
      },
      setLang: function (next) {
        lang = next === 'en' ? 'en' : 'ko';
        if (!opts.placeholder) {
          input.placeholder = lang === 'en' ? 'Search name / ticker' : '이름·티커 검색';
        }
      },
    };
  }

  /**
   * Scroll element into view if mostly outside the viewport (single-match UX).
   */
  function scrollIntoViewIfNeeded(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    try {
      var r = el.getBoundingClientRect();
      var vh = global.innerHeight || 0;
      var vw = global.innerWidth || 0;
      var visible = r.bottom > 40 && r.top < vh - 40 && r.right > 0 && r.left < vw;
      if (visible) return;
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
    } catch (e) {}
  }

  /** Gold search-match stroke (same as netmap). */
  var MATCH_STROKE = '#f0b429';
  var MATCH_STROKE_WIDTH = 3;

  global.InvestingMapTabSearch = {
    create: create,
    matches: matches,
    classifyChartHits: classifyChartHits,
    statusText: statusText,
    scrollIntoViewIfNeeded: scrollIntoViewIfNeeded,
    MATCH_STROKE: MATCH_STROKE,
    MATCH_STROKE_WIDTH: MATCH_STROKE_WIDTH,
    injectStyles: injectStyles,
    _test: {
      matches: matches,
      classifyChartHits: classifyChartHits,
      statusText: statusText,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
