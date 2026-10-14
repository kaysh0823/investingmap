import { SECTOR_ORDER, normalizeTicker } from './hub_dashboard_core.mjs';
import { aggregateSectorReturns } from './returns_core.mjs';
import { sectorCaptureKey } from './sector_weighting.mjs';

export function buildSectorReturnCaptureRows(hubIndex, source, timestamp, tradeDate, sessionKind = 'regular') {
  const rows = [];
  for (const sid of SECTOR_ORDER) {
    const tickers = [...new Set((hubIndex.sectors?.[sid]?.companies || []).map((c) => normalizeTicker(c.ticker)).filter(Boolean))];
    const members = tickers.map((ticker) => source.byTicker?.[ticker])
      .filter(Boolean).map((src) => ({ ...src, k: source.meta?.k ?? 0 }));
    for (const weighting of ['cap', 'equal']) {
      const agg = aggregateSectorReturns(members, weighting);
      if (agg.chg1dPct == null) continue;
      rows.push({ sector_id: sectorCaptureKey(sid, weighting), ts: timestamp,
        ret_1d_pct: agg.chg1dPct, anchor_dd: source.meta?.anchorDd || tradeDate.replace(/-/g, ''),
        trade_date: tradeDate, session_kind: sessionKind });
    }
  }
  return rows;
}
