/**
 * Naver Finance USD/KRW (FX_USDKRW) — shared by /api/fx and scripts/update_fx_from_naver.mjs
 */

export const FX_USDKRW_SOURCE =
  'https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW';

/** @param {string} html */
export function parseUsdKrwRate(html) {
  const patterns = [
    /"nowValue":"([0-9,]+\.[0-9]+)"/,
    /class="[^"]*no_today[^"]*"[^>]*>[\s\S]{0,600}?<em[^>]*>([0-9,]+\.[0-9]+)<\/em>/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (v > 500 && v < 5000) return v;
    }
  }
  const candidates = [...html.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+\.[0-9]{2})/g)].map((x) =>
    parseFloat(x[1].replace(/,/g, '')),
  );
  const inBand = candidates.filter((n) => n > 1100 && n < 2000);
  return inBand.length ? inBand[0] : null;
}

/** Compatible with data/fx_usdkrw.json: { rate, asOf, source } */
export function buildFxPayload(rate, asOf = null) {
  return {
    rate,
    asOf: asOf || new Date().toISOString().slice(0, 10),
    source: FX_USDKRW_SOURCE,
  };
}

/**
 * @returns {Promise<{ rate: number, asOf: string, source: string }>}
 */
export async function fetchUsdKrwFromNaver() {
  const res = await fetch(FX_USDKRW_SOURCE, {
    headers: { 'User-Agent': 'investingmap-fx/1.0' },
  });
  if (!res.ok) throw new Error(`naver_fx_http_${res.status}`);
  const html = await res.text();
  const rate = parseUsdKrwRate(html);
  if (rate == null) throw new Error('naver_fx_parse_failed');
  return buildFxPayload(rate);
}
