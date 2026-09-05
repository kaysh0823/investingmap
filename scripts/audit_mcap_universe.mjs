/**
 * Read-only audit: hub coverage vs KRX market-cap floor (2천억원).
 *
 * Usage:
 *   npm run audit:mcap-universe
 *
 * Requires KRX_AUTH_KEY (or .dev.vars). Writes CSV only; no data mutations.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAuthKey,
  fetchMarketDay,
  tradingDates,
  recentDateCandidates,
} from '../functions/lib/krx_yoy.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';
import { MIN_MCAP_WON } from '../lib/mcap_policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = path.join(ROOT, 'docs', 'reports');
const REMOVALS_CSV = path.join(REPORTS_DIR, 'mcap_audit_removals.csv');
const ADDITIONS_CSV = path.join(REPORTS_DIR, 'mcap_audit_additions.csv');
const MIN_MCAP_EOK = MIN_MCAP_WON / 1e8;

const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const KOSPI_DAILY = '/sto/stk_bydd_trd';
const KOSDAQ_DAILY = '/sto/ksq_bydd_trd';
const SHORT_CODE_RE = /^[0-9A-Z]{6}$/;

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

function parseNum(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function shortCodeFromRow(row) {
  const srt = row && row.ISU_SRT_CD;
  if (srt) {
    const s = String(srt).trim().toUpperCase();
    if (SHORT_CODE_RE.test(s)) return s;
  }
  const cd = row && row.ISU_CD;
  if (!cd) return null;
  const s = String(cd).trim().toUpperCase();
  if (SHORT_CODE_RE.test(s)) return s;
  if (s.length >= 9 && s.startsWith('KR')) return s.substring(3, 9);
  return null;
}

function mcapFromRow(row) {
  const cl = parseNum(row?.TDD_CLSPRC);
  const shrs = parseNum(row?.LIST_SHRS);
  if (cl != null && shrs != null && cl > 0 && shrs > 0) return cl * shrs;
  const direct = parseNum(row?.MKTCAP);
  if (direct != null && direct > 0) return direct;
  return null;
}

function nameFromRow(row) {
  return String(row?.ISU_ABBRV || row?.ISU_NM || '').trim();
}

function marketFromRow(row) {
  const raw = String(row?.MKT_NM || row?.MKT_ID || '').trim();
  if (/KOSPI/i.test(raw)) return 'KOSPI';
  if (/KOSDAQ/i.test(raw)) return 'KOSDAQ';
  return raw || '';
}

async function krxDaily(authKey, endpoint, basDd) {
  const url = `${KRX_BASE}${endpoint}`;
  const headers = { AUTH_KEY: authKey, Accept: 'application/json', 'Content-Type': 'application/json' };
  let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ basDd }) });
  if (!res.ok) {
    res = await fetch(`${url}?basDd=${encodeURIComponent(basDd)}`, {
      method: 'GET',
      headers: { AUTH_KEY: authKey, Accept: 'application/json' },
    });
  }
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.OutBlock_1) ? j.OutBlock_1 : [];
}

async function resolveRecentMarketDay(authKey) {
  const dates = tradingDates(10);
  for (const basDd of recentDateCandidates(dates).slice(0, 5)) {
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (byCode.size >= 100) return { basDd, byCode };
    } catch {
      /* try next session */
    }
  }
  throw new Error('KRX market day unavailable (no basDd with sufficient listings)');
}

async function fetchMarketTags(authKey, basDd) {
  const tags = new Map();
  const [kospi, kosdaq] = await Promise.all([
    krxDaily(authKey, KOSPI_DAILY, basDd),
    krxDaily(authKey, KOSDAQ_DAILY, basDd),
  ]);
  for (const row of kospi) {
    const code = shortCodeFromRow(row);
    if (code) tags.set(code, 'KOSPI');
  }
  for (const row of kosdaq) {
    const code = shortCodeFromRow(row);
    if (code) tags.set(code, 'KOSDAQ');
  }
  return tags;
}

function loadHubCoverage() {
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_index.json'), 'utf8'));
  const byTicker = new Map();
  for (const c of listHubCompanies(hub)) {
    const ticker = normalizeTicker(c.ticker);
    if (!ticker || byTicker.has(ticker)) continue;
    byTicker.set(ticker, {
      name: c.name || c.nameEn || ticker,
      sector: c.sectorId || '',
    });
  }
  return byTicker;
}

function mcapEok(mcapWon) {
  return Math.round((mcapWon / 1e8) * 100) / 100;
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, header, rows) {
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function preview(title, rows, formatter, limit = 20) {
  console.log(`\n${title} (top ${Math.min(limit, rows.length)} of ${rows.length})`);
  for (const row of rows.slice(0, limit)) {
    console.log(`  ${formatter(row)}`);
  }
}

async function main() {
  const env = loadEnv();
  const authKey = getAuthKey(env);
  if (!authKey) {
    console.error('Missing KRX auth key (KRX_AUTH_KEY or .dev.vars)');
    process.exit(1);
  }

  const hubByTicker = loadHubCoverage();
  const { basDd, byCode } = await resolveRecentMarketDay(authKey);
  const marketTags = await fetchMarketTags(authKey, basDd);

  const krxByTicker = new Map();
  for (const [ticker, row] of byCode) {
    const mcapWon = mcapFromRow(row);
    if (mcapWon == null || mcapWon <= 0) continue;
    krxByTicker.set(ticker, {
      ticker,
      name: nameFromRow(row) || ticker,
      market: marketTags.get(ticker) || marketFromRow(row) || '',
      mcapWon,
      mcapEok: mcapEok(mcapWon),
    });
  }

  const removals = [];
  for (const [ticker, hub] of hubByTicker) {
    const krx = krxByTicker.get(ticker);
    if (!krx) continue;
    if (krx.mcapWon >= MIN_MCAP_WON) continue;
    removals.push({
      ticker,
      name: hub.name || krx.name,
      mcapEok: krx.mcapEok,
      sector: hub.sector,
    });
  }
  removals.sort((a, b) => a.mcapEok - b.mcapEok || a.ticker.localeCompare(b.ticker));

  const additions = [...krxByTicker.values()]
    .filter((u) => !hubByTicker.has(u.ticker) && u.mcapWon >= MIN_MCAP_WON)
    .sort((a, b) => b.mcapEok - a.mcapEok || a.ticker.localeCompare(b.ticker));

  writeCsv(
    REMOVALS_CSV,
    ['ticker', 'name', 'mcap_eok', 'sector'],
    removals.map((r) => [r.ticker, r.name, r.mcapEok, r.sector]),
  );
  writeCsv(
    ADDITIONS_CSV,
    ['ticker', 'name', 'market', 'mcap_eok'],
    additions.map((a) => [a.ticker, a.name, a.market, a.mcapEok]),
  );

  const basDdDash = `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
  console.log('mcap universe audit (read-only)');
  console.log(`  KRX basDd:     ${basDdDash}`);
  console.log(`  floor:         ${MIN_MCAP_EOK.toLocaleString('ko-KR')}억원`);
  console.log(`  hub covered:   ${hubByTicker.size} tickers`);
  console.log(`  KRX listed:    ${krxByTicker.size} tickers (with mcap)`);
  console.log(`  (A) removals:  ${removals.length} → ${path.relative(ROOT, REMOVALS_CSV)}`);
  console.log(`  (B) additions: ${additions.length} → ${path.relative(ROOT, ADDITIONS_CSV)}`);

  preview('(A) removal candidates', removals, (r) =>
    `${r.ticker}\t${r.name}\t${r.mcapEok}억\t${r.sector}`,
  );
  preview('(B) addition candidates', additions, (a) =>
    `${a.ticker}\t${a.name}\t${a.market}\t${a.mcapEok}억`,
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
