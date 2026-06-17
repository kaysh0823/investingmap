/**
 * Writes data/fx_usdkrw.json from Naver Finance USD/KRW (FX_USDKRW).
 * Run from repo: node investingmap/scripts/update_fx_from_naver.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'data', 'fx_usdkrw.json');
const source =
  'https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW';

function parseRate(html) {
  const patterns = [
    /"nowValue":"([0-9,]+\.[0-9]+)"/,
    /class="[^"]*no_today[^"]*"[^>]*>[\s\S]{0,600}?<em[^>]*>([0-9,]+\.[0-9]+)<\/em>/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (v > 500 && v < 5000) return v;
    }
  }
  const candidates = [...html.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+\.[0-9]{2})/g)].map((x) =>
    parseFloat(x[1].replace(/,/g, '')),
  );
  const inBand = candidates.filter((n) => n > 1100 && n < 2000);
  return inBand.length ? inBand[0] : null;
}

const res = await fetch(source, {
  headers: { 'User-Agent': 'investingmap-fx-updater/1.0' },
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const html = await res.text();
const rate = parseRate(html);
if (!rate) throw new Error('Could not parse USD/KRW from Naver page');

const payload = {
  rate,
  asOf: new Date().toISOString().slice(0, 10),
  source,
};

fs.mkdirSync(dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath, payload);
