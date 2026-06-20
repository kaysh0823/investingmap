/**
 * Local dev: GET /api/quotes?codes=005930
 * File-backed Naver cache (data/.naver_quotes_cache.json) + same session rules.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchNaverSiseQuote,
  emptyQuote,
  mergeNaverIntoQuote,
} from '../functions/lib/naver_sise_quotes.mjs';
import { isKrxRegularSession, NAVER_REFRESH_MS } from '../functions/lib/krx_session.mjs';

const PORT = Number(process.env.PORT) || 8788;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', '.naver_quotes_cache.json');

let fileCache = null;
let fileCacheLoaded = false;

async function loadFileCache() {
  if (fileCacheLoaded) return fileCache || {};
  fileCacheLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    fileCache = JSON.parse(raw);
  } catch {
    fileCache = {};
  }
  return fileCache;
}

async function saveFileCache() {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(fileCache, null, 2), 'utf8');
}

function normalizeTicker(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim().toUpperCase();
  if (/^[0-9A-Z]{6}$/.test(s)) return s;
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (alnum.length > 6) return alnum.slice(0, 6);
  if (/^[0-9]+$/.test(alnum)) return alnum.padStart(6, '0');
  if (alnum.length === 6) return alnum;
  return null;
}

async function getQuote(code) {
  const cache = await loadFileCache();
  const regular = isKrxRegularSession();
  const entry = cache[code];
  const fresh = entry && entry.fetchedAt && Date.now() - entry.fetchedAt < NAVER_REFRESH_MS;

  if (!regular && entry) {
    return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
  }

  if (entry && fresh) {
    return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
  }

  if (!entry && !regular) {
    /* bootstrap: first fetch even off-hours */
  } else if (!regular) {
    return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
  }

  try {
    const freshQuote = await fetchNaverSiseQuote(code);
    const merged = mergeNaverIntoQuote(emptyQuote(), freshQuote, { preferNaverLast: true });
    cache[code] = { fetchedAt: Date.now(), quote: merged };
    fileCache = cache;
    await saveFileCache();
    return { quote: merged, fromCache: false, fetched: true };
  } catch {
    if (entry) return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
    return { quote: emptyQuote(), fromCache: false, fetched: false };
  }
}

async function handleQuotes(url) {
  const codesRaw = url.searchParams.get('codes') || '';
  const codes = [...new Set(codesRaw.split(/[, ]+/).map(normalizeTicker).filter(Boolean))];
  if (!codes.length) {
    return {
      asOf: new Date().toISOString(),
      items: {},
      source: 'naver-sise-cache',
      regularSession: isKrxRegularSession(),
    };
  }

  const items = {};
  let cacheHits = 0;
  let fetched = 0;
  for (const code of codes) {
    const r = await getQuote(code);
    items[code] = r.quote;
    if (r.fromCache) cacheHits++;
    if (r.fetched) fetched++;
  }

  return {
    asOf: new Date().toISOString(),
    source: 'naver-sise-cache',
    regularSession: isKrxRegularSession(),
    cacheHits,
    naverFetched: fetched,
    items,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/quotes') {
    try {
      const payload = await handleQuotes(url);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'quotes_fetch_failed', message: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Quotes dev server http://127.0.0.1:${PORT}/api/quotes?codes=005930`);
  console.log(`Cache file: ${CACHE_FILE}`);
});
