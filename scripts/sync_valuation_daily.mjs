/**
 * Sync KRX [12021] MDCSTAT03501 → stock_valuation_daily.
 * First write for (ticker, trade_date) wins — later runs skip existing rows.
 *
 * Usage: node scripts/sync_valuation_daily.mjs [--date=YYYYMMDD]
 * Exit 3 = VALUATION_PENDING (fetch/coverage < 1000)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchKrxValuationDay } from '../functions/lib/krx_valuation.mjs';
import { kstYmd, kstYmdDash } from '../functions/lib/krx_session.mjs';
import { tradingDates } from '../functions/lib/krx_yoy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSERT_BATCH = 500;
const MIN_ROWS = 1000;

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

function ymdToDash(ymd) {
  const s = String(ymd || '').replace(/\D/g, '');
  if (s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveTradeYmd(env, override) {
  if (override && String(override).replace(/\D/g, '').length === 8) {
    return String(override).replace(/\D/g, '');
  }
  const today = kstYmd();
  try {
    const dates = await tradingDates(env.KRX_AUTH_KEY || '', 5);
    if (Array.isArray(dates) && dates.length) {
      const sorted = dates.map((d) => String(d).replace(/\D/g, '')).filter((d) => d.length === 8).sort();
      const last = sorted[sorted.length - 1];
      if (last) return last;
    }
  } catch (e) {
    console.warn('tradingDates failed:', e.message || e);
  }
  return today;
}

async function fetchExistingTickers(supabaseUrl, serviceKey, tradeDateDash) {
  const found = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_valuation_daily?trade_date=eq.${tradeDateDash}` +
      `&select=ticker&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || /PGRST205|does not exist|Could not find the table/i.test(body)) {
        throw new Error(
          'stock_valuation_daily missing — apply supabase/migrations/0023_stock_valuation_daily.sql',
        );
      }
      throw new Error(`valuation coverage fetch ${res.status}: ${body.slice(0, 160)}`);
    }
    const page = await res.json();
    for (const row of page) {
      if (row?.ticker) found.add(String(row.ticker));
    }
    if (!Array.isArray(page) || page.length < pageSize) break;
  }
  return found;
}

async function upsertBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_valuation_daily`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=ticker,trade_date',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  if (attempt < 2) {
    await sleep(800);
    return upsertBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body };
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const override = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1];
  const basDd = await resolveTradeYmd(env, override);
  const tradeDateDash = ymdToDash(basDd) || kstYmdDash();
  console.log(`Sync valuation → stock_valuation_daily (${tradeDateDash})`);

  const byCode = await fetchKrxValuationDay(basDd, env);
  if (byCode.size < MIN_ROWS) {
    console.error(
      `VALUATION_PENDING: ${tradeDateDash} — fetched ${byCode.size} < ${MIN_ROWS}`,
    );
    process.exit(3);
  }

  const existing = await fetchExistingTickers(supabaseUrl, serviceKey, tradeDateDash);
  const rows = [];
  for (const [ticker, v] of byCode) {
    if (existing.has(ticker)) continue; // first write locks the day
    rows.push({
      ticker,
      trade_date: tradeDateDash,
      close: v.close,
      eps: v.eps,
      per: v.per,
      bps: v.bps,
      pbr: v.pbr,
      dps: v.dps,
      dvd_yld: v.dvdYld,
      source: 'mdcstat',
    });
  }

  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const result = await upsertBatch(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      console.error(`  valuation upsert failed: ${(result.body || '').slice(0, 200)}`);
      failed += batch.length;
      continue;
    }
    upserted += batch.length;
  }

  const after = await fetchExistingTickers(supabaseUrl, serviceKey, tradeDateDash);
  console.log(
    `  valuation ${tradeDateDash}: fetched=${byCode.size} existing=${existing.size} `
    + `upserted=${upserted} failed=${failed} coverage=${after.size}`,
  );

  if (after.size < MIN_ROWS) {
    console.error(
      `VALUATION_PENDING: ${tradeDateDash} — coverage ${after.size} < ${MIN_ROWS}`,
    );
    process.exit(3);
  }
  if (failed) process.exit(1);
  console.log('OK sync_valuation_daily');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
