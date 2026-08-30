const hosts = [
  'https://www.investingmap.kr/',
  'https://www.investingmap.kr/',
  'https://www.investingmap.kr/',
];

for (const h of hosts) {
  try {
    const r = await fetch(h, { redirect: 'follow' });
    const html = await r.text();
    const semi = await fetch(new URL('/semiconductor/korea_semiconductor_map.html', h).href);
    const semiHtml = await semi.text();
    console.log(JSON.stringify({
      host: h,
      status: r.status,
      finalUrl: r.url,
      homeHasRelationNetwork: /relation_network\.js/.test(html),
      semiStatus: semi.status,
      semiFinalUrl: semi.url,
      semiV1: (semiHtml.match(/relation_network\.js\?v=1/g) || []).length,
      semiV2: (semiHtml.match(/relation_network\.js\?v=2/g) || []).length,
      semiV3: (semiHtml.match(/relation_network\.js\?v=3/g) || []).length,
    }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ host: h, error: e.message }));
  }
}
