/**
 * Pretty-prints bio_translations.json (UTF-8).
 * Edit strings in bio_translations.json directly; this script only re-serializes.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, 'bio_translations.json');
const T = JSON.parse(fs.readFileSync(path, 'utf8'));
fs.writeFileSync(path, JSON.stringify(T, null, 2), 'utf8');
console.log('ok', T.ko.title);
