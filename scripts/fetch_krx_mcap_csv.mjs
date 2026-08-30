/**
 * Fetch KRX daily market-cap CSVs (data_4937 KOSPI, data_4848 KOSDAQ).
 *
 * Usage: npm run fetch:krx-mcap
 * Requires KRX_AUTH_KEY (or .dev.vars).
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
import { parseKrxMcapLine } from '../lib/krx_data_sources.mjs';
import { resolveKrxCsvWriteEncoding, writeKrxCsvFile } from '../lib/krx_csv_encode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const CSV_HEADER = '종목코드,종목명,시장구분,업종명,종가,대비,등락률,시가총액';

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

function industryFromRow(row) {
  return String(row?.IDX_IND_NM || row?.IDX_NM || row?.SECUGRP_NM || '').trim();
}

function changeFromRow(row) {
  const n = parseNum(row?.CMPPREVDD_PRC);
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : String(n);
}

function changeRateFromRow(row) {
  const n = parseNum(row?.FLUC_RT);
  if (n == null) return '';
  return Number.isInteger(n) ? `${n}.00` : String(n);
}

function closeFromRow(row) {
  const n = parseNum(row?.TDD_CLSPRC);
  if (n == null || n <= 0) return null;
  return Number.isInteger(n) ? String(n) : String(n);
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

/** Same endpoints as fetchMarketDay; returns split arrays for CSV files. */
async function fetchMarketDaySplit(authKey, basDd) {
  const [kospi, kosdaq] = await Promise.all([
    krxDaily(authKey, KOSPI_DAILY, basDd),
    krxDaily(authKey, KOSDAQ_DAILY, basDd),
  ]);
  return { kospi, kosdaq };
}

async function resolveRecentMarketDay(authKey) {
  const dates = tradingDates(10);
  for (const basDd of recentDateCandidates(dates).slice(0, 5)) {
    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (byCode.size >= 100) return basDd;
    } catch {
      /* try next session */
    }
  }
  throw new Error('KRX market day unavailable (no basDd with sufficient listings)');
}

function csvField(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function formatMcapCsvRow(entry) {
  return [
    csvField(entry.code),
    csvField(entry.name),
    csvField(entry.market),
    csvField(entry.industry),
    csvField(entry.close),
    csvField(entry.change),
    csvField(entry.changeRate),
    csvField(entry.mcap),
  ].join(',');
}

function rowToEntry(row, market) {
  const code = shortCodeFromRow(row);
  const mcap = mcapFromRow(row);
  const close = closeFromRow(row);
  if (!code || mcap == null || mcap <= 0 || close == null) return null;
  return {
    code,
    name: nameFromRow(row) || code,
    market,
    industry: industryFromRow(row),
    close,
    change: changeFromRow(row),
    changeRate: changeRateFromRow(row),
    mcap: Math.round(mcap),
  };
}

function buildCsvText(rows) {
  const lines = [CSV_HEADER];
  for (const row of rows) {
    lines.push(formatMcapCsvRow(row));
  }
  return `${lines.join('\n')}\n`;
}

function verifyCsvRoundTrip(text) {
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parsed = parseKrxMcapLine(line);
    if (!parsed) throw new Error(`CSV row failed parseKrxMcapLine: ${line.slice(0, 80)}`);
  }
}

function writeMarketCsv(filePath, rows, encoding) {
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));
  const text = buildCsvText(sorted);
  verifyCsvRoundTrip(text);
  writeKrxCsvFile(filePath, text, encoding);
}

async function main() {
  const env = loadEnv();
  const authKey = getAuthKey(env);
  if (!authKey) {
    console.error('Missing KRX auth key (KRX_AUTH_KEY or .dev.vars)');
    process.exit(1);
  }

  const basDd = await resolveRecentMarketDay(authKey);
  const { kospi, kosdaq } = await fetchMarketDaySplit(authKey, basDd);

  const kospiRows = [];
  for (const row of kospi) {
    const entry = rowToEntry(row, 'KOSPI');
    if (entry) kospiRows.push(entry);
  }

  const kosdaqRows = [];
  for (const row of kosdaq) {
    const entry = rowToEntry(row, 'KOSDAQ');
    if (entry) kosdaqRows.push(entry);
  }

  if (kospiRows.length < 50 || kosdaqRows.length < 50) {
    throw new Error(`Insufficient listings for ${basDd} (KOSPI ${kospiRows.length}, KOSDAQ ${kosdaqRows.length})`);
  }

  const encoding = resolveKrxCsvWriteEncoding(DATA_DIR);
  const kospiPath = path.join(DATA_DIR, `data_4937_${basDd}.csv`);
  const kosdaqPath = path.join(DATA_DIR, `data_4848_${basDd}.csv`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeMarketCsv(kospiPath, kospiRows, encoding);
  writeMarketCsv(kosdaqPath, kosdaqRows, encoding);

  const y = basDd.slice(0, 4);
  const mo = basDd.slice(4, 6);
  const d = basDd.slice(6, 8);
  console.log(`KRX market cap CSV written (encoding: ${encoding})`);
  console.log(`  basDd: ${basDd} (${y}-${mo}-${d})`);
  console.log(`  KOSPI: ${kospiRows.length} → ${path.relative(ROOT, kospiPath)}`);
  console.log(`  KOSDAQ: ${kosdaqRows.length} → ${path.relative(ROOT, kosdaqPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
