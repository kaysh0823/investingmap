/**
 * Assert sector map HTML: canonical == og:url == every WebPage JSON-LD url.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listMapHtml() {
  const out = [];
  for (const ent of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(ROOT, ent.name);
    for (const name of fs.readdirSync(dir)) {
      if (/^korea_.*_map\.html$/.test(name)) out.push(path.join(ent.name, name));
    }
  }
  return out.sort();
}

function extractWebPageUrls(html) {
  const urls = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1]);
      if (j && j['@type'] === 'WebPage' && j.url) urls.push(j.url);
    } catch {
      /* ignore */
    }
  }
  return urls;
}

let checked = 0;
const failures = [];

for (const rel of listMapHtml()) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const wpUrls = extractWebPageUrls(html);
  if (!wpUrls.length) continue; // stub pages without WebPage

  checked++;
  const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
  const ogUrl = (html.match(/property="og:url" content="([^"]+)"/) || [])[1];

  try {
    assert.ok(canonical, `${rel}: missing canonical`);
    assert.ok(ogUrl, `${rel}: missing og:url`);
    assert.equal(canonical, ogUrl, `${rel}: canonical !== og:url`);
    for (const [i, url] of wpUrls.entries()) {
      assert.equal(url, canonical, `${rel}: WebPage[${i}].url !== canonical (got ${url})`);
    }
    console.log(`  seo OK ${rel} webPages=${wpUrls.length}`);
  } catch (err) {
    failures.push(err.message || String(err));
    console.error(`  seo FAIL ${rel}: ${err.message}`);
  }
}

assert.ok(checked >= 20, `expected many sector maps with WebPage, got ${checked}`);
if (failures.length) {
  console.error(`verify:seo FAILED — ${failures.length} page(s)`);
  process.exit(1);
}
console.log(`verify:seo OK — ${checked} map HTML with WebPage JSON-LD`);
