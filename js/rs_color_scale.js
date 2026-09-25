/**
 * Shared RS (0–100) color scale — volatility scatter + valuation strip.
 * Pale pink → deep red; null/non-finite → missing gray.
 */
(function (global) {
  'use strict';

  var MISSING_COLOR = '#9aa3ad';
  var RS_LO = '#ffe0e0';
  var RS_HI = '#8b0000';

  function clamp01(t) {
    if (t == null || !isFinite(t)) return 0;
    return Math.max(0, Math.min(1, t));
  }

  /** Sequential red scale domain [0,1] (same as former map_volatility redScale). */
  function redScale() {
    if (typeof d3 === 'undefined') {
      return function (t) {
        return interpolateRs(clamp01(t));
      };
    }
    return d3.scaleSequential(function (t) {
      return d3.interpolate(RS_LO, RS_HI)(t);
    });
  }

  function interpolateRs(t) {
    t = clamp01(t);
    function hexToRgb(hex) {
      var h = hex.replace('#', '');
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    var a = hexToRgb(RS_LO);
    var b = hexToRgb(RS_HI);
    function ch(x, y) {
      var n = Math.round(x + (y - x) * t);
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + ch(a.r, b.r) + ch(a.g, b.g) + ch(a.b, b.b);
  }

  /**
   * @param {number|null|undefined} rs RS in 0..100
   * @returns {string} CSS color
   */
  function colorForRs(rs) {
    if (typeof rs !== 'number' || !isFinite(rs)) return MISSING_COLOR;
    var t = clamp01(rs / 100);
    if (typeof d3 !== 'undefined') {
      var scale = redScale();
      scale.domain([0, 1]);
      return scale(t);
    }
    return interpolateRs(t);
  }

  global.InvestingMapRsColor = {
    MISSING_COLOR: MISSING_COLOR,
    RS_LO: RS_LO,
    RS_HI: RS_HI,
    clamp01: clamp01,
    redScale: redScale,
    colorForRs: colorForRs,
  };
})(typeof window !== 'undefined' ? window : globalThis);
