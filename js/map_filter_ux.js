/**
 * Tidy filter bar: labeled rows for chain/market chips + search tools.
 */
(function () {
  'use strict';

  if (document.getElementById('im-filter-ux-css')) return;

  var css =
    '.filter-bar{display:flex;flex-direction:column;gap:12px;align-items:stretch;margin-bottom:16px}' +
    '.filter-row{display:flex;flex-direction:column;gap:8px;width:100%}' +
    '.filter-row-tools{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px}' +
    '.filter-label{display:block;margin:0;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.03em}' +
    '#chain-chips,#market-chips{display:flex;flex-wrap:wrap;gap:6px;width:100%;align-items:center}' +
    '.filter-divider{display:none!important}' +
    '.filter-group{display:contents}' +
    '@media (max-width:768px){' +
    '.filter-chip{font-size:11px;padding:5px 10px;border-radius:14px}' +
    '.filter-row-tools{flex-direction:column;align-items:stretch}' +
    '.search-box{width:100%!important;min-width:0;flex:1 1 auto}' +
    '.result-count{margin-left:0!important;width:100%}' +
    '}' +
    '@media (min-width:769px){' +
    '.filter-row-chain,.filter-row-market{flex-direction:row;align-items:flex-start;gap:12px}' +
    '.filter-row-chain .filter-label,.filter-row-market .filter-label{flex:0 0 76px;padding-top:5px}' +
    '.filter-row-tools{margin-top:2px;justify-content:space-between}' +
    '.search-box{flex:1 1 220px;max-width:280px}' +
    '.result-count{margin-left:auto!important;flex:0 0 auto}' +
    '}';

  var el = document.createElement('style');
  el.id = 'im-filter-ux-css';
  el.textContent = css;
  document.head.appendChild(el);
})();
