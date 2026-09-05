/**
 * Scan stock_price_history (post price_adjustments) for residual price jumps (jump >= 1.7 or <= 0.6).
 * Outputs a review-only CSV of jump candidates with share-count context.
 *
 * Usage:
 *   node scripts/scan_residual_price_jumps.mjs
 *   node scripts/scan_residual_price_jumps.mjs --ticker=005930
 *   node scripts/scan_residual_price_jumps.mjs --threshold=1.7
 *
 * Output: docs/reports/price_jump_residuals.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import {
  cumulativeAdjustmentRatio,
  sharesFromHistoryRow,
} from '../functions/lib/price_adjustments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'reports', 'price_jump_residuals.csv');
const DEFAULT_JUMP_THRESHOLD = 1.7;

export function loadEnv() {
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

export function parseArgs(argv) {
  const out = {
    tickers: null,
    outPath: DEFAULT_OUT,
    threshold: DEFAULT_JUMP_THRESHOLD,
  };
  for (const arg of argv) {
    if (arg.startsWith('--ticker=')) {
      out.tickers = [normalizeTicker(arg.slice('--ticker='.length))].filter(Boolean);
    } else if (arg.startsWith('--tickers=')) {
      out.tickers = arg
        .slice('--tickers='.length)
        .split(',')
        .map((t) => normalizeTicker(t.trim()))
        .filter(Boolean);
    } else if (arg.startsWith('--out=')) {
      out.outPath = path.resolve(ROOT, arg.slice('--out='.length));
    } else if (arg.startsWith('--threshold=')) {
      const th = parseFloat(arg.slice('--threshold='.length));
      if (Number.isFinite(th) && th > 1) out.threshold = th;
    }
  }
  return out;
}

export function loadHubCompanyMap() {
  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const companyMap = new Map();
  for (const c of listHubCompanies(hubIndex)) {
    const t = normalizeTicker(c.ticker);
    if (!t || companyMap.has(t)) continue;
    companyMap.set(t, c.name);
  }
  return companyMap;
}

export async function fetchAllPriceAdjustments(supabaseUrl, serviceKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/price_adjustments?select=ticker,effective_date,ratio,type,source,note&order=effective_date.asc`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    },
  );
  if (!res.ok) {
    throw new Error(`fetch_price_adjustments_failed: ${res.status} ${(await res.text()).slice(0, 100)}`);
  }
  const rows = await res.json();
  const byTicker = new Map();
  for (const r of rows) {
    const t = String(r.ticker).padStart(6, '0').slice(-6);
    if (!byTicker.has(t)) byTicker.set(t, []);
    byTicker.get(t).push(r);
  }
  return { all: rows, byTicker };
}

export async function fetchTickerHistory(supabaseUrl, serviceKey, ticker) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const q =
      `${supabaseUrl}/rest/v1/stock_price_history?ticker=eq.${encodeURIComponent(ticker)}` +
      `&select=trade_date,close,mcap_won&order=trade_date.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(q, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      throw new Error(`history_fetch_${ticker}:${res.status}:${(await res.text()).slice(0, 100)}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Scan a single ticker's history rows for price jumps after applying price adjustments.
 */
export function scanTickerHistoryForJumps(ticker, name, history, adjustments, threshold = 1.7) {
  const candidates = [];
  if (!history || history.length < 2) return candidates;

  const adjRows = history.map((r) => {
    const cum = cumulativeAdjustmentRatio(r.trade_date, adjustments);
    const adjClose = Math.round(r.close / cum);
    const shares = sharesFromHistoryRow(r);
    return {
      trade_date: r.trade_date,
      rawClose: r.close,
      adjClose,
      mcap_won: r.mcap_won,
      shares,
    };
  });

  for (let i = 1; i < adjRows.length; i++) {
    const prev = adjRows[i - 1];
    const curr = adjRows[i];
    if (!(prev.adjClose > 0) || !(curr.adjClose > 0)) continue;

    const priceRatio = curr.adjClose / prev.adjClose;
    const jump = Math.max(priceRatio, 1 / priceRatio);

    if (jump >= threshold) {
      const prevSh = prev.shares;
      const currSh = curr.shares;
      let sharesRatio = null;
      let sharesChanged = 'N';

      if (prevSh > 0 && currSh > 0) {
        sharesRatio = currSh / prevSh;
        if (Math.abs(sharesRatio - 1) >= 0.05) {
          sharesChanged = 'Y';
        }
      }

      const isDateAdjusted = adjustments.some(
        (a) => String(a.effective_date).slice(0, 10) === curr.trade_date,
      );

      candidates.push({
        ticker,
        name: name || '',
        date: curr.trade_date,
        prevClose: prev.adjClose,
        close: curr.adjClose,
        priceRatio: Number(priceRatio.toFixed(4)),
        sharesRatio: sharesRatio != null ? Number(sharesRatio.toFixed(4)) : '',
        sharesChanged,
        이미조정여부: isDateAdjusted ? 'Y' : 'N',
        jump: Number(jump.toFixed(2)),
      });
    }
  }

  return candidates;
}

export function formatResidualsCsv(candidates) {
  const headers = [
    'ticker',
    'name',
    'date',
    'prevClose',
    'close',
    'priceRatio',
    'sharesRatio',
    'sharesChanged',
    '이미조정여부',
  ];
  const lines = [headers.join(',')];
  for (const c of candidates) {
    const row = [
      c.ticker,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      c.date,
      c.prevClose,
      c.close,
      c.priceRatio,
      c.sharesRatio,
      c.sharesChanged,
      c.이미조정여부,
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or service key in env / .dev.vars');
    process.exit(1);
  }

  const companyMap = loadHubCompanyMap();
  const tickers = args.tickers?.length ? args.tickers : Array.from(companyMap.keys()).sort();

  console.log(`scan_residual_price_jumps: scanning ${tickers.length} tickers (threshold jump >= ${args.threshold})`);

  const { byTicker: adjustmentsByTicker, all: allAdjustments } = await fetchAllPriceAdjustments(
    supabaseUrl,
    serviceKey,
  );
  console.log(`Loaded ${allAdjustments.length} existing price adjustment rows from database.`);

  const allCandidates = [];
  const CONCURRENCY = 15;
  let scanned = 0;

  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const history = await fetchTickerHistory(supabaseUrl, serviceKey, ticker);
          const adjustments = adjustmentsByTicker.get(ticker) || [];
          const name = companyMap.get(ticker) || '';
          const candidates = scanTickerHistoryForJumps(
            ticker,
            name,
            history,
            adjustments,
            args.threshold,
          );
          for (const cand of candidates) allCandidates.push(cand);
        } catch (err) {
          console.warn(`\n[${ticker}] error: ${err.message || err}`);
        }
      }),
    );
    scanned += batch.length;
    process.stdout.write(`\r  scanned ${scanned}/${tickers.length}`);
  }
  process.stdout.write('\n');

  // Sort candidates by ticker asc, date asc
  allCandidates.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  fs.writeFileSync(args.outPath, formatResidualsCsv(allCandidates), 'utf8');

  const sharesChangedY = allCandidates.filter((c) => c.sharesChanged === 'Y');
  const sharesChangedN = allCandidates.filter((c) => c.sharesChanged === 'N');
  const alreadyAdjY = allCandidates.filter((c) => c.이미조정여부 === 'Y');

  console.log(`\nScan complete! Found ${allCandidates.length} residual jump candidate(s):`);
  console.log(`  - sharesChanged = Y (share count changed >= 5%): ${sharesChangedY.length}`);
  console.log(`  - sharesChanged = N (share count unchanged, pure price movement/lagged): ${sharesChangedN.length}`);
  console.log(`  - 이미조정여부 = Y: ${alreadyAdjY.length}`);
  console.log(`Saved report to: ${path.relative(ROOT, args.outPath)}`);
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
