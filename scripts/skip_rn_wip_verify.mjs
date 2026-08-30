/**
 * Temporary no-op while relation network graph tab is WIP (RN_WIP in relation_network.js).
 * Usage: node scripts/skip_rn_wip_verify.mjs [label]
 */
const label = process.argv[2] || 'relation-network verify';
console.log(`SKIP ${label} — RN_WIP (graph tab disabled; restore RN_WIP=false to re-enable)`);
process.exit(0);
