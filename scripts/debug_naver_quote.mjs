/**
 * Debug a single ticker against Naver sise / mobile / basic sources.
 * Usage: node scripts/debug_naver_quote.mjs 005930
 */
import {
  decodeNaverHtml,
  fetchNaverBasicQuote,
  fetchNaverMobileQuote,
  fetchNaverQuote,
  fetchNaverSiseQuote,
  parseNaverBasicQuote,
  parseNaverMobileIntegration,
  parseNaverSiseHtml,
  NAVER_MOBILE_BASIC_URL,
  NAVER_MOBILE_INTEGRATION_URL,
  NAVER_SISE_URL,
} from '../functions/lib/naver_sise_quotes.mjs';

const code = String(process.argv[2] || '005930').trim().padStart(6, '0');

async function probeHttp(label, url, { html = false, parse } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'investingmap-quotes/1.0',
      Accept: html ? 'text/html,application/xhtml+xml' : 'application/json',
    },
  });
  const status = res.status;
  const buf = await res.arrayBuffer();
  let bodyText = '';
  try {
    bodyText = html ? decodeNaverHtml(buf) : new TextDecoder('utf-8').decode(buf);
  } catch {
    bodyText = '';
  }
  if (!res.ok) {
    console.log(`[${label}] HTTP ${status}`);
    console.log(`  body: ${bodyText.slice(0, 300)}`);
    return null;
  }
  try {
    const raw = html ? bodyText : JSON.parse(bodyText);
    const q = parse(raw);
    console.log(`[${label}] HTTP ${status}`);
    console.log(
      `  last=${q.last} prevClose=${q.prevClose} chg1dPct=${q.chg1dPct} `
      + `tradeDate=${q.tradeDate} marketClosed=${q.marketClosed}`
      + (q.sessionClose != null ? ` sessionClose=${q.sessionClose}` : ''),
    );
    return q;
  } catch (e) {
    console.log(`[${label}] HTTP ${status} parse FAIL ${e.message || e}`);
    console.log(`  body: ${bodyText.slice(0, 300)}`);
    return null;
  }
}

async function main() {
  console.log(`debug_naver_quote code=${code}`);
  await probeHttp('sise', `${NAVER_SISE_URL}?code=${encodeURIComponent(code)}`, {
    html: true,
    parse: parseNaverSiseHtml,
  });
  await probeHttp(
    'mobile',
    `${NAVER_MOBILE_INTEGRATION_URL}/${encodeURIComponent(code)}/integration`,
    { parse: parseNaverMobileIntegration },
  );
  await probeHttp(
    'basic',
    `${NAVER_MOBILE_BASIC_URL}/${encodeURIComponent(code)}/basic`,
    { parse: parseNaverBasicQuote },
  );

  console.log('--- library fetchers ---');
  for (const [label, fn] of [
    ['sise', fetchNaverSiseQuote],
    ['mobile', fetchNaverMobileQuote],
    ['basic', fetchNaverBasicQuote],
  ]) {
    try {
      const q = await fn(code);
      console.log(`[${label}] ok last=${q.last} prevClose=${q.prevClose} tradeDate=${q.tradeDate} marketClosed=${q.marketClosed}`);
    } catch (e) {
      console.log(`[${label}] FAIL ${e.message || e}`);
    }
  }
  try {
    const merged = await fetchNaverQuote(code);
    console.log(
      `[merged] last=${merged.last} prevClose=${merged.prevClose} tradeDate=${merged.tradeDate} `
      + `marketClosed=${merged.marketClosed} sources=${JSON.stringify({
        basic: merged._sources?.basic,
        sise: merged._sources?.sise,
        mobile: merged._sources?.mobile,
      })}`,
    );
  } catch (e) {
    console.log(`[merged] FAIL ${e.message || e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
