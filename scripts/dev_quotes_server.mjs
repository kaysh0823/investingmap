/**
 * Local dev: GET /api/quotes?codes=005930 (Naver sise fallback, no KRX key required)
 * Usage: node scripts/dev_quotes_server.mjs
 *        open maps via http://localhost:8788/...
 */
import http from 'node:http';
import { fetchNaverSiseQuotes, mergeNaverIntoQuote } from '../lib/naver_sise_quotes.mjs';

const PORT = Number(process.env.PORT) || 8788;

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

async function handleQuotes(url) {
  const codesRaw = url.searchParams.get('codes') || '';
  const codes = [...new Set(codesRaw.split(/[, ]+/).map(normalizeTicker).filter(Boolean))];
  if (!codes.length) {
    return {
      asOf: new Date().toISOString(),
      items: {},
      source: 'naver-sise',
      configured: true,
    };
  }
  const naverItems = await fetchNaverSiseQuotes(codes);
  const items = {};
  for (const code of codes) {
    const n = naverItems[code] || {};
    items[code] = mergeNaverIntoQuote(
      { last: null, high52w: null, low52w: null, yoyReturnPct: null },
      n,
      { preferNaverLast: true },
    );
  }
  return { asOf: new Date().toISOString(), source: 'naver-sise', items };
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
      res.end(JSON.stringify({ error: 'naver_fetch_failed', message: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Quotes dev server http://127.0.0.1:${PORT}/api/quotes?codes=005930`);
});
