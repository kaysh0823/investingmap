/**
 * Build data/hub_sector_returns.json — KRX mcap-ratio sector returns (1M/3M/6M/1Y).
 * Same calculation as /api/hub_sectors; used for instant hub paint before live API refresh.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildHubSectors } from '../functions/lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../functions/lib/krx_yoy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadAuthKey() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (fs.existsSync(devVars)) {
    for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!env[k]) env[k] = v;
    }
  }
  return getAuthKey(env);
}

async function main() {
  const outPath = path.join(ROOT, 'data', 'hub_sector_returns.json');
  if (process.env.REFRESH_HUB_SNAPSHOTS !== '1') {
    console.log('skip hub_sector_returns (deterministic build — use npm run refresh:hub-snapshots)');
    process.exit(0);
  }
  const authKey = loadAuthKey();
  if (!authKey) {
    if (fs.existsSync(outPath)) {
      console.warn('KRX_AUTH_KEY missing — keeping existing hub_sector_returns.json');
      process.exit(0);
    }
    console.warn('KRX_AUTH_KEY missing — skip hub_sector_returns.json');
    process.exit(0);
  }

  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const env = { KRX_AUTH_KEY: authKey };

  console.log('Building hub sector returns (KRX mcap ratio, all horizons)…');
  const payload = await buildHubSectors(hubIndex, env);
  if (!payload || !payload.sectors || !Object.keys(payload.sectors).length) {
    console.error('Sector returns build failed');
    process.exit(1);
  }

  const out = {
    builtAt: hubIndex.builtAt || null,
    asOf: payload.asOf,
    source: payload.source,
    mcapRecentDd: payload.mcapRecentDd,
    effectiveAnchorDd: payload.effectiveAnchorDd,
    mcapPast1dDd: payload.mcapPast1dDd,
    mcapPast20dDd: payload.mcapPast20dDd,
    mcapPast50dDd: payload.mcapPast50dDd,
    mcapPast120dDd: payload.mcapPast120dDd,
    mcapPast200dDd: payload.mcapPast200dDd,
    sectors: payload.sectors,
  };

  fs.writeFileSync(outPath, `${JSON.stringify(out)}\n`, 'utf8');
  const sample = Object.entries(out.sectors).slice(0, 2)
    .map(([sid, s]) => `${sid} 20D=${s.return20dPct?.toFixed(2)}%`)
    .join(', ');
  console.log(`OK ${outPath} — ${Object.keys(out.sectors).length} sectors (${sample}…)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
