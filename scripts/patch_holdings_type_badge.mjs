/**
 * Ensure holdings map exposes "company-type map (not a general industry)" badge copy.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fp = path.join(ROOT, 'holdings', 'korea_holdings_map.html');
let html = fs.readFileSync(fp, 'utf8');

const koBadge = '기업 유형별 지도(일반 산업 아님)';
const enBadge = 'Company-type map (not a general industry)';

if (!html.includes(koBadge)) {
  html = html.replace(
    /(<p id="hdr-subtitle">)([^<]*)(<\/p>)/,
    `$1${koBadge} · $2$3`,
  );
  html = html.replace(
    /("subtitle":\s*")([^"]*)(")/,
    (full, a, body, c, offset) => {
      // only first (ko) occurrence before "en"
      if (html.slice(0, offset).includes('"en"')) return full;
      if (body.includes(koBadge)) return full;
      return `${a}${koBadge} · ${body}${c}`;
    },
  );
}

if (!html.includes(enBadge)) {
  html = html.replace(
    /("en":\s*\{[\s\S]*?"subtitle":\s*")([^"]*)(")/,
    (full, a, body, c) => {
      if (body.includes(enBadge)) return full;
      return `${a}${enBadge} · ${body}${c}`;
    },
  );
}

fs.writeFileSync(fp, html, 'utf8');
console.log('OK holdings type badge');
