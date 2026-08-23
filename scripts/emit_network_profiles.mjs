/**
 * Emit NETWORK_PROFILES for browser runtime.
 * Run: node scripts/emit_network_profiles.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = `/** Generated — do not edit. Source: lib/relation_network/profiles.mjs */
(function (g) { g.NETWORK_PROFILES = ${JSON.stringify(NETWORK_PROFILES, null, 2)}; })(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(join(ROOT, 'js', 'network_profiles.js'), out, 'utf8');
console.log('OK emit_network_profiles.js');
