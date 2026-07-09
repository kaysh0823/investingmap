/**
 * Phase 9: verify Supabase-disabled fallback via actual Pages Function handlers.
 * Usage: node scripts/phase9_fallback_verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8799';

function loadKrxKey() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.dev.vars'), 'utf8');
    const m = raw.match(/KRX_AUTH_KEY\s*=\s*"?([^"\n]+)"?/);
    return m ? m[1].trim() : '';
  } catch {
    return process.env.KRX_AUTH_KEY || '';
  }
}

function assetFetch(request) {
  const u = new URL(request.url);
  const rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    return new Response('not found', { status: 404 });
  }
  const ext = path.extname(file).toLowerCase();
  const type =
    ext === '.json' ? 'application/json' :
    ext === '.html' ? 'text/html; charset=utf-8' :
    'application/octet-stream';
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type } });
}

function makeEnv() {
  return {
    KRX_AUTH_KEY: loadKrxKey(),
    ASSETS: { fetch: assetFetch },
  };
}

function makeContext(request, env) {
  return {
    request,
    env,
    waitUntil() {},
    passThroughOnException() {},
  };
}

async function callHandler(mod, pathname, search = '') {
  const env = makeEnv();
  const request = new Request(`${BASE}${pathname}${search}`);
  const response = await mod.onRequest(makeContext(request, env));
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { status: response.status, body };
}

const LEGACY_SOURCES = new Set([
  'naver-sise-cache',
  'naver-sise-cache+krx-yoy',
  'hub_quote_snapshot+naver-cache',
  'hub_rs_snapshot',
  'krx-mcap-ratio',
  'hub_index',
  'missing',
]);

function isLegacySource(source) {
  if (!source) return false;
  if (source === 'supabase') return false;
  if (LEGACY_SOURCES.has(source)) return true;
  return /naver|krx|hub_|snapshot|cache/i.test(source);
}

async function main() {
  const quotes = await import('../functions/api/quotes.js');
  const hubTop10 = await import('../functions/api/hub_top10.js');
  const hubRsTop10 = await import('../functions/api/hub_rs_top10.js');
  const hubSectors = await import('../functions/api/hub_sectors.js');

  const tests = [
    {
      name: '/api/quotes',
      run: () => callHandler(quotes, '/api/quotes', '?codes=005930'),
    },
    {
      name: '/api/hub_top10',
      run: () => callHandler(hubTop10, '/api/hub_top10', '?nocache=1'),
    },
    {
      name: '/api/hub_rs_top10',
      run: () => callHandler(hubRsTop10, '/api/hub_rs_top10', '?nocache=1'),
    },
    {
      name: '/api/hub_sectors',
      run: () => callHandler(hubSectors, '/api/hub_sectors', '?nocache=1'),
    },
  ];

  const rows = [];
  for (const t of tests) {
    try {
      const { status, body } = await t.run();
      const source = body.source ?? '(none)';
      const ok = status >= 200 && status < 300 && !body.error && isLegacySource(source);
      rows.push({
        api: t.name,
        status,
        source,
        ok,
        error: body.error || '',
        note: body.message || '',
      });
    } catch (e) {
      rows.push({
        api: t.name,
        status: 0,
        source: '(exception)',
        ok: false,
        error: String(e.message || e),
        note: '',
      });
    }
  }

  console.log(JSON.stringify({ envHasSupabase: false, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
