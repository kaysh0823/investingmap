/**
 * Writes data/fx_usdkrw.json from Naver Finance USD/KRW (FX_USDKRW).
 * Static file is the offline fallback for GET /api/fx.
 * Run: node scripts/update_fx_from_naver.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchUsdKrwFromNaver } from '../functions/lib/naver_fx.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'data', 'fx_usdkrw.json');

const payload = await fetchUsdKrwFromNaver();
fs.mkdirSync(dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath, payload);
