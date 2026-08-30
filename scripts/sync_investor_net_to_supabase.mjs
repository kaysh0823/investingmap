/**
 * Sync latest KRX investor net purchase (MDCSTAT02401) → Supabase stock_investor_net.
 * Run after market close (~18:00 KST) when KRX aggregates are published.
 *
 * Usage: npm run sync:investor-net
 */
import {
  loadEnv,
  resolveLatestTradeYmd,
  syncInvestorNetDay,
  queryInvestorNetForTicker,
  ymdToDash,
} from './lib/investor_net_supabase.mjs';

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

  const dayYmd = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1]?.replace(/\D/g, '')
    || (await resolveLatestTradeYmd(env));

  console.log(`Sync investor net → Supabase (${ymdToDash(dayYmd)})`);
  const result = await syncInvestorNetDay(dayYmd, supabaseUrl, serviceKey, undefined, env);

  const sample = await queryInvestorNetForTicker(
    supabaseUrl,
    serviceKey,
    SAMPLE_TICKER,
    result.tradeDate,
  );
  console.log(`\nSample ${SAMPLE_TICKER} @ ${result.tradeDate}:`);
  for (const row of sample) {
    console.log(`  ${row.invst_tp_cd}: ${row.net_val}`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n=== sync_investor_net summary ===');
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
