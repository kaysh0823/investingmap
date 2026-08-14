import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'chain_overrides.json');

let cache = null;

function load() {
  if (!cache) cache = JSON.parse(fs.readFileSync(PATH, 'utf8'));
  return cache;
}

export function chainOverride(industryKey, ticker) {
  const t = String(ticker || '').padStart(6, '0');
  return load()?.[industryKey]?.[t] || null;
}
