/**
 * Deterministically fill stock_price_history for one trade date via
 * data.krx MDCSTAT01501 (regular-session OHLC). Bypasses Naver consensus tradeDate.
 *
 * Usage: node scripts/backfill_daily_ohlc_krxweb.mjs --date=YYYYMMDD [--force]
 *    or: npm run backfill:daily-ohlc -- --date=20260914
 */
import { fetchKrxDailyOhlc, ymdToDash } from '../functions/lib/krx_daily_ohlc.mjs';
import { loadEnv } from './lib/investor_net_supabase.mjs';
import { upsertHistoryRows } from './lib/hub_history_gap.mjs';

const SAMPLE_TICKERS = ['000150', '000880', '001200', '0015G0', '0088D0', '0120G0', '005930'];

function parseArgs(argv) {
  let dayYmd = null;
  let force = false;
  for (const a of argv) {
    if (a === '--force') force = true;
    else if (a.startsWith('--date=')) {
      dayYmd = a.slice('--date='.length).replace(/\D/g, '');
    }
  }
  return { dayYmd, force };
}

function mapToHistoryRows(dailyMap, tradeDateDash) {
  const rows = [];
  for (const [ticker, fields] of dailyMap) {
    if (!ticker || !fields) continue;
    const close = fields.close;
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    rows.push({
      ticker,
      trade_date: tradeDateDash,
      open: fields.open ?? null,
      high: fields.high ?? null,
      low: fields.low ?? null,
      close,
      volume: fields.volume ?? null,
      turnover_won: fields.turnover_won ?? null,
      mcap_won: fields.mcap_won ?? null,
    });
  }
  return rows;
}

function fmt(n) {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return Number(n).toLocaleString('en-US');
}

async function main() {
  const { dayYmd, force } = parseArgs(process.argv.slice(2));
  if (!dayYmd || dayYmd.length !== 8) {
    console.error('Usage: node scripts/backfill_daily_ohlc_krxweb.mjs --date=YYYYMMDD [--force]');
    process.exit(1);
  }

  const env = loadEnv();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  if (!(env.KRX_ID || '').trim() || !(env.KRX_PW || '').trim()) {
    console.error('KRX_ID and KRX_PW are required for data.krx MDCSTAT01501');
    process.exit(1);
  }

  const tradeDateDash = ymdToDash(dayYmd);
  console.log(
    `Backfill daily OHLC via data.krx MDCSTAT01501 → ${tradeDateDash}` +
      (force ? ' (--force)' : ''),
  );

  const dailyMap = await fetchKrxDailyOhlc(dayYmd, env);
  const rows = mapToHistoryRows(dailyMap, tradeDateDash);
  if (!rows.length) {
    console.error(
      `daily-ohlc-krxweb ${tradeDateDash}: fetched 0 usable rows (empty market day or login failure)`,
    );
    process.exit(1);
  }

  console.log('sample closes:');
  for (const t of SAMPLE_TICKERS) {
    const f = dailyMap.get(t);
    console.log(`  ${t} close=${fmt(f?.close)}${f ? '' : ' (missing)'}`);
  }

  const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey, {
    tradeDateDash,
    // --force: overwrite contaminated days even when prev close is wrong.
    closeJumpSanity: !force,
  });

  console.log(
    `daily-ohlc-krxweb ${tradeDateDash}: fetched ${dailyMap.size}, upserted ${result.upserted}` +
      (result.failed ? `, failed ${result.failed}` : '') +
      (result.rejected ? `, jump-rejected ${result.rejected}` : ''),
  );

  if (result.failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
