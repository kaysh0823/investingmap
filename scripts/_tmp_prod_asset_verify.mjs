const OLD_ETAG = 'W/"3035440d8f40a17dcf31f73da18964e0"';
const REF_URL = 'https://investing-map.pages.dev/js/relation_network.js?v=3';
const URLS = [
  'https://www.investingmap.kr/js/relation_network.js?v=3',
  'https://www.investingmap.kr/js/relation_network.js?v=3',
  'https://www.investingmap.kr/js/relation_network.js?v=3',
];

async function inspect(url, ref) {
  const r = await fetch(url);
  const t = await r.text();
  const etag = r.headers.get('etag');
  return {
    url,
    status: r.status,
    len: t.length,
    etag,
    etagMatchesRef: etag === ref.etag,
    isOldEtag: etag === OLD_ETAG,
    hasComputeVisibleGraph: t.includes('computeVisibleGraph'),
    hasFitAll: t.includes('fitAll:'),
    hasReadability: t.includes('READABILITY'),
    sizeMatchesRef: t.length === ref.len,
    cache: r.headers.get('cf-cache-status'),
    age: r.headers.get('age'),
  };
}

const refRes = await fetch(REF_URL);
const refBody = await refRes.text();
const ref = {
  url: REF_URL,
  status: refRes.status,
  len: refBody.length,
  etag: refRes.headers.get('etag'),
  cache: refRes.headers.get('cf-cache-status'),
  age: refRes.headers.get('age'),
  hasComputeVisibleGraph: refBody.includes('computeVisibleGraph'),
  hasFitAll: refBody.includes('fitAll:'),
  hasReadability: refBody.includes('READABILITY'),
};

console.log('REFERENCE', JSON.stringify(ref, null, 2));
for (const url of URLS) {
  console.log('CHECK', JSON.stringify(await inspect(url, ref), null, 2));
}
