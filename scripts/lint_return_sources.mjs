/**
 * Fail CI when functions/api/** or js/** reintroduce legacy return sources.
 *
 * Banned tokens (DB / mcap pipelines that must not be read outside the allowlist):
 *   sector_mcap_daily | sector_returns | sector_intraday_snapshots |
 *   hub_trend mcap | chg_1d_pct | ret_\d+d_pct
 *
 * Allowlist (relative to repo root): returns_core, hub_returns_source, sync job,
 * and this linter itself. Scanned trees are only functions/api and js — lib/scripts
 * are out of scope by design (writers/loaders live there).
 *
 * Usage: npm run lint:returns
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = [
  path.join(ROOT, 'functions', 'api'),
  path.join(ROOT, 'js'),
];

/** Paths (posix-relative from ROOT) allowed to mention banned tokens. */
const ALLOWLIST = new Set([
  'functions/lib/returns_core.mjs',
  'functions/lib/hub_returns_source.mjs',
  'scripts/sync_quotes_to_supabase.mjs',
  'scripts/lint_return_sources.mjs',
]);

const RULES = [
  { id: 'sector_mcap_daily', re: /sector_mcap_daily/ },
  // Word-boundary so hub_sector_returns.json does not match.
  { id: 'sector_returns', re: /(?<![A-Za-z0-9_])sector_returns(?![A-Za-z0-9_])/ },
  { id: 'sector_intraday_snapshots', re: /sector_intraday_snapshots/ },
  { id: 'hub_trend mcap', re: /hub_trend\s+mcap/i },
  { id: 'chg_1d_pct', re: /chg_1d_pct/ },
  { id: 'ret_Nd_pct', re: /ret_\d+d_pct/ },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs|ts|tsx)$/i.test(name)) out.push(full);
  }
  return out;
}

/** Strip line and block comments so docstrings do not false-positive. */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    // Keep strings intact (avoid stripping // inside strings incorrectly is ok for our tokens).
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      const q = src[i];
      out += q;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] || '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === q) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

function relPosix(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

const violations = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const rel = relPosix(file);
    if (ALLOWLIST.has(rel)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const text = stripComments(raw);
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        violations.push({ file: rel, rule: rule.id });
      }
    }
  }
}

if (violations.length) {
  console.error('lint:returns FAILED — banned legacy return-source tokens outside allowlist:\n');
  for (const v of violations) {
    console.error(`  ${v.file}  ←  ${v.rule}`);
  }
  console.error(
    '\nUse loadReturnSource + returns_core instead.'
    + ' Allowlist: returns_core, hub_returns_source, sync_quotes_to_supabase.',
  );
  process.exit(1);
}

console.log(
  `lint:returns OK — scanned ${SCAN_DIRS.map((d) => relPosix(d)).join(', ')}`
  + ` (${RULES.length} rules)`,
);
