/**
 * Audit English copy: Hangul in *En fields, glossary forbidden patterns.
 * Usage: node scripts/audit_english.mjs
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MAP_DIRS = [
  'semiconductor', 'bio', 'ship', 'defense', 'robot', 'energy',
  'powergrid', 'kculture', 'finance', 'construction',
];
const HANGUL = /[\uAC00-\uD7A3\u3131-\u318E]/;

const glossary = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'en_glossary.json'), 'utf8'));
const forbidden = (glossary.forbiddenPatterns || []).map((p) => new RegExp(p, 'gi'));

const issues = [];

function addIssue(type, file, detail) {
  issues.push({ type, file: file.replace(ROOT + '\\', '').replace(ROOT + '/', ''), detail });
}

function scanEnFieldsInHtml(filePath, html) {
  const fields = ['nameEn', 'semTypeEn', 'productsEn', 'edgeLabelEn'];
  for (const field of fields) {
    const re = new RegExp(`${field}:\\s*['"]([^'"]*)['"]`, 'g');
    let m;
    while ((m = re.exec(html)) !== null) {
      const val = m[1];
      if (val && val !== '—' && HANGUL.test(val)) {
        if (field === 'nameEn' && /^Theme:/i.test(val)) continue;
        addIssue('hangul-in-en', filePath, `${field}: ${val.slice(0, 80)}`);
      }
    }
  }
}

function scanForbidden(filePath, text) {
  for (const re of forbidden) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - 30);
      const snippet = text.slice(start, m.index + m[0].length + 30).replace(/\s+/g, ' ');
      addIssue('forbidden-pattern', filePath, `"${m[0]}" …${snippet}…`);
    }
  }
}

function scanMapChainI18n(filePath, html) {
  const chainKeys = (() => {
    const m = html.match(/const CHAIN_COLORS\s*=\s*(\{[^;]+\});/);
    if (!m) return [];
    try {
      return Object.keys(JSON.parse(m[1].replace(/'/g, '"')));
    } catch {
      return [...m[1].matchAll(/"([^"]+)"\s*:/g)].map((x) => x[1]);
    }
  })();
  if (!chainKeys.length) return;

  function keysInBlock(lang, name) {
    const re = new RegExp(`"${lang}"\\s*:\\s*\\{[\\s\\S]*?"${name}"\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm');
    const m = html.match(re);
    if (!m) return new Set();
    return new Set([...m[1].matchAll(/"([^"]+)"\s*:/g)].map((x) => x[1]));
  }

  const koLabel = keysInBlock('ko', 'chainLabel');
  const enLabel = keysInBlock('en', 'chainLabel');
  for (const ch of chainKeys) {
    if (!enLabel.has(ch)) addIssue('chain-key-missing-en', filePath, `T.en.chainLabel missing: ${ch}`);
    if (!koLabel.has(ch)) addIssue('chain-key-missing-ko', filePath, `T.ko.chainLabel missing: ${ch}`);
  }
  for (const ch of enLabel) {
    if (!chainKeys.includes(ch)) addIssue('chain-key-stale-en', filePath, `T.en.chainLabel stale: ${ch}`);
  }

  const tabFields = ['tabHeatmap', 'tabTable', 'tabGraph'];
  const enBlock = html.match(/"en"\s*:\s*\{([\s\S]*?)\n\s*\}\s*\};/m);
  if (enBlock) {
    for (const field of tabFields) {
      const tm = enBlock[1].match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`));
      if (tm && HANGUL.test(tm[1])) {
        addIssue('hangul-in-en-tab', filePath, `${field}: ${tm[1]}`);
      }
    }
  }
}

const mapFiles = MAP_DIRS.map((d) => join(d, `korea_${d === 'semiconductor' ? 'semiconductor' : d}_map.html`));
for (const rel of mapFiles) {
  const p = join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8');
  scanEnFieldsInHtml(p, html);
  scanMapChainI18n(p, html);
  scanForbidden(p, html);
}

const jsFiles = [
  'index.html',
  'js/hub_dashboard.js',
  'js/map_editorial.js',
  'lib/seo_sector_copy.mjs',
  'data/geo.json',
  'faq.html',
  'about.html',
  'llms.txt',
];
const skipForbidden = /scripts[/\\]|patch_|audit_english/;
for (const rel of jsFiles) {
  const p = join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  scanForbidden(p, fs.readFileSync(p, 'utf8'));
}

const byType = {};
for (const i of issues) {
  byType[i.type] = (byType[i.type] || 0) + 1;
}

console.log('English audit report');
console.log('===================');
console.log('Total issues:', issues.length);
console.log('By type:', byType);
console.log('');

const show = issues.slice(0, 80);
for (const i of show) {
  console.log(`[${i.type}] ${i.file}`);
  console.log(`  ${i.detail}`);
}
if (issues.length > 80) {
  console.log(`… and ${issues.length - 80} more`);
}

process.exit(issues.length > 0 ? 1 : 0);
