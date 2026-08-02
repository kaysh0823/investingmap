/**
 * Shared helpers: hub sector daily mcap sums for sector_mcap_daily.
 * Used by backfill + sync (Node); keep free of Cloudflare-only APIs.
 */
import { SECTOR_ORDER, normalizeTicker } from '../../functions/lib/hub_dashboard_core.mjs';

/**
 * @param {object} hubIndex
 * @param {Map<string, number>|Record<string, {mcap_won?: number|null}>} mcapSource
 * @param {string} tradeDateDash YYYY-MM-DD
 * @returns {{ sector_id: string, trade_date: string, mcap_sum: number }[]}
 */
export function buildSectorMcapDailyRows(hubIndex, mcapSource, tradeDateDash) {
  const getMcap = (ticker) => {
    if (!mcapSource) return null;
    if (mcapSource instanceof Map) {
      const m = mcapSource.get(ticker);
      return m != null && Number.isFinite(m) && m > 0 ? m : null;
    }
    const row = mcapSource[ticker] || mcapSource.get?.(ticker);
    const m = row && typeof row === 'object' ? row.mcap_won : row;
    return m != null && Number.isFinite(m) && m > 0 ? m : null;
  };

  const rows = [];
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    let sum = 0;
    let n = 0;
    const seen = new Set();
    for (const c of block.companies || []) {
      const t = normalizeTicker(c.ticker);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const m = getMcap(t);
      if (m == null) continue;
      sum += m;
      n += 1;
    }
    if (n > 0 && sum > 0) {
      rows.push({ sector_id: sid, trade_date: tradeDateDash, mcap_sum: sum });
    }
  }
  return rows;
}

/**
 * Upsert sector_mcap_daily rows (PK = sector_id, trade_date).
 */
export async function upsertSectorMcapDaily(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return { ok: true, upserted: 0 };
  const res = await fetch(`${supabaseUrl}/rest/v1/sector_mcap_daily`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=sector_id,trade_date',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true, upserted: rows.length };
  const body = await res.text();
  return { ok: false, upserted: 0, status: res.status, body };
}
