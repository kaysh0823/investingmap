/**
 * Build data/hub_sector_returns.json — official-mode stock aggregate
 * (same math as /api/hub_sectors after close). Committed with refs/RS on post_close.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildOfficialSectorReturnsFromRefs } from '../functions/lib/hub_returns_source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const outPath = path.join(ROOT, 'data', 'hub_sector_returns.json');
  if (process.env.REFRESH_HUB_SNAPSHOTS !== '1') {
    console.log('skip hub_sector_returns (deterministic build — use npm run refresh:hub-snapshots)');
    process.exit(0);
  }

  const hubPath = path.join(ROOT, 'data', 'hub_index.json');
  const refsPath = path.join(ROOT, 'data', 'hub_return_refs.json');
  if (!fs.existsSync(hubPath) || !fs.existsSync(refsPath)) {
    console.error('hub_index.json / hub_return_refs.json required');
    process.exit(1);
  }
  const hubIndex = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
  const refs = JSON.parse(fs.readFileSync(refsPath, 'utf8'));

  console.log('Building hub sector returns (official stock aggregate from hub_return_refs)…');
  const payload = buildOfficialSectorReturnsFromRefs(hubIndex, refs);
  if (!payload || !payload.sectors || !Object.keys(payload.sectors).length) {
    console.error('Sector returns build failed');
    process.exit(1);
  }

  const out = {
    builtAt: hubIndex.builtAt || null,
    asOf: payload.asOf,
    source: payload.source,
    numeratorMode: payload.numeratorMode,
    anchorDd: payload.anchorDd,
    refsRecentDd: payload.refsRecentDd,
    k: payload.k,
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
    .map(([sid, s]) => `${sid} 1D=${s.return1dPct?.toFixed?.(2) ?? s.return1dPct}%`)
    .join(', ');
  console.log(
    `OK ${outPath} — ${Object.keys(out.sectors).length} sectors `
    + `(missingShares=${payload.missingShares || 0}; ${sample}…)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
