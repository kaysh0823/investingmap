/**
 * Fetch Naver quotes for every hub-listed ticker and write data/hub_quote_snapshot.json.
 * Used by /api/hub_top10 for accurate all-sector Top 10 without per-request crawl limits.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchNaverQuote } from '../functions/lib/naver_sise_quotes.mjs';
import {
  calcQuotePosition,
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 10;
const DELAY_MS = 80;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function quoteOk(q) {
  return q
    && q.last != null && q.high52w != null && q.low52w != null
    && q.last > 0 && q.high52w > 0 && q.low52w > 0;
}

async function fetchQuotes(codes) {
  const quotes = {};
  let ok = 0;
  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const batch = codes.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(
      batch.map(async (code) => {
        try {
          const q = await fetchNaverQuote(code);
          if (quoteOk(q)) return { code, q };
        } catch {
          /* retry once */
          try {
            await sleep(DELAY_MS);
            const q = await fetchNaverQuote(code);
            if (quoteOk(q)) return { code, q };
          } catch {
            /* skip */
          }
        }
        return { code, q: null };
      }),
    );
    for (const row of rows) {
      if (row.q) {
        quotes[row.code] = {
          last: row.q.last,
          high52w: row.q.high52w,
          low52w: row.q.low52w,
        };
        ok++;
      }
    }
    const done = Math.min(i + CONCURRENCY, codes.length);
    process.stdout.write(`\r  quotes ${done}/${codes.length} (ok ${ok})`);
    if (i + CONCURRENCY < codes.length) await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
  return { quotes, ok };
}

async function main() {
  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const companies = listHubCompanies(hubIndex);
  const codes = companies
    .map((c) => normalizeTicker(c.ticker))
    .filter(Boolean);

  console.log(`Fetching ${codes.length} hub tickers…`);
  const { quotes, ok } = await fetchQuotes(codes);

  const ranked = companies
    .map((c) => {
      const key = normalizeTicker(c.ticker);
      const q = key ? quotes[key] : null;
      if (!q) return null;
      const positionPct = calcQuotePosition(q.last, q.high52w, q.low52w);
      if (positionPct == null) return null;
      return { ...c, positionPct };
    })
    .filter(Boolean)
    .sort((a, b) => b.positionPct - a.positionPct);

  const out = {
    builtAt: kstYmdDash(),
    asOf: new Date().toISOString(),
    source: 'naver-sise-build',
    quotesTotal: codes.length,
    quotesOk: ok,
    coveragePct: codes.length > 0 ? Math.round((ok / codes.length) * 1000) / 10 : 0,
    quotes,
    top10Preview: ranked.slice(0, 10).map((r) => ({
      ticker: r.ticker,
      name: r.name,
      sectorId: r.sectorId,
      positionPct: Math.round(r.positionPct * 10) / 10,
    })),
  };

  const outPath = path.join(ROOT, 'data', 'hub_quote_snapshot.json');
  fs.writeFileSync(outPath, `${JSON.stringify(out)}\n`, 'utf8');
  console.log(`OK ${outPath} — ${ok}/${codes.length} quotes (${out.coveragePct}%)`);
  if (ranked.length >= 10) {
    console.log('Top 3:', ranked.slice(0, 3).map((r) => `${r.name} ${r.positionPct.toFixed(1)}%`).join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
