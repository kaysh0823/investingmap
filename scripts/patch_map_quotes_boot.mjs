/**
 * Boot map tables with RS snapshot before applyLang so return columns populate.
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

const START_BLOCK = /      applyLang\(\);\s*\n      if \(window\.InvestingMapLiveQuotes && InvestingMapLiveQuotes\.start\) \{\s*\n        InvestingMapLiveQuotes\.start\(\{/;

const BIO_START_BLOCK = /      try \{ applyLang\(\); \} catch \(e\) \{\s*\n        console\.error\('applyLang failed', e\);\s*\n        try \{ renderTable\(\); \} catch \(e2\) \{ console\.error\('renderTable failed', e2\); \}\s*\n      \}\s*\n      if \(window\.InvestingMapLiveQuotes && InvestingMapLiveQuotes\.start\) \{\s*\n        InvestingMapLiveQuotes\.start\(\{/;

const END_BLOCK = /        \}\);\s*\n      \}/;

const BOOT_TAIL = `        };
      if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.bootMapQuotes) {
        InvestingMapLiveQuotes.bootMapQuotes(imQuoteOpts).then(function () { applyLang(); });
      } else {
        applyLang();
        if (window.InvestingMapLiveQuotes && InvestingMapLiveQuotes.start) {
          InvestingMapLiveQuotes.start(imQuoteOpts);
        }
      }`;

function patchContent(text, isBio) {
  if (text.includes('bootMapQuotes(imQuoteOpts)')) return text;
  const startRe = isBio ? BIO_START_BLOCK : START_BLOCK;
  if (!startRe.test(text)) return text;
  let out = text.replace(startRe, '      var imQuoteOpts = {');
  out = out.replace(END_BLOCK, BOOT_TAIL);
  return out;
}

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip', rel);
    continue;
  }
  const before = fs.readFileSync(fp, 'utf8');
  const after = patchContent(before, rel.includes('bio'));
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8');
    console.log('patched', rel);
  } else {
    console.log('unchanged', rel);
  }
}

// bump live_quotes cache buster in map html
const HTML_MAPS = TARGETS.filter((r) => r.endsWith('.html'));
for (const rel of HTML_MAPS) {
  const fp = path.join(ROOT, rel);
  let html = fs.readFileSync(fp, 'utf8');
  const next = html.replace(/live_quotes\.js\?v=\d+/g, 'live_quotes.js?v=6');
  if (next !== html) {
    fs.writeFileSync(fp, next, 'utf8');
    console.log('bumped live_quotes v=6', rel);
  }
}

const bioHtml = path.join(ROOT, 'bio/korea_bio_map.html');
if (fs.existsSync(bioHtml)) {
  let html = fs.readFileSync(bioHtml, 'utf8');
  const next = html.replace(/live_quotes\.js\?v=\d+/g, 'live_quotes.js?v=6');
  if (next !== html) {
    fs.writeFileSync(bioHtml, next, 'utf8');
    console.log('bumped live_quotes v=6 bio/korea_bio_map.html');
  }
}
