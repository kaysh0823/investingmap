/**
 * WiseReport / FnGuide annual consensus EPS → stock_consensus_latest.
 *
 * Usage:
 *   node scripts/sync_consensus_eps.mjs
 *   node scripts/sync_consensus_eps.mjs --dry-run --tickers=005930,000660
 *
 * Successful fetches are upserted. A failed fetch leaves the existing row.
 * A table that arrived with blank (E) cells is a success and is stored as null.
 * Exit 3 = CONSENSUS_PENDING (response success rate < 50%).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { kstYmdDash } from '../functions/lib/krx_session.mjs';
import { extractEncparam, parseConsensusAnnual } from '../functions/lib/wisereport_consensus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_URL = 'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=005930';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CONCURRENCY = 4;
const GAP_MS = 120;
const UPSERT_BATCH = 200;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : '';
}

function loadTickers() {
  const explicit = argValue('--tickers')
    .split(',')
    .map((t) => normalizeTicker(t))
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const seen = new Set();
  const out = [];
  for (const c of listHubCompanies(hubIndex)) {
    const t = normalizeTicker(c.ticker);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function fetchToken() {
  const res = await fetch(TOKEN_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`wisereport token HTTP ${res.status}`);
  const html = await res.text();
  const token = extractEncparam(html);
  if (!token) throw new Error('wisereport encparam missing');
  return token;
}

async function fetchAnnualHtml(ticker, token) {
  const url =
    'https://navercomp.wisereport.co.kr/v2/company/ajax/cF1001.aspx'
    + `?cmp_cd=${encodeURIComponent(ticker)}&fin_typ=0&freq_typ=Y`
    + `&encparam=${encodeURIComponent(token)}&id=`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
      Referer: `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${ticker}`,
    },
  });
  const html = await res.text();
  return { ok: res.ok, status: res.status, html };
}

function toRow(ticker, parsed, fetchedAt) {
  const slot = (fy) => ({
    end: fy?.end ?? null,
    eps: fy && fy.eps != null && Number.isFinite(fy.eps) ? fy.eps : null,
  });
  const fy1 = slot(parsed.fy1);
  const fy2 = slot(parsed.fy2);
  const fy3 = slot(parsed.fy3);
  return {
    ticker,
    fy1_end: fy1.end,
    fy1_eps: fy1.eps,
    fy2_end: fy2.end,
    fy2_eps: fy2.eps,
    fy3_end: fy3.end,
    fy3_eps: fy3.eps,
    source: 'wisereport',
    fetched_at: fetchedAt,
  };
}

async function upsertBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_consensus_latest`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=ticker',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  if (attempt < 1) {
    await sleep(800);
    return upsertBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, status: res.status, body };
}

async function tableExists(supabaseUrl, serviceKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/stock_consensus_latest?select=ticker&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (res.ok) return true;
  const body = await res.text();
  if (res.status === 404 || /PGRST205|does not exist|Could not find the table/i.test(body)) {
    return false;
  }
  throw new Error(`consensus table probe ${res.status}: ${body.slice(0, 160)}`);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      out[idx] = await fn(items[idx], idx);
      await sleep(GAP_MS);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const todayDash = kstYmdDash();
  const tickers = loadTickers();
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!dryRun) {
    if (!supabaseUrl || !serviceKey) {
      console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
      process.exit(1);
    }
    const ready = await tableExists(supabaseUrl, serviceKey);
    if (!ready) {
      console.error(
        'stock_consensus_latest missing — apply supabase/migrations/0024_stock_consensus_latest.sql',
      );
      process.exit(1);
    }
  }

  let token = await fetchToken();
  let refreshing = null;
  let failuresSinceRefresh = 0;

  async function refreshToken() {
    if (!refreshing) {
      refreshing = fetchToken()
        .then((next) => {
          token = next;
          failuresSinceRefresh = 0;
          console.warn('  wisereport encparam reissued');
          return next;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  async function fetchOne(ticker) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetchAnnualHtml(ticker, token);
      const thin = !res.ok || !res.html || res.html.length < 80 || !/<table/i.test(res.html);
      if (thin) {
        failuresSinceRefresh += 1;
        if (attempt === 0 && failuresSinceRefresh >= 2) await refreshToken();
        continue;
      }
      const parsed = parseConsensusAnnual(res.html, todayDash);
      const epsRow = /EPS\s*\(원\)/i.test(res.html);
      if (!epsRow) {
        failuresSinceRefresh += 1;
        if (attempt === 0 && failuresSinceRefresh >= 2) await refreshToken();
        continue;
      }
      failuresSinceRefresh = 0;
      return { ticker, ok: true, parsed };
    }
    return { ticker, ok: false, parsed: null };
  }

  const results = await mapPool(tickers, CONCURRENCY, fetchOne);
  const fetchedAt = new Date().toISOString();
  const rows = [];
  let failed = 0;
  let coveredFy1 = 0;
  let coveredFy2 = 0;
  for (const item of results) {
    if (!item?.ok) {
      failed += 1;
      if (dryRun) console.log(`${item.ticker} FAIL`);
      continue;
    }
    const row = toRow(item.ticker, item.parsed, fetchedAt);
    if (row.fy1_eps != null) coveredFy1 += 1;
    if (row.fy2_eps != null) coveredFy2 += 1;
    rows.push(row);
    if (dryRun) console.log(JSON.stringify(row));
  }

  const fetched = rows.length;
  console.log(
    `hub=${tickers.length} fetched=${fetched} covered_fy1=${coveredFy1} `
    + `covered_fy2=${coveredFy2} failed=${failed}`,
  );

  if (!dryRun && rows.length) {
    let upsertFailed = 0;
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const batch = rows.slice(i, i + UPSERT_BATCH);
      const result = await upsertBatch(batch, supabaseUrl, serviceKey);
      if (!result.ok) {
        console.error(`  consensus upsert failed (${result.status}): ${(result.body || '').slice(0, 200)}`);
        upsertFailed += batch.length;
      }
    }
    if (upsertFailed) process.exit(1);
  }

  if (tickers.length && fetched / tickers.length < 0.5) {
    console.error(
      `CONSENSUS_PENDING: fetched ${fetched}/${tickers.length} < 50%`,
    );
    process.exit(3);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
