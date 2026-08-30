/**
 * Targeted layout smoke for filter sidebar release gate pre-check.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = [
  { sector: 'nuclear', vp: 'desktop', lang: 'ko', w: 1440, h: 900 },
  { sector: 'finance', vp: 'desktop', lang: 'ko', w: 1440, h: 900 },
  { sector: 'construction', vp: 'desktop', lang: 'ko', w: 1440, h: 900 },
  { sector: 'bigchip', vp: 'desktop', lang: 'ko', w: 1440, h: 900 },
  { sector: 'robot', vp: 'desktop', lang: 'ko', w: 1440, h: 900 },
  { sector: 'nuclear', vp: 'mobile', lang: 'ko', w: 375, h: 812 },
  { sector: 'cosmetics', vp: 'mobile', lang: 'en', w: 375, h: 812 },
  { sector: 'kcontent', vp: 'mobile', lang: 'en', w: 375, h: 812 },
  { sector: 'software', vp: 'mobile', lang: 'en', w: 375, h: 812 },
  { sector: 'bio', vp: 'mobile', lang: 'en', w: 375, h: 812 },
];

const failures = [];
for (const c of cases) {
  const env = {
    ...process.env,
    RN_TEST_ONLY: c.sector,
    RN_TEST_QUICK: '1',
    RN_BROWSER_VIEWPORT: `${c.w}x${c.h}`,
  };
  delete env.RN_BROWSER_SHARD;
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'verify:relation-browser'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    shell: true,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const failLine = out.split('\n').find((l) => l.includes('failures:'));
  if (r.status !== 0) {
    failures.push({ case: `${c.sector}/${c.vp}/${c.lang}`, status: r.status, failLine, tail: out.split('\n').slice(-8).join('\n') });
  } else {
    console.log('PASS', `${c.sector}/${c.vp}/${c.lang}`, failLine?.trim());
  }
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('ALL_TARGETED_PASS', cases.length);
