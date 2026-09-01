/**
 * Re-apply data + UI patches (cp_list, heatmap i18n, editorial, mcap fmt, bio inline).
 * Run before npm run build on deploy.
 */
import fs from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cpList = process.env.CP_LIST_DIR || join(root, 'cp_list');

function run(cmd, label) {
  console.log('\n==>', label);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function runOptional(cmd, label) {
  console.log('\n==>', label);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.warn('WARN optional step failed (continuing):', label, e && e.status);
  }
}

function ensureMapBuilder(relHtml, builderCmd, label) {
  const fp = join(root, relHtml);
  if (fs.existsSync(fp)) {
    console.log('\n==>', label, '(exists, skip)');
    return;
  }
  run(builderCmd, label);
}

run('node build_korea_auto_map.mjs', 'rebuild auto map');
ensureMapBuilder('medtech/korea_medtech_map.html', 'node build_korea_medtech_map.mjs', 'build medtech map');
run('node build_korea_robot_map.mjs', 'rebuild robot map');
run('node build_korea_bigchip_map.mjs', 'build chip leaders map');
run('node build_korea_software_map.mjs', 'build IT & software map');
run('node build_korea_holdings_map.mjs', 'build holdings map');
run('node build_korea_telecom_map.mjs', 'build telecom map');
run('node build_korea_chemical_map.mjs', 'build chemical map');
run('node build_korea_travel_map.mjs', 'build travel map');
run('node build_korea_elec_map.mjs', 'build electrical & electronics map');
run('node build_korea_metal_map.mjs', 'build steel, metals & machinery map');
run('node scripts/apply_curated_sector_moves.mjs', 'apply approved powergrid/defense moves');
run('node scripts/verify_map_companies.mjs', 'verify map company arrays');
run(`node scripts/apply_cp_list_to_maps.mjs "${cpList}"`, 'cp_list → industry maps');
run('node scripts/prune_defense_energy_universe.mjs', 'prune defense/energy curated universe');
run('node scripts/split_energy_clean_sectors.mjs', 'split energy into battery/renewable/nuclear');
run('node scripts/split_kconsume_cosmetics.mjs', 'split cosmetics from kconsume + Pharmaresearch→medtech');
run('node scripts/apply_cp_list_sector_additions.mjs', 'cp_list additions → semi/ship/battery/robot/kconsume/software/kcontent/medtech/metal/elec/auto/telecom/cosmetics/holdings');
run('node scripts/rebalance_cosmetics_medtech_bio.mjs', 'cosmetics aesthetic + bio IVD → medtech rebalance');
run('node scripts/apply_sector_exclusive.mjs', 'enforce single-sector ownership');
run('node scripts/apply_cross_sector_memberships.mjs', 'verify no active cross-sector memberships');
run('node scripts/enrich_company_fields.mjs', 'enrich semType/products (all maps)');
run('node scripts/apply_semi_chain_reclass.mjs', 'semiconductor chain split persistence');
run('node scripts/apply_semi_relation_network.mjs', 'semiconductor curated relation network');
run('node scripts/migrate_network_data.mjs', 'structured relation network JSON (pilots)');
run('node scripts/apply_evidence_review_phase26.mjs', 'Phase 2.6 evidence review');
run('node scripts/normalize_network_entities_phase27.mjs', 'Phase 2.7 entity normalization');
run('node scripts/apply_evidence_review_phase27.mjs', 'Phase 2.7 evidence review');
run('node scripts/migrate_bigchip_network_phase3a.mjs', 'Phase 3A bigchip dualAnchor network');
run('node scripts/fix_bigchip_metrics_phase3b0.mjs', 'Phase 3B-0 bigchip metrics demotion');
run('node scripts/migrate_battery_network_phase3b.mjs', 'Phase 3B battery circular value chain');
run('node scripts/write_battery_phase3b_metrics.mjs', 'Phase 3B battery orphan metrics');
run('node scripts/migrate_ship_network_phase3c.mjs', 'Phase 3C ship project ecosystem');
run('node scripts/fix_ship_reported_phase3d0.mjs', 'Phase 3D-0 ship reported demotion');
run('node scripts/migrate_finance_network_phase3d.mjs', 'Phase 3D finance ownershipTree');
run('node scripts/curate_finance_ownership_phase3d1.mjs', 'Phase 3D.1 finance ownership curation');
run('node scripts/migrate_powergrid_network_phase4a.mjs', 'Phase 4A powergrid grid infrastructure');
run('node scripts/curate_powergrid_contracts_phase4a1.mjs', 'Phase 4A.1 powergrid contract curation');
run('node scripts/curate_powergrid_contracts_phase4a2.mjs', 'Phase 4A.2 powergrid contract evidence/status semantics');
run('node scripts/migrate_nuclear_network_phase4b.mjs', 'Phase 4B nuclear project lifecycle ecosystem');
run('node scripts/curate_nuclear_phase4b1.mjs', 'Phase 4B.1 nuclear project/canonical/role corrections');
run('node scripts/migrate_renewable_network_phase4c.mjs', 'Phase 4C renewable project value chain');
run('node scripts/curate_renewable_phase4c1.mjs', 'Phase 4C.1 renewable project qualification/capacity curation');
run('node scripts/migrate_construction_network_phase5a.mjs', 'Phase 5A construction development/project ecosystem');
run('node scripts/curate_construction_phase5a1.mjs', 'Phase 5A.1 construction evidence/amount/orphan curation');
run('node scripts/curate_construction_phase5a2.mjs', 'Phase 5A.2 construction DART/KIND primary + legal-party audit');
run('node scripts/curate_construction_phase5a3.mjs', 'Phase 5A.3 construction claim-scoped evidence closing audit');
run('node scripts/migrate_auto_network_phase5b.mjs', 'Phase 5B auto automotive value-chain ecosystem');
run('node scripts/curate_auto_relationships_phase5b1.mjs', 'Phase 5B.1 auto evidence/ownership/supply curation');
run('node scripts/curate_auto_business_relationships_phase5b2.mjs', 'Phase 5B.2 auto confirmed business relationship curation');
run('node scripts/migrate_elec_network_phase5c.mjs', 'Phase 5C elec electronics value-chain ecosystem');
run('node scripts/curate_elec_relationships_phase5c1.mjs', 'Phase 5C.1 elec product canonical + cross-sector audit');
run('node scripts/migrate_metal_network_phase5d.mjs', 'Phase 5D metal metals value-chain ecosystem');
run('node scripts/migrate_cosmetics_network_phase5e.mjs', 'Phase 5E cosmetics beauty brand/ODM ecosystem');
run('node scripts/migrate_kconsume_network_phase5f.mjs', 'Phase 5F kconsume consumer brand/distribution ecosystem');
run('node scripts/migrate_kcontent_network_phase5f.mjs', 'Phase 5F kcontent IP/production/distribution ecosystem');
run('node scripts/migrate_software_network_phase5h.mjs', 'Phase 5H software product/platform ecosystem');
run('node scripts/migrate_telecom_network_phase5h.mjs', 'Phase 5H telecom network/service ecosystem');
run('node scripts/migrate_chemical_network.mjs', 'chemical refining value-chain ecosystem');
run('node scripts/migrate_travel_network.mjs', 'travel leisure airlines value-chain ecosystem');
run('node scripts/migrate_robot_network_phase5i.mjs', 'Phase 5I robot component/system/application ecosystem');
run('node scripts/emit_network_profiles.mjs', 'network profiles JS');
run('node scripts/patch_relation_network.mjs', 'relation network v2 UI + renderer');
run('node scripts/apply_powergrid_chain_reclass.mjs', 'powergrid cable split persistence');
run('node scripts/apply_ship_chain_reclass.mjs', 'ship chain split persistence');
run('node scripts/filter_mcap_floor.mjs', 'mcap floor 3천억원');
run('node scripts/migrate_medtech_network_phase5g.mjs', 'Phase 5G medtech device/specialty/regulatory ecosystem');
run('node scripts/patch_mobile_ux.mjs', 'mobile UX header/tabs');
run('node scripts/patch_global_bottom_nav.mjs', 'global bottom nav');
run('node scripts/patch_global_search.mjs', 'global search');
run('node bio/gen_korea_bio_inline.mjs', 'bio inline.js');
run('node scripts/build_hub_index.mjs', 'hub index JSON + crossSectors');
run('node scripts/build_search_index.mjs', 'search index');
console.log('\n==> hub snapshots (consume committed files; refresh via npm run refresh:hub-snapshots)');
run('node scripts/build_hub_quote_snapshot.mjs', 'hub quote snapshot gate');
runOptional('node scripts/build_hub_rs_snapshot.mjs', 'hub RS snapshot gate');
runOptional('node scripts/build_hub_sector_returns.mjs', 'hub sector returns gate');
run('node scripts/prerender_seo.mjs', 'SEO prerender tables + sitemap');
run('node scripts/patch_desktop_sidebar.mjs', 'desktop left sidebar');
run('node scripts/patch_map_nav_filters.mjs', 'desktop sector nav, filters, tab state');
run('node scripts/patch_tab_heatmap_i18n.mjs', 'tabHeatmap i18n');
run('node scripts/patch_heatmap_chg.mjs', 'heatmap 1D return colors');
run('node scripts/patch_momentum_tab.mjs', 'momentum matrix tab');
run('node scripts/patch_volatility_tab.mjs', 'volatility distribution tab');
run('node scripts/patch_editorial_collapsible_html.mjs', 'editorial collapsible HTML');
run('node scripts/fix_mcap_script_order.mjs', 'mcap fmt + script order');
run('node scripts/patch_rs_column.mjs', 'RS table column');
run('node scripts/patch_return_columns.mjs', 'return % columns');
run('node scripts/patch_spark_column.mjs', 'spark chart column');
run('node scripts/patch_candle_modal.mjs', 'candle chart modal');
run('node scripts/patch_cross_sector_ui.mjs', 'cross-sector table badges (final)');
console.log('\nOK rebuild_site');
