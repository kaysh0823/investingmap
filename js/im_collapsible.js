/**
 * Hub collapsible blocks. Collapsed content stays in the DOM (CSS display:none)
 * so crawlers still see h1/h2 text and prerendered copy.
 */
(function (global) {
  'use strict';

  var MQ_DESKTOP = '(min-width: 769px)';

  function setExpanded(btn, panel, expanded) {
    if (!btn || !panel) return;
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded) panel.classList.remove('is-collapsed');
    else panel.classList.add('is-collapsed');
  }

  function bindToggle(btn, panel) {
    if (!btn || !panel || btn._imBound) return;
    btn._imBound = true;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      setExpanded(btn, panel, !open);
    });
  }

  function syncRankDefaults() {
    var desktop = window.matchMedia(MQ_DESKTOP).matches;
    [
      ['hub-rs-toggle', 'hub-top-rs-body'],
      ['hub-top-toggle', 'hub-top-position-body'],
    ].forEach(function (pair) {
      var btn = document.getElementById(pair[0]);
      var panel = document.getElementById(pair[1]);
      if (!btn || !panel) return;
      // Desktop default open; mobile default collapsed (unless user already toggled).
      if (btn.getAttribute('data-user-toggled') === '1') return;
      setExpanded(btn, panel, desktop);
    });
  }

  function markUserToggle(btn) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.setAttribute('data-user-toggled', '1');
    }, { once: false });
  }

  function init() {
    var titleBtn = document.getElementById('hub-title-toggle');
    var leadPanel = document.getElementById('hub-lead-panel');
    // Intro always starts collapsed (mobile + desktop).
    setExpanded(titleBtn, leadPanel, false);
    bindToggle(titleBtn, leadPanel);

    var rsBtn = document.getElementById('hub-rs-toggle');
    var rsBody = document.getElementById('hub-top-rs-body');
    var topBtn = document.getElementById('hub-top-toggle');
    var topBody = document.getElementById('hub-top-position-body');
    bindToggle(rsBtn, rsBody);
    bindToggle(topBtn, topBody);
    markUserToggle(rsBtn);
    markUserToggle(topBtn);
    syncRankDefaults();

    var mq = window.matchMedia(MQ_DESKTOP);
    var onChange = function () { syncRankDefaults(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.InvestingMapCollapsible = {
    syncHubLead: function () { /* intro stays user-controlled; no auto-open */ },
    syncRankDefaults: syncRankDefaults,
  };
})(typeof window !== 'undefined' ? window : globalThis);
