/**
 * Wire onQuotesReady so active calc tabs re-render after quotes merge.
 * Also bump live_quotes / map_momentum cache busters.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_QUOTES_V = 22;
const MOMENTUM_V = 14;

const MAP_FILES = [
  'bigchip/korea_bigchip_map.html',
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'bio/korea_bio_map.inline.js',
  'bio/bio_inline_tail.js',
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

const ON_QUOTES_READY = `onQuotesReady: function () {
            function isActive(id) {
              var el = document.getElementById(id);
              return !!(el && (el.classList.contains('active') || el.offsetParent !== null));
            }
            var tab = null;
            if (isActive('tab-momentum')) tab = 'momentum';
            else if (isActive('tab-heatmap')) tab = 'heatmap';
            else if (isActive('tab-volatility')) tab = 'volatility';
            else if (isActive('tab-perfcalendar')) tab = 'perfcalendar';
            else if (window.InvestingMapTabState && typeof InvestingMapTabState.getTab === 'function') {
              tab = InvestingMapTabState.getTab();
            }
            if (tab === 'momentum' && typeof renderMomentum === 'function') renderMomentum();
            else if (tab === 'heatmap' && typeof renderHeatmap === 'function') renderHeatmap();
            else if (tab === 'volatility' && typeof renderVolatility === 'function') renderVolatility();
            else if (tab === 'perfcalendar' && typeof renderPerfCalendar === 'function') renderPerfCalendar();
          }`;

const WRAPPED_RENDER_TABLE =
  /renderTable:\s*function\s*\(\)\s*\{\s*renderTable\(\);\s*if\s*\(document\.getElementById\('tab-heatmap'\)[\s\S]*?renderPerfCalendar\(\);\s*\},/;

function patchBoot(source) {
  let out = source;
  if (WRAPPED_RENDER_TABLE.test(out)) {
    out = out.replace(WRAPPED_RENDER_TABLE, 'renderTable: function () { renderTable(); },');
  } else if (/renderTable:\s*renderTable,/.test(out) && !/renderTable:\s*function\s*\(\)\s*\{\s*renderTable\(\);\s*\},/.test(out)) {
    out = out.replace(/renderTable:\s*renderTable,/, 'renderTable: function () { renderTable(); },');
  }

  if (!out.includes('onQuotesReady:')) {
    out = out.replace(
      /renderTable:\s*function\s*\(\)\s*\{\s*renderTable\(\);\s*\},/,
      `renderTable: function () { renderTable(); },\n          ${ON_QUOTES_READY},`,
    );
  }

  out = out.replace(/live_quotes\.js(?:\?v=\d+)?/g, `live_quotes.js?v=${LIVE_QUOTES_V}`);
  out = out.replace(/map_momentum\.js(?:\?v=\d+)?/g, `map_momentum.js?v=${MOMENTUM_V}`);
  return out;
}

for (const rel of MAP_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    continue;
  }
  const before = fs.readFileSync(fp, 'utf8');
  if (!before.includes('imQuoteOpts')) {
    console.log('no imQuoteOpts', rel);
    continue;
  }
  const after = patchBoot(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8');
    console.log('patched', rel);
  } else {
    console.log('unchanged', rel);
  }
}
