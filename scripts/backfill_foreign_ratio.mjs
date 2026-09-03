/**
 * Backfill stock_foreign_ratio for OSC display depth.
 * Default 250 (~1Y); use --days=1250 for 5Y daily charts.
 * Skips dates already present for anchor ticker 005930.
 *
 * Usage: npm run backfill:foreign-ratio [--days=250|1250]
 */
import { tradingDates } from '../functions/lib/krx_yoy.mjs';
import {
  loadEnv,
  sleep,
  syncForeignRatioDay,
  fetchExistingForeignRatioDates,
  ymdToDash,
} from './lib/foreign_ratio_supabase.mjs';

const DEFAULT_DAYS = 250;
const KRX_DELAY_MS = 400;

async function main() {
  const started = Date.now();
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const targetDays = daysArg
    ? Math.max(1, parseInt(daysArg.split('=')[1], 10) || DEFAULT_DAYS)
    : DEFAULT_DAYS;

  const existing = await fetchExistingForeignRatioDates(supabaseUrl, serviceKey);
  const candidates = tradingDates(Math.ceil(targetDays * 1.15)).slice(0, targetDays);
  const missing = candidates.filter((ymd) => !existing.has(ymdToDash(ymd)));

  console.log(
    `Backfill foreign ratio: target=${targetDays} trading days, ` +
      `existing=${existing.size}, to_fetch=${missing.length}`,
  );

  let synced = 0;
  let skipped = candidates.length - missing.length;
  let totalUpserted = 0;
  let failures = 0;

  for (const dayYmd of missing.reverse()) {
    const dash = ymdToDash(dayYmd);
    process.stdout.write(`\n[${synced + 1}/${missing.length}] ${dash}`);
    const result = await syncForeignRatioDay(dayYmd, supabaseUrl, serviceKey, env);
    if (result.totalRows === 0) {
      console.log(' — empty (holiday/no data)');
      continue;
    }
    synced += 1;
    totalUpserted += result.upserted;
    failures += result.failed;
    console.log(` — upserted ${result.upserted} rows`);
    await sleep(KRX_DELAY_MS);
  }

  const after = await fetchExistingForeignRatioDates(supabaseUrl, serviceKey);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log('\n=== backfill_foreign_ratio summary ===');
  console.log(`target days:     ${targetDays}`);
  console.log(`skipped existing:${skipped}`);
  console.log(`days synced:     ${synced}`);
  console.log(`rows upserted:   ${totalUpserted}`);
  console.log(`upsert failures: ${failures}`);
  console.log(`coverage dates:  ${after.size} (anchor 005930)`);
  console.log(`elapsed:         ${elapsed}s`);

  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
