/**
 * Validate structured relation network JSON + patch presence on pilot maps.
 * Phase 2.5 — failures vs warnings, evidence metrics split.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { PILOT_NETWORK_SECTORS, NETWORK_PROFILES } from '../lib/relation_network/profiles.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];

function check(cond, msg, isWarn) {
  if (!cond) (isWarn ? warnings : failures).push(msg);
}

const pilotMaps = {
  semiconductor: 'semiconductor/korea_semiconductor_map.html',
  holdings: 'holdings/korea_holdings_map.html',
  defense: 'defense/korea_defense_map.html',
  bio: 'bio/korea_bio_map.html',
  bigchip: 'bigchip/korea_bigchip_map.html',
  battery: 'battery/korea_battery_map.html',
  ship: 'ship/korea_ship_map.html',
  finance: 'finance/korea_finance_map.html',
  powergrid: 'powergrid/korea_powergrid_map.html',
  nuclear: 'nuclear/korea_nuclear_map.html',
  renewable: 'renewable/korea_renewable_map.html',
  construction: 'construction/korea_construction_map.html',
  auto: 'auto/korea_auto_map.html',
  elec: 'elec/korea_elec_map.html',
};

for (const sector of PILOT_NETWORK_SECTORS) {
  const fp = path.join(ROOT, 'data', 'networks', `${sector}.json`);
  check(fs.existsSync(fp), `missing network JSON: ${sector}.json`);
  if (!fs.existsSync(fp)) continue;

  const network = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const { failures: vFails, warnings: vWarns, summary } = validateNetworkReport(network);

  console.log(`\n${sector}:`);
  console.log(`  nodeCount: ${summary.nodeCount}`);
  console.log(`  edgeCount: ${summary.edgeCount}`);
  console.log(`  statusCounts: ${JSON.stringify(summary.statusCounts)}`);
  console.log(`  typeCounts: ${JSON.stringify(summary.typeCounts)}`);
  console.log(`  evidenceFieldCoverage: ${summary.evidenceFieldCoverage}%`);
  console.log(`  directEvidenceCoverage: ${summary.directEvidenceCoverage}%`);
  console.log(`  primarySourceCoverage: ${summary.primarySourceCoverage}%`);
  console.log(`  staleEdgeCount: ${summary.staleEdgeCount}`);
  console.log(`  orphanListedCompanyCount: ${summary.orphanListedCompanyCount}`);
  if (summary.businessRelationOrphanCount != null) {
    console.log(`  businessRelationOrphanCount: ${summary.businessRelationOrphanCount}`);
    console.log(`  classificationOnlyCompanyCount: ${summary.classificationOnlyCompanyCount}`);
    console.log(`  weakRelationOnlyCompanyCount: ${summary.weakRelationOnlyCompanyCount}`);
  }
  console.log(`  legacyFallback: ${summary.legacyFallback}`);
  if (summary.overusedEvidenceUrls?.length) {
    console.log(`  overusedEvidenceUrls: ${summary.overusedEvidenceUrls.length}`);
  }
  console.log(`  warnings: ${vWarns.length}`);
  console.log(`  failures: ${vFails.length}`);

  vFails.forEach((f) => failures.push(`${sector}: ${f}`));
  vWarns.forEach((w) => warnings.push(`${sector}: ${w}`));

  const profile = NETWORK_PROFILES[sector];
  if (profile?.defaultViewFilters?.transactionalOnly) {
    const peerActive = (network.edges || []).filter((e) => e.type === 'peer' && !e.defaultHidden);
    check(peerActive.length === 0, `${sector}: peer edges should be defaultHidden`, true);
  }

  if (sector === 'defense') {
    const exports = (network.edges || []).filter((e) => e.type === 'export_contract');
    for (const e of exports) {
      check(
        e.source.includes('program:') || e.target.includes('program:'),
        `defense export_contract ${e.id} missing program node`,
        true,
      );
    }
  }

  if (sector === 'holdings') {
    for (const e of network.edges || []) {
      if (e.type === 'controls' && e.status === 'confirmed') {
        check(Array.isArray(e.evidence) && e.evidence.length, `holdings controls ${e.id} missing evidence`);
      }
      if (e.type === 'group_member' && e.status === 'controls') {
        failures.push(`holdings: edge ${e.id} group_member mislabeled as controls`);
      }
    }
  }

  const transactional = (network.edges || []).filter((e) => e.status === 'confirmed' || e.status === 'reported');
  for (const e of transactional) {
    if (!e.evidence?.length) failures.push(`${sector}: transactional edge ${e.id} has no evidence`);
    for (const ev of e.evidence || []) {
      if (!ev.reviewStatus) warnings.push(`${sector}: edge ${e.id} evidence missing reviewStatus`);
    }
  }
}

for (const [sector, rel] of Object.entries(pilotMaps)) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  check(html.includes('relation_network.js'), `${rel} missing relation_network.js`);
  check(html.includes('id="rn-model-desc"'), `${rel} missing model desc UI`);
  check(html.includes('id="rn-detail-panel"'), `${rel} missing detail panel`);
  check(html.includes('id="rn-legend"'), `${rel} missing legend`, true);
  if (sector === 'bio') {
    const inline = fs.readFileSync(path.join(ROOT, 'bio/bio_inline_tail.js'), 'utf8');
    check(inline.includes('RelationNetwork v2'), 'bio_inline_tail.js missing v2 graph delegation');
  } else {
    check(html.includes('RelationNetwork v2'), `${rel} missing v2 graph delegation`);
  }
}

const pg = fs.readFileSync(path.join(ROOT, 'powergrid/korea_powergrid_map.html'), 'utf8');
check(pg.includes('relation_network_legacy.js'), 'powergrid missing legacy adapter');

const robot = fs.readFileSync(path.join(ROOT, 'robot/korea_robot_map.html'), 'utf8');
check(!robot.includes('<body data-sector="semi">'), 'robot still has data-sector=semi');
check(robot.includes('data-sector="robot"'), 'robot missing data-sector=robot');

console.log('\nRelation network verification');
console.log('failures:', failures.length);
console.log('warnings:', warnings.length);
failures.forEach((f) => console.log(' FAIL', f));
warnings.slice(0, 20).forEach((w) => console.log(' WARN', w));
process.exit(failures.length ? 1 : 0);
