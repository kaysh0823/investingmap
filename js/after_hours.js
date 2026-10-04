/**
 * investingmap — KRX after-hours single-price hint (시간외 단일가) under the
 * official regular close in map tables. Display only; returns stay on the KRX
 * regular close. Data: /data/hub_after_hours.json (written by the post_close sync).
 * Shown from 15:30 on the session date until the next session opens (validUntil).
 */
(function () {
  'use strict';

  var DATA_URL = '/data/hub_after_hours.json';
  var MARK = 'im-ah';
  var snapshot = null;
  var scheduled = false;

  function lang() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) { /* ignore */ }
    return (document.documentElement.lang || 'ko').indexOf('en') === 0 ? 'en' : 'ko';
  }

  function active(snap) {
    if (!snap || !snap.items || !snap.validFrom || !snap.validUntil) return false;
    var now = Date.now();
    return now >= Date.parse(snap.validFrom) && now < Date.parse(snap.validUntil);
  }

  function fmtPct(c) {
    if (c == null || !isFinite(c)) return '';
    return (c > 0 ? '+' : '') + Number(c).toFixed(2) + '%';
  }

  function injectStyle() {
    if (document.getElementById('im-ah-style')) return;
    var st = document.createElement('style');
    st.id = 'im-ah-style';
    st.textContent =
      '.' + MARK + '{display:block;font-size:10px;line-height:1.3;color:#8b949e;font-weight:400;white-space:nowrap}' +
      '.' + MARK + ' .up{color:#3fb950}.' + MARK + ' .down{color:#f85149}';
    document.head.appendChild(st);
  }

  function priceCell(tr) {
    var cells = tr.querySelectorAll('td.quote-cell');
    for (var i = 0; i < cells.length; i++) {
      if (!cells[i].classList.contains('ret-cell')) return cells[i];
    }
    return null;
  }

  function regularPrice(cell) {
    var clone = cell.cloneNode(true);
    var old = clone.querySelector('.' + MARK);
    if (old) old.remove();
    var n = parseInt(String(clone.textContent || '').replace(/[^0-9]/g, ''), 10);
    return isFinite(n) ? n : null;
  }

  function decorate() {
    scheduled = false;
    if (!active(snapshot)) return;
    var label = lang() === 'en' ? 'After-hours ' : '시간외 ';
    var title = lang() === 'en'
      ? 'KRX after-hours single-price (16:00–18:00). Returns use the regular close.'
      : 'KRX 시간외 단일가(16:00~18:00) 가격입니다. 등락률·수익률은 정규장 종가 기준입니다.';
    var rows = document.querySelectorAll('tr[data-ticker]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var item = snapshot.items[tr.getAttribute('data-ticker')];
      var cell = priceCell(tr);
      if (!cell) continue;
      var el = cell.querySelector('.' + MARK);
      var regular = regularPrice(cell);
      if (!item || !item.p || regular == null || item.p === regular) {
        if (el) el.remove();
        continue;
      }
      var cls = item.c > 0 ? 'up' : item.c < 0 ? 'down' : '';
      var html = label + Number(item.p).toLocaleString('ko-KR') +
        (item.c != null ? ' <span class="' + cls + '">(' + fmtPct(item.c) + ')</span>' : '');
      if (!el) {
        el = document.createElement('span');
        el.className = MARK;
        cell.appendChild(el);
      }
      if (el.innerHTML !== html) el.innerHTML = html;
      el.title = title;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(decorate);
  }

  function observe() {
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        var own = t && t.classList && t.classList.contains(MARK);
        if (!own) { schedule(); return; }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function start() {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        snapshot = j;
        if (!active(snapshot)) return;
        injectStyle();
        decorate();
        observe();
      })
      .catch(function () { /* optional hint */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
