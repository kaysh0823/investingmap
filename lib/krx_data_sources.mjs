/**
 * Resolves latest KRX CSVs under data/ (mtime) per project rules.
 * - data_4937_* / data_4848_* : 시가총액·시장구분 (기존 8필드 따옴표 행)
 * - data_3557_* : 단축코드·영문 종목명·시장구분 (선택, 있으면 nameEn 보강)
 */
import fs from 'fs';
import { join } from 'path';
import { parse5016Line } from './krx_per_pbr.mjs';

export function resolveLatestCsv(dataDir, prefix) {
  const names = fs.readdirSync(dataDir).filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith('.csv'));
  if (!names.length) {
    throw new Error(`No CSV with prefix ${prefix} in ${dataDir}`);
  }
  names.sort((a, b) => fs.statSync(join(dataDir, b)).mtimeMs - fs.statSync(join(dataDir, a)).mtimeMs);
  return join(dataDir, names[0]);
}

/** Same shape as legacy update_semiconductor parse. */
export function parseKrxMcapLine(line) {
  const m = line.match(
    /^"([^"]+)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/,
  );
  if (!m) return null;
  const code = m[1];
  const market = m[3];
  const mcap = parseInt(m[8], 10);
  if (!code || !market || !Number.isFinite(mcap)) return null;
  return { code, market, mcap };
}

export function loadMergedKrxMap(dataDir) {
  const map = new Map();
  for (const prefix of ['data_4937_', 'data_4848_']) {
    const p = resolveLatestCsv(dataDir, prefix);
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/).slice(1)) {
      const row = parseKrxMcapLine(line);
      if (row) map.set(row.code, { market: row.market, mcap: row.mcap });
    }
  }
  return map;
}

function normalizeMarketLabel(raw) {
  const s = (raw || '').toUpperCase();
  if (s.includes('KOSPI')) return 'KOSPI';
  if (s.includes('KOSDAQ')) return 'KOSDAQ';
  return raw || '';
}

/**
 * @returns {Map<string, { nameEn: string, marketHint: string }>}
 */
export function loadListedEnglish3557Map(dataDir) {
  const names = fs.readdirSync(dataDir).filter((f) => /^data_3557_.*\.csv$/i.test(f));
  if (!names.length) return new Map();
  names.sort((a, b) => fs.statSync(join(dataDir, b)).mtimeMs - fs.statSync(join(dataDir, a)).mtimeMs);
  const p = join(dataDir, names[0]);
  const text = fs.readFileSync(p, 'utf8');
  const map = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line || !line.trim()) continue;
    const f = parse5016Line(line);
    if (f.length < 7) continue;
    const code = (f[1] || '').trim();
    if (!code) continue;
    const nameEn = (f[4] || '').trim();
    const marketHint = normalizeMarketLabel(f[6]);
    if (nameEn) map.set(code, { nameEn, marketHint });
  }
  return map;
}

export function mergeListedEnglishIntoCompanies(companies, meta3557) {
  if (!meta3557 || !meta3557.size) return;
  for (const c of companies) {
    const t = c.ticker;
    if (!t || t === 'UNLISTED') continue;
    const row = meta3557.get(t);
    if (row && row.nameEn) c.nameEn = row.nameEn;
  }
}

export function extractYmdFromFilename(filename) {
  const m = filename.match(/_(\d{4})(\d{2})(\d{2})\.csv$/i);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDataAsofLabels(ymd) {
  if (!ymd) return { ko: '', en: '' };
  const { y, mo, d } = ymd;
  return {
    ko: `업데이트 기준일: ${y}년 ${mo}월 ${d}일`,
    en: `Data as of: ${EN_MONTHS[mo - 1]} ${d}, ${y}`,
  };
}

/** Latest date among known quantitative CSV filenames in dataDir. */
export function maxQuantCsvDateYmd(dataDir) {
  const prefixes = ['data_4937_', 'data_4848_', 'data_5016_', 'data_3557_'];
  let best = null;
  for (const prefix of prefixes) {
    let names;
    try {
      names = fs.readdirSync(dataDir).filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith('.csv'));
    } catch {
      continue;
    }
    for (const n of names) {
      const ymd = extractYmdFromFilename(n);
      if (!ymd) continue;
      if (
        !best ||
        ymd.y > best.y ||
        (ymd.y === best.y && (ymd.mo > best.mo || (ymd.mo === best.mo && ymd.d > best.d)))
      ) {
        best = ymd;
      }
    }
  }
  return best;
}
