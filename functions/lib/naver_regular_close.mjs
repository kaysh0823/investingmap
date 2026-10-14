import { pricePhase } from './session_price_policy.mjs';
import { kstYmd } from './krx_session.mjs';

// Even KRX day charts continue through 20:00. The closing auction is 15:30;
// siseJson daily closes and the last chart point can contain after-hours prices.
export function parseRegularClose(chart, tradeDd) {
  if (!chart || chart.stockExchangeType !== 'KRX' || String(chart.tradeBaseAt) !== tradeDd) return null;
  const prevClose = Number(chart.lastClosePrice);
  if (!(prevClose > 0) || !Number.isFinite(prevClose)) return null;
  if (!/^\d{8}$/.test(String(chart.lastTradeBaseAt)) || chart.lastTradeBaseAt >= tradeDd) return null;
  const bars = (Array.isArray(chart.priceInfos) ? chart.priceInfos : [])
    .filter((bar) => /^\d{14}$/.test(String(bar.localDateTime))
      && bar.localDateTime >= `${tradeDd}090000` && bar.localDateTime <= `${tradeDd}153000`);
  const closing = bars.find((bar) => bar.localDateTime === `${tradeDd}153000`);
  if (!closing || !Number.isFinite(Number(closing.currentPrice)) || !(Number(closing.currentPrice) > 0)) return null;
  const highs = bars.map((bar) => Number(bar.highPrice)).filter((value) => Number.isFinite(value) && value > 0);
  const lows = bars.map((bar) => Number(bar.lowPrice)).filter((value) => Number.isFinite(value) && value > 0);
  if (!highs.length || !lows.length || !(Number(chart.openPrice) > 0) || !Number.isFinite(Number(closing.accumulatedTradingVolume))) return null;
  return { date: tradeDd, open: Number(chart.openPrice), high: Math.max(...highs), low: Math.min(...lows),
    close: Number(closing.currentPrice), volume: Number(closing.accumulatedTradingVolume), prevClose };
}

export async function fetchRegularClose(ticker, now = new Date(), fetchImpl = fetch) {
  if (pricePhase(now) !== 'afterClose') return null;
  const tradeDd = kstYmd(now);
  const url = new URL(`https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(ticker)}`);
  url.search = new URLSearchParams({ periodType: 'day', range: '5' });
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' } });
  if (!response.ok) throw new Error(`regular closing auction ${ticker}: HTTP ${response.status}`);
  return parseRegularClose(await response.json(), tradeDd);
}

export function regularCloseRow(ticker, bar) {
  const dd = bar.date;
  return { ticker, last: bar.close, prev_close: bar.prevClose,
    as_of: `${dd.slice(0, 4)}-${dd.slice(4, 6)}-${dd.slice(6, 8)}T15:30:00+09:00`,
    regular_session: true, session_open: bar.open, session_high: bar.high,
    session_low: bar.low, session_volume: bar.volume };
}
