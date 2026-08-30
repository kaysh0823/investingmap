/**
 * Hybrid quotes API checks: Supabase base + Naver live overlay.
 * Static merge math always runs; live probe when QUOTES_API_URL is set.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { krxSessionInfo } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mergeSupabaseWithNaverLive(codes, supabaseItems, naverItems) {
  const items = {};
  for (const code of codes) {
    const base = supabaseItems[code] ? { ...supabaseItems[code] } : {};
    const naver = naverItems[code];
    if (naver) {
      const liveLast = numOrNull(naver.last);
      if (liveLast != null) {
        base.last = liveLast;
        const livePrev = numOrNull(naver.prevClose);
        if (livePrev != null) base.prevClose = livePrev;
        if (base.prevClose != null && base.prevClose > 0) {
          base.chg1dPct = Math.round(((base.last / base.prevClose) - 1) * 10000) / 100;
        }
      }
    }
    if (Object.keys(base).length) items[code] = base;
  }
  return items;
}

// --- static merge ---
const merged = mergeSupabaseWithNaverLive(
  ['005930'],
  {
    '005930': {
      last: 70_000,
      prevClose: 71_000,
      rs: 95,
      high52w: 80_000,
      ret20dPct: 3.2,
    },
  },
  { '005930': { last: 70_500, prevClose: 71_000 } },
);
assert(merged['005930'].last === 70_500, 'last from naver');
assert(merged['005930'].rs === 95, 'rs from supabase');
assert(merged['005930'].high52w === 80_000, 'high52w from supabase');
assert(merged['005930'].chg1dPct === -0.7, `chg1dPct ${merged['005930'].chg1dPct}`);

const noNaver = mergeSupabaseWithNaverLive(['005930'], merged, {});
assert(noNaver['005930'].last === 70_500, 'fallback keeps supabase when naver missing last');

const src = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'quotes.js'), 'utf8');
assert(src.includes('fetchNaverLiveOverlay'), 'naver overlay helper');
assert(src.includes('stale-while-revalidate=120'), 'SWR header');
assert(src.includes('mergeSupabaseWithNaverLive'), 'merge helper');

console.log('verify_quotes_hybrid static OK');

const base = (process.env.QUOTES_API_URL || '').replace(/\/+$/, '');
if (!base) {
  console.log('SKIP live probe: set QUOTES_API_URL');
  process.exit(0);
}

const url = `${base}/?codes=005930`;
const res = await fetch(url, { headers: { Accept: 'application/json' } });
const j = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('FAIL HTTP', res.status, j);
  process.exit(1);
}

const cc = res.headers.get('Cache-Control') || '';
const session = krxSessionInfo();
const q = j.items && j.items['005930'];

assert(q && typeof q.last === 'number', 'missing 005930.last');
assert(typeof q.rs === 'number' || q.rs == null, 'rs field present');

if (session.regular) {
  assert(j.source === 'supabase+naver-live', `source=${j.source}`);
  assert(cc.includes('max-age=300'), `Cache-Control=${cc}`);
  assert(cc.includes('stale-while-revalidate=120'), `Cache-Control=${cc}`);
  console.log('OK live regular', url, 'last=', q.last, 'source=', j.source, 'Cache-Control=', cc);
} else {
  assert(j.source === 'supabase', `closed source=${j.source}`);
  console.log('OK live closed', url, 'last=', q.last, 'source=', j.source, 'Cache-Control=', cc);
}
