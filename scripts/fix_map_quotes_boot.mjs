/**
 * Repair accidental bootMapQuotes insertion inside renderTable sort callback.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'kculture/korea_kculture_map.html',
  'energy/korea_energy_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
];

const BAD_SORT = /          return 0;\r?\n        };\r?\n      if \(window\.InvestingMapLiveQuotes && InvestingMapLiveQuotes\.bootMapQuotes\) \{[\s\S]*?      const countEl = document\.getElementById\('show-count'\);/;

const GOOD_SORT = `          return 0;
        });
      }
      const countEl = document.getElementById('show-count');`;

const BAD_INIT = /var imQuoteOpts = \{([\s\S]*?)\r?\n        \}\);\r?\n      \}\r?\n    \}\);/;

const BOOT_INIT = (body) => `var imQuoteOpts = {${body}
        };
      if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.bootMapQuotes) {
        InvestingMapLiveQuotes.bootMapQuotes(imQuoteOpts).then(function () { applyLang(); });
      } else {
        applyLang();
        if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.start) {
          InvestingMapLiveQuotes.start(imQuoteOpts);
        }
      }
    });`;

function fixContent(text) {
  let out = text;
  if (BAD_SORT.test(out)) out = out.replace(BAD_SORT, GOOD_SORT);
  if (BAD_INIT.test(out)) out = out.replace(BAD_INIT, (_, body) => BOOT_INIT(body));
  return out;
}

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const before = fs.readFileSync(fp, 'utf8');
  const after = fixContent(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8');
    console.log('fixed', rel);
  } else {
    console.log('ok', rel);
  }
}
