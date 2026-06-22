/**
 * Patch map pages + bio tail: off-hours quotes label via InvestingMapLiveQuotes.formatQuotesAsofDisplay
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'energy/korea_energy_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
  'bio/bio_inline_tail.js',
];

const oldFn =
  /let imQuotesAsOf = '';\r?\n    let imQuotesError = '';\r?\n    function updateQuotesAsofDisplay\(\) \{[\s\S]*?el\.textContent = \(lang === 'en' \? 'Live quotes: ' : '실시간 시세: '\) \+ short;\r?\n    \}/;

const newFn = `let imQuotesAsOf = '';
    let imQuotesRegularSession = null;
    let imQuotesError = '';
    function updateQuotesAsofDisplay() {
      var el = document.getElementById('quotes-asof');
      if (!el) return;
      if (imQuotesError) {
        el.textContent = imQuotesError;
        return;
      }
      var text = (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.formatQuotesAsofDisplay)
        ? InvestingMapLiveQuotes.formatQuotesAsofDisplay(imQuotesAsOf, imQuotesRegularSession, lang)
        : '';
      el.textContent = text;
    }`;

const oldOn =
  /onAsOf: function \(iso\) \{\r?\n            imQuotesError = '';\r?\n            imQuotesAsOf = iso \|\| '';\r?\n            updateQuotesAsofDisplay\(\);\r?\n          \},/;

const newOn = `onAsOf: function (iso, meta) {
            imQuotesError = '';
            imQuotesAsOf = iso || '';
            imQuotesRegularSession = meta && meta.regularSession != null ? meta.regularSession : null;
            updateQuotesAsofDisplay();
          },`;

for (const rel of FILES) {
  const abs = join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  if (!oldFn.test(html)) {
    console.warn('skip:', rel);
    continue;
  }
  html = html.replace(oldFn, newFn).replace(oldOn, newOn);
  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', rel);
}

execSync('node bio/gen_korea_bio_inline.mjs', { cwd: root, stdio: 'inherit' });
console.log('OK patch_quotes_asof_display');
