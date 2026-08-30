const BASE = 'https://www.investingmap.kr';

async function snap(path) {
  const res = await fetch(BASE + path, { cache: 'no-store' });
  const lm = res.headers.get('last-modified');
  const etag = res.headers.get('etag');
  const text = await res.text();
  return { path, status: res.status, len: text.length, lm, etag, head: text.slice(0, 120) };
}

const paths = [
  '/data/snapshots/manifest.json',
  '/nuclear/data/korea_nuclear_network.json',
  '/nuclear/data/korea_nuclear_cp_list.json',
];

for (const p of paths) {
  try {
    console.log(JSON.stringify(await snap(p)));
  } catch (e) {
    console.log(p, 'ERR', e.message);
  }
}

// local manifest if exists
import fs from 'fs';
for (const lp of ['data/snapshots/manifest.json']) {
  if (fs.existsSync(lp)) {
    const s = fs.statSync(lp);
    console.log('local', lp, { mtime: s.mtime.toISOString(), size: s.size });
  }
}
