const urls = [
  'https://www.investingmap.kr/js/relation_network.js',
  'https://www.investingmap.kr/js/relation_network.js?v=1',
  'https://www.investingmap.kr/js/relation_network.js?v=2',
];
for (const url of urls) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  console.log(url, {
    status: res.status,
    len: text.length,
    hasSetup: text.includes('setupWorkspaceLayout'),
    hasDrawer: text.includes('rn-filter-drawer-toggle'),
    etag: res.headers.get('etag'),
    cfCache: res.headers.get('cf-cache-status'),
  });
}
