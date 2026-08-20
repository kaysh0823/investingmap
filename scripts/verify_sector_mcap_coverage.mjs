/**
 * Coverage audit: for each hub_trend daily anchor date, check that
 * sector_mcap_daily sums include current hub_index constituents present in
 * stock_price_history (missing members shrink the past denominator and inflate returns).
 *
 * Usage:
 *   node scripts/verify_sector_mcap_coverage.mjs
 *   node scripts/verify_sector_mcap_coverage.mjs --fix   # re-upsert thin days
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTOR_ORDER, normalizeTicker, listHubCompanies } from '../functions/lib/hub_dashboard_core.mjs';
import { buildHubTrendPayload, TREND_HORIZONS } from '../functions/lib/hub_trend.mjs';
import { getSupabaseConfig, fetchSupabaseJson, numOrNull } from '../functions/lib/supabase_hub.mjs';
import {
  buildSectorMcapDailyRows,
  upsertSectorMcapDaily,
} from './lib/sector_mcap_daily.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 1000;
/** Member must contribute ≥ this share of current sector mcap to flag as material miss. */
const MATERIAL_SHARE = 0.02;
/** Sector day fails if history coverage of material members < this. */
const MIN_COVERAGE = 0.85;

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

async function loadHistoryMcaps(config, date, tickers) {
  const need = new Set(tickers);
  const map = new Map();
  let offset = 0;
  while (need.size) {
    const rows = await fetchSupabaseJson(
      config,
      `stock_price_history?trade_date=eq.${encodeURIComponent(date)}` +
        `&select=ticker,mcap_won&mcap_won=gt.0&limit=${PAGE}&offset=${offset}`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const t = normalizeTicker(row.ticker);
      if (!t || !need.has(t)) continue;
      const m = numOrNull(row.mcap_won);
      if (m != null && m > 0) {
        map.set(t, m);
        need.delete(t);
      }
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return map;
}

async function loadSectorDaily(config, date) {
  const rows = await fetchSupabaseJson(
    config,
    `sector_mcap_daily?trade_date=eq.${encodeURIComponent(date)}&select=sector_id,mcap_sum`,
  );
  const map = new Map();
  for (const row of rows) {
    const m = numOrNull(row.mcap_sum);
    if (row.sector_id && m != null) map.set(row.sector_id, m);
  }
  return map;
}

function sectorMembers(hubIndex) {
  const out = new Map();
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors?.[sid];
    if (!block) continue;
    const members = [];
    let totalMcap = 0;
    for (const c of block.companies || []) {
      const t = normalizeTicker(c.ticker);
      if (!t) continue;
      const m = Number(c.mcapWon) || 0;
      members.push({ ticker: t, mcapWon: m });
      totalMcap += m;
    }
    out.set(sid, { members, totalMcap });
  }
  return out;
}

async function main() {
  const fix = process.argv.includes('--fix');
  const env = loadEnv();
  const config = getSupabaseConfig(env);
  if (!config) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY required');
    process.exit(1);
  }
  const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const membersBySector = sectorMembers(hubIndex);
  const allTickers = [...new Set(listHubCompanies(hubIndex).map((c) => normalizeTicker(c.ticker)).filter(Boolean))];

  const anchorDates = new Set();
  for (const horizon of TREND_HORIZONS.filter((h) => h !== '1d')) {
    const payload = await buildHubTrendPayload(hubIndex, env, horizon);
    for (const entry of payload.sectors || []) {
      const series = entry.series || [];
      if (series.length) {
        anchorDates.add(series[0].t);
        anchorDates.add(series[series.length - 1].t);
      }
    }
  }

  const dates = [...anchorDates].sort();
  console.log(`Coverage audit: ${dates.length} anchor date(s) from hub_trend daily series`);
  console.log(`  dates: ${dates.join(', ')}`);

  const problems = [];
  const thinDates = new Set();

  for (const date of dates) {
    const history = await loadHistoryMcaps(config, date, allTickers);
    const daily = await loadSectorDaily(config, date);
    console.log(`\n=== ${date} history_rows=${history.size} sector_daily=${daily.size} ===`);

    if (history.size < 30) {
      console.log('  skip: stock_price_history thin (session may still be open)');
      continue;
    }

    for (const sid of SECTOR_ORDER) {
      const info = membersBySector.get(sid);
      if (!info || !info.members.length) continue;
      const pool = info.members;
      let missing = [];
      let histSum = 0;
      for (const m of pool) {
        const hm = history.get(m.ticker);
        if (hm != null) {
          histSum += hm;
        } else {
          const share = info.totalMcap > 0 ? m.mcapWon / info.totalMcap : 0;
          if (share >= MATERIAL_SHARE) missing.push(m.ticker);
        }
      }
      // Coverage only fails when material members (≥MATERIAL_SHARE of sector) lack history.
      const material = info.members.filter(
        (m) => info.totalMcap > 0 && m.mcapWon / info.totalMcap >= MATERIAL_SHARE,
      );
      const materialPool = material.length ? material : info.members;
      let materialPresent = 0;
      for (const m of materialPool) {
        if (history.has(m.ticker)) materialPresent += 1;
      }
      const coverage = materialPool.length ? materialPresent / materialPool.length : 1;
      const stored = daily.get(sid);
      const ratio =
        stored != null && histSum > 0 ? Math.abs(stored - histSum) / Math.max(stored, histSum) : null;

      if (coverage < MIN_COVERAGE) {
        thinDates.add(date);
        problems.push({ date, sid, coverage, missing: missing.slice(0, 8), stored, histSum });
        console.log(
          `  FAIL ${sid}: cov=${(coverage * 100).toFixed(0)}% missing=${missing.slice(0, 6).join(',')}` +
            (missing.length > 6 ? '…' : '') +
            ` stored=${stored ?? 'n/a'} histSum=${histSum || 'n/a'}`,
        );
      } else if (ratio != null && ratio > 0.05) {
        // Stored sum diverges from rebuildable hist sum → stale sector_mcap_daily.
        thinDates.add(date);
        problems.push({ date, sid, coverage, drift: ratio, stored, histSum });
        console.log(
          `  DRIFT ${sid}: stored/hist Δ=${(ratio * 100).toFixed(1)}% stored=${stored} histSum=${histSum}`,
        );
      } else {
        console.log(`  OK   ${sid}: cov=${(coverage * 100).toFixed(0)}% n=${pool.length}`);
      }
    }
  }

  if (fix && thinDates.size) {
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('--fix requires SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
    console.log(`\nRebuilding sector_mcap_daily for ${thinDates.size} date(s)…`);
    for (const date of [...thinDates].sort()) {
      const history = await loadHistoryMcaps(config, date, allTickers);
      if (history.size < 30) {
        console.log(`  ${date}: skip thin history (${history.size})`);
        continue;
      }
      const rows = buildSectorMcapDailyRows(hubIndex, history, date);
      const result = await upsertSectorMcapDaily(rows, config.url, serviceKey);
      console.log(
        `  ${date}: sectors=${rows.length} upsert=${result.ok ? 'ok' : `fail ${result.status}`}`,
      );
    }
  }

  if (problems.length) {
    console.error(
      `\n${problems.length} coverage/drift issue(s).` +
        (fix ? ' Re-ran backfill for thin dates.' : ' Re-run with --fix or backfill_sector_mcap_daily.'),
    );
    process.exit(fix ? 0 : 1);
  }
  console.log('\nverify:sector-mcap-coverage OK — anchors cover current constituents');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
