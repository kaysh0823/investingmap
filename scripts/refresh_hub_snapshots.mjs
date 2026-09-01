/**
 * Explicit hub snapshot refresh (Naver quotes + optional KRX RS / sector returns).
 * Normal `npm run build` does NOT run this — it consumes committed snapshot files.
 */
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, REFRESH_HUB_SNAPSHOTS: '1' };

function run(cmd, label) {
  console.log('\n==>', label);
  execSync(cmd, { cwd: root, stdio: 'inherit', env });
}

function runOptional(cmd, label) {
  console.log('\n==>', label);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', env });
  } catch (e) {
    console.warn('WARN optional step failed (continuing):', label, e && e.status);
  }
}

run('node scripts/build_hub_quote_snapshot.mjs', 'hub quote snapshot');
runOptional('node scripts/build_hub_rs_snapshot.mjs', 'hub RS snapshot');
runOptional('node scripts/build_hub_sector_returns.mjs', 'hub sector returns');
runOptional('node scripts/build_hub_volatility_snapshot.mjs', 'hub volatility snapshot');
console.log('\nOK refresh_hub_snapshots');
