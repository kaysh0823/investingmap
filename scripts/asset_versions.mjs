/**
 * Content-hash cache busters for /js/* script tags.
 * /js is Cache-Control: immutable (1y) — ?v= must change when file body changes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Grepped from HTML: ../js/*.js?v= and js/*.js?v= references.
 * Keep basename → js/<name> mapping only for files that exist under js/.
 */
export const JS_FILES = [
  'js/candle_modal.js',
  'js/desktop_sidebar_nav.js',
  'js/global_bottom_nav.js',
  'js/global_search.js',
  'js/hub_dashboard.js',
  'js/hub_trend_chart.js',
  'js/im_collapsible.js',
  'js/live_quotes.js',
  'js/map_cross_sector.js',
  'js/map_filter_ux.js',
  'js/map_heatmap.js',
  'js/map_i18n.js',
  'js/map_mobile_table.js',
  'js/map_mobile_ux.js',
  'js/map_momentum.js',
  'js/map_perfcalendar.js',
  'js/map_tab_state.js',
  'js/map_valuation.js',
  'js/map_netmap.js',
  'js/map_volatility.js',
  'js/return_live.js',
  'js/returns_badge.js',
  'js/returns_tick.js',
  'js/rs_color_scale.js',
  'js/sector_nav.js',
  'js/turnover_radius.js',
];

const JS_SET = new Set(JS_FILES);

const versionCache = new Map();

/**
 * @param {string} relPath e.g. 'js/live_quotes.js'
 * @returns {string} sha1 hex first 8 chars
 */
export function assetVersion(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (versionCache.has(norm)) return versionCache.get(norm);
  const abs = path.join(ROOT, norm);
  const buf = fs.readFileSync(abs);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  versionCache.set(norm, hash);
  return hash;
}

/** Clear memo (tests / re-stamp in same process after writing js). */
export function clearAssetVersionCache() {
  versionCache.clear();
}

/**
 * Replace ?v=… for known JS assets with content hash.
 * Leaves unknown js paths untouched.
 * Matches ../js/foo.js?v=…, js/foo.js?v=…, /js/foo.js?v=…
 *
 * @param {string} html
 * @returns {string}
 */
export function stampAssetVersions(html) {
  // Match one or more ?v= suffixes so prior double-stamps collapse to a single hash.
  return String(html).replace(
    /((?:\.\.\/|\/)?js\/([\w\-]+\.js))(?:\?v=[\w.\-]+)+/g,
    (full, prefixPath, fileName) => {
      const rel = `js/${fileName}`;
      if (!JS_SET.has(rel)) return full;
      if (!fs.existsSync(path.join(ROOT, rel))) return full;
      return `${prefixPath}?v=${assetVersion(rel)}`;
    },
  );
}

export function projectRoot() {
  return ROOT;
}
