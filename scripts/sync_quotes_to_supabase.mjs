/**
 * Sync hub-listed tickers: Naver quotes + KRX returns/RS → Supabase stock_quotes_latest.
 * Reuses functions/lib collectors; safe to run locally or in GitHub Actions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchNaverQuote } from '../functions/lib/naver_sise_quotes.mjs';
import { buildKrxRsSnapshot, getAuthKey } from '../functions/lib/krx_rs.mjs';
import { isKrxRegularSession } from '../functions/lib/krx_session.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAVER_CONCURRENCY = 4;
const NAVER_DELAY_MS = 80;
const UPSERT_BATCH_SIZE = 40;
const SUPABASE_MAX_RETRIES = 1;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[k]) env[k] = v;
  }
  return env;
}

function loadHubTickers(hubIndex) {
  const seen = new Set();
  const codes = [];
  for (const c of listHubCompanies(hubIndex)) {
    const code = normalizeTicker(c.ticker);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes.sort();
}

async function fetchNaverQuotes(codes) {
  const quotes = {};
  const failed = [];
  let ok = 0;

  for (let i = 0; i < codes.length; i += NAVER_CONCURRENCY) {
    const batch = codes.slice(i, i + NAVER_CONCURRENCY);
    const rows = await Promise.all(
      batch.map(async (code) => {
        try {
          const q = await fetchNaverQuote(code);
          return { code, q, err: null };
        } catch (e1) {
          try {
            await sleep(NAVER_DELAY_MS);
            const q = await fetchNaverQuote(code);
            return { code, q, err: null };
          } catch (e2) {
            return { code, q: null, err: e2 };
          }
        }
      }),
    );

    for (const row of rows) {
      if (row.q) {
        quotes[row.code] = row.q;
        ok += 1;
      } else {
        failed.push(row.code);
      }
    }

    const done = Math.min(i + NAVER_CONCURRENCY, codes.length);
    process.stdout.write(`\r  Naver ${done}/${codes.length} (ok ${ok})`);
    if (i + NAVER_CONCURRENCY < codes.length) await sleep(NAVER_DELAY_MS);
  }

  process.stdout.write('\n');
  return { quotes, ok, failed };
}

async function loadKrxQuotes(authKey) {
  if (!authKey) {
    console.warn('KRX_AUTH_KEY missing — skipping KRX returns/RS');
    return { quotes: {}, ok: 0 };
  }
  console.log('Building KRX returns/RS snapshot…');
  const snapshot = await buildKrxRsSnapshot(authKey);
  if (!snapshot || !snapshot.quotes) {
    throw new Error('KRX RS snapshot build failed');
  }
  console.log(`  KRX universe ${snapshot.quotesOk}/${snapshot.universe} tickers`);
  return { quotes: snapshot.quotes, ok: snapshot.quotesOk || 0 };
}

function toSupabaseRow(ticker, naver, krx, asOf, regularSession) {
  return {
    ticker,
    last: naver?.last ?? null,
    high_52w: naver?.high52w ?? null,
    low_52w: naver?.low52w ?? null,
    mcap_won: naver?.mcapWon ?? null,
    per: naver?.per ?? null,
    pbr: naver?.pbr ?? null,
    chg_1d_pct: krx?.chg1dPct ?? null,
    ret_20d_pct: krx?.ret20dPct ?? null,
    ret_50d_pct: krx?.ret50dPct ?? null,
    ret_120d_pct: krx?.ret120dPct ?? null,
    ret_250d_pct: krx?.ret250dPct ?? null,
    rs: krx?.rs ?? null,
    as_of: asOf,
    regular_session: regularSession,
  };
}

async function upsertBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_quotes_latest`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (res.ok) return { ok: true, status: res.status };

  const body = await res.text();
  if (attempt < SUPABASE_MAX_RETRIES) {
    await sleep(1000);
    return upsertBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, status: res.status, body };
}

async function upsertToSupabase(rows, supabaseUrl, serviceKey) {
  const upserted = [];
  const failed = [];

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const result = await upsertBatch(batch, supabaseUrl, serviceKey);
    if (result.ok) {
      upserted.push(...batch.map((r) => r.ticker));
    } else {
      failed.push(...batch.map((r) => r.ticker));
      console.error(
        `\n  Supabase batch failed (${result.status}): tickers ${batch.map((r) => r.ticker).join(', ')}`,
      );
      if (result.body) console.error(`  ${result.body.slice(0, 300)}`);
    }
    const done = Math.min(i + UPSERT_BATCH_SIZE, rows.length);
    process.stdout.write(`\r  Supabase upsert ${done}/${rows.length}`);
  }

  process.stdout.write('\n');
  return { upserted, failed };
}

async function main() {
  const started = Date.now();
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = getAuthKey(env);

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const tickers = loadHubTickers(hubIndex);
  const asOf = new Date().toISOString();
  const regularSession = isKrxRegularSession();

  console.log(`Sync ${tickers.length} hub tickers → Supabase`);
  console.log(`  regularSession=${regularSession}`);

  const naverResult = await fetchNaverQuotes(tickers);
  const krxResult = await loadKrxQuotes(authKey);

  const rows = tickers.map((ticker) =>
    toSupabaseRow(
      ticker,
      naverResult.quotes[ticker],
      krxResult.quotes[ticker],
      asOf,
      regularSession,
    ),
  );

  console.log(`Upserting ${rows.length} rows…`);
  const upsertResult = await upsertToSupabase(rows, supabaseUrl, serviceKey);

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  const naverFailedUnique = [...new Set(naverResult.failed)];
  const upsertFailedUnique = [...new Set(upsertResult.failed)];

  console.log('\n=== sync_quotes_to_supabase summary ===');
  console.log(`total tickers:     ${tickers.length}`);
  console.log(`naver ok:          ${naverResult.ok}`);
  console.log(`naver failed:      ${naverFailedUnique.length}`);
  console.log(`krx matched:       ${tickers.filter((t) => krxResult.quotes[t]).length}`);
  console.log(`supabase upserted: ${upsertResult.upserted.length}`);
  console.log(`supabase failed:   ${upsertFailedUnique.length}`);
  console.log(`elapsed:           ${elapsedSec}s`);

  if (naverFailedUnique.length) {
    console.log(`naver failed tickers: ${naverFailedUnique.join(', ')}`);
  }
  if (upsertFailedUnique.length) {
    console.log(`supabase failed tickers: ${upsertFailedUnique.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
