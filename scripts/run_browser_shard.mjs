/** Usage: node scripts/run_browser_shard.mjs a|b|c|d */
const shard = String(process.argv[2] || '').toLowerCase();
if (!['a', 'b', 'c', 'd'].includes(shard)) {
  console.error('Usage: node scripts/run_browser_shard.mjs a|b|c|d');
  process.exit(2);
}
process.env.RN_BROWSER_SHARD = shard;
process.env.RN_BROWSER_RELEASE = '1';
process.env.RN_BROWSER_CONCURRENCY = process.env.RN_BROWSER_CONCURRENCY || '1';
delete process.env.RN_TEST_ONLY;
delete process.env.RN_TEST_QUICK;
await import('./verify_relation_browser.mjs');
