/**
 * Build data/hub_rs_snapshot.json — KRX full-market RS
 * (tradingKRX-aligned: adjusted stock_price_history + market_index_daily).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildKrxRsSnapshot, getAuthKey } from '../functions/lib/krx_rs.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';
import {
  listHubCompanies,
  normalizeTicker,
} from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
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
  return env;
}

async function main() {
  const outPath = path.join(ROOT, 'data', 'hub_rs_snapshot.json');
  if (process.env.REFRESH_HUB_SNAPSHOTS !== '1') {
    console.log('skip hub_rs_snapshot (deterministic build — use npm run refresh:hub-snapshots)');
    process.exit(0);
  }

  const env = loadEnv();
  const authKey = getAuthKey(env);
  const supabase = getSupabaseConfig(env, { preferServiceRole: true });

  if (!supabase && !authKey) {
    if (fs.existsSync(outPath)) {
      console.warn('SUPABASE/KRX credentials missing — keeping existing hub_rs_snapshot.json');
      process.exit(0);
    }
    console.warn('SUPABASE/KRX credentials missing — skip hub_rs_snapshot.json');
    process.exit(0);
  }

  console.log(
    'Building KRX RS snapshot '
    + `(${supabase ? 'supabase history+adj+ffill' : 'KRX bydd_trd fallback'}; `
    + '20/50/120/200, tradingKRX weights)…',
  );
  const snapshot = await buildKrxRsSnapshot({ authKey, supabase, env });
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
  console.log(
    `OK ${outPath} — ${snapshot.quotesOk}/${snapshot.universeOrdinary || snapshot.universe} RS scores`
    + ` source=${snapshot.source || 'n/a'}`,
  );
  if (snapshot.universeRaw != null) {
    console.log(
      `Universe: raw=${snapshot.universeRaw} ordinary=${snapshot.universeOrdinary}`
      + (snapshot.universeExcluded
        ? ` excl=${JSON.stringify(snapshot.universeExcluded)}`
        : '')
      + (snapshot.rankPoolByPeriod
        ? ` rankPool=${JSON.stringify(snapshot.rankPoolByPeriod)}`
        : ''),
    );
  }
  if (snapshot.indices) {
    console.log(
      'Index RS:',
      Object.entries(snapshot.indices)
        .map(([code, row]) => `${code}=${row.rs} (20=${row.rs20}/50=${row.rs50}/120=${row.rs120}/200=${row.rs200})`)
        .join(', '),
    );
  } else {
    console.warn('WARN hub_rs_snapshot has no indices (KOSPI/KOSDAQ closes unavailable)');
  }
  if (hubPreview.length) {
    console.log('Hub RS Top 3:', hubPreview.slice(0, 3).map((r) => `${r.name} ${r.rs}`).join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
