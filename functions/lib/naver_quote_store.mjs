/**
 * Server-side Naver quote cache.
 * Regular session: refresh at most every 5 minutes (mcap, price, PER/PBR).
 * Outside session: refresh at most every 30 minutes — still crawls Naver when stale.
 */

import {
  fetchNaverQuote,
  emptyQuote,
  mergeNaverIntoQuote,
  resolveNaverSession,
} from './naver_sise_quotes.mjs';
import { isKrxClockRegularSession, kstYmdDash, naverRefreshMs } from './krx_session.mjs';

/**
 * Session flag from Naver trade markers across cached quotes (holiday-aware
 * without a hardcoded calendar). Falls back to the wall clock when no marker
 * is available (e.g. all entries served from an old cache).
 * @param {Record<string, {tradeDate?: string|null, marketClosed?: boolean|null}>} items
 */
export function resolveSessionFromItems(items) {
  const clockRegular = isKrxClockRegularSession();
  const dateCounts = new Map();
  for (const q of Object.values(items || {})) {
    if (q && q.tradeDate) dateCounts.set(q.tradeDate, (dateCounts.get(q.tradeDate) || 0) + 1);
  }
  let tradeDate = null;
  let best = 0;
  for (const [d, n] of dateCounts) {
    if (n > best) { best = n; tradeDate = d; }
  }
  let closedVotes = 0;
  let openVotes = 0;
  for (const q of Object.values(items || {})) {
    if (!q || q.tradeDate !== tradeDate) continue;
    if (q.marketClosed === true) closedVotes += 1;
    else if (q.marketClosed === false) openVotes += 1;
  }
  const marketClosed = closedVotes || openVotes ? closedVotes >= openVotes : null;
  return resolveNaverSession({ clockRegular, tradeDate, marketClosed, todayYmdDash: kstYmdDash() });
}

const CACHE_ORIGIN = 'https://investingmap-internal.invalid/naver-quotes/v1';
const memory = new Map();

function entryFromQuote(quote) {
  return { fetchedAt: Date.now(), quote: { ...quote } };
}

function isFresh(entry) {
  return entry && entry.fetchedAt && Date.now() - entry.fetchedAt < naverRefreshMs();
}

async function readCfCache(code) {
  try {
    const cache = caches.default;
    const req = new Request(`${CACHE_ORIGIN}/${code}.json`);
    const res = await cache.match(req);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function writeCfCache(code, entry) {
  try {
    const cache = caches.default;
    const req = new Request(`${CACHE_ORIGIN}/${code}.json`);
    const res = new Response(JSON.stringify(entry), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=31536000' },
    });
    await cache.put(req, res);
  } catch {
    /* ignore */
  }
}

async function loadEntry(code) {
  const mem = memory.get(code);
  if (mem) return mem;
  const cf = await readCfCache(code);
  if (cf) {
    memory.set(code, cf);
    return cf;
  }
  return null;
}

async function saveEntry(code, entry) {
  memory.set(code, entry);
  await writeCfCache(code, entry);
}

function shouldFetchFromNaver(entry) {
  if (!entry) return true;
  return !isFresh(entry);
}

/**
 * @param {string} code
 * @param {{ fetchBudget?: { left: number } }} [opts]
 * @returns {Promise<{ quote: object, fromCache: boolean, fetched: boolean }>}
 */
export async function getCachedNaverQuote(code, opts) {
  const budget = opts && opts.fetchBudget;
  const entry = await loadEntry(code);

  if (!shouldFetchFromNaver(entry)) {
    if (entry) {
      return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
    }
    return { quote: emptyQuote(), fromCache: false, fetched: false };
  }

  if (budget && budget.left <= 0) {
    if (entry) {
      return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
    }
    return { quote: emptyQuote(), fromCache: false, fetched: false };
  }

  try {
    if (budget) budget.left--;
    const fresh = await fetchNaverQuote(code);
    const next = entryFromQuote(mergeNaverIntoQuote(emptyQuote(), fresh, { preferNaverLast: true, preferNaverFundamentals: true }));
    await saveEntry(code, next);
    return { quote: { ...emptyQuote(), ...next.quote }, fromCache: false, fetched: true };
  } catch {
    if (entry) {
      return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
    }
    return { quote: emptyQuote(), fromCache: false, fetched: false };
  }
}

/**
 * @param {string[]} codes
 * @param {{ concurrency?: number, maxFetches?: number }} [opts]
 */
export async function getCachedNaverQuotes(codes, opts) {
  const concurrency = (opts && opts.concurrency) || 4;
  const maxFetches = opts && typeof opts.maxFetches === 'number' ? opts.maxFetches : Infinity;
  const fetchBudget = { left: maxFetches };
  const items = {};
  let cacheHits = 0;
  let fetched = 0;

  for (let i = 0; i < codes.length; i += concurrency) {
    const batch = codes.slice(i, i + concurrency);
    const rows = await Promise.all(
      batch.map(async (code) => {
        const r = await getCachedNaverQuote(code, { fetchBudget });
        return { code, ...r };
      }),
    );
    for (const row of rows) {
      items[row.code] = row.quote;
      if (row.fromCache) cacheHits++;
      if (row.fetched) fetched++;
    }
  }

  const session = resolveSessionFromItems(items);
  return {
    items,
    cacheHits,
    fetched,
    regularSession: session.regularSession,
    marketClosed: session.marketClosed,
    tradeDate: session.tradeDate,
  };
}

/** Test/dev: reset in-memory layer */
export function clearMemoryCache() {
  memory.clear();
}

/** Test/dev: seed cache without HTTP */
export async function seedCache(code, quote, fetchedAt) {
  const entry = { fetchedAt: fetchedAt || Date.now(), quote: { ...quote } };
  await saveEntry(code, entry);
  return entry;
}
