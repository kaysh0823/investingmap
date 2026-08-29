/**
 * Phase 6 — sequential browser shard release gate.
 * Runs shards A→B→C→D as separate processes (fresh browser each), merges results.
 * Does NOT retry failures. Does NOT weaken assertions.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARDS = ['a', 'b', 'c', 'd'];
const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();

const results = [];
let blocked = false;

for (const shard of SHARDS) {
  console.log(`\n==== RELEASE SHARD ${shard.toUpperCase()} (HEAD ${head.slice(0, 8)}) ====`);
  const t0 = Date.now();
  const r = spawnSync(
    process.execPath,
    ['scripts/verify_relation_browser.mjs'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        RN_BROWSER_SHARD: shard,
        RN_BROWSER_RELEASE: '1',
        RN_BROWSER_CONCURRENCY: '1',
        RN_HEAD: head,
        RN_TEST_ONLY: '',
        RN_TEST_QUICK: '',
        RN_TEST_RUNS: '1',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60 * 60 * 1000,
    },
  );
  const durationMs = Date.now() - t0;
  const shardPath = path.join(ROOT, `docs/reports/phase6-browser-shard-${shard}.json`);
  let summary = null;
  if (fs.existsSync(shardPath)) {
    summary = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  }
  const entry = {
    shard,
    exitCode: r.status ?? 1,
    durationMs,
    stdoutTail: (r.stdout || '').split('\n').slice(-30).join('\n'),
    stderrTail: (r.stderr || '').split('\n').slice(-20).join('\n'),
    summary,
  };
  results.push(entry);
  console.log(`shard ${shard} exit=${entry.exitCode} duration=${durationMs}ms`);
  if (entry.exitCode !== 0) blocked = true;
}

const merged = {
  generatedAt: new Date().toISOString(),
  head,
  note: 'Phase 6 sharded release gate — not a monolithic matrix; infra failures block deployment gate',
  shards: results.map((r) => ({
    shard: r.shard,
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    totalCases: r.summary?.totalCases ?? null,
    passedCases: r.summary?.passedCases ?? null,
    appFailures: r.summary?.appFailures ?? null,
    infrastructureFailures: r.summary?.infrastructureFailures ?? null,
    pages: r.summary?.pages ?? null,
  })),
  totals: {
    totalCases: results.reduce((n, r) => n + (r.summary?.totalCases || 0), 0),
    passedCases: results.reduce((n, r) => n + (r.summary?.passedCases || 0), 0),
    appFailures: results.reduce((n, r) => n + (r.summary?.appFailures || 0), 0),
    infrastructureFailures: results.reduce((n, r) => n + (r.summary?.infrastructureFailures || 0), 0),
    skippedCases: 0,
    retry: 0,
    assertionWeakening: 0,
  },
  deploymentBrowserGate: !blocked
    && results.every((r) => (r.summary?.appFailures || 0) === 0)
    && results.every((r) => (r.summary?.infrastructureFailures || 0) === 0)
    && results.every((r) => r.exitCode === 0),
  prReadyIndependentOfBrowser: true,
};

fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'docs/reports/phase6-browser-shard-release.json'),
  `${JSON.stringify(merged, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(ROOT, 'data/relation_network_release_browser_gate.json'),
  `${JSON.stringify(merged, null, 2)}\n`,
);

console.log('\n==== RELEASE GATE SUMMARY ====');
console.log(JSON.stringify(merged.totals, null, 2));
console.log('deploymentBrowserGate:', merged.deploymentBrowserGate);
process.exit(blocked ? 1 : 0);
