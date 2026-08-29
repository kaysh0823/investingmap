/**
 * Build data/hub_rs_snapshot.json — KRX full-market RS (20/50/120-day percentile avg).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildKrxRsSnapshot, getAuthKey } from '../functions/lib/krx_rs.mjs';
import {
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';

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
  const outPath = path.join(ROOT, 'data', 'hub_rs_snapshot.json');
  if (process.env.REFRESH_HUB_SNAPSHOTS !== '1') {
    console.log('skip hub_rs_snapshot (deterministic build — use npm run refresh:hub-snapshots)');
    process.exit(0);
  }
  const authKey = loadAuthKey();
  if (!authKey) {
    if (fs.existsSync(outPath)) {
      console.warn('KRX_AUTH_KEY missing — keeping existing hub_rs_snapshot.json');
      process.exit(0);
    }
    console.warn('KRX_AUTH_KEY missing — skip hub_rs_snapshot.json (runtime /api/hub_rs_snapshot will build)');
    process.exit(0);
  }

  console.log('Building KRX RS snapshot (20/50/120 trading days)…');
  const snapshot = await buildKrxRsSnapshot(authKey);
  if (!snapshot || !snapshot.quotes) {
    console.error('RS snapshot build failed');
    process.exit(1);
  }

  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const hubPreview = listHubCompanies(hubIndex)
    .map((c) => {
      const key = normalizeTicker(c.ticker);
      const q = key ? snapshot.quotes[key] : null;
      if (!q) return null;
      return { ticker: c.ticker, name: c.name, sectorId: c.sectorId, rs: q.rs };
    })
    .filter(Boolean)
    .sort((a, b) => b.rs - a.rs)
    .slice(0, 10);

  const out = { ...snapshot, hubTop10Preview: hubPreview };
  fs.writeFileSync(outPath, `${JSON.stringify(out)}\n`, 'utf8');
  console.log(`OK ${outPath} — ${snapshot.quotesOk}/${snapshot.universe} RS scores`);
  if (hubPreview.length) {
    console.log('Hub RS Top 3:', hubPreview.slice(0, 3).map((r) => `${r.name} ${r.rs}`).join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
