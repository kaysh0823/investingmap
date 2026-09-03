/**
 * Sync latest KRX foreign ownership ratio (MDCSTAT03701) → Supabase stock_foreign_ratio.
 * Run after market close when KRX aggregates are published.
 *
 * Usage: npm run sync:foreign-ratio
 */
import {
  loadEnv,
  resolveLatestForeignRatioYmd,
  syncForeignRatioDay,
  queryForeignRatioForTicker,
  ymdToDash,
} from './lib/foreign_ratio_supabase.mjs';

const SAMPLE_TICKER = '005930';

async function main() {
  const started = Date.now();
  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const dayYmd =
    process.argv.find((a) => a.startsWith('--date='))?.split('=')[1]?.replace(/\D/g, '') ||
    (await resolveLatestForeignRatioYmd(env));

  console.log(`Sync foreign ratio → Supabase (${ymdToDash(dayYmd)})`);
  const result = await syncForeignRatioDay(dayYmd, supabaseUrl, serviceKey, env);

  const sample = await queryForeignRatioForTicker(
    supabaseUrl,
    serviceKey,
    SAMPLE_TICKER,
    result.tradeDate,
  );
  console.log(`\nSample ${SAMPLE_TICKER} @ ${result.tradeDate}: hold_ratio=${sample}`);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n=== sync_foreign_ratio summary ===');
  console.log(`trade_date: ${result.tradeDate}`);
  console.log(`rows fetched: ${result.totalRows}`);
  console.log(`upserted:     ${result.upserted}`);
  console.log(`failed:       ${result.failed}`);
  console.log(`elapsed:      ${elapsed}s`);

  if (result.failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
