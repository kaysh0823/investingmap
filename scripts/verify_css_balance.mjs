/**
 * Verify <style> brace balance + top-level critical selectors in dist HTML.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  depthAt,
  hasTopLevelRule,
  isCssBalanced,
  scanBraceDepth,
} from '../lib/css_blocks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/** Active sector maps (hub 26) — ignore legacy dist leftovers (kculture/energy). */
const SECTOR_MAP_RELS = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'auto/korea_auto_map.html',
  'medtech/korea_medtech_map.html',
  'battery/korea_battery_map.html',
  'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html',
  'powergrid/korea_powergrid_map.html',
  'finance/korea_finance_map.html',
  'construction/korea_construction_map.html',
  'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html',
  'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html',
  'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html',
  'travel/korea_travel_map.html',
  'elec/korea_elec_map.html',
  'metal/korea_metal_map.html',
  'machinery/korea_machinery_map.html',
  'shipping/korea_shipping_map.html',
];

const TRUST_PAGES = [
  'authors.html',
  'disclaimer.html',
  'editorial-policy.html',
  'faq.html',
];

function eachStyle(html, fn) {
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  let idx = 0;
  while ((m = re.exec(html))) {
    fn(m[1], idx++);
  }
}

function checkHtml(label, html, { requireEditorial = false, requireTrustFooter = false } = {}) {
  const failures = [];
  let styleCount = 0;
  eachStyle(html, (css, i) => {
    styleCount += 1;
    const endDepth = scanBraceDepth(css);
    if (!isCssBalanced(css)) {
      failures.push(
        `${label} <style>#${i}: unbalanced braces (endDepth=${endDepth}, must end at 0 and never go negative)`,
      );
    } else if (endDepth !== 0) {
      failures.push(`${label} <style>#${i}: endDepth=${endDepth}, expected 0`);
    }
  });

  if (styleCount === 0) {
    failures.push(`${label}: no <style> blocks`);
    return failures;
  }

  // Critical selectors: check across all style bodies joined (depth is per-file continuous
  // only within each block — evaluate per style that contains the selector).
  if (requireEditorial) {
    let found = false;
    eachStyle(html, (css) => {
      if (hasTopLevelRule(css, '.map-editorial-panel.is-collapsed')) found = true;
    });
    if (!found) {
      failures.push(
        `${label}: .map-editorial-panel.is-collapsed must open at brace depth 0 in a <style>`,
      );
    }
  }

  if (requireTrustFooter) {
    let found = false;
    eachStyle(html, (css) => {
      if (hasTopLevelRule(css, '.im-trust-footer')) found = true;
    });
    if (!found && /class=["'][^"']*\bim-trust-footer\b/.test(html)) {
      failures.push(`${label}: .im-trust-footer must open at brace depth 0 in a <style>`);
    }
  }

  // Spot-check: if editorial marker present, its start comment must sit at depth 0.
  eachStyle(html, (css, i) => {
    const marker = css.search(/\/\*\s*investingmap-header-editorial-toggle-v2\s*\*\//);
    if (marker >= 0 && depthAt(css, marker) !== 0) {
      failures.push(
        `${label} <style>#${i}: editorial-toggle-v2 marker at depth ${depthAt(css, marker)} (need 0)`,
      );
    }
  });

  return failures;
}

if (!fs.existsSync(DIST)) {
  console.error('verify:css-balance FAIL — dist/ missing (run build first)');
  process.exit(1);
}

const failures = [];
const sectorRels = SECTOR_MAP_RELS.filter((rel) => fs.existsSync(path.join(DIST, rel)));
assert.ok(sectorRels.length >= 26, `expected ≥26 sector maps in dist, got ${sectorRels.length}`);

for (const rel of sectorRels) {
  const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
  const needEd =
    html.includes('id="map-editorial-panel"') || html.includes("id='map-editorial-panel'");
  failures.push(
    ...checkHtml(`dist/${rel}`, html, {
      requireEditorial: needEd,
      requireTrustFooter: true,
    }),
  );
}

for (const rel of TRUST_PAGES) {
  const abs = path.join(DIST, rel);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, 'utf8');
  failures.push(
    ...checkHtml(`dist/${rel}`, html, {
      requireEditorial: false,
      requireTrustFooter: /im-trust-footer/.test(html),
    }),
  );
}

if (failures.length) {
  for (const f of failures) console.error('  FAIL', f);
  console.error(
    `verify:css-balance FAILED — ${failures.length} issue(s) across ${sectorRels.length} sector + trust pages`,
  );
  process.exit(1);
}
console.log(
  `verify:css-balance OK — ${sectorRels.length} sector maps + trust pages (braces + top-level selectors)`,
);
