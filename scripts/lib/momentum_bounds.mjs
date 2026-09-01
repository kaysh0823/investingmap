function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Compute persisted momentum boundaries from complete daily OHLC bars.
 * Input must be ordered oldest → newest. Incomplete/non-traded placeholders
 * are excluded so a suspension does not count as an indicator bar.
 */
export function computeMomentumBounds(historyBars) {
  const bars = (historyBars || [])
    .map((bar) => ({
      high: finitePositive(bar?.high),
      low: finitePositive(bar?.low),
      close: finitePositive(bar?.close),
    }))
    .filter(
      (bar) =>
        bar.high != null &&
        bar.low != null &&
        bar.close != null &&
        bar.high >= bar.low,
    );

  function rangeFor(period) {
    if (bars.length < period) return { high: null, low: null };
    const sample = bars.slice(-period);
    return {
      high: Math.max(...sample.map((bar) => bar.high)),
      low: Math.min(...sample.map((bar) => bar.low)),
    };
  }

  const range120 = rangeFor(120);
  const range50 = rangeFor(50);
  const range20 = rangeFor(20);
  let bbUpper = null;
  let bbLower = null;
  if (bars.length >= 50) {
    const closes = bars.slice(-50).map((bar) => bar.close);
    const mean = closes.reduce((sum, close) => sum + close, 0) / closes.length;
    const variance =
      closes.reduce((sum, close) => sum + (close - mean) ** 2, 0) / closes.length;
    const sigma = Math.sqrt(variance);
    bbUpper = mean + 2 * sigma;
    bbLower = mean - 2 * sigma;
  }

  return {
    high_120d: range120.high,
    low_120d: range120.low,
    high_50d: range50.high,
    low_50d: range50.low,
    high_20d: range20.high,
    low_20d: range20.low,
    bb_upper: bbUpper,
    bb_lower: bbLower,
    completeBars: bars.length,
  };
}
