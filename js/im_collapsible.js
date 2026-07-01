/**
 * Mobile-first collapsible blocks. Content stays in the DOM for crawlers (<details>).
 */
(function (global) {
  'use strict';

  var MQ = '(max-width: 768px)';

  function syncHubLead() {
    var d = document.getElementById('hub-lead-details');
    if (!d) return;
    d.open = !window.matchMedia(MQ).matches;
  }

  function init() {
    syncHubLead();
    var mq = window.matchMedia(MQ);
    if (mq.addEventListener) mq.addEventListener('change', syncHubLead);
    else if (mq.addListener) mq.addListener(syncHubLead);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.InvestingMapCollapsible = { syncHubLead: syncHubLead };
})(typeof window !== 'undefined' ? window : globalThis);
