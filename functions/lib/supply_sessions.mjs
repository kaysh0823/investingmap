import { fetchSupabaseJson } from './supabase_hub.mjs';
import { SUPPLY_FOREIGN_CODE, SUPPLY_INSTITUTION_CODE } from './supply_investor_codes.mjs';

export async function fetchSupplySessions(config, limit, { requireInstitution = true } = {}) {
  const anchor = 'select=trade_date&ticker=eq.005930&order=trade_date.desc';
  let cutoff = '';
  if (requireInstitution) {
    const institution = await fetchSupabaseJson(config,
      `stock_investor_net?${anchor}&invst_tp_cd=eq.${SUPPLY_INSTITUTION_CODE}&limit=1`);
    if (!institution.length) return [];
    cutoff = `&trade_date=lte.${institution[0].trade_date}`;
  }
  const foreign = await fetchSupabaseJson(config,
    `stock_investor_net?${anchor}&invst_tp_cd=eq.${SUPPLY_FOREIGN_CODE}${cutoff}&limit=${limit}`);
  if (!foreign.length) return [];
  const lastPublished = foreign[0].trade_date;
  const prices = await fetchSupabaseJson(config,
    `stock_price_history?${anchor}&trade_date=lte.${lastPublished}&limit=${limit}`);
  // Price history preserves sessions where investor collection was interrupted.
  return [...new Set([...foreign, ...prices].map((row) => row.trade_date))]
    .sort().reverse().slice(0, limit);
}
