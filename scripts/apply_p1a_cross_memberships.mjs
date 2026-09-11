/**
 * P1-A data: chain overrides + additions for 028260 / 034020 cross homes.
 * SECTOR_CROSS itself is maintained in lib/sector_exclusive.mjs.
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

const overridesPath = join(ROOT, 'data', 'chain_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
if (!overrides.construction) overrides.construction = {};
overrides.construction['028260'] = '종합건설';
if (!overrides.kconsume) overrides.kconsume = {};
overrides.kconsume['028260'] = '종합상사';
if (!overrides.nuclear) overrides.nuclear = {};
overrides.nuclear['034020'] = '원자로·주기기';
if (!overrides.powergrid) overrides.powergrid = {};
overrides.powergrid['034020'] = '발전·비상전원 설비';
fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
console.log('OK chain_overrides');

const fieldsPath = join(ROOT, 'data', 'ticker_field_overrides.json');
const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
fields['028260'] = fields['028260'] || {};
fields['028260'].byIndustry = fields['028260'].byIndustry || {};
fields['028260'].byIndustry.construction = {
  ...(fields['028260'].byIndustry.construction || {}),
  chain: '종합건설',
  needs_review: false,
};
fields['028260'].byIndustry.kconsume = {
  chain: '종합상사',
  needs_review: false,
  evidence: '건설 + 종합상사(트레이딩) 교차수록 P1-A',
  semType: '종합상사·건설',
  products: '건설·엔지니어링·종합상사 트레이딩',
};
fields['034020'] = fields['034020'] || {};
fields['034020'].byIndustry = fields['034020'].byIndustry || {};
fields['034020'].byIndustry.nuclear = {
  ...(fields['034020'].byIndustry.nuclear || {}),
  chain: '원자로·주기기',
  needs_review: false,
};
fields['034020'].byIndustry.powergrid = {
  chain: '발전·비상전원 설비',
  needs_review: false,
  evidence: '원자로 주기기 + 가스터빈·발전설비 교차수록 P1-A',
  semType: '가스터빈·발전설비',
  products: '가스터빈·발전설비·원전 주기기',
};
fields._policy = fields._policy || {};
fields._policy.p1_cross =
  'P1-A CROSS: 028260 construction+kconsume, 034020 nuclear+powergrid, 377300 finance+software. Hub ticker dedup. P1-B relations UI-only.';
fs.writeFileSync(fieldsPath, JSON.stringify(fields, null, 2) + '\n', 'utf8');
console.log('OK ticker_field_overrides');

function upsertAddition(fileRel, row) {
  const fp = join(ROOT, fileRel);
  const arr = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : [];
  const i = arr.findIndex((r) => pad(r.ticker) === pad(row.ticker));
  if (i >= 0) arr[i] = { ...arr[i], ...row };
  else arr.push(row);
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

upsertAddition('kconsume/cp_list_kconsume_additions.json', {
  ticker: '028260',
  name: '삼성물산',
  nameEn: 'SAMSUNG C&T CORPORATION',
  chain: '종합상사',
  semType: '종합상사·건설',
  semTypeEn: 'Trading house & construction',
  products: '건설·엔지니어링·종합상사 트레이딩',
  productsEn: 'Construction, engineering and trading-house operations',
  partners: [],
  subSector: '종합상사',
  level: 'cross',
});
upsertAddition('powergrid/cp_list_powergrid_additions.json', {
  ticker: '034020',
  name: '두산에너빌리티',
  nameEn: 'Doosan Enerbility',
  chain: '발전·비상전원 설비',
  semType: '가스터빈·발전설비',
  semTypeEn: 'Gas turbines & power plants',
  products: '가스터빈·발전설비·원전 주기기',
  productsEn: 'Gas turbines, power plants and nuclear critical components',
  partners: [],
  subSector: '발전·비상전원 설비',
  level: 'cross',
});
console.log('OK additions');
