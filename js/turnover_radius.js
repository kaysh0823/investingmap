/**
 * Shared bubble radius from daily turnover — momentum matrix + volatility scatter.
 */
(function (global) {
  'use strict';

  var MIN_R = 7;

  function hoverRadius(r) {
    return Math.max((Number(r) || 0) * 1.4, 18);
  }

  /**
   * @param {{
   *   items: any[],
   *   turnoverOf: (d: any) => number,
   *   width: number,
   *   height: number,
   *   mobile?: boolean
   * }} opts
   */
  function create(opts) {
    var items = opts && opts.items ? opts.items : [];
    var turnoverOf = opts && typeof opts.turnoverOf === 'function'
      ? opts.turnoverOf
      : function () { return 0; };
    // Prefer SVG outer size; fall back to legacy innerW/innerH if callers lag.
    var width = Math.max(
      1,
      Number(opts && opts.width) || Number(opts && opts.innerW) || 1,
    );
    var height = Math.max(
      1,
      Number(opts && opts.height) || Number(opts && opts.innerH) || 1,
    );
    var mobile = !!(opts && opts.mobile);
    var n = Math.max(1, items.length);
    var maxTurnover = (typeof d3 !== 'undefined' && d3.max
      ? d3.max(items, turnoverOf)
      : null) || 1;
    if (!(maxTurnover > 0)) maxTurnover = 1;
    var maxR = Math.max(
      12,
      Math.min(mobile ? 30 : 42, Math.sqrt((width * height) / n) * 0.3),
    );
    var scale =
      typeof d3 !== 'undefined' && d3.scaleSqrt
        ? d3.scaleSqrt().domain([0, maxTurnover]).range([MIN_R, maxR]).clamp(true)
        : function (v) {
            if (!(v > 0)) return MIN_R;
            var t = Math.min(1, Math.sqrt(v / maxTurnover));
            return MIN_R + (maxR - MIN_R) * t;
          };

    return {
      radius: function (d) {
        var v = turnoverOf(d);
        return v > 0 ? scale(v) : MIN_R;
      },
      minR: MIN_R,
      maxR: maxR,
      hoverRadius: hoverRadius,
    };
  }

  global.InvestingMapTurnoverRadius = {
    create: create,
    hoverRadius: hoverRadius,
    MIN_R: MIN_R,
  };
})(typeof window !== 'undefined' ? window : globalThis);
