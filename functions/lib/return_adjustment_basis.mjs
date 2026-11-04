/** Reconcile cached adjusted refs with confirmed corporate actions, without mutating raw history. */
import { fetchSupabaseJson, numOrNull } from './supabase_hub.mjs';
import { normalizeTicker } from './hub_dashboard_core.mjs';
import { normalizeAdjustmentEvents, cumulativeAdjustmentRatio } from './price_adjustments.mjs';

const TTL_MS = 60_000;
const stateCache = new Map();
const refsCache = new WeakMap();
function dash(value) {
  const s = String(value || '').replace(/-/g, '');
  return /^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : '';
}
export function adjustmentFreshnessToken(now = new Date()) {
  return Math.floor(now.getTime() / 300_000);
}
function signature(rows) {
  const s = rows.map((r) => `${r.ticker}:${r.effective_date}:${r.ratio}`).sort().join('|');
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
export function adjustmentStateFromRows(rows, throughDate, verified = true) {
  const through = dash(throughDate);
  const byTicker = new Map();
  for (const row of rows || []) {
    const ticker = normalizeTicker(row.ticker);
    if (!ticker || !dash(row.effective_date) || dash(row.effective_date) > through) continue;
    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push({ ...row, effective_date: dash(row.effective_date) });
  }
  const conflicts = new Set();
  const normalized = [];
  for (const [ticker, events] of byTicker) {
    try {
      const clean = normalizeAdjustmentEvents(events, through);
      byTicker.set(ticker, clean);
      normalized.push(...clean.map((row) => ({ ticker, ...row })));
    } catch {
      conflicts.add(ticker);
      byTicker.set(ticker, []);
      normalized.push({ ticker, effective_date: 'conflict', ratio: 0 });
    }
  }
  return { byTicker, conflicts, verified, version: `${verified ? 'a1' : 'unknown'}-${signature(normalized)}` };
}

/** Read only: all active events share one short cache across quote/sector requests. */
export async function loadAdjustmentState(config, throughDate) {
  if (!config) return adjustmentStateFromRows([], throughDate, false);
  const through = dash(throughDate);
  const key = `${config.url}|${through}`;
  const cached = stateCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = (async () => {
    try {
      const rows = await fetchSupabaseJson(config,
        `price_adjustments?effective_date=lte.${through}&select=ticker,effective_date,ratio`
        + '&order=ticker.asc,effective_date.asc', { paginate: true });
      return adjustmentStateFromRows(rows, through);
    } catch {
      // Preserve known affected tickers on a transient failure, but never claim
      // an empty/error response proves there are no adjustments.
      const previous = cached ? await cached.promise : null;
      return previous ? { ...previous, verified: false, version: `unavailable-${previous.version}` }
        : adjustmentStateFromRows([], throughDate, false);
    }
  })();
  stateCache.set(key, { at: Date.now(), promise });
  if (stateCache.size > 8) stateCache.delete(stateCache.keys().next().value);
  return promise;
}

function basisEvents(quote) {
  const basis = quote?.adjustmentBasis;
  if (basis?.version !== 1 || !dash(basis.throughDate) || !Array.isArray(basis.events)) return null;
  if (basis.events.some((event) => !dash(event.effective_date) || dash(event.effective_date) > dash(basis.throughDate))) return null;
  try { return normalizeAdjustmentEvents(basis.events, basis.throughDate); } catch { return null; }
}
function nullQuote(q, reason) {
  return { ...q, closes: q.closes.map(() => null), shares: null, adjustmentError: reason };
}
function normalizeKnownQuote(q, dates, events, anchorDate) {
  const applied = basisEvents(q);
  if (!applied || q.adjustmentError) return null;
  // A changed/removed event needs raw prices. Never undo rounded adjusted closes.
  if (applied.some((a) => !events.some((b) => b.effective_date === a.effective_date && b.ratio === a.ratio))) return null;
  const additions = events.filter((a) => !applied.some((b) => b.effective_date === a.effective_date));
  // A late-discovered event inside the snapshot may cross a forward-filled
  // value whose raw source date predates the displayed calendar date.
  if (additions.some((a) => a.effective_date <= dash(q.adjustmentBasis.throughDate))) return null;
  // Prior adjusted closes were rounded to won; a second factor must be applied
  // to raw prices in one pass rather than magnifying that rounding loss.
  if (additions.length && applied.length) return null;
  if (numOrNull(q.shares) > 0 && !dash(q.sharesBasisDate)) return null;
  const ownDates = dates.slice(-q.closes.length);
  if (ownDates.length !== q.closes.length) return null;
  const closes = additions.length ? q.closes.map((close, i) => {
    if (!(numOrNull(close) > 0)) return null;
    const factor = cumulativeAdjustmentRatio(ownDates[i], additions, anchorDate);
    return Math.round(Number(close) / factor);
  }) : q.closes;
  const sharesDate = dash(q.sharesBasisDate);
  // Price metadata alone does not prove the basis of the stored share count.
  const shares = sharesDate && sharesDate <= anchorDate && numOrNull(q.shares) > 0
    ? Math.round(Number(q.shares) * cumulativeAdjustmentRatio(sharesDate, events, anchorDate)) : null;
  return { ...q, closes, shares, adjustmentError: undefined, sharesBasisDate: anchorDate,
    adjustmentBasis: { version: 1, throughDate: anchorDate, events } };
}

/** Pure reconstruction from stored RAW closes. Ffill happens after adjustments, max 20 sessions. */
export function rebuildQuoteFromRawHistory(q, dates, history, events, anchorDate) {
  const byDate = new Map();
  for (const row of history || []) {
    const date = dash(row.trade_date);
    const close = numOrNull(row.close);
    if (date && close > 0 && date <= dates.at(-1)) byDate.set(date, { ...row, close });
  }
  if (!byDate.size) return null;
  let last = null;
  let gap = 0;
  const closes = dates.map((date) => {
    const row = byDate.get(date);
    if (row) {
      last = Math.round(row.close / cumulativeAdjustmentRatio(date, events, anchorDate));
      gap = 0;
      return last;
    }
    if (last != null && gap < 20) { gap += 1; return last; }
    gap = 20;
    return null;
  }).slice(-q.closes.length);
  // Missing coverage cannot masquerade as a reconstructed price series.
  if (closes.length !== q.closes.length || !closes.some((v) => v > 0)) return null;
  const shareRow = [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a))
    .find(([, row]) => numOrNull(row.mcap_won) > 0);
  const shares = shareRow
    ? Math.round(Number(shareRow[1].mcap_won) / shareRow[1].close
      * cumulativeAdjustmentRatio(shareRow[0], events, anchorDate))
    : null;
  return { ...q, closes, shares, adjustmentError: undefined, sharesBasisDate: anchorDate,
    adjustmentBasis: { version: 1, throughDate: anchorDate, events } };
}

async function fetchRawHistory(config, codes, dates) {
  const byTicker = new Map();
  if (!config || !codes.length || !dates.length) return byTicker;
  // At most 260 sessions per ticker, in bounded 20-ticker batches, paged at 1,000.
  for (let i = 0; i < codes.length; i += 20) {
    const batch = codes.slice(i, i + 20);
    try {
      const rows = await fetchSupabaseJson(config,
        `stock_price_history?ticker=in.(${batch.join(',')})`
        + `&trade_date=gte.${dates[0]}&trade_date=lte.${dates.at(-1)}`
        + '&select=ticker,trade_date,close,mcap_won&order=ticker.asc,trade_date.asc', { paginate: true });
      for (const row of rows) {
        const ticker = normalizeTicker(row.ticker);
        if (!batch.includes(ticker)) continue;
        if (!byTicker.has(ticker)) byTicker.set(ticker, []);
        byTicker.get(ticker).push(row);
      }
    } catch { /* Missing batch fails closed for affected tickers below. */ }
  }
  return byTicker;
}

/**
 * Return a detached refs view in selected numerator's price/share basis. Legacy
 * event-affected refs are rebuilt from raw DB history, never divided speculatively.
 * historyByTicker supports fully offline tests and read-only repair tooling.
 */
export async function reconcileReturnRefs(refs, codes, anchorDate, state, config = null, historyByTicker = null, now = new Date()) {
  if (!refs?.quotes) return refs;
  const anchor = dash(anchorDate);
  const dates = (refs.tradingDates || []).map(dash).filter(Boolean);
  const cacheKey = `${config?.url || 'offline'}|${state.version}|${anchor}|${adjustmentFreshnessToken(now)}|${[...codes].sort().join(',')}`;
  let cache = refsCache.get(refs);
  const cached = cache?.get(cacheKey);
  if (!historyByTicker && cached && Date.now() - cached.at < 300_000) return cached.promise;
  const work = async () => {
    const quotes = { ...refs.quotes };
    const pending = [];
    const eventsFor = new Map();
    for (const ticker of codes) {
      const q = refs.quotes[ticker];
      if (!q?.closes?.length) continue;
      if (state.conflicts.has(ticker)) { quotes[ticker] = nullQuote(q, 'conflicting_events'); continue; }
      const events = normalizeAdjustmentEvents(state.byTicker.get(ticker) || [], anchor);
      const applied = basisEvents(q);
      if (!state.verified) {
        quotes[ticker] = nullQuote(q, 'events_unavailable');
        continue;
      }
      if (!events.length && !applied?.length) continue;
      // Old events before the retained calendar cannot change its closes or a
      // share observation inside it. Avoid rebuilding unrelated historic splits.
      if (!applied && events.every((event) => event.effective_date <= dates[0])) continue;
      eventsFor.set(ticker, events);
      const normalized = normalizeKnownQuote(q, dates, events, anchor);
      if (normalized) quotes[ticker] = normalized;
      else pending.push(ticker);
    }
    const raw = historyByTicker || await fetchRawHistory(config, pending, dates);
    for (const ticker of pending) {
      const rebuilt = rebuildQuoteFromRawHistory(refs.quotes[ticker], dates, raw.get(ticker), eventsFor.get(ticker), anchor);
      quotes[ticker] = rebuilt || nullQuote(refs.quotes[ticker], 'raw_history_unavailable');
    }
    return { ...refs, quotes, adjustmentVersion: state.version, adjustmentThroughDate: anchor };
  };
  const promise = work();
  if (!historyByTicker) {
    if (!cache) { cache = new Map(); refsCache.set(refs, cache); }
    if (cache.size > 16) cache.clear();
    cache.set(cacheKey, { at: Date.now(), promise });
  }
  return promise;
}
