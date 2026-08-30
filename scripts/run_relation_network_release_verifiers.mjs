/**
 * Phase 6 — run required relation-network verifiers; write summary JSON.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const COMMANDS = [
  'verify:relation-network',
  'verify:relation-network-asset-version',
  'verify:relation-network-readability',
  'verify:semi-relations',
  'verify:bigchip',
  'verify:battery',
  'verify:ship',
  'verify:finance',
  'verify:powergrid',
  'verify:nuclear',
  'verify:renewable',
  'verify:construction',
  'verify:auto',
  'verify:elec',
  'verify:metal',
  'verify:cosmetics',
  'verify:kconsume',
  'verify:kcontent',
  'verify:medtech',
  'verify:software',
  'verify:telecom',
  'verify:robot',
  'verify:nav-tab-preserve',
  'verify:data-sector-profile',
  'verify:dist',
];

const rows = [];
let failed = 0;

for (const cmd of COMMANDS) {
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', cmd], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
  const durationMs = Date.now() - t0;
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const warnings = (out.match(/\bWARN\b|\bwarnings?:\s*[1-9]/gi) || []).length;
  const row = {
    command: `npm run ${cmd}`,
    exitCode: r.status ?? 1,
    durationMs,
    failures: r.status ? 1 : 0,
    warnings,
    warningReason: warnings ? 'see command output / sector validator warnings' : null,
  };
  rows.push(row);
  console.log(`${row.exitCode === 0 ? 'OK' : 'FAIL'} ${cmd} (${durationMs}ms)`);
  if (row.exitCode !== 0) failed += 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  phase: 6,
  commands: rows,
  failedCount: failed,
  pass: failed === 0,
};

fs.writeFileSync(
  path.join(ROOT, 'data/relation_network_release_verify_summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`wrote verify summary failed=${failed}`);
process.exit(failed ? 1 : 0);
