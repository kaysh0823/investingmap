/**
 * Shared diverging color scales v2 — RS vs market RS, %b vs 0.5.
 * Neutral gray #6e7681 → green #3fb950 / red #f85149 (site up/down tone).
 */
(function (global) {
  'use strict';

  var MISSING_COLOR = '#9aa3ad';
  var NEUTRAL = '#6e7681';
  var GREEN = '#3fb950';
  var RED = '#f85149';
  var RS_HALF = 25; // |ΔRS| / 25 → strength
  var PCTB_HALF = 0.5; // |pctB − 0.5| / 0.5 → strength

  function clamp01(t) {
    if (t == null || !isFinite(t)) return 0;
    return Math.max(0, Math.min(1, t));
  }

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function rgbToHex(r, g, b) {
    function ch(n) {
      var x = Math.max(0, Math.min(255, Math.round(n)));
      return (x < 16 ? '0' : '') + x.toString(16);
    }
    return '#' + ch(r) + ch(g) + ch(b);
  }

  function lerpRgb(aHex, bHex, t) {
    t = clamp01(t);
    if (typeof d3 !== 'undefined' && d3.interpolateRgb) {
      return d3.interpolateRgb(aHex, bHex)(t);
    }
    var a = hexToRgb(aHex);
    var b = hexToRgb(bHex);
    return rgbToHex(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t,
    );
  }

  /** strength = sqrt(clamp(|delta| / half, 0, 1)) */
  function divergingColor(value, center, half) {
    if (typeof value !== 'number' || !isFinite(value)) return MISSING_COLOR;
    var c = typeof center === 'number' && isFinite(center) ? center : 50;
    var h = half > 0 ? half : 25;
    var delta = value - c;
    if (Math.abs(delta) < 1e-9) return NEUTRAL;
    var strength = Math.sqrt(clamp01(Math.abs(delta) / h));
    if (delta > 0) return lerpRgb(NEUTRAL, GREEN, strength);
    return lerpRgb(NEUTRAL, RED, strength);
  }

  /**
   * @param {number|null|undefined} rs
   * @param {number|null|undefined} marketRs center (default 50)
   */
  function colorForRs(rs, marketRs) {
    if (typeof rs !== 'number' || !isFinite(rs)) return MISSING_COLOR;
    var center =
      typeof marketRs === 'number' && isFinite(marketRs) ? marketRs : 50;
    return divergingColor(rs, center, RS_HALF);
  }

  /**
   * Resolve market RS for a company from window.InvestingMapMarketRs.
   * KOSDAQ → kosdaqRs, else kospiRs; missing → 50.
   */
  function marketRsFor(company) {
    var m = global.InvestingMapMarketRs || {};
    var market = String(
      (company && (company.market || company.Market || company.mkt)) || '',
    ).toUpperCase();
    if (market.indexOf('KOSDAQ') >= 0) {
      return typeof m.kosdaqRs === 'number' && isFinite(m.kosdaqRs) ? m.kosdaqRs : 50;
    }
    return typeof m.kospiRs === 'number' && isFinite(m.kospiRs) ? m.kospiRs : 50;
  }

  function gradientCss() {
    return 'background:linear-gradient(to right,' + RED + ',' + NEUTRAL + ',' + GREEN + ')';
  }

  /** Labels for legend gradient: below / market / above. */
  function gradientLabels(lang) {
    if (lang === 'en') {
      return {
        lo: 'Below market RS',
        mid: 'Market RS',
        hi: 'Above',
        loPctB: 'Below 50',
        midPctB: '%b = 50',
        hiPctB: 'Above 50',
      };
    }
    return {
      lo: '시장 RS 미만',
      mid: '시장 RS',
      hi: '초과',
      loPctB: '50 미만',
      midPctB: '%b = 50',
      hiPctB: '50 초과',
    };
  }

  function colorForPctB(pctB) {
    if (typeof pctB !== 'number' || !isFinite(pctB)) return MISSING_COLOR;
    return divergingColor(pctB, 0.5, PCTB_HALF);
  }

  /** @deprecated sequential API — prefer colorForRs(rs, marketRs) */
  function redScale() {
    if (typeof d3 !== 'undefined' && d3.scaleSequential) {
      return d3.scaleSequential(function (t) {
        return lerpRgb(NEUTRAL, RED, clamp01(t));
      });
    }
    return function (t) {
      return lerpRgb(NEUTRAL, RED, clamp01(t));
    };
  }

  global.InvestingMapRsColor = {
    MISSING_COLOR: MISSING_COLOR,
    NEUTRAL: NEUTRAL,
    GREEN: GREEN,
    RED: RED,
    RS_HALF: RS_HALF,
    clamp01: clamp01,
    colorForRs: colorForRs,
    marketRsFor: marketRsFor,
    gradient: gradientCss,
    gradientCss: gradientCss,
    gradientLabels: gradientLabels,
    divergingColor: divergingColor,
    redScale: redScale,
    // legacy aliases
    RS_LO: NEUTRAL,
    RS_HI: RED,
  };

  global.InvestingMapPctBColor = {
    MISSING_COLOR: MISSING_COLOR,
    NEUTRAL: NEUTRAL,
    GREEN: GREEN,
    RED: RED,
    colorForPctB: colorForPctB,
    gradient: gradientCss,
    gradientCss: gradientCss,
  };
})(typeof window !== 'undefined' ? window : globalThis);
