/**
 * Local dev: GET /api/quotes?codes=005930
 * File-backed Naver cache (data/.naver_quotes_cache.json) — mcap/per/pbr from Naver crawl.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchNaverQuote,
  emptyQuote,
  mergeNaverIntoQuote,
} from '../functions/lib/naver_sise_quotes.mjs';
import { isKrxRegularSession, naverRefreshMs } from '../functions/lib/krx_session.mjs';
import { buildHubDashboard, buildHubSectors, buildHubTop10, buildHubRsTop10Payload } from '../functions/lib/hub_dashboard_core.mjs';

const PORT = Number(process.env.PORT) || 8788;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', '.naver_quotes_cache.json');
const HUB_INDEX_FILE = path.join(__dirname, '..', 'data', 'hub_index.json');
const HUB_SNAPSHOT_FILE = path.join(__dirname, '..', 'data', 'hub_quote_snapshot.json');
const HUB_RS_SNAPSHOT_FILE = path.join(__dirname, '..', 'data', 'hub_rs_snapshot.json');

async function loadHubSnapshotFile() {
  try {
    const raw = await fs.readFile(HUB_SNAPSHOT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadHubRsSnapshotFile() {
  try {
    const raw = await fs.readFile(HUB_RS_SNAPSHOT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

function isFresh(entry) {
  return entry && entry.fetchedAt && Date.now() - entry.fetchedAt < naverRefreshMs();
}

async function getQuote(code) {
  const cache = await loadFileCache();
  const entry = cache[code];

  if (entry && isFresh(entry)) {
    return { quote: { ...emptyQuote(), ...entry.quote }, fromCache: true, fetched: false };
  }

  try {
    const freshQuote = await fetchNaverQuote(code);
    const merged = mergeNaverIntoQuote(emptyQuote(), freshQuote, {
      preferNaverLast: true,
      preferNaverFundamentals: true,
    });
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
  if (req.method === 'GET' && url.pathname === '/api/hub_dashboard') {
    try {
      const raw = await fs.readFile(HUB_INDEX_FILE, 'utf8');
      const hubIndex = JSON.parse(raw);
      const env = process.env.KRX_AUTH_KEY ? { KRX_AUTH_KEY: process.env.KRX_AUTH_KEY } : null;
      const snapshot = await loadHubSnapshotFile();
      const payload = await buildHubDashboard(hubIndex, env, null, { snapshot });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'hub_dashboard_failed', message: String(e.message || e) }));
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/hub_sectors') {
    try {
      const raw = await fs.readFile(HUB_INDEX_FILE, 'utf8');
      const hubIndex = JSON.parse(raw);
      const env = process.env.KRX_AUTH_KEY ? { KRX_AUTH_KEY: process.env.KRX_AUTH_KEY } : null;
      const payload = await buildHubSectors(hubIndex, env);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'hub_sectors_failed', message: String(e.message || e) }));
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/hub_top10') {
    try {
      const raw = await fs.readFile(HUB_INDEX_FILE, 'utf8');
      const hubIndex = JSON.parse(raw);
      const env = process.env.KRX_AUTH_KEY ? { KRX_AUTH_KEY: process.env.KRX_AUTH_KEY } : null;
      const snapshot = await loadHubSnapshotFile();
      const payload = await buildHubTop10(hubIndex, env, null, { snapshot });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'hub_top10_failed', message: String(e.message || e) }));
    }
    return;
  }
    if (req.method === 'GET' && url.pathname === '/api/hub_rs_snapshot') {
      try {
        const snapshot = await loadHubRsSnapshotFile();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(snapshot || { quotes: {} }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'hub_rs_snapshot_failed', message: String(e.message || e) }));
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/hub_rs_top10') {
    try {
      const raw = await fs.readFile(HUB_INDEX_FILE, 'utf8');
      const hubIndex = JSON.parse(raw);
      const env = process.env.KRX_AUTH_KEY ? { KRX_AUTH_KEY: process.env.KRX_AUTH_KEY } : null;
      const snapshot = await loadHubRsSnapshotFile();
      const payload = await buildHubRsTop10Payload(hubIndex, env, null, { snapshot });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'hub_rs_top10_failed', message: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Quotes dev server http://127.0.0.1:${PORT}/api/quotes?codes=005930`);
  console.log(`Hub sectors  http://127.0.0.1:${PORT}/api/hub_sectors`);
  console.log(`Hub top10    http://127.0.0.1:${PORT}/api/hub_top10`);
  console.log(`Hub RS top10 http://127.0.0.1:${PORT}/api/hub_rs_top10`);
  console.log(`Hub dashboard http://127.0.0.1:${PORT}/api/hub_dashboard`);
  console.log(`Cache file: ${CACHE_FILE}`);
});
