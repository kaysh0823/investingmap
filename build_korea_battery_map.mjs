import { execSync } from 'child_process';

execSync('node scripts/split_energy_clean_sectors.mjs', { stdio: 'inherit' });
