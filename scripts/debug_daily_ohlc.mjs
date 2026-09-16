/**
 * One-off: compare OTP CSV vs getJsonData closes for 2026-09-16 sample names.
 *
 * Usage: node scripts/debug_daily_ohlc.mjs
 *    or: node scripts/debug_daily_ohlc.mjs --date=20260916
 *
 * Requires KRX_ID / KRX_PW in env or .dev.vars.
 */
import {
  fetchKrxDailyOhlc,
  fetchDailyOhlcOtpCsvRaw,
  fetchDailyOhlcJsonRaw,
} from '../functions/lib/krx_daily_ohlc.mjs';
import { loadEnv } from './lib/investor_net_supabase.mjs';

const TARGETS = ['000150', '000880', '001200'];
/** Doosan (000150) regular-session close ballpark on 2026-09-16. */
const REALITY_CLOSE = {
  '000150': { label: '두산', approxMin: 1_200_000, approxMax: 1_400_000 },
};

function parseArgs(argv) {
  let dayYmd = '20260916';
  for (const a of argv) {
    if (a.startsWith('--date=')) dayYmd = a.slice('--date='.length).replace(/\D/g, '');
  }
  return { dayYmd };
}

function padTicker(raw) {
  const s = String(raw || '').replace(/"/g, '').trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(6, '0').slice(-6);
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Exact first-column ticker match (avoids false hits on price "150"). */
function csvCode(line) {
  const cols = splitCsvLine(line);
  return cols[0] ? String(cols[0]).replace(/"/g, '').trim() : '';
}

function byTickerFirst(rows) {
  const m = new Map();
  for (const row of rows || []) {
    if (row?.ticker && !m.has(row.ticker)) m.set(row.ticker, row);
  }
  return m;
}

function matchesReality(ticker, close) {
  const hint = REALITY_CLOSE[ticker];
  if (!hint || close == null || !Number.isFinite(close)) return null;
  return close >= hint.approxMin && close <= hint.approxMax;
}

function fmt(n) {
  if (n == null || !Number.isFinite(n)) return 'null';
  return n.toLocaleString('en-US');
}

function pickCloseFromCsvLine(line) {
  // MDCSTAT01501: code,name,market,[dept],close,...
  const cols = splitCsvLine(line);
  for (const idx of [4, 5, 3]) {
    const n = Number(String(cols[idx] || '').replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function main() {
  const { dayYmd } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  if (!(env.KRX_ID || '').trim() || !(env.KRX_PW || '').trim()) {
    console.error('KRX_ID and KRX_PW are required');
    process.exit(1);
  }

  console.log(`=== debug_daily_ohlc ${dayYmd} targets=${TARGETS.join(',')} ===\n`);

  const [csvPack, jsonPack, merged] = await Promise.all([
    fetchDailyOhlcOtpCsvRaw(env, dayYmd),
    fetchDailyOhlcJsonRaw(env, dayYmd),
    fetchKrxDailyOhlc(dayYmd, env),
  ]);

  // --- 1) raw OTP CSV lines (exact code in col0) -----------------------------
  console.log('--- 1) OTP CSV raw lines (col0 == ticker) ---');
  const lines = String(csvPack.text || '').split(/\r?\n/);
  for (const ticker of TARGETS) {
    const hits = lines.filter((l) => {
      const code = csvCode(l);
      return code === ticker || padTicker(code) === ticker;
    });
    if (!hits.length) {
      console.log(`[${ticker}] (no raw line)`);
      continue;
    }
    for (const line of hits) {
      const code = csvCode(line);
      const note = code !== ticker ? `  ← rawCode=${code} padTicker→${padTicker(code)}` : '';
      console.log(`[${ticker}] ${line}${note}`);
    }
  }
  console.log(
    `csv: otpOk=${csvPack.otpOk} lines=${lines.length} parsedRows=${csvPack.rows?.length || 0}\n`,
  );

  // --- 2) CSV vs JSON close (parser first-wins map) -------------------------
  console.log('--- 2) parsed close: CSV vs JSON (first padTicker win) ---');
  const csvMap = byTickerFirst(csvPack.rows);
  const jsonMap = byTickerFirst(jsonPack.rows);
  console.log(
    'ticker'.padEnd(8),
    'csv_close'.padStart(14),
    'json_close'.padStart(14),
    'merged'.padStart(14),
    'diff?',
  );
  for (const ticker of TARGETS) {
    const csvC = csvMap.get(ticker)?.close ?? null;
    const jsonC = jsonMap.get(ticker)?.close ?? null;
    const mergedC = merged.get(ticker)?.close ?? null;
    const differ = csvC != null && jsonC != null && csvC !== jsonC;
    console.log(
      ticker.padEnd(8),
      fmt(csvC).padStart(14),
      fmt(jsonC).padStart(14),
      fmt(mergedC).padStart(14),
      differ ? 'YES' : 'no',
    );
  }

  // Exact-code CSV close vs JSON rows whose ISU_SRT_CD pads to ticker
  console.log('\n--- 2b) exact-code CSV close vs JSON rows that pad→ticker ---');
  const block = jsonPack.json?.OutBlock_1 || jsonPack.json?.output || [];
  for (const ticker of TARGETS) {
    const exactLine = lines.find((l) => csvCode(l) === ticker);
    const exactCsvClose = exactLine ? pickCloseFromCsvLine(exactLine) : null;
    const jsonHits = (block || []).filter(
      (r) => padTicker(r.ISU_SRT_CD || r.ISU_CD) === ticker,
    );
    console.log(`[${ticker}] exact CSV col0 close=${fmt(exactCsvClose)}`);
    if (!jsonHits.length) {
      console.log(`         JSON pad→${ticker}: (none)`);
      continue;
    }
    for (const row of jsonHits) {
      const rawClose = String(row.TDD_CLSPRC ?? '').replace(/,/g, '');
      const closeNum = Number(rawClose);
      console.log(
        `         JSON ISU_SRT_CD=${row.ISU_SRT_CD} TDD_CLSPRC=${row.TDD_CLSPRC}`
        + ` (num=${fmt(closeNum)}) name=${row.ISU_ABBRV || row.ISU_NM || ''}`,
      );
    }
  }
  console.log(
    `json: ok=${jsonPack.ok} parsedRows=${jsonPack.rows?.length || 0} `
    + `OutBlock=${block.length || 0}\n`,
  );

  // --- 3) reality (두산 ≈ 1.3M) ---------------------------------------------
  console.log('--- 3) reality check (두산 000150 ≈ 1,2xx,xxx–1,4xx,xxx) ---');
  for (const ticker of TARGETS) {
    const hint = REALITY_CLOSE[ticker];
    if (!hint) {
      console.log(`[${ticker}] (no reality band configured)`);
      continue;
    }
    const exactLine = lines.find((l) => csvCode(l) === ticker);
    const exactCsvClose = exactLine ? pickCloseFromCsvLine(exactLine) : null;
    const csvFirst = csvMap.get(ticker)?.close ?? null;
    const jsonFirst = jsonMap.get(ticker)?.close ?? null;
    const jsonExact = (block || []).find((r) => String(r.ISU_SRT_CD || '') === ticker);
    const jsonExactClose = jsonExact
      ? Number(String(jsonExact.TDD_CLSPRC ?? '').replace(/,/g, ''))
      : null;

    const candidates = [
      { src: 'CSV exact col0', close: exactCsvClose },
      { src: 'CSV parse first-win', close: csvFirst },
      { src: 'JSON exact ISU_SRT_CD', close: jsonExactClose },
      { src: 'JSON parse first-win', close: jsonFirst },
    ];
    console.log(`[${ticker} ${hint.label}]`);
    for (const c of candidates) {
      const ok = matchesReality(ticker, c.close);
      const mark = ok === true ? 'OK REALITY' : ok === false ? 'miss' : '?';
      console.log(`  ${mark.padEnd(10)} ${c.src.padEnd(24)} close=${fmt(c.close)}`);
    }
    const winners = candidates.filter((c) => matchesReality(ticker, c.close));
    if (winners.length) {
      console.log(`  → matches reality: ${winners.map((w) => w.src).join(', ')}`);
    } else {
      console.log('  → no candidate in reality band');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
