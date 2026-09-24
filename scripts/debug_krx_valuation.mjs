/**
 * Peek KRX [12021] MDCSTAT03501 OutBlock_1 keys / first rows.
 * Usage: node scripts/debug_krx_valuation.mjs <yyyymmdd>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchValuationJsonRaw,
  fetchValuationOtpCsvRaw,
  KRX_VALUATION_BLD,
} from '../functions/lib/krx_valuation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const day = String(process.argv[2] || '').replace(/\D/g, '');
if (day.length !== 8) {
  console.error('Usage: node scripts/debug_krx_valuation.mjs <yyyymmdd>');
  process.exit(1);
}

const env = loadEnv();
console.log(`bld=${KRX_VALUATION_BLD} trdDd=${day}`);

const json = await fetchValuationJsonRaw(env, day);
console.log('\n=== getJsonData ===');
console.log(`ok=${json.ok} status=${json.status || ''} parseError=${!!json.parseError}`);
const block = json.json?.OutBlock_1 || json.json?.output || json.json?.outBlock_1;
if (Array.isArray(block) && block.length) {
  console.log(`rows=${block.length}`);
  console.log('keys[0]:', Object.keys(block[0]).join(', '));
  for (let i = 0; i < Math.min(3, block.length); i++) {
    console.log(`row[${i}]:`, JSON.stringify(block[i]));
  }
} else {
  console.log('no OutBlock_1 — body head:', String(json.text || '').slice(0, 400));
}

const csv = await fetchValuationOtpCsvRaw(env, day);
console.log('\n=== OTP CSV ===');
console.log(`otpOk=${csv.otpOk} rows=${csv.rows?.length || 0}`);
const lines = String(csv.text || '').split(/\r?\n/).filter(Boolean);
console.log('csv head (3):');
for (let i = 0; i < Math.min(3, lines.length); i++) console.log(lines[i]);
if (csv.rows?.[0]) console.log('parsed[0]:', csv.rows[0]);
