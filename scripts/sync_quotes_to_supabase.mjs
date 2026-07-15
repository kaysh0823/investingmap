/**
 * Sync hub-listed tickers: Naver quotes + KRX returns/RS → Supabase stock_quotes_latest,
 * then mcap-weighted sector returns → sector_returns.
 * Reuses functions/lib collectors; safe to run locally or in GitHub Actions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchNaverQuote } from '../functions/lib/naver_sise_quotes.mjs';
import { buildKrxRsSnapshot, getAuthKey } from '../functions/lib/krx_rs.mjs';
import { isKrxRegularSession } from '../functions/lib/krx_session.mjs';
import {
  SECTOR_ORDER,
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAVER_CONCURRENCY = 4;
const NAVER_DELAY_MS = 80;
const UPSERT_BATCH_SIZE = 40;
const SUPABASE_MAX_RETRIES = 1;

/** out column on sector_returns ← source field on stock quote rows */
const SECTOR_RET_FIELDS = [
  { out: 'ret_1d_pct', src: 'chg_1d_pct' },
  { out: 'ret_20d_pct', src: 'ret_20d_pct' },
  { out: 'ret_50d_pct', src: 'ret_50d_pct' },
  { out: 'ret_120d_pct', src: 'ret_120d_pct' },
  { out: 'ret_250d_pct', src: 'ret_250d_pct' },
];

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
  let chg1d = null;
  if (naver?.chg1dPct != null && Number.isFinite(naver.chg1dPct)) {
    chg1d = naver.chg1dPct;
  } else if (naver?.last != null && naver?.prevClose > 0) {
    chg1d = Math.round(((naver.last / naver.prevClose) - 1) * 10000) / 100;
  } else if (naver?.last != null && krx?.refClose > 0 && regularSession) {
    // Intraday: recompute vs latest KRX reference close when Naver prev is missing.
    chg1d = Math.round(((naver.last / krx.refClose) - 1) * 10000) / 100;
  } else {
    chg1d = krx?.chg1dPct ?? null;
  }

  return {
    ticker,
    last: naver?.last ?? null,
    high_52w: naver?.high52w ?? null,
    low_52w: naver?.low52w ?? null,
    mcap_won: naver?.mcapWon ?? null,
    per: naver?.per ?? null,
    pbr: naver?.pbr ?? null,
    chg_1d_pct: chg1d,
    ret_20d_pct: krx?.ret20dPct ?? null,
    ret_50d_pct: krx?.ret50dPct ?? null,
    ret_120d_pct: krx?.ret120dPct ?? null,
    ret_250d_pct: krx?.ret250dPct ?? null,
    rs: krx?.rs ?? null,
    as_of: asOf,
    regular_session: regularSession,
  };
}

async function upsertBatch(table, rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
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
    return upsertBatch(table, rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, status: res.status, body };
}

async function upsertToSupabase(rows, supabaseUrl, serviceKey) {
  const upserted = [];
  const failed = [];

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const result = await upsertBatch('stock_quotes_latest', batch, supabaseUrl, serviceKey);
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

/** mcap-weighted mean of retPct; skips null ret or non-positive mcap. */
function mcapWeightedReturn(members, retKey) {
  let wSum = 0;
  let mSum = 0;
  for (const m of members) {
    const ret = m[retKey];
    const mcap = m.mcap_won;
    if (ret == null || !Number.isFinite(ret)) continue;
    if (mcap == null || !Number.isFinite(mcap) || mcap <= 0) continue;
    wSum += ret * mcap;
    mSum += mcap;
  }
  if (mSum <= 0) return null;
  return Math.round((wSum / mSum) * 100) / 100;
}

/**
 * Build sector_returns rows from hub_index sector membership + freshly synced quote rows.
 * Uses each sector's own company list (not cross-sector unique).
 */
function buildSectorReturnRows(hubIndex, quoteRowsByTicker, updatedAt) {
  const rows = [];
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors && hubIndex.sectors[sid];
    if (!block) continue;
    const members = [];
    for (const c of block.companies || []) {
      const key = normalizeTicker(c.ticker);
      if (!key) continue;
      const q = quoteRowsByTicker.get(key);
      if (!q) continue;
      members.push(q);
    }
    const row = { sector_id: sid, updated_at: updatedAt };
    for (const { out, src } of SECTOR_RET_FIELDS) {
      row[out] = mcapWeightedReturn(members, src);
    }
    rows.push(row);
  }
  return rows;
}

async function upsertSectorReturns(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return { upserted: 0, failed: 0, body: null };
  const result = await upsertBatch('sector_returns', rows, supabaseUrl, serviceKey);
  if (result.ok) return { upserted: rows.length, failed: 0, body: null };
  console.error(`\n  sector_returns upsert failed (${result.status})`);
  if (result.body) console.error(`  ${result.body.slice(0, 300)}`);
  return { upserted: 0, failed: rows.length, body: result.body };
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

  const quoteByTicker = new Map(rows.map((r) => [r.ticker, r]));
  const sectorRows = buildSectorReturnRows(hubIndex, quoteByTicker, asOf);
  console.log(`Upserting ${sectorRows.length} sector_returns rows…`);
  const sectorResult = await upsertSectorReturns(sectorRows, supabaseUrl, serviceKey);
  for (const r of sectorRows) {
    const vals = SECTOR_RET_FIELDS.map((f) => `${f.out}=${r[f.out] == null ? 'null' : r[f.out]}`).join(' ');
    console.log(`  ${r.sector_id}: ${vals}`);
  }

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
  console.log(`sector upserted:   ${sectorResult.upserted}`);
  console.log(`sector failed:     ${sectorResult.failed}`);
  console.log(`elapsed:           ${elapsedSec}s`);

  if (naverFailedUnique.length) {
    console.log(`naver failed tickers: ${naverFailedUnique.join(', ')}`);
  }
  if (upsertFailedUnique.length) {
    console.log(`supabase failed tickers: ${upsertFailedUnique.join(', ')}`);
    process.exit(1);
  }
  if (sectorResult.failed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
