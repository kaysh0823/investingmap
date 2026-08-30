const BASE = 'https://www.investingmap.kr';
const maxAttempts = 36;
const delayMs = 10000;

async function check() {
  const htmlRes = await fetch(`${BASE}/semiconductor/korea_semiconductor_map.html?tab=graph`);
  const html = await htmlRes.text();
  const htmlV3 = html.includes('relation_network.js?v=3');
  const htmlV2 = html.includes('relation_network.js?v=2');

  const jsRes = await fetch(`${BASE}/js/relation_network.js?v=3`);
  const js = await jsRes.text();
  const hasReadability = js.includes('READABILITY') && js.includes('computeVisibleGraph') && js.includes('fitAll:');

  return { htmlV3, htmlV2, hasReadability, jsStatus: jsRes.status, htmlStatus: htmlRes.status };
}

for (let i = 1; i <= maxAttempts; i++) {
  const r = await check();
  console.log(`attempt ${i}`, r);
  if (r.htmlV3 && r.hasReadability && !r.htmlV2) {
    console.log('PRODUCTION_READY');
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
console.error('TIMEOUT');
process.exit(1);
