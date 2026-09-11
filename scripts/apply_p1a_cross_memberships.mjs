/**
 * Clear former P1-A / Kakao Pay cross homes; single-home via SECTOR_EXCLUSIVE.
 * Primary homes keep chain overrides; secondary sector additions/overrides removed.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pad(t) {
  const s = String(t || '').trim();
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  return s.padStart(6, '0');
}

function removeAddition(fileRel, ticker) {
  const fp = join(ROOT, fileRel);
  if (!fs.existsSync(fp)) return false;
  const arr = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const next = arr.filter((r) => pad(r.ticker) !== pad(ticker));
  if (next.length === arr.length) return false;
  fs.writeFileSync(fp, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return true;
}

const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
if (!overrides.construction) overrides.construction = {};
overrides.construction['028260'] = '종합건설';
if (!overrides.nuclear) overrides.nuclear = {};
overrides.nuclear['034020'] = '원자로·주기기';
if (!overrides.finance) overrides.finance = {};
overrides.finance['377300'] = '결제·핀테크';
if (overrides.kconsume) delete overrides.kconsume['028260'];
if (overrides.powergrid) delete overrides.powergrid['034020'];
if (overrides.software) delete overrides.software['377300'];
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides (primary only)');

const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
fields['028260'] = fields['028260'] || {};
fields['028260'].byIndustry = fields['028260'].byIndustry || {};
fields['028260'].byIndustry.construction = {
  ...(fields['028260'].byIndustry.construction || {}),
  chain: '종합건설',
  needs_review: false,
};
delete fields['028260'].byIndustry.kconsume;

fields['034020'] = fields['034020'] || {};
fields['034020'].byIndustry = fields['034020'].byIndustry || {};
fields['034020'].byIndustry.nuclear = {
  ...(fields['034020'].byIndustry.nuclear || {}),
  chain: '원자로·주기기',
  needs_review: false,
};
delete fields['034020'].byIndustry.powergrid;

fields['377300'] = fields['377300'] || {};
fields['377300'].byIndustry = fields['377300'].byIndustry || {};
fields['377300'].byIndustry.finance = {
  ...(fields['377300'].byIndustry.finance || {}),
  chain: '결제·핀테크',
};
delete fields['377300'].byIndustry.software;

fields._policy = fields._policy || {};
fields._policy.kakao_pay_cross =
  '377300 카카오페이 — finance 결제·핀테크 단일홈 (software 교차 해제).';
fields._policy.p1_cross =
  'P1 single-home: 028260 construction only, 034020 nuclear only, 377300 finance only. SECTOR_CROSS={}. P1-B relations UI-only.';
fields._policy.software_finance_payments =
  '결제·데이터 인프라(software)는 PG·VAN·결제 플랫폼·데이터 API 기술·인프라 역할. finance의 결제·핀테크는 금융서비스 역할. 카카오페이(377300)는 finance 단일홈.';
fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

const removed = [
  removeAddition('kconsume/cp_list_kconsume_additions.json', '028260') && 'kconsume:028260',
  removeAddition('powergrid/cp_list_powergrid_additions.json', '034020') && 'powergrid:034020',
  removeAddition('software/cp_list_software_additions.json', '377300') && 'software:377300',
].filter(Boolean);
console.log('OK additions removed:', removed.join(', ') || '(already clean)');
