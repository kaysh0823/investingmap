/**
 * Optional smoke test for the quotes Worker.
 * Usage (PowerShell): $env:QUOTES_WORKER_URL="https://your-worker.workers.dev"; node scripts/verify_quotes_worker.mjs
 */
const base = (process.env.QUOTES_WORKER_URL || '').replace(/\/+$/, '');
if (!base) {
  console.log('SKIP: set QUOTES_WORKER_URL to your deployed Worker origin (no trailing slash required).');
  process.exit(0);
}

const url = `${base}/?codes=005930`;
const res = await fetch(url, { headers: { Accept: 'application/json' } });
if (!res.ok) {
  console.error('FAIL HTTP', res.status, url);
  process.exit(1);
}
const j = await res.json();
const q = j.items && j.items['005930'];
if (!q || typeof q.last !== 'number') {
  console.error('FAIL missing items.005930.last', j);
  process.exit(1);
}
console.log('OK quotes worker', url, 'last=', q.last, 'high52=', q.high52w, 'asOf=', j.asOf);
