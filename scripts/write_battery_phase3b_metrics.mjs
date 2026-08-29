/**
 * Write Phase 3B orphan / relation-density metrics for battery (no edge mutation).
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { computeListedRelationOrphanMetrics } from '../lib/relation_network/orphan_metrics.mjs';
import { validateNetworkReport } from '../lib/relation_network/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NET = join(ROOT, 'data', 'networks', 'battery.json');
const OUT = join(ROOT, 'data', 'battery_relation_phase3b_metrics.json');

const network = JSON.parse(fs.readFileSync(NET, 'utf8'));
const orphan = computeListedRelationOrphanMetrics(network);
const report = validateNetworkReport(network);

const edges = network.edges || [];
const byOrigin = {};
for (const e of edges) {
  const o = e.edgeOrigin || 'unknown';
  byOrigin[o] = (byOrigin[o] || 0) + 1;
}

const payload = {
  asOf: '2026-08-23',
  sectorId: 'battery',
  note: 'Orphan metrics split: classic orphanListedCompanyCount==0 can hide business-relation gaps when member_of/produces/exposed_to exist.',
  listedCompanyCount: orphan.listedCompanyCount,
  structuralOrphanCount: orphan.structuralOrphanCount,
  businessRelationOrphanCount: orphan.businessRelationOrphanCount,
  directRelationshipOrphanCount: orphan.directRelationshipOrphanCount,
  classificationOnlyCompanyCount: orphan.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: orphan.weakRelationOnlyCompanyCount,
  orphanListedCompanyCount: orphan.orphanListedCompanyCount,
  edgeOriginCounts: byOrigin,
  statusCounts: report.summary.statusCounts,
  typeCounts: report.summary.typeCounts,
  evidenceFieldCoverage: report.summary.evidenceFieldCoverage,
  directEvidenceCoverage: report.summary.directEvidenceCoverage,
  primarySourceCoverage: report.summary.primarySourceCoverage,
  details: orphan.details,
  validateFailures: report.failures.length,
  validateWarnings: report.warnings.length,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  structuralOrphanCount: payload.structuralOrphanCount,
  businessRelationOrphanCount: payload.businessRelationOrphanCount,
  directRelationshipOrphanCount: payload.directRelationshipOrphanCount,
  classificationOnlyCompanyCount: payload.classificationOnlyCompanyCount,
  weakRelationOnlyCompanyCount: payload.weakRelationOnlyCompanyCount,
  orphanListedCompanyCount: payload.orphanListedCompanyCount,
  out: OUT,
}, null, 2));
