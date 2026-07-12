/**
 * Emit js/sector_editorial_data.js from lib/sector_editorial.mjs (browser IIFE).
 * Run before or during SEO prerender so map_editorial.js shares one source.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECTOR_EDITORIAL } from '../lib/sector_editorial.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'js', 'sector_editorial_data.js');

const payload = JSON.stringify(SECTOR_EDITORIAL, null, 0);
const body =
  `/** Auto-generated from lib/sector_editorial.mjs — do not edit by hand. */\n` +
  `(function (g) {\n` +
  `  'use strict';\n` +
  `  g.IM_SECTOR_EDITORIAL = ${payload};\n` +
  `})(typeof window !== 'undefined' ? window : globalThis);\n`;

fs.writeFileSync(out, body, 'utf8');
console.log('OK wrote', path.relative(ROOT, out));
