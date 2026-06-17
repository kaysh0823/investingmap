/**
 * Loads PER / PBR from KRX-style CSV data_5016_YYYYMMDD.csv (종목코드 … PER … BPS … PBR …).
 */
import fs from 'fs';
import { join } from 'path';

/** Split one line of KRX 5016 export (handles empty fields like ,,,,,). */
export function parse5016Line(line) {
  const fields = [];
  let i = 0;
  const len = line.length;
  while (i < len) {
    if (line[i] === ',') {
      fields.push('');
      i++;
      continue;
    }
    if (line[i] === '"') {
      i++;
      let cell = '';
      while (i < len) {
        if (line[i] === '"') {
          i++;
          break;
        }
        cell += line[i++];
      }
      fields.push(cell);
      if (i < len && line[i] === ',') i++;
      continue;
    }
    const start = i;
    while (i < len && line[i] !== ',') i++;
    fields.push(line.slice(start, i));
    if (i < len && line[i] === ',') i++;
  }
  return fields;
}

function parseFin(s) {
  const t = (s || '').trim().replace(/,/g, '');
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function resolveData5016Path(dataDir) {
  const names = fs.readdirSync(dataDir).filter((f) => /^data_5016_.*\.csv$/i.test(f));
  if (!names.length) {
    throw new Error('No data_5016_*.csv in ' + dataDir);
  }
  names.sort((a, b) => {
    const ma = fs.statSync(join(dataDir, a)).mtimeMs;
    const mb = fs.statSync(join(dataDir, b)).mtimeMs;
    return mb - ma;
  });
  return join(dataDir, names[0]);
}

/** @returns {Map<string, { per: number|null, pbr: number|null }>} */
export function loadPerPbrMap(dataDir) {
  const filePath = resolveData5016Path(dataDir);
  const text = fs.readFileSync(filePath, 'utf8');
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line || !line.trim()) continue;
    const f = parse5016Line(line);
    if (f.length < 11) continue;
    const code = (f[0] || '').trim();
    if (!code) continue;
    const per = parseFin(f[6]);
    const pbr = parseFin(f[10]);
    map.set(code, { per, pbr });
  }
  return map;
}

export function mergePerPbrIntoCompanies(companies, perPbrMap) {
  for (const c of companies) {
    const t = c.ticker;
    if (!t || t === 'UNLISTED') {
      c.per = null;
      c.pbr = null;
      continue;
    }
    const row = perPbrMap.get(t);
    c.per = row && row.per != null ? row.per : null;
    c.pbr = row && row.pbr != null ? row.pbr : null;
  }
}
