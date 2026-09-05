/**
 * Market cap display: Korean jo (兆) with 2 decimals = 100억 won granularity.
 */
(function (global) {
  'use strict';

  var MIN_MCAP_WON = 300000000000;
  var JO = 1e12;
  var EOK_100 = 1e10; // 0.01 jo = 100억원

  function fmtMcapKoJo(won) {
    if (won == null || won === 0 || !Number.isFinite(Number(won))) return '\u2014';
    var trimmed = Math.round(Number(won) / EOK_100) * EOK_100;
    return (trimmed / JO).toFixed(2) + '\uC870\uC6D0';
  }

  function isWholeJoMcap(won) {
    return won != null && Number.isFinite(Number(won)) && Number(won) >= JO && Number(won) % JO === 0;
  }

  /** Prefer KRX/sub-jo precision over Naver mobile "N조" only values. */
  function shouldApplyLiveMcap(existing, incoming) {
    if (incoming == null || !Number.isFinite(incoming) || incoming <= 0) return false;
    if (existing == null || !Number.isFinite(existing) || existing <= 0) return true;
    if (isWholeJoMcap(incoming) && !isWholeJoMcap(existing)) return false;
    return true;
  }

  global.InvestingMapMcapFmt = {
    fmtMcapKoJo: fmtMcapKoJo,
    isWholeJoMcap: isWholeJoMcap,
    shouldApplyLiveMcap: shouldApplyLiveMcap,
    MIN_MCAP_WON: MIN_MCAP_WON,
    passesMcapFloor: function (c) {
      if (!c) return false;
      var mcap = c.mcapWon;
      if (mcap == null || !Number.isFinite(Number(mcap)) || Number(mcap) <= 0) return false;
      return Number(mcap) >= MIN_MCAP_WON;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
