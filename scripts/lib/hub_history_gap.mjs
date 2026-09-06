/**
 * Repair per-ticker gaps in stock_price_history for hub-listed tickers.
 * fillMissingHistoryDays only adds calendar days after the anchor max date;
 * newly added hub members can miss rows on days the rest of the market already has.
 */
import { tradingDates, fetchMarketDay, historyFieldsFromKrxRow } from '../../functions/lib/krx_yoy.mjs';
import { normalizeTicker } from '../../functions/lib/hub_dashboard_core.mjs';

const HISTORY_UPSERT_BATCH = 500;
const KRX_DELAY_MS = 150;
const SUPABASE_MAX_RETRIES = 1;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function basDdToDash(basDd) {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function historyRowFromKrx(ticker, tradeDate, krxRow) {
  const fields = historyFieldsFromKrxRow(krxRow);
  if (!fields) return null;
  return {
    ticker,
    trade_date: tradeDate,
    open: fields.open,
    high: fields.high,
    low: fields.low,
    close: fields.close,
    volume: fields.volume,
    mcap_won: fields.mcap_won,
    turnover_won: fields.turnover_won,
  };
}

async function fetchHistoryTickerSetForDate(supabaseUrl, serviceKey, tradeDate) {
  const found = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url =
      `${supabaseUrl}/rest/v1/stock_price_history?trade_date=eq.${tradeDate}` +
      `&select=ticker&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      throw new Error(`history coverage fetch ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    const page = await res.json();
    for (const row of page) {
      const ticker = normalizeTicker(row?.ticker);
      if (ticker) found.add(ticker);
    }
    if (page.length < pageSize) break;
  }
  return found;
}

async function upsertHistoryBatch(rows, supabaseUrl, serviceKey, attempt = 0) {
  const res = await fetch(`${supabaseUrl}/rest/v1/stock_price_history`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates, on_conflict=ticker,trade_date',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  if (attempt < SUPABASE_MAX_RETRIES) {
    await sleep(800);
    return upsertHistoryBatch(rows, supabaseUrl, serviceKey, attempt + 1);
  }
  return { ok: false, body };
}

async function upsertHistoryRows(rows, supabaseUrl, serviceKey) {
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += HISTORY_UPSERT_BATCH) {
    const batch = rows.slice(i, i + HISTORY_UPSERT_BATCH);
    const result = await upsertHistoryBatch(batch, supabaseUrl, serviceKey);
    if (!result.ok) {
      failed += batch.length;
      continue;
    }
    upserted += batch.length;
  }
  return { upserted, failed };
}

/**
 * For recent trading sessions, upsert hub tickers missing from stock_price_history.
 * Does not throw when a ticker has no KRX row (suspended / not yet listed).
 */
export async function repairHubHistoryGapsForRecentSessions({
  authKey,
  supabaseUrl,
  serviceKey,
  expectedTickers,
  lookbackSessions = 30,
}) {
  if (!authKey || !supabaseUrl || !serviceKey || !expectedTickers?.length) {
    return { daysChecked: 0, daysRepaired: 0, rowsUpserted: 0, rowsFailed: 0 };
  }

  const hubTickers = [...new Set(expectedTickers.map(normalizeTicker).filter(Boolean))].sort();
  const basDates = tradingDates(lookbackSessions + 5).slice(0, lookbackSessions);
  let daysRepaired = 0;
  let rowsUpserted = 0;
  let rowsFailed = 0;

  for (const basDd of basDates) {
    const tradeDate = basDdToDash(basDd);
    const existing = await fetchHistoryTickerSetForDate(supabaseUrl, serviceKey, tradeDate);
    const missingTickers = hubTickers.filter((t) => !existing.has(t));
    if (!missingTickers.length) continue;

    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (!byCode?.size) continue;

      const rows = [];
      for (const ticker of missingTickers) {
        const row = historyRowFromKrx(ticker, tradeDate, byCode.get(ticker));
        if (row) rows.push(row);
      }
      if (!rows.length) continue;

      const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey);
      rowsUpserted += result.upserted;
      rowsFailed += result.failed;
      if (result.upserted) {
        daysRepaired += 1;
        console.log(
          `  hub history gap ${tradeDate}: upserted ${result.upserted}/${missingTickers.length} missing ticker(s)`,
        );
      }
      await sleep(KRX_DELAY_MS);
    } catch (e) {
      console.warn(`  hub history gap ${tradeDate} failed: ${e.message || e}`);
    }
  }

  if (daysRepaired) {
    console.log(
      `  hub history gap repair: ${daysRepaired} day(s), ${rowsUpserted} row(s)` +
        (rowsFailed ? ` (${rowsFailed} failed)` : ''),
    );
  } else {
    console.log(`  hub history gap repair: none (${basDates.length} sessions checked)`);
  }

  return {
    daysChecked: basDates.length,
    daysRepaired,
    rowsUpserted,
    rowsFailed,
  };
}

/**
 * Force re-upsert hub tickers for explicit session dates (YYYY-MM-DD) from KRX.
 * Use when a day exists but may be incomplete / needs refresh (e.g. 2026-07-10).
 */
export async function repairHubHistoryForDates({
  authKey,
  supabaseUrl,
  serviceKey,
  expectedTickers,
  datesDash = [],
  forceAll = true,
}) {
  if (!authKey || !supabaseUrl || !serviceKey || !expectedTickers?.length || !datesDash?.length) {
    return { daysChecked: 0, daysRepaired: 0, rowsUpserted: 0, rowsFailed: 0 };
  }

  const hubTickers = [...new Set(expectedTickers.map(normalizeTicker).filter(Boolean))].sort();
  let daysRepaired = 0;
  let rowsUpserted = 0;
  let rowsFailed = 0;

  for (const tradeDate of datesDash) {
    const dash = String(tradeDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dash)) continue;
    const basDd = dash.replace(/-/g, '');
    const existing = await fetchHistoryTickerSetForDate(supabaseUrl, serviceKey, dash);
    const targets = forceAll
      ? hubTickers
      : hubTickers.filter((t) => !existing.has(t));
    if (!targets.length) {
      console.log(`  hub history ${dash}: already complete (${existing.size} tickers)`);
      continue;
    }

    try {
      const byCode = await fetchMarketDay(authKey, basDd);
      if (!byCode?.size) {
        console.warn(`  hub history ${dash}: KRX returned empty`);
        continue;
      }

      const rows = [];
      for (const ticker of targets) {
        const row = historyRowFromKrx(ticker, dash, byCode.get(ticker));
        if (row) rows.push(row);
      }
      if (!rows.length) continue;

      const result = await upsertHistoryRows(rows, supabaseUrl, serviceKey);
      rowsUpserted += result.upserted;
      rowsFailed += result.failed;
      if (result.upserted) {
        daysRepaired += 1;
        console.log(
          `  hub history ${dash}: upserted ${result.upserted}/${targets.length}` +
            (forceAll ? ' (force refresh)' : ' missing'),
        );
      }
      await sleep(KRX_DELAY_MS);
    } catch (e) {
      console.warn(`  hub history ${dash} failed: ${e.message || e}`);
    }
  }

  return {
    daysChecked: datesDash.length,
    daysRepaired,
    rowsUpserted,
    rowsFailed,
  };
}
