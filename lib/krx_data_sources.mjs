/**
 * Resolves latest KRX CSVs under data/ (mtime) per project rules.
 * - data_4937_* / data_4848_* : 시가총액·시장구분 (기존 8필드 따옴표 행)
 * - data_3557_* : 단축코드·영문 종목명·시장구분 (선택, 있으면 nameEn 보강)
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse5016Line } from './krx_per_pbr.mjs';
import { readKrxCsvFile } from './krx_csv_encode.mjs';

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
  const name = (m[2] || '').trim();
  const market = m[3];
  const mcap = parseInt(m[8], 10);
  if (!code || !market || !Number.isFinite(mcap)) return null;
  return { code, name, market, mcap };
}

export function loadMergedKrxMap(dataDir) {
  const map = new Map();
  for (const prefix of ['data_4937_', 'data_4848_']) {
    const p = resolveLatestCsv(dataDir, prefix);
    const text = readKrxCsvFile(p);
    for (const line of text.split(/\r?\n/).slice(1)) {
      const row = parseKrxMcapLine(line);
      if (row) map.set(row.code, { market: row.market, mcap: row.mcap, name: row.name || '' });
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
 * @returns {Map<string, { nameEn: string, nameKo: string, marketHint: string }>}
 */
export function loadListedEnglish3557Map(dataDir) {
  const names = fs.readdirSync(dataDir).filter((f) => /^data_3557_.*\.csv$/i.test(f));
  if (!names.length) return new Map();
  names.sort((a, b) => fs.statSync(join(dataDir, b)).mtimeMs - fs.statSync(join(dataDir, a)).mtimeMs);
  const p = join(dataDir, names[0]);
  const text = readKrxCsvFile(p);
  const map = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line || !line.trim()) continue;
    const f = parse5016Line(line);
    if (f.length < 7) continue;
    const code = (f[1] || '').trim();
    if (!code) continue;
    const nameKo = ((f[3] || f[2] || '').trim()).replace(/^\(주\)/, '').trim();
    const nameEn = (f[4] || '').trim();
    const marketHint = normalizeMarketLabel(f[6]);
    if (nameEn || nameKo) map.set(code, { nameEn, nameKo, marketHint });
  }
  return map;
}

export function formatListedEnglishName(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const glossary = JSON.parse(
    fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'en_glossary.json'), 'utf8'),
  );
  const alias = glossary.nameAliases?.[trimmed] || glossary.nameAliases?.[trimmed.toUpperCase()];
  if (alias) return alias;

  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !/\s/.test(trimmed)) {
    const spaced = trimmed
      .replace(/(BANK|GROUP|HOLDINGS|CORP|CORPORATION|CO\.|LTD|INC)(?=[A-Z]|$)/gi, ' $1')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    return spaced
      .split(' ')
      .map((w) => (/^(of|and|the|for|in|co\.|ltd\.?|inc\.?)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ')
      .replace(/\bCo\.?\b/gi, 'Co.')
      .replace(/\bLtd\.?\b/gi, 'Ltd.')
      .replace(/\bInc\.?\b/gi, 'Inc.');
  }

  if (/[a-z][A-Z]/.test(trimmed) && !/\s/.test(trimmed)) {
    return trimmed.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  return trimmed;
}

export function mergeListedEnglishIntoCompanies(companies, meta3557) {
  if (!meta3557 || !meta3557.size) return;
  for (const c of companies) {
    const t = c.ticker;
    if (!t || t === 'UNLISTED') continue;
    const row = meta3557.get(t);
    if (!row) continue;
    if (row.nameEn) {
      const curated = c.nameEn && /\s/.test(c.nameEn) && c.nameEn !== row.nameEn;
      if (!curated) c.nameEn = formatListedEnglishName(row.nameEn);
    }
    if (row.nameKo && (!c.name || c.name.includes('\uFFFD'))) c.name = row.nameKo;
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
