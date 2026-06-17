/**
 * Verifies data/ CSV references used by maps (exit 1 on failure).
 * Run: node investingmap/scripts/verify_data_refs.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadMergedKrxMap, loadListedEnglish3557Map, maxQuantCsvDateYmd } from '../lib/krx_data_sources.mjs';
import { loadPerPbrMap } from '../lib/krx_per_pbr.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, 'data');

function need(name, ok, detail) {
  const line = ok ? `  OK ${name}` : `  FAIL ${name}`;
  console.log(line + (detail ? ` — ${detail}` : ''));
  if (!ok) process.exitCode = 1;
}

console.log('data dir:', dataDir);

try {
  const m = loadMergedKrxMap(dataDir);
  need('loadMergedKrxMap (4937+4848)', m.size > 100, `rows ${m.size}`);
} catch (e) {
  need('loadMergedKrxMap', false, e.message);
}

try {
  const p = loadPerPbrMap(dataDir);
  need('loadPerPbrMap (5016)', p.size > 100, `rows ${p.size}`);
} catch (e) {
  need('loadPerPbrMap', false, e.message);
}

try {
  const fxPath = join(dataDir, 'fx_usdkrw.json');
  const fx = JSON.parse(fs.readFileSync(fxPath, 'utf8'));
  const ok = fx && typeof fx.rate === 'number' && fx.rate > 500 && fx.rate < 5000;
  need('fx_usdkrw.json', ok, ok ? `rate ${fx.rate}` : 'invalid rate');
} catch (e) {
  need('fx_usdkrw.json', false, e.message);
}

const ymd = maxQuantCsvDateYmd(dataDir);
need('maxQuantCsvDateYmd', !!ymd, ymd ? `${ymd.y}-${String(ymd.mo).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}` : 'none');

const en3557 = loadListedEnglish3557Map(dataDir);
need('data_3557 (optional)', true, en3557.size ? `rows ${en3557.size}` : 'skipped (no file)');

const failed = process.exitCode === 1;
console.log(failed ? '\nSome checks failed.' : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
