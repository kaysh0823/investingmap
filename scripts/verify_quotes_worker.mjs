/**
 * Smoke test for /api/quotes (Pages Function or legacy Worker).
 *
 * Pages (deployed):
 *   $env:QUOTES_API_URL="https://your-site.pages.dev/api/quotes"; node scripts/verify_quotes_worker.mjs
 *
 * Local wrangler pages dev:
 *   $env:QUOTES_API_URL="http://localhost:8788/api/quotes"; node scripts/verify_quotes_worker.mjs
 *
 * Legacy Worker:
 *   $env:QUOTES_WORKER_URL="https://your-worker.workers.dev"; node scripts/verify_quotes_worker.mjs
 */
const base = (process.env.QUOTES_API_URL || process.env.QUOTES_WORKER_URL || '').replace(/\/+$/, '');
if (!base) {
  console.log('SKIP: set QUOTES_API_URL (Pages /api/quotes) or QUOTES_WORKER_URL.');
  process.exit(0);
}

const url = `${base}/?codes=005930`;
const res = await fetch(url, { headers: { Accept: 'application/json' } });
const j = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('FAIL HTTP', res.status, url, j);
  process.exit(1);
}
const q = j.items && j.items['005930'];
if (!q || typeof q.last !== 'number') {
  console.error('FAIL missing items.005930.last', j);
  process.exit(1);
}
console.log('OK quotes', url, 'last=', q.last, 'high52=', q.high52w, 'basDd=', j.basDd || q.basDd, 'source=', j.source);
