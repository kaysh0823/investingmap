import fs from 'node:fs';
import { fetchRegularClose, regularCloseRow } from '../functions/lib/naver_regular_close.mjs';
import { pricePhase } from '../functions/lib/session_price_policy.mjs';

const now = new Date();
if (pricePhase(now) !== 'afterClose') {
  console.log('Regular close snapshot: not after the regular close; skipped');
  process.exit(0);
}
const env = process.env;
const base = env.SUPABASE_URL?.replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Database service credentials required');
const index = JSON.parse(fs.readFileSync(new URL('../data/hub_index.json', import.meta.url), 'utf8'));
const tickers = [...new Set(Object.values(index.sectors).flatMap((s) => s.companies.map((c) => c.ticker)))];
const rows = [];
let next = 0;
let missing = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < tickers.length) {
    const ticker = tickers[next++];
    let bar;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { bar = await fetchRegularClose(ticker, now); break; }
      catch (error) { if (attempt === 1) console.warn(`${ticker}: ${error.message}`); }
    }
    if (bar) rows.push(regularCloseRow(ticker, bar));
    else missing++;
  }
}));
if (!rows.length) throw new Error('No same-day regular close candles found; preserved stored quotes');
for (let i = 0; i < rows.length; i += 40) {
  const response = await fetch(`${base}/rest/v1/stock_quotes_latest?on_conflict=ticker`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.slice(i, i + 40)),
  });
  if (!response.ok) throw new Error(`Regular close snapshot write: HTTP ${response.status}`);
}
console.log(`Regular close snapshot saved: ${rows.length}/${tickers.length}; unavailable=${missing}`);
for (const ticker of ['005930', '000660']) {
  const row = rows.find((r) => r.ticker === ticker);
  if (row) console.log(`${ticker}: close=${row.last} previous=${row.prev_close}`);
}
