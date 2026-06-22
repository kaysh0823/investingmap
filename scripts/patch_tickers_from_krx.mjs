/**
 * Patch wrong tickers/names from KRX data_3557 + targeted manual overrides.
 * Run: node scripts/patch_tickers_from_krx.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse5016Line } from '../lib/krx_per_pbr.mjs';
import { resolveLatestCsv } from '../lib/krx_data_sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');

const MAP_FILES = [
  'semiconductor/korea_semiconductor_map.html',
  'energy/korea_energy_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
];

/** id → partial company fields (editorial overrides where auto-match is ambiguous) */
const MANUAL = {
  samwha: { name: '삼화전기', nameEn: 'SamwhaElectric', ticker: '009470', market: 'KOSPI' },
  siliconmitus: { name: '써닉시스템', nameEn: 'SUNIC SYSTEM Co., Ltd.' },
  iljinm: { name: '롯데에너지머티리얼즈', nameEn: 'LOTTE ENERGY MATERIALS CORPORATION', market: 'KOSPI' },
  hansoliones: { name: '한솔아이온스', nameEn: 'Hansol IONES', ticker: '114810', market: 'KOSDAQ' },
  kometal: { name: '한국전자금속', nameEn: 'KoreaElectricTerminal', ticker: '025540', market: 'KOSPI' },
};

function decode3557Csv(path) {
  const buf = fs.readFileSync(path);
  let text;
  try {
    text = new TextDecoder('euc-kr').decode(buf);
  } catch {
    text = buf.toString('utf8');
  }
  const byTicker = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const f = parse5016Line(line);
    if (f.length < 7) continue;
    const ticker = (f[1] || '').trim();
    if (!ticker) continue;
    const marketRaw = (f[6] || '').trim();
    const market = marketRaw.includes('KOSPI') ? 'KOSPI' : marketRaw.includes('KOSDAQ') ? 'KOSDAQ' : marketRaw;
    byTicker.set(ticker, {
      ticker,
      name: (f[3] || f[2] || '').trim(),
      nameEn: (f[4] || '').trim(),
      market,
    });
  }
  return byTicker;
}

function normEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function enMatch(a, b) {
  const na = normEn(a);
  const nb = normEn(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const min = Math.min(na.length, nb.length);
  return min >= 8 && na.slice(0, min) === nb.slice(0, min);
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function patchCompanyBlock(html, id, fields) {
  let out = html;
  for (const [key, val] of Object.entries(fields)) {
    if (val == null) continue;
    const keyRe = new RegExp(
      `(\\{[\\s\\n]*id:\\s*'${id}'[\\s\\n]*,[\\s\\n]*name:\\s*'[^']*'[\\s\\n]*,[\\s\\n]*${key}:\\s*)'[^']*'`,
    );
    if (!keyRe.test(out)) return { html, ok: false, reason: `missing ${key} for ${id}` };
    out = out.replace(keyRe, `$1'${esc(val)}'`);
  }
  return { html: out, ok: true };
}

function extractIds(html) {
  const m = html.match(/const koreanCompanies = \[([\s\S]*?)\];\s*\n\s*const globalCompanies/);
  if (!m) return [];
  const ids = [];
  const re = /id:\s*'([^']*)'/g;
  let hit;
  while ((hit = re.exec(m[1]))) ids.push(hit[1]);
  return ids;
}

function companyFieldsFromHtml(html, id) {
  const re = new RegExp(
    `id:\\s*'${id}',\\s*name:\\s*'([^']*)',\\s*nameEn:\\s*'([^']*)',\\s*ticker:\\s*'([^']*)',\\s*market:\\s*'([^']*)'`,
  );
  const m = html.match(re);
  if (!m) return null;
  return { id, name: m[1], nameEn: m[2], ticker: m[3], market: m[4] };
}

const krxPath = resolveLatestCsv(dataDir, 'data_3557_');
const krx = decode3557Csv(krxPath);
console.log('KRX 3557:', krxPath, 'rows', krx.size);

let totalPatches = 0;

for (const rel of MAP_FILES) {
  const abs = join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  let filePatches = 0;

  for (const id of extractIds(html)) {
    const cur = companyFieldsFromHtml(html, id);
    if (!cur || cur.ticker === 'UNLISTED' || !cur.ticker) continue;

    const manual = MANUAL[id];
    if (manual) {
      const r = patchCompanyBlock(html, id, manual);
      if (r.ok) {
        html = r.html;
        filePatches++;
        console.log(`[manual] ${id} in ${rel}`, manual);
      }
      continue;
    }

    const row = krx.get(cur.ticker);
    if (!row) {
      console.warn(`[missing] ${cur.name} (${cur.ticker}) in ${rel} — not in KRX`);
      continue;
    }

    // Ticker exists but points to a different company — find by English name
    if (!enMatch(cur.nameEn, row.nameEn)) {
      let match = null;
      for (const candidate of krx.values()) {
        if (enMatch(cur.nameEn, candidate.nameEn)) {
          match = candidate;
          break;
        }
      }
      if (match && match.ticker !== cur.ticker) {
        const fields = {
          ticker: match.ticker,
          nameEn: match.nameEn,
          market: match.market,
        };
        const r = patchCompanyBlock(html, id, fields);
        if (r.ok) {
          html = r.html;
          filePatches++;
          console.log(`[reticker-en] ${id}: ${cur.ticker} → ${match.ticker} in ${rel}`);
        }
        continue;
      }
    }

    const fields = {};
    if (!enMatch(cur.nameEn, row.nameEn)) fields.nameEn = row.nameEn;
    if (cur.market !== row.market && row.market) fields.market = row.market;

    if (Object.keys(fields).length) {
      const r = patchCompanyBlock(html, id, fields);
      if (r.ok) {
        html = r.html;
        filePatches++;
        console.log(`[krx] ${id} (${cur.ticker}) in ${rel}`, fields);
      }
    }
  }

  // Fix tickers that are absent from KRX (wrong code) by matching English name
  for (const id of extractIds(html)) {
    const cur = companyFieldsFromHtml(html, id);
    if (!cur || cur.ticker === 'UNLISTED') continue;
    if (krx.has(cur.ticker)) continue;
    if (MANUAL[id]) continue;

    let match = null;
    for (const row of krx.values()) {
      if (enMatch(cur.nameEn, row.nameEn)) {
        match = row;
        break;
      }
    }
    if (!match) {
      console.warn(`[unresolved] ${cur.name} (${cur.ticker}) in ${rel}`);
      continue;
    }
    const fields = {
      ticker: match.ticker,
      nameEn: match.nameEn,
      market: match.market,
    };
    if (match.name && !normKr(cur.name).includes(normKr(match.name).slice(0, 3))) {
      // keep editorial Korean name if loosely related
    }
    const r = patchCompanyBlock(html, id, fields);
    if (r.ok) {
      html = r.html;
      filePatches++;
      console.log(`[reticker] ${id}: ${cur.ticker} → ${match.ticker} in ${rel}`);
    }
  }

  if (filePatches) {
    fs.writeFileSync(abs, html, 'utf8');
    totalPatches += filePatches;
    console.log(`patched ${rel}: ${filePatches} companies`);
  }
}

function normKr(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/\(주\)/g, '')
    .replace(/㈜/g, '');
}

console.log('\nTotal patches:', totalPatches);
