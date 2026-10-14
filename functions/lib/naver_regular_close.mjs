import { pricePhase } from './session_price_policy.mjs';
import { kstYmd } from './krx_session.mjs';

// Daily KRX candles, not /basic afterMarket or NXT overPrice.
export function parseRegularClose(text, tradeDd) {
  const bars = [];
  for (const match of String(text).matchAll(/\[\s*["'](\d{8})["']\s*,([^\]]+)\]/g)) {
    const values = match[2].split(',').map((value) => Number(value.trim()));
    const [open, high, low, close, volume] = values;
    if (!Number.isFinite(close) || close <= 0 || match[1] > tradeDd) continue;
    bars.push({ date: match[1], open, high, low, close, volume });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  const today = bars.find((bar) => bar.date === tradeDd);
  const prev = bars.filter((bar) => bar.date < tradeDd).at(-1);
  return today && prev ? { ...today, prevClose: prev.close } : null;
}

export async function fetchRegularClose(ticker, now = new Date(), fetchImpl = fetch) {
  if (pricePhase(now) !== 'afterClose') return null;
  const tradeDd = kstYmd(now);
  const start = new Date(now.getTime() - 15 * 86400000);
  const url = new URL('https://api.finance.naver.com/siseJson.naver');
  url.search = new URLSearchParams({ symbol: ticker, requestType: '1', startTime: kstYmd(start), endTime: tradeDd, timeframe: 'day' });
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' } });
  if (!response.ok) throw new Error(`daily candle ${ticker}: HTTP ${response.status}`);
  return parseRegularClose(await response.text(), tradeDd);
}

export function regularCloseRow(ticker, bar) {
  const dd = bar.date;
  return { ticker, last: bar.close, prev_close: bar.prevClose,
    as_of: `${dd.slice(0, 4)}-${dd.slice(4, 6)}-${dd.slice(6, 8)}T15:30:00+09:00`,
    regular_session: true, session_open: bar.open, session_high: bar.high,
    session_low: bar.low, session_volume: bar.volume };
}
