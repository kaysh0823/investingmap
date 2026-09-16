/**
 * Single-page scheduler for all returns fetches.
 * register → start; one tick runs all fetchFns, aligns X-Data-Version, then render.
 */
(function (global) {
  'use strict';

  var SESSION_BOUNDARIES_MIN = [9 * 60, 15 * 60 + 30, 16 * 60, 20 * 60];
  var MAX_RETRY = 2;

  /** @type {Map<string, { fetch: Function, render: Function }>} */
  var registry = new Map();
  var started = false;
  var ticking = false;
  var timer = null;
  var boundaryTimer = null;
  var intervalMs = 60 * 1000;
  var lastBoundaryKey = '';
  var syncing = false;

  function pageLang() {
    var html = document.documentElement;
    var lang = (html && html.getAttribute('lang')) || '';
    return lang.toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  }

  function kstMinutesNow() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date());
      var values = {};
      for (var i = 0; i < parts.length; i++) values[parts[i].type] = parts[i].value;
      if (values.weekday === 'Sat' || values.weekday === 'Sun') return -1;
      return Number(values.hour) * 60 + Number(values.minute);
    } catch (e) {
      return -1;
    }
  }

  function sessionOpenNow() {
    var m = kstMinutesNow();
    if (m < 0) return false;
    // Regular 09:00–15:30 or aftermarket until 20:00
    return (m >= 9 * 60 && m < 15 * 60 + 30) || (m >= 15 * 60 + 30 && m < 20 * 60);
  }

  function defaultIntervalMs() {
    return sessionOpenNow() ? 60 * 1000 : 5 * 60 * 1000;
  }

  function extractVersion(result) {
    if (!result) return '';
    if (typeof result.dataVersion === 'string' && result.dataVersion) return result.dataVersion;
    if (result.meta && result.meta.dataVersion) return String(result.meta.dataVersion);
    if (result.headers && typeof result.headers.get === 'function') {
      return result.headers.get('X-Data-Version') || result.headers.get('x-data-version') || '';
    }
    return '';
  }

  /**
   * fetchFn should resolve to { data, dataVersion, response? } or a payload with dataVersion.
   */
  function register(name, fetchFn, renderFn) {
    if (!name || typeof fetchFn !== 'function') return;
    registry.set(String(name), {
      fetch: fetchFn,
      render: typeof renderFn === 'function' ? renderFn : null,
    });
  }

  function unregister(name) {
    registry.delete(String(name));
  }

  function setSyncing(flag) {
    syncing = !!flag;
    try {
      if (global.InvestingMapReturnsBadge && global.InvestingMapReturnsBadge.setSyncing) {
        global.InvestingMapReturnsBadge.setSyncing(syncing, pageLang());
      }
    } catch (e) {}
  }

  function runOne(entry) {
    return Promise.resolve()
      .then(function () { return entry.fetch(); })
      .then(function (result) {
        var data = result && result.data != null ? result.data : result;
        var version = (result && result.dataVersion) || extractVersion(data) || extractVersion(result) || '';
        return { ok: true, data: data, dataVersion: version, entry: entry };
      })
      .catch(function (err) {
        return { ok: false, error: err, data: null, dataVersion: '', entry: entry };
      });
  }

  function maxVersion(rows) {
    var best = '';
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i].dataVersion || '';
      if (v && v > best) best = v;
    }
    return best;
  }

  function allSameVersion(rows) {
    var versions = [];
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].ok) continue;
      versions.push(rows[i].dataVersion || '');
    }
    if (!versions.length) return true;
    var first = versions[0];
    for (var j = 1; j < versions.length; j++) {
      if (versions[j] !== first) return false;
    }
    return true;
  }

  function renderAll(rows) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.ok || !row.entry.render) continue;
      try {
        row.entry.render(row.data, row.dataVersion);
      } catch (e) {}
    }
  }

  function tick() {
    if (ticking) return Promise.resolve();
    if (!registry.size) return Promise.resolve();
    ticking = true;
    var entries = [];
    registry.forEach(function (entry) { entries.push(entry); });

    var rowsPromise = Promise.all(entries.map(runOne));

    return rowsPromise
      .then(function (rows) {
        var attempt = 0;
        function align() {
          if (allSameVersion(rows) || attempt >= MAX_RETRY) return Promise.resolve(rows);
          attempt += 1;
          setSyncing(true);
          var latest = maxVersion(rows);
          var retries = [];
          for (var i = 0; i < rows.length; i++) {
            (function (idx) {
              var row = rows[idx];
              if (!row.ok) return;
              if ((row.dataVersion || '') === latest) return;
              retries.push(
                runOne(row.entry).then(function (next) {
                  rows[idx] = next;
                }),
              );
            })(i);
          }
          if (!retries.length) return Promise.resolve(rows);
          return Promise.all(retries).then(align);
        }
        return align().then(function (aligned) {
          var mismatched = !allSameVersion(aligned);
          setSyncing(mismatched);
          renderAll(aligned);
          return aligned;
        });
      })
      .finally(function () {
        ticking = false;
      });
  }

  function clearTimers() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (boundaryTimer) {
      clearInterval(boundaryTimer);
      boundaryTimer = null;
    }
  }

  function watchSessionBoundaries() {
    if (boundaryTimer) clearInterval(boundaryTimer);
    boundaryTimer = setInterval(function () {
      var m = kstMinutesNow();
      if (m < 0) return;
      var key = '';
      for (var i = 0; i < SESSION_BOUNDARIES_MIN.length; i++) {
        var b = SESSION_BOUNDARIES_MIN[i];
        if (m === b || (m > b && m < b + 2)) {
          key = String(b);
          break;
        }
      }
      if (!key || key === lastBoundaryKey) return;
      lastBoundaryKey = key;
      intervalMs = defaultIntervalMs();
      clearInterval(timer);
      timer = setInterval(function () { tick(); }, intervalMs);
      tick();
    }, 15 * 1000);
  }

  function start(opts) {
    opts = opts || {};
    if (opts.intervalMs != null) {
      intervalMs = Number(opts.intervalMs) || defaultIntervalMs();
    } else if (!started) {
      intervalMs = defaultIntervalMs();
    }
    if (started) {
      return tick();
    }
    started = true;
    clearTimers();
    watchSessionBoundaries();
    tick();
    timer = setInterval(function () { tick(); }, intervalMs);
    return undefined;
  }

  function stop() {
    started = false;
    clearTimers();
  }

  function forceTick() {
    return tick();
  }

  /**
   * Helper: fetch JSON with default cache (ETag / 304) and return { data, dataVersion }.
   */
  function fetchJson(url, init) {
    var opts = init || {};
    if (opts.cache == null) opts.cache = 'default';
    if (!opts.credentials) opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (res) {
      if (res.status === 304) {
        return { data: null, dataVersion: res.headers.get('X-Data-Version') || '', notModified: true, response: res };
      }
      return res.json().then(function (j) {
        if (!res.ok) {
          var msg = (j && (j.message || j.error)) ? String(j.message || j.error) : ('http ' + res.status);
          throw new Error(msg);
        }
        var dv = res.headers.get('X-Data-Version') || (j && j.dataVersion) || '';
        if (j && !j.dataVersion && dv) j.dataVersion = dv;
        return { data: j, dataVersion: dv, response: res };
      });
    });
  }

  global.InvestingMapReturnsTick = {
    register: register,
    unregister: unregister,
    start: start,
    stop: stop,
    forceTick: forceTick,
    fetchJson: fetchJson,
    isSyncing: function () { return syncing; },
    sessionOpenNow: sessionOpenNow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
