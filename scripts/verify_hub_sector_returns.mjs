/**
 * Verify hub sector mcap-ratio returns match independent recomputation.
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

const KEYS = [
  ['return1dPct', '1일', 'mcapPast1dDd'],
  ['return20dPct', '20일(~1M)', 'mcapPast20dDd'],
  ['return50dPct', '50일(~3M)', 'mcapPast50dDd'],
  ['return120dPct', '120일(~6M)', 'mcapPast120dDd'],
  ['return250dPct', '250일(~1Y)', 'mcapPast250dDd'],
];

async function main() {
  const cachedPath = path.join(ROOT, 'data/hub_sector_returns.json');
  const cached = JSON.parse(fs.readFileSync(cachedPath, 'utf8'));
  const hubIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hub_index.json'), 'utf8'));
  const authKey = loadAuthKey();

  console.log('Cached builtAt:', cached.builtAt);
  console.log('Anchor dates:', {
    recent: cached.mcapRecentDd,
    past1d: cached.mcapPast1dDd,
    past20d: cached.mcapPast20dDd,
    past50d: cached.mcapPast50dDd,
    past120d: cached.mcapPast120dDd,
    past250d: cached.mcapPast250dDd,
  });

  if (!authKey) {
    console.warn('KRX_AUTH_KEY missing — spot-check cached JSON only');
    for (const sid of ['semi', 'energy', 'powergrid']) {
      const s = cached.sectors[sid];
      console.log(sid, {
        '1d': s.return1dPct?.toFixed(2),
        '20d': s.return20dPct?.toFixed(2),
        '50d': s.return50dPct?.toFixed(2),
        '120d': s.return120dPct?.toFixed(2),
        '250d': s.return250dPct?.toFixed(2),
      });
    }
    return;
  }

  const live = await buildHubSectors(hubIndex, { KRX_AUTH_KEY: authKey });
  console.log('\nLive recompute vs cached (semi, energy, powergrid):');
  let maxDiff = 0;
  for (const sid of ['semi', 'energy', 'powergrid', 'bio', 'finance']) {
    const a = cached.sectors[sid] || {};
    const b = live.sectors[sid] || {};
    const row = {};
    for (const [key, label] of KEYS) {
      const c = a[key];
      const l = b[key];
      const diff = c != null && l != null ? Math.abs(c - l) : null;
      if (diff != null && diff > maxDiff) maxDiff = diff;
      row[label] = {
        cached: c != null ? c.toFixed(2) + '%' : '—',
        live: l != null ? l.toFixed(2) + '%' : '—',
        diff: diff != null ? diff.toFixed(4) : '—',
      };
    }
    console.log('\n' + sid + ':', JSON.stringify(row, null, 2));
  }

  console.log('\nLive anchor dates:', {
    recent: live.mcapRecentDd,
    past1d: live.mcapPast1dDd,
    past20d: live.mcapPast20dDd,
    past50d: live.mcapPast50dDd,
    past120d: live.mcapPast120dDd,
    past250d: live.mcapPast250dDd,
  });

  if (maxDiff < 0.05) {
    console.log('\nOK — live vs cached within 0.05%p (same KRX session).');
  } else if (maxDiff < 2) {
    console.log('\nWARN — small drift (likely stale cache or session timing). max diff:', maxDiff.toFixed(4) + '%p');
  } else {
    console.error('\nFAIL — large mismatch. max diff:', maxDiff.toFixed(4) + '%p');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
