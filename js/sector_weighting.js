(function (global) {
  'use strict';
  var key = 'im-sector-weighting-v1';
  var eventName = 'investingmap:sector-weighting';
  var selected = 'cap';
  try { if (global.sessionStorage.getItem(key) === 'equal') selected = 'equal'; } catch (e) {}
  function set(value) {
    var next = value === 'equal' ? 'equal' : 'cap';
    if (next === selected) return;
    selected = next;
    try { global.sessionStorage.setItem(key, selected); } catch (e) {}
    global.dispatchEvent(new CustomEvent(eventName, { detail: { weighting: selected } }));
  }
  function mount(root, lang) {
    if (!root) return;
    if (!document.getElementById('im-sector-weighting-css')) {
      var style = document.createElement('style');
      style.id = 'im-sector-weighting-css';
      style.textContent = '.im-sector-weighting{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.im-sector-weighting button{padding:6px 12px;border:1px solid var(--border);border-radius:20px;background:var(--surface2);color:var(--text-muted);font:inherit;font-size:11px;font-weight:600;cursor:pointer}.im-sector-weighting button.is-active{color:var(--accent);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface2))}.im-sector-weighting button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}';
      document.head.appendChild(style);
    }
    root.classList.add('im-sector-weighting');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', lang === 'en' ? 'Sector weighting' : '섹터 수익률 가중 방식');
    root.innerHTML = ['cap', 'equal'].map(function (mode) {
      var label = mode === 'equal' ? (lang === 'en' ? 'Equal weight' : '동일가중') : (lang === 'en' ? 'Market cap' : '시가총액 가중');
      return '<button type="button" data-weighting="' + mode + '" class="' + (selected === mode ? 'is-active' : '') + '" aria-pressed="' + (selected === mode) + '">' + label + '</button>';
    }).join('');
    root.querySelectorAll('[data-weighting]').forEach(function (button) {
      button.addEventListener('click', function () { set(button.getAttribute('data-weighting')); });
    });
  }
  global.InvestingMapSectorWeighting = {
    get: function () { return selected; }, set: set, mount: mount,
    subscribe: function (listener) { global.addEventListener(eventName, function () { listener(selected); }); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
