import fs from 'fs';

const MAPS = [
  'auto/korea_auto_map.html', 'battery/korea_battery_map.html', 'bigchip/korea_bigchip_map.html',
  'bio/korea_bio_map.html', 'ship/korea_ship_map.html', 'defense/korea_defense_map.html',
  'robot/korea_robot_map.html', 'medtech/korea_medtech_map.html', 'renewable/korea_renewable_map.html',
  'nuclear/korea_nuclear_map.html', 'powergrid/korea_powergrid_map.html', 'finance/korea_finance_map.html',
  'construction/korea_construction_map.html', 'kconsume/korea_kconsume_map.html',
  'cosmetics/korea_cosmetics_map.html', 'kcontent/korea_kcontent_map.html',
  'software/korea_software_map.html', 'holdings/korea_holdings_map.html',
  'telecom/korea_telecom_map.html',
  'chemical/korea_chemical_map.html', 'elec/korea_elec_map.html', 'metal/korea_metal_map.html',
  'semiconductor/korea_semiconductor_map.html',
];

const bad = [];
for (const f of MAPS) {
  const h = fs.readFileSync(f, 'utf8');
  const toolbar = (h.match(/class="rn-toolbar"/g) || []).length;
  const filter = (h.match(/id="rn-filter-content"/g) || []).length;
  const legacy = (h.match(/<div class="graph-sidebar"/g) || []).length;
  const search = (h.match(/id="rn-search"/g) || []).length;
  const sidebar = (h.match(/id="rn-filter-sidebar"/g) || []).length;
  if (toolbar !== 1 || filter !== 1 || legacy !== 0 || search !== 1 || sidebar !== 1) {
    bad.push({ f, toolbar, filter, legacy, search, sidebar });
  }
}
console.log(JSON.stringify({ maps: MAPS.length, bad }, null, 2));
process.exit(bad.length ? 1 : 0);
