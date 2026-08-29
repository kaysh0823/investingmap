/**
 * Phase 6 — build relation network release inventory + integrity + cross-sector audits.
 * Read-only against network JSON / HTML / profiles (no relationship enrichment).
 */
import fs from 'fs';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { NETWORK_PROFILES, PILOT_NETWORK_SECTORS } from '../lib/relation_network/profiles.mjs';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';
import { allowedEdgeTypes, resolveSectorKey } from '../lib/relation_network/schema.mjs';
import { extractCompaniesFromHtml, countKoreanTickersInHtml } from '../lib/map_company_serialize.mjs';
import { validateCoverageMetric } from '../lib/relation_network/coverage_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_OF = new Date().toISOString().slice(0, 10);

const HTML_BY_SECTOR = {
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
  metal: 'metal/korea_metal_map.html',
  cosmetics: 'cosmetics/korea_cosmetics_map.html',
  kconsume: 'kconsume/korea_kconsume_map.html',
  kcontent: 'kcontent/korea_kcontent_map.html',
  medtech: 'medtech/korea_medtech_map.html',
  software: 'software/korea_software_map.html',
  telecom: 'telecom/korea_telecom_map.html',
  robot: 'robot/korea_robot_map.html',
};

const VERIFIER_BY_SECTOR = {
  semiconductor: 'verify:semi-relations',
  bigchip: 'verify:bigchip',
  battery: 'verify:battery',
  ship: 'verify:ship',
  finance: 'verify:finance',
  powergrid: 'verify:powergrid',
  nuclear: 'verify:nuclear',
  renewable: 'verify:renewable',
  construction: 'verify:construction',
  auto: 'verify:auto',
  elec: 'verify:elec',
  metal: 'verify:metal',
  cosmetics: 'verify:cosmetics',
  kconsume: 'verify:kconsume',
  kcontent: 'verify:kcontent',
  medtech: 'verify:medtech',
  software: 'verify:software',
  telecom: 'verify:telecom',
  robot: 'verify:robot',
  holdings: 'verify:relation-network',
  defense: 'verify:relation-network',
  bio: 'verify:relation-network',
};

const CHECKPOINT_BY_SECTOR = {
  semiconductor: 'phase4', holdings: 'phase4', defense: 'phase4', bio: 'phase4',
  bigchip: 'phase3a', battery: 'phase3b', ship: 'phase3c', finance: 'phase3d',
  powergrid: 'phase4a', nuclear: 'phase4b', renewable: 'phase4c',
  construction: 'phase5a', auto: 'phase5b', elec: 'phase5c', metal: 'phase5d',
  cosmetics: 'phase5e', kconsume: 'phase5f', kcontent: 'phase5f',
  medtech: 'phase5g', software: 'phase5h', telecom: 'phase5h', robot: 'phase5i',
};

const FORBIDDEN_GENERIC = [
  'robot:item', 'product:item', 'component:item', 'technology:item', 'application:item',
  'market:item', 'partner:item', 'software:item', 'platform:item', 'service:item',
  'brand:item', 'device:item', 'asset:item',
];

const inventoryFailures = [];
const integrityFailures = [];
const integrityWarnings = [];
const sectors = [];
const crossSectorRows = [];

function hashFile(fp) {
  return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
}

function readHtmlSector(htmlPath) {
  const fp = join(ROOT, htmlPath);
  if (!fs.existsSync(fp)) return null;
  const html = fs.readFileSync(fp, 'utf8');
  const m = html.match(/data-sector="([^"]+)"/);
  return { html, dataSector: m ? m[1] : null, listed: countKoreanTickersInHtml(html) };
}

for (const sectorId of [...PILOT_NETWORK_SECTORS].sort()) {
  const profile = NETWORK_PROFILES[sectorId];
  const htmlPath = HTML_BY_SECTOR[sectorId] || null;
  const netRel = profile?.networkPath || null;
  const netFile = netRel
    ? (netRel.startsWith('../') ? netRel.replace(/^\.\.\//, '') : netRel)
    : `data/networks/${sectorId}.json`;
  const netFp = join(ROOT, netFile);
  const exists = fs.existsSync(netFp);
  const network = exists ? JSON.parse(fs.readFileSync(netFp, 'utf8')) : null;
  const htmlInfo = htmlPath ? readHtmlSector(htmlPath) : null;
  const report = network ? validateNetworkReport(network) : null;
  const metrics = network?.metrics || {};
  const listedFromHtml = htmlInfo?.listed ?? null;
  const listedFromNet = (network?.nodes || []).filter((n) => n.type === 'listed_company' && n.isMapConstituent !== false).length;

  if (!profile) inventoryFailures.push(`${sectorId}: missing profile`);
  if (!htmlPath || !htmlInfo) inventoryFailures.push(`${sectorId}: missing HTML`);
  if (!netRel) inventoryFailures.push(`${sectorId}: networkPath null`);
  if (!exists) inventoryFailures.push(`${sectorId}: missing JSON ${netFile}`);
  if (network?._legacyFallback === true) inventoryFailures.push(`${sectorId}: legacyFallback true`);
  if (htmlInfo && profile && htmlInfo.dataSector !== profile.dataSector
    && !(sectorId === 'semiconductor' && htmlInfo.dataSector === 'semi')) {
    inventoryFailures.push(`${sectorId}: data-sector=${htmlInfo.dataSector} vs profile=${profile.dataSector}`);
  }
  if (listedFromHtml != null && listedFromNet !== listedFromHtml) {
    const known = new Set(['bigchip', 'bio', 'holdings']);
    if (!known.has(sectorId)) {
      integrityWarnings.push(`${sectorId}: html listed ${listedFromHtml} vs network constituents ${listedFromNet}`);
    }
  }

  // integrity
  if (network) {
    const nodes = network.nodes || [];
    const edges = network.edges || [];
    const ids = new Set();
    const tickers = new Set();
    for (const n of nodes) {
      if (!n.id) integrityFailures.push(`${sectorId}: node missing id`);
      else if (ids.has(n.id)) integrityFailures.push(`${sectorId}: duplicate node ${n.id}`);
      else ids.add(n.id);
      if (FORBIDDEN_GENERIC.includes(n.id)) integrityFailures.push(`${sectorId}: generic ID ${n.id}`);
      if (n.type === 'listed_company' && n.ticker) {
        if (tickers.has(n.ticker)) integrityFailures.push(`${sectorId}: duplicate ticker ${n.ticker}`);
        tickers.add(n.ticker);
      }
      if (n.type === 'global_company' && n.ticker && /^\d{6}$/.test(String(n.ticker))) {
        integrityFailures.push(`${sectorId}: global node has KR ticker ${n.id}`);
      }
    }
    const edgeIds = new Set();
    const edgeKeys = new Set();
    const allowed = new Set(allowedEdgeTypes(resolveSectorKey(network)));
    for (const e of edges) {
      if (!e.id) integrityFailures.push(`${sectorId}: edge missing id`);
      else if (edgeIds.has(e.id)) integrityFailures.push(`${sectorId}: duplicate edge id ${e.id}`);
      else edgeIds.add(e.id);
      if (!ids.has(e.source) || !ids.has(e.target)) {
        integrityFailures.push(`${sectorId}: edge ${e.id} missing endpoint`);
      }
      const k = `${e.source}|${e.type}|${e.target}`;
      if (edgeKeys.has(k)) integrityFailures.push(`${sectorId}: duplicate edge key ${k}`);
      edgeKeys.add(k);
      if (allowed.size && e.type && !allowed.has(e.type)) {
        integrityWarnings.push(`${sectorId}: edge type ${e.type} not in sector allowlist (${e.id})`);
      }
      if ((e.type === 'peer' || e.status === 'peer' || e.status === 'inferred' || e.status === 'ended')
        && e.defaultHidden !== true && e.status !== 'reference') {
        if (e.type === 'peer' || e.status === 'peer' || e.status === 'inferred' || e.status === 'ended') {
          integrityFailures.push(`${sectorId}: ${e.id} peer/inferred/ended must be defaultHidden`);
        }
      }
      if (e.type === 'cross_sector_reference') {
        crossSectorRows.push({
          sourceSector: sectorId,
          targetSector: e.owningSector || (String(e.target).startsWith('sector:') ? String(e.target).slice(7) : null),
          sourceEntity: e.source,
          targetReference: e.target,
          reason: e.noteEn || e.noteKo || e.labelEn || e.labelKo || null,
          owningSector: e.owningSector || null,
          duplicateBusinessCountExcluded: e.duplicateBusinessCountExcluded === true,
          excludesFromBusinessCoverage: e.excludesFromBusinessCoverage === true,
          excludesFromOrphanResolution: e.excludesFromOrphanResolution === true,
          correspondingBusinessEdgeIds: e.correspondingBusinessEdgeIds || [],
          duplicateConfirmedCount: (e.status === 'confirmed' || e.status === 'reported') ? 1 : 0,
          edgeId: e.id,
          status: e.status,
        });
        if (e.status === 'confirmed' || e.status === 'reported') {
          integrityFailures.push(`${sectorId}: cross_sector_reference ${e.id} must not be confirmed/reported business`);
        }
        if (e.excludesFromBusinessCoverage !== true || e.excludesFromOrphanResolution !== true) {
          integrityWarnings.push(`${sectorId}: xref ${e.id} missing exclusion flags`);
        }
      }
      if ((e.type === 'owns' || e.type === 'owns_stake_in') && e.status === 'confirmed') {
        if (e.stakePct == null || !e.asOf) {
          integrityFailures.push(`${sectorId}: confirmed ownership ${e.id} missing stakePct/asOf`);
        }
      }
      for (const ev of e.evidence || []) {
        if (ev.directEvidence === true) {
          if (ev.sourceOpened === false || !ev.reviewedAt || !ev.reviewedBy || ev.reviewStatus !== 'reviewed') {
            // many sectors use structural evidence with directEvidence false; only fail if claimed true without metadata
            if (ev.reviewStatus === 'reviewed' || ev.directEvidence === true) {
              if (!ev.reviewedAt || !ev.reviewedBy) {
                integrityWarnings.push(`${sectorId}: ${e.id} directEvidence without full review metadata`);
              }
            }
          }
        }
        if (ev.primarySource === true && /news|press|portal|media|blog/i.test(String(ev.sourceType || ''))) {
          integrityFailures.push(`${sectorId}: ${e.id} primarySource on press/portal`);
        }
      }
    }
    const cc = metrics.claimCoverage || {};
    for (const [key, val] of Object.entries(cc)) {
      if (key === 'metricNotes' || !val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `${sectorId}.${key}`);
      if (err) integrityFailures.push(err);
      if (val.denominator === 0 && (val.percentage === 1 || val.percentage === 100 || val.displayValue === '100%')) {
        integrityFailures.push(`${sectorId}.${key}: 0/0 as 100%`);
      }
      if (typeof val.numerator === 'number' && typeof val.denominator === 'number' && val.numerator > val.denominator) {
        integrityFailures.push(`${sectorId}.${key}: numerator>denominator`);
      }
    }
    if (report?.failures?.length) {
      for (const f of report.failures) integrityFailures.push(`${sectorId} validate: ${f}`);
    }
  }

  sectors.push({
    sectorId,
    htmlPath,
    dataSector: profile?.dataSector || htmlInfo?.dataSector || null,
    profileId: sectorId,
    networkPath: netRel,
    networkFile: netFile,
    model: profile?.model || network?.model || null,
    layout: profile?.layout || network?.layout || null,
    listedCompanyCount: listedFromHtml ?? listedFromNet,
    nodeCount: network?.nodes?.length ?? 0,
    edgeCount: network?.edges?.length ?? 0,
    confirmedBusinessEdgeCount: metrics.confirmedBusinessEdgeCount ?? null,
    reportedBusinessEdgeCount: metrics.reportedBusinessEdgeCount ?? null,
    legacyFallback: network ? network._legacyFallback === true : null,
    verifierScript: VERIFIER_BY_SECTOR[sectorId] || null,
    browserTestIncluded: true,
    jsonHash: exists ? hashFile(netFp) : null,
    lastCheckpoint: CHECKPOINT_BY_SECTOR[sectorId] || null,
    warnings: report?.warnings?.length ?? 0,
    knownHumanReviewCount: (network?.edges || []).filter((e) => (e.evidence || []).some((ev) => ev.reviewStatus === 'needs_human_review')).length,
    validateFailures: report?.failures?.length ?? 0,
  });
}

// orphan JSON files
const netDir = join(ROOT, 'data/networks');
for (const f of fs.readdirSync(netDir).filter((x) => x.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '');
  if (!PILOT_NETWORK_SECTORS.has(id) && !['holdings'].includes(id)) {
    // still list if not in pilot — flag isolated
    if (![...PILOT_NETWORK_SECTORS].includes(id)) {
      integrityWarnings.push(`orphan network file without pilot registry: ${f}`);
    }
  }
}

const inventory = {
  asOf: AS_OF,
  phase: 6,
  sectorCount: sectors.length,
  networkPathNullCount: sectors.filter((s) => !s.networkPath).length,
  legacyFallbackTrueCount: sectors.filter((s) => s.legacyFallback === true).length,
  inventoryFailures,
  integrityFailureCount: integrityFailures.length,
  integrityWarningCount: integrityWarnings.length,
  totals: {
    listed: sectors.reduce((n, s) => n + (s.listedCompanyCount || 0), 0),
    nodes: sectors.reduce((n, s) => n + (s.nodeCount || 0), 0),
    edges: sectors.reduce((n, s) => n + (s.edgeCount || 0), 0),
    confirmed: sectors.reduce((n, s) => n + (s.confirmedBusinessEdgeCount || 0), 0),
    reported: sectors.reduce((n, s) => n + (s.reportedBusinessEdgeCount || 0), 0),
  },
  sectors,
};

const xrefBizDup = crossSectorRows.filter((r) => r.duplicateConfirmedCount > 0);
const crossAudit = {
  asOf: AS_OF,
  phase: 6,
  crossSectorReferenceCount: crossSectorRows.length,
  duplicateConfirmedBusinessCount: xrefBizDup.length,
  missingExclusionFlagCount: crossSectorRows.filter((r) => !r.excludesFromBusinessCoverage || !r.excludesFromOrphanResolution).length,
  rows: crossSectorRows,
  integrityFailures: xrefBizDup.map((r) => `${r.sourceSector}: confirmed xref ${r.edgeId}`),
};

const integrityReport = {
  asOf: AS_OF,
  phase: 6,
  failures: integrityFailures,
  warnings: integrityWarnings.slice(0, 200),
  warningTotal: integrityWarnings.length,
  pass: integrityFailures.length === 0 && inventoryFailures.length === 0,
};

fs.writeFileSync(join(ROOT, 'data/relation_network_release_inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
fs.writeFileSync(join(ROOT, 'data/relation_network_cross_sector_audit.json'), `${JSON.stringify(crossAudit, null, 2)}\n`);
fs.writeFileSync(join(ROOT, 'data/relation_network_release_integrity.json'), `${JSON.stringify(integrityReport, null, 2)}\n`);

console.log(JSON.stringify({
  sectors: sectors.length,
  networkPathNull: inventory.networkPathNullCount,
  legacyTrue: inventory.legacyFallbackTrueCount,
  inventoryFailures: inventoryFailures.length,
  integrityFailures: integrityFailures.length,
  integrityWarnings: integrityWarnings.length,
  xref: crossSectorRows.length,
  xrefConfirmedDup: xrefBizDup.length,
  totals: inventory.totals,
}, null, 2));

if (inventoryFailures.length || integrityFailures.length) process.exitCode = 1;
