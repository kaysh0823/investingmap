/**
 * Parse all inline <script> blocks in dist HTML (and bio inline sources) with node:vm.
 * Catches strip/patch accidents that leave broken JS (e.g. 1ab2cf9 greedy switchTab regex).
 *
 * Failures print file, script ordinal, and error line — then exit 1.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const JS_TYPES = new Set([
  '',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
  'text/jscript',
  'application/x-javascript',
  'module',
]);

function walkHtmlFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtmlFiles(fp, out);
    else if (ent.isFile() && ent.name.endsWith('.html')) out.push(fp);
  }
  return out;
}

function extractInlineScripts(html) {
  const out = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  let ordinal = 0;
  while ((m = re.exec(html))) {
    ordinal += 1;
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeM = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = (typeM ? typeM[1] : '').trim().toLowerCase();
    if (type && !JS_TYPES.has(type)) continue; // skip ld+json etc.
    out.push({ ordinal, code: m[2] });
  }
  return out;
}

function checkCode(label, code, failures) {
  try {
    // eslint-disable-next-line no-new
    new vm.Script(code, { filename: label });
    return true;
  } catch (e) {
    const errLine = e && e.stack ? String(e.stack).split('\n')[0] : String(e);
    const msg = e && e.message ? String(e.message).split('\n')[0] : String(e);
    failures.push({ label, msg, errLine });
    console.error(`FAIL ${label}`);
    console.error(`  ${msg}`);
    if (typeof e.lineNumber === 'number') console.error(`  line: ${e.lineNumber}`);
    return false;
  }
}

const failures = [];

const htmlFiles = walkHtmlFiles(DIST);
for (const fp of htmlFiles) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
  const html = fs.readFileSync(fp, 'utf8');
  for (const s of extractInlineScripts(html)) {
    checkCode(`${rel} inline#${s.ordinal}`, s.code, failures);
  }
}

const EXTRA = ['bio/korea_bio_map.inline.js', 'bio/bio_inline_tail.js'];
for (const rel of EXTRA) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const code = fs.readFileSync(fp, 'utf8');
  checkCode(rel, code, failures);
  // also parse dist copies if present
  const distFp = path.join(DIST, rel);
  if (fs.existsSync(distFp) && path.resolve(distFp) !== path.resolve(fp)) {
    checkCode(`dist/${rel}`, fs.readFileSync(distFp, 'utf8'), failures);
  }
}

if (failures.length) {
  console.error(`verify_inline_js_syntax: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`OK verify_inline_js_syntax (${htmlFiles.length} html, ${EXTRA.length} bio js)`);
