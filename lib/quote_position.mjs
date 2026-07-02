/** 52-week price position: (last - low) / (high - low) × 100, clamped 0–100. */
export function calcQuotePosition(last, hi, lo) {
  if (last == null || hi == null || lo == null) return null;
  if (!Number.isFinite(last) || !Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  if (last >= hi) return 100;
  if (last <= lo) return 0;
  const span = hi - lo;
  if (span <= 0) return null;
  const pct = ((last - lo) / span) * 100;
  return pct < 0 ? 0 : pct > 100 ? 100 : pct;
}

export function roundQuotePosition(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}
