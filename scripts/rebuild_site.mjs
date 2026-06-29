/**
 * Re-apply data + UI patches (cp_list, heatmap i18n, editorial, mcap fmt, bio inline).
 * Run before npm run build on deploy.
 */
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cpList = join(root, '..', 'cp_list');

function run(cmd, label) {
  console.log('\n==>', label);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

run(`node scripts/apply_cp_list_to_maps.mjs "${cpList}"`, 'cp_list → industry maps');
run('node scripts/patch_mobile_ux.mjs', 'mobile UX header/tabs');
run('node scripts/patch_global_bottom_nav.mjs', 'global bottom nav');
run('node scripts/build_hub_index.mjs', 'hub index JSON');
run('node scripts/patch_desktop_sidebar.mjs', 'desktop left sidebar');
run('node scripts/patch_map_nav_filters.mjs', 'desktop sector nav, filters, tab state');
run('node scripts/patch_tab_heatmap_i18n.mjs', 'tabHeatmap i18n');
run('node scripts/patch_editorial_collapsible_html.mjs', 'editorial collapsible HTML');
run('node scripts/fix_mcap_script_order.mjs', 'mcap fmt + script order');
run('node bio/gen_korea_bio_inline.mjs', 'bio inline.js');
console.log('\nOK rebuild_site');
