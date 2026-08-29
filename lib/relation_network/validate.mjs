/**
 * Relation network validation — failures vs warnings, evidence metrics.
 */
import fs from 'fs';
import {
  allowedEdgeTypes,
  isUndirectedEdgeType,
  isTransactionalStatus,
  meetsConfirmedRequirements,
  resolveSectorKey,
} from './schema.mjs';
import { auditEdgeEvidence, aggregateEvidenceMetrics } from './evidence_audit.mjs';
import { auditEntityIssues } from './entity_normalize.mjs';
import { computeListedRelationOrphanMetrics, DIRECT_RELATION_EDGE_TYPES, STRUCTURAL_EDGE_TYPES, COMPANY_OR_PROJECT_TYPES } from './orphan_metrics.mjs';
import { validateCoverageMetric } from './coverage_metrics.mjs';

const TICKER_RE = /^[0-9A-Z]{6}$/;

const ENDED_CONTRACT_STATUSES = new Set(['completed', 'cancelled', 'terminated', 'ended']);

const WEAK_URL_PATTERNS = [
  /^https?:\/\/[^/?#]+\/?$/,
  /ftc\.go\.kr\/www\/selectReport\.do\?key=/,
  /\/press\/?$/,
];

function countBy(arr, keyFn) {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

/**
 * @param {object} network
 * @returns {{ failures: string[], warnings: string[], summary: object }}
 */
export function validateNetworkReport(network) {
  const failures = [];
  const warnings = [];
  const fail = (m) => failures.push(m);
  const warn = (m) => warnings.push(m);

  if (!network || typeof network !== 'object') {
    return { failures: ['network must be an object'], warnings: [], summary: {} };
  }

  const sectorKey = resolveSectorKey(network);
  const allowed = new Set(allowedEdgeTypes(sectorKey));
  const nodeMap = new Map();
  const edgeIds = new Set();
  const edgeTriples = new Set();
  const reverseTransactional = new Set();
  const today = new Date().toISOString().slice(0, 10);
  const edges = network.edges || [];
  const nodes = network.nodes || [];

  for (const n of nodes) {
    if (!n.id) fail(`node missing id (${n.nameKo || '?'})`);
    if (!n.nameKo || !n.nameEn) fail(`node ${n.id} missing ko/en name`);
    if (n.type === 'listed_company' && n.ticker && !TICKER_RE.test(String(n.ticker))) {
      fail(`node ${n.id} bad ticker ${n.ticker}`);
    }
    if (n.id) nodeMap.set(n.id, n);
  }

  const listedIds = [...nodeMap.values()]
    .filter((n) => n.type === 'listed_company')
    .map((n) => n.id);

  const degree = new Map(listedIds.map((id) => [id, 0]));
  const statusCounts = {};
  const typeCounts = {};
  let legacyFallback = 0;
  /** @type {Map<string, { count: number, edges: object[], rosterEligible: boolean }>} */
  const urlUsage = new Map();

  for (const e of edges) {
    statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    if (e._legacy) legacyFallback += 1;

    if (!e.id) fail('edge missing id');
    if (e.id && edgeIds.has(e.id)) fail(`duplicate edge id ${e.id}`);
    if (e.id) edgeIds.add(e.id);

    if (!nodeMap.has(e.source)) fail(`edge ${e.id} source missing: ${e.source}`);
    if (!nodeMap.has(e.target)) fail(`edge ${e.id} target missing: ${e.target}`);
    if (e.source === e.target) fail(`edge ${e.id} self-loop`);
    if (!allowed.has(e.type)) fail(`edge ${e.id} type "${e.type}" not allowed for ${sectorKey}`);

    const triple = `${e.source}|${e.target}|${e.type}`;
    if (edgeTriples.has(triple)) fail(`duplicate edge triple ${triple}`);
    edgeTriples.add(triple);

    if (e.type === 'supplies_to') {
      const rev = `${e.target}|${e.source}|customer_of`;
      if (edgeTriples.has(rev)) warn(`supplies_to/customer_of reverse duplicate near ${e.id}`);
      reverseTransactional.add(`${e.source}|${e.target}`);
    }

    if (e.status === 'confirmed') {
      const chk = meetsConfirmedRequirements(e);
      if (!chk.ok) {
        fail(`confirmed edge ${e.id} fails review gate: ${chk.issues.join(', ')}`);
      }
    }

    if (isTransactionalStatus(e.status)) {
      if (!Array.isArray(e.evidence) || !e.evidence.length) {
        fail(`confirmed/reported edge ${e.id} missing evidence`);
      } else {
        for (const ev of e.evidence) {
          if (!ev.url || !/^https?:\/\//.test(ev.url)) fail(`edge ${e.id} evidence missing URL`);
          if (!ev.title) fail(`edge ${e.id} evidence missing title`);
          if (!ev.sourceType) warn(`edge ${e.id} evidence missing sourceType`);
          if (!ev.publishedAt && !ev.accessedAt) warn(`edge ${e.id} evidence missing date`);
          if (WEAK_URL_PATTERNS.some((re) => re.test(ev.url))) {
            if (e.status === 'confirmed') fail(`confirmed edge ${e.id} weak evidence URL: ${ev.url}`);
            else warn(`edge ${e.id} weak evidence URL: ${ev.url}`);
          }
          const slot = urlUsage.get(ev.url) || { count: 0, edges: [], rosterEligible: true };
          slot.count += 1;
          slot.edges.push(e);
          const rosterOk = ev.evidenceUsageType === 'official_roster'
            && ev.evidenceScope === 'multiple_entities'
            && (e.type === 'group_member' || e.type === 'affiliated_with');
          if (!rosterOk) slot.rosterEligible = false;
          urlUsage.set(ev.url, slot);
        }
      }
    }

    if (e.status === 'peer' && e.type !== 'peer') {
      warn(`edge ${e.id} status peer but type ${e.type}`);
    }

    if (e.type === 'peer' && (e.evidence || []).length) {
      warn(`peer edge ${e.id} should not carry transactional evidence`);
    }

    if (e.type === 'prime_contractor') {
      const url = (e.evidence || [])[0]?.url || '';
      if (/\/product\//i.test(url) || /\/Business\/Defense\/Product/i.test(url) || /VIRTUAL_EX\/PDF/i.test(url)) {
        warn(`prime_contractor ${e.id} evidence looks like product page only — consider manufactures/develops`);
      }
    }

    if (e.type === 'controls' && sectorKey === 'holdings') {
      if (e.stakePct == null) warn(`holdings controls ${e.id} stakePct not verified (null OK)`);
      if (!e.asOf && !e.lastVerifiedAt) warn(`holdings controls ${e.id} missing asOf/lastVerifiedAt`);
    }
    if (e.type === 'owns' && sectorKey === 'holdings' && e.stakePct == null) {
      warn(`holdings owns ${e.id} stakePct not verified (null OK)`);
    }

    if (e.status === 'confirmed' && e.type === 'export_contract' && !e.source?.includes('program:') && !e.target?.includes('program:')) {
      warn(`defense export_contract ${e.id} missing program node in path`);
    }

    if (!e.lastVerifiedAt && isTransactionalStatus(e.status)) {
      warn(`edge ${e.id} missing lastVerifiedAt`);
    }

    if (e.validTo && e.validTo < today && e.status === 'confirmed') {
      fail(`edge ${e.id} ended but still confirmed`);
    }

    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);

    // Transactional reported without evidence URL → fail or demote path
    if (isTransactionalStatus(e.status) && e.edgeOrigin === 'legacyMigrated' && (!e.evidence || !e.evidence.length)) {
      if (e.type === 'owns') {
        warn(`battery owns ${e.id} missing evidence/stakePct — human review`);
      }
    }

    if (e.type === 'participates_in' || e.type === 'joint_venture') {
      const jvId = e.target.startsWith('jv:') ? e.target : (e.source.startsWith('jv:') ? e.source : null);
      if (jvId) {
        const participants = edges.filter((x) =>
          (x.type === 'participates_in' || x.type === 'owns') && (x.target === jvId || x.source === jvId));
        if (participants.length < 2) warn(`JV ${jvId} has fewer than 2 participant edges`);
      }
    }

    if (isUndirectedEdgeType(e.type) && e.direction && e.direction !== 'undirected') {
      warn(`undirected type ${e.type} on ${e.id} has direction ${e.direction}`);
    }
  }

  if (sectorKey === 'battery') {
    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`battery KR ticker on global_company ${n.id}`);
      }
    }
    const jvs = nodes.filter((n) => n.type === 'joint_venture');
    for (const jv of jvs) {
      const parts = edges.filter((e) =>
        (e.type === 'participates_in' || e.type === 'owns') && (e.target === jv.id || e.source === jv.id));
      if (parts.length < 2) warn(`battery JV ${jv.id} participants=${parts.length}`);
    }
  }

  if (sectorKey === 'ship') {
    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`ship KR ticker on global_company ${n.id}`);
      }
      if (n.isAnonymousCounterparty && n.type === 'listed_company') {
        fail(`ship anonymous counterparty must not be listed_company ${n.id}`);
      }
    }
    const contracts = nodes.filter((n) => n.type === 'order_contract' || n.type === 'vessel_project');
    for (const c of contracts) {
      const yardLink = edges.some((e) =>
        (e.source === c.id || e.target === c.id)
        && (e.type === 'awarded_to' || e.type === 'built_by'));
      if (!yardLink) warn(`ship contract ${c.id} missing awarded_to/built_by yard link`);
      if (c.contractValue != null && !c.currency) warn(`ship contract ${c.id} has value without currency`);
      if (c.vesselCount != null && c.vesselCount < 0) fail(`ship contract ${c.id} negative vesselCount`);
    }
    const ids = new Set();
    for (const c of contracts) {
      if (ids.has(c.id)) fail(`ship duplicate contract id ${c.id}`);
      ids.add(c.id);
    }
    for (const e of edges) {
      if (String(e.type).startsWith('supplies_') && e.status === 'confirmed') {
        const hasProductPageOnly = (e.evidence || []).every((ev) => /product|catalog/i.test(ev.url || ''));
        if (hasProductPageOnly && (e.evidence || []).length) {
          fail(`ship ${e.id}: product page cannot prove supply contract`);
        }
      }
      if ((e.status === 'ended' || e.contractStatus === 'delivered') && e.defaultHidden === false) {
        warn(`ship completed/ended edge ${e.id} should be defaultHidden`);
      }
    }
  }

  if (sectorKey === 'finance') {
    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`finance KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'domestic_unlisted_company') {
        if (n.ticker) fail(`finance unlisted ${n.id} must not have ticker`);
        if (n.mcapWon != null) fail(`finance unlisted ${n.id} must not have mcapWon`);
      }
      if ((n.type === 'category' || n.type === 'corporate_group') && n.mcapWon != null) {
        fail(`finance ${n.type} ${n.id} must not have mcapWon`);
      }
      if (n.type === 'listed_company' && n.isListedKorea && !n.ticker) {
        fail(`finance listed company ${n.id} missing ticker`);
      }
      if (/금융네트웍스|financial.?network/i.test(String(n.nameKo || '') + String(n.nameEn || ''))) {
        warn(`finance brand-like node ${n.id} — verify legal entity`);
      }
    }
    for (const e of edges) {
      if (e.type === 'owns' || e.type === 'equity_investment' || e.type === 'controls') {
        if (!(e.evidence || []).length) {
          if (e.status === 'confirmed' || e.status === 'reported') fail(`finance ${e.id} owns missing evidence`);
          else warn(`finance ${e.id} owns missing evidence`);
        }
        if (!e.asOf && !e.sourceDocumentDate) {
          if (e.status === 'confirmed') fail(`finance confirmed owns ${e.id} missing asOf`);
          else warn(`finance ownership ${e.id} missing asOf`);
        }
        if (e.status === 'confirmed' && e.stakePct == null && !(e.evidence || []).length) {
          fail(`finance confirmed owns ${e.id} missing stakePct and subsidiary evidence`);
        }
        if (e.status === 'confirmed') {
          const hasDirect = (e.evidence || []).some((ev) => ev.directEvidence === true);
          if (!hasDirect) fail(`finance confirmed owns ${e.id} directEvidence=false`);
        }
        if (e.stakePct != null && (e.stakePct < 0 || e.stakePct > 100)) {
          fail(`finance ${e.id} stakePct out of range`);
        }
        if (e.stakePct === 0) warn(`finance ${e.id} stakePct is 0 — prefer null if unknown`);
        if ((e.ownershipKind === 'indirect' || e.directOrIndirect === 'indirect') && !e.intermediateNodeId) {
          fail(`finance indirect ownership ${e.id} missing intermediateNodeId`);
        }
        if ((e.status === 'reference' || e.status === 'inferred') && e.defaultHidden === false) {
          warn(`finance weak owns ${e.id} should be defaultHidden`);
        }
        const rev = edges.find((x) =>
          x.source === e.target && x.target === e.source && x.type === 'subsidiary_of');
        if (rev) fail(`finance owns/subsidiary_of reverse duplicate near ${e.id}`);
        const evs = e.evidence || [];
        const onlyHome = evs.length && evs.every((ev) => {
          try {
            const u = new URL(ev.url || '');
            return u.pathname === '/' || u.pathname === '' || /^\/(en|ko|kr|eng)?\/?$/i.test(u.pathname);
          } catch {
            return true;
          }
        });
        if (onlyHome && (e.status === 'confirmed' || e.status === 'reported')) {
          warn(`finance ownership ${e.id} homepage-only evidence`);
        }
      }
      if (e.type === 'group_member') {
        if (e.stakePct != null) fail(`finance group_member ${e.id} must not carry stakePct`);
      }
      if (/customer|loan_client|policyholder|merchant|brokerage_client/i.test(e.type || '')) {
        fail(`finance customer relation forbidden: ${e.id}`);
      }
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (e.type === 'peer' && s?.isListedKorea && t?.isListedKorea) {
        warn(`finance domestic peer mesh edge ${e.id}`);
      }
    }
    const kids = new Map();
    for (const e of edges) {
      if (e.type !== 'owns' && e.type !== 'controls') continue;
      if (e.status !== 'confirmed' && e.status !== 'reported') continue;
      if (!kids.has(e.source)) kids.set(e.source, []);
      kids.get(e.source).push(e.target);
    }
    const visiting = new Set();
    const visited = new Set();
    function dfs(id) {
      if (visiting.has(id)) {
        fail(`finance ownership cycle involving ${id}`);
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const child of kids.get(id) || []) dfs(child);
      visiting.delete(id);
      visited.add(id);
    }
    for (const id of kids.keys()) dfs(id);
  }

  if (sectorKey === 'powergrid') {
    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`powergrid KR ticker on global_company ${n.id}`);
      }
      if ((n.type === 'grid_stage' || n.type === 'equipment_category' || n.type === 'end_market' || n.type === 'region')
        && n.mcapWon != null) {
        fail(`powergrid structural node ${n.id} must not have mcapWon`);
      }
      if (n.isAnonymousCounterparty && n.type === 'listed_company') {
        fail(`powergrid anonymous counterparty must not be listed_company ${n.id}`);
      }
    }
    for (const e of edges) {
      if (e.type === 'manufactures') {
        const t = nodeMap.get(e.target);
        if (t && t.type !== 'equipment_category' && t.type !== 'technology') {
          fail(`powergrid manufactures ${e.id} target must be equipment`);
        }
      }
      if (e.type === 'exposed_to') {
        const t = nodeMap.get(e.target);
        if (t && t.type !== 'end_market') fail(`powergrid exposed_to ${e.id} must target end_market`);
      }
      if (e.type === 'used_in_grid_stage') {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (t?.type !== 'grid_stage' && s?.type !== 'grid_stage') {
          fail(`powergrid used_in_grid_stage ${e.id} must touch grid_stage`);
        }
      }
      if ((e.type === 'supplies_transformer_to' || e.type === 'supplies_cable_to' || e.type === 'awarded_contract')
        && (e.status === 'confirmed' || e.status === 'reported')) {
        const evs = e.evidence || [];
        if (!evs.length) fail(`powergrid ${e.id} missing evidence`);
        const onlyHome = evs.length && evs.every((ev) => {
          try {
            const u = new URL(ev.url || '');
            return u.pathname === '/' || u.pathname === '';
          } catch { return true; }
        });
        if (onlyHome) fail(`powergrid ${e.id} homepage cannot prove award/supply`);
      }
      if (e.target === 'market:data_center' && /supplies_|awarded_/.test(e.type || '')) {
        fail(`powergrid must not use data_center market as customer (${e.id})`);
      }
      if ((e.status === 'peer' || e.type === 'peer' || e.status === 'inferred' || e.status === 'ended')
        && e.defaultHidden === false) {
        warn(`powergrid weak edge ${e.id} should be defaultHidden`);
      }
    }

    const contractNodes = nodes.filter((n) => n.type === 'contract');
    const contractIds = new Set(contractNodes.map((n) => n.id));
    const receiptToContract = new Map();

    for (const c of contractNodes) {
      if (!c.contractId) warn(`powergrid contract ${c.id} missing contractId`);
      if (c.contractStatus === 'letter_of_award' && c.status === 'effective') {
        fail(`powergrid LOA ${c.id} must not use contractStatus letter_of_award with status effective`);
      }
      if (c.contractStatus === 'effective' && c.status === 'letter_of_award') {
        fail(`powergrid ${c.id} LOA badge inconsistent with effective contractStatus`);
      }
      if (c.contractValue != null && !c.currency) {
        fail(`powergrid contract ${c.id} has contractValue but no currency`);
      }
      if (c.contractValueKrwReference != null && !c.fxAsOf) {
        fail(`powergrid contract ${c.id} has FX conversion without fxAsOf`);
      }
      if (c.isAnonymousCounterparty && c.type === 'listed_company') {
        fail(`powergrid anonymous counterparty must not be listed_company ${c.id}`);
      }
      for (const rcp of [c.originalReceiptNo, c.latestReceiptNo, ...(c.correctionReceiptNos || [])]) {
        if (!rcp) continue;
        if (!/^\d{14}$/.test(String(rcp))) fail(`powergrid contract ${c.id} invalid DART receipt ${rcp}`);
        if (receiptToContract.has(rcp) && receiptToContract.get(rcp) !== c.id) {
          fail(`powergrid receipt ${rcp} reused across contracts`);
        }
        receiptToContract.set(rcp, c.id);
      }
      if (c.originalReceiptNo && c.latestReceiptNo && c.originalReceiptNo !== c.latestReceiptNo) {
        if (!c.latestUpdateDate) warn(`powergrid contract ${c.id} correction chain missing latestUpdateDate`);
      }
      if (c.correctionReviewStatus === 'needs_review') {
        warn(`powergrid contract ${c.id} correctionReviewStatus needs_review`);
      }
      if (c.validTo && c.contractStatus === 'effective') {
        const vt = String(c.validTo);
        if (vt < today && !ENDED_CONTRACT_STATUSES.has(c.contractStatus)) {
          warn(`powergrid contract ${c.id} validTo passed but still active status`);
        }
      }

      // Phase 4A.2 — status separation & evidence semantics
      const lifecycle = c.contractStatus || c.status;
      const lifecycleSet = new Set(['letter_of_award', 'announced', 'effective', 'in_delivery', 'completed', 'cancelled', 'terminated', 'unknown']);
      if (lifecycle && !lifecycleSet.has(lifecycle)) {
        fail(`powergrid contract ${c.id} invalid contractStatus ${lifecycle}`);
      }
      if (c.contractStatus && c.status && c.contractStatus !== c.status
        && !['reference', 'reported', 'confirmed'].includes(c.status)) {
        // node.status may mirror lifecycle; editorial status belongs on edges
      }
      const endedFlags = [lifecycle === 'completed', lifecycle === 'cancelled', lifecycle === 'terminated'].filter(Boolean);
      if (endedFlags.length > 1) {
        fail(`powergrid contract ${c.id} has multiple ended lifecycle flags`);
      }
      if (lifecycle === 'completed' && c.statusReview !== 'reviewed' && c.statusReview !== 'needs_review') {
        warn(`powergrid contract ${c.id} completed without statusReview`);
      }
      if (lifecycle === 'completed' && !c.statusReview) {
        warn(`powergrid contract ${c.id} completed by date alone should set statusReview=needs_review`);
      }
      const cpStatus = c.counterpartyStatus;
      if (cpStatus === 'exact' && c.counterpartyDisclosure !== 'named') {
        fail(`powergrid contract ${c.id} counterpartyStatus=exact requires named disclosure`);
      }
      if (cpStatus === 'anonymous' && c.endCustomer && !String(c.endCustomer).startsWith('counterparty:undisclosed')) {
        fail(`powergrid contract ${c.id} anonymous but endCustomer is a real company id`);
      }
      if (cpStatus === 'intermediary_disclosed' && c.endCustomer && !String(c.endCustomer).startsWith('counterparty:undisclosed')
        && c.endCustomer === c.legalCounterparty) {
        warn(`powergrid contract ${c.id} intermediary_disclosed but endCustomer==legalCounterparty`);
      }
      if ((c.correctionReceiptNos || []).includes('20250924800543')) {
        fail(`powergrid contract ${c.id} retains rejected DART receipt 20250924800543`);
      }
    }

    for (const e of edges) {
      if (e.type === 'awarded_contract' && (e.status === 'confirmed' || e.status === 'reported')) {
        if (!contractIds.has(e.target)) fail(`powergrid ${e.id} must target contract node`);
        const evs = e.evidence || [];
        if (!evs.length) fail(`powergrid ${e.id} missing evidence`);
        const badUrl = evs.some((ev) => {
          try {
            const u = new URL(ev.url || '');
            return u.pathname === '/' || u.pathname === '';
          } catch { return true; }
        });
        if (badUrl) fail(`powergrid ${e.id} homepage URL cannot prove contract`);
        for (const ev of evs) {
          if (ev.directEvidence === true) {
            if (ev.reviewStatus !== 'reviewed') {
              fail(`powergrid ${e.id} directEvidence=true requires reviewStatus=reviewed`);
            }
            if (!ev.reviewedAt || !ev.reviewedBy) {
              fail(`powergrid ${e.id} directEvidence=true requires reviewedAt/reviewedBy`);
            }
            if (ev.sourceAccessStatus === 'failed') {
              fail(`powergrid ${e.id} directEvidence=true but sourceAccessStatus=failed`);
            }
            if (ev.sourceAccessStatus && ev.sourceAccessStatus !== 'opened') {
              fail(`powergrid ${e.id} directEvidence=true requires sourceAccessStatus=opened`);
            }
          }
          if (ev.primarySource === true && ev.directEvidence === true && ev.sourceAccessStatus === 'failed') {
            fail(`powergrid ${e.id} primarySource cannot imply directEvidence when access failed`);
          }
        }
        if (e.status === 'confirmed') {
          for (const ev of evs) {
            if (!ev.directEvidence || ev.reviewStatus !== 'reviewed' || !ev.reviewedBy || !ev.reviewedAt) {
              fail(`powergrid confirmed contract edge ${e.id} fails confirmed gate`);
            }
            if (ev.sourceAccessStatus && ev.sourceAccessStatus !== 'opened') {
              fail(`powergrid confirmed contract edge ${e.id} requires opened source access`);
            }
          }
        }
        if (e.status === 'reported') {
          const allPass = evs.length && evs.every((ev) =>
            ev.directEvidence === true
            && ev.reviewStatus === 'reviewed'
            && ev.reviewedBy
            && ev.reviewedAt
            && (!ev.sourceAccessStatus || ev.sourceAccessStatus === 'opened')
            && ev.relationshipSupported);
          if (allPass) {
            warn(`powergrid ${e.id} meets confirmed gate but remains reported`);
          }
        }
      }
      if ((e.type === 'supplies_transformer_to' || e.type === 'supplies_cable_to' || e.type === 'supplies_equipment_to')
        && (e.status === 'reported' || e.status === 'confirmed')
        && e.source.startsWith('krx:')
        && e.target.startsWith('utility:')) {
        fail(`powergrid direct listed→utility supply ${e.id} — use contract path`);
      }
      if ((e.type === 'supplies_transformer_to' || e.type === 'supplies_cable_to')
        && (e.status === 'reported' || e.status === 'confirmed')
        && !e.source.startsWith('contract:')
        && !e.target.startsWith('counterparty:')
        && e.source.startsWith('krx:')) {
        fail(`powergrid ${e.id} direct company supply must be reference or via contract`);
      }
      if (e.status === 'inferred' && (e.type === 'awarded_contract' || /supplies_/.test(e.type || ''))
        && e.defaultHidden === false) {
        warn(`powergrid inferred contract edge ${e.id} should be defaultHidden`);
      }
    }

    const listedTickers = new Set(nodes.filter((n) => n.type === 'listed_company').map((n) => n.ticker));
    for (const n of nodes) {
      if (n.type === 'utility' && n.ticker && listedTickers.has(n.ticker)) {
        fail(`powergrid utility ${n.id} duplicates cp_list listed ticker ${n.ticker}`);
      }
    }
  }

  if (sectorKey === 'nuclear') {
    const PROJECT_STATUSES = new Set([
      'proposed', 'memorandum', 'feasibility_study', 'preferred_bidder', 'selected_bidder',
      'negotiation', 'contract_signed', 'design', 'licensing', 'pre_construction',
      'under_construction', 'commissioning', 'operating', 'completed', 'suspended',
      'cancelled', 'decommissioning', 'unknown',
    ]);
    const PROJECT_ROLE_TYPES = new Set([
      'project_owner', 'project_developer', 'project_operator', 'export_lead',
      'selected_for', 'preferred_bidder_for', 'negotiates_for', 'epc_for',
      'architect_engineer_for', 'designs_for', 'builds', 'commissions', 'operates',
      'maintains', 'decommissions', 'supplies_nsss_to', 'supplies_reactor_to',
      'supplies_turbine_to', 'supplies_equipment_to', 'supplies_ic_to', 'supplies_fuel_to',
      'supplies_service_to', 'consortium_member', 'memorandum_with', 'feasibility_study_for',
    ]);
    const listedTickers = new Set(nodes.filter((n) => n.type === 'listed_company').map((n) => n.ticker));
    const hasPublicKepco = nodes.some((n) => n.id === 'public:kepco');
    const hasKrxKepco = nodes.some((n) => n.id === 'krx:015760');
    if (hasPublicKepco && hasKrxKepco) fail('nuclear KEPCO duplicate public:kepco and krx:015760');
    if (hasPublicKepco && !hasKrxKepco) fail('nuclear KEPCO must use canonical krx:015760');

    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`nuclear KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'public_corporation' && n.ticker && listedTickers.has(n.ticker)) {
        fail(`nuclear public ${n.id} duplicates listed ticker ${n.ticker}`);
      }
      if (n.type === 'public_corporation' && n.id === 'public:kepco') {
        fail('nuclear public:kepco must be migrated to krx:015760');
      }
      if (n.id === 'krx:015760') {
        if (n.isMapConstituent !== false && !n.excludeFromMapCompanyCount) {
          fail('nuclear krx:015760 must be excluded from map company count');
        }
        if (n.entityRole !== 'listed_reference_company') {
          warn('nuclear krx:015760 should set entityRole=listed_reference_company');
        }
      }
      if ((n.id === 'kr:khnp' || n.id === 'operator:khnp') && n.ticker === '015760') {
        fail('nuclear KHNP must not carry KEPCO ticker');
      }
      if ((n.id === 'kr:khnp' || n.id === 'operator:khnp') && n.mcapWon != null) {
        fail('nuclear KHNP must not use KEPCO mcap');
      }
      if (n.ticker === '051600' && (n.role === 'operator' || n.role === 'project_operator')) {
        fail('nuclear KEPCO KPS must not be labeled operator');
      }
      if ((n.type === 'lifecycle_stage' || n.type === 'equipment_category' || n.type === 'reactor_technology'
        || n.type === 'smr_technology' || n.type === 'country' || n.type === 'ecosystem') && n.mcapWon != null) {
        fail(`nuclear structural node ${n.id} must not have mcapWon`);
      }
      if (n.type === 'nuclear_project') {
        const ps = n.projectStatus || 'unknown';
        if (!PROJECT_STATUSES.has(ps)) fail(`nuclear project ${n.id} invalid projectStatus ${ps}`);
        if (n.isStructuralBundle) fail(`nuclear ${n.id} structural bundle must use type ecosystem`);
        if (n.totalProjectValue != null && n.valueType === 'company_contract') {
          fail(`nuclear project ${n.id} must not use company_contract as totalProjectValue type`);
        }
        if (ps === 'selected_bidder' && n.contractStatus === 'effective') {
          fail(`nuclear ${n.id} cannot be selected_bidder with effective contract`);
        }
        if (ps === 'under_construction' && n.constructionStartExpected && n.constructionStartExpected > '2026') {
          warn(`nuclear ${n.id} under_construction but constructionStartExpected ${n.constructionStartExpected}`);
        }
      }
      if (n.type === 'ecosystem' && n.projectStatus && ['contract_signed', 'under_construction'].includes(n.projectStatus)) {
        fail(`nuclear ecosystem ${n.id} must not use award projectStatus ${n.projectStatus}`);
      }
      if (n.type === 'consortium' && (!n.memberIds || !n.memberIds.length)) {
        fail(`nuclear consortium ${n.id} missing memberIds`);
      }
      if (n.type === 'reactor_technology' && n.isListedKorea) {
        fail(`nuclear reactor technology must not be listed company ${n.id}`);
      }
    }

    for (const e of edges) {
      if (e.type === 'peer' || e.status === 'inferred' || e.type === 'inferred') {
        if (e.defaultHidden === false) warn(`nuclear weak edge ${e.id} should be defaultHidden`);
      }
      if (e.type === 'manufactures') {
        const t = nodeMap.get(e.target);
        if (t && t.type !== 'equipment_category' && t.type !== 'smr_technology' && t.type !== 'reactor_technology') {
          fail(`nuclear manufactures ${e.id} target must be equipment/tech`);
        }
      }
      if (PROJECT_ROLE_TYPES.has(e.type)) {
        const t = nodeMap.get(e.target);
        const s = nodeMap.get(e.source);
        const touchesProject = t?.type === 'nuclear_project' || s?.type === 'nuclear_project'
          || t?.type === 'consortium' || s?.type === 'consortium'
          || t?.type === 'smr_technology' || s?.type === 'smr_technology'
          || t?.type === 'ecosystem' || s?.type === 'ecosystem';
        if (!touchesProject && e.type !== 'memorandum_with') {
          fail(`nuclear project-role edge ${e.id} must touch project/consortium/smr/ecosystem`);
        }
        if ((e.status === 'confirmed' || e.editorialStatus === 'confirmed')) {
          const gate = meetsConfirmedRequirements({ ...e, status: 'confirmed' });
          if (!gate.ok) {
            fail(`nuclear confirmed project role ${e.id} fails confirmed gate: ${(gate.issues || []).join(',')}`);
          }
        }
        if (e.projectStatus === 'contract_signed' && e.type === 'memorandum_with') {
          fail(`nuclear MOU edge ${e.id} must not use projectStatus contract_signed`);
        }
        if (e.type === 'memorandum_with' && (e.projectStatus === 'contract_signed' || e.contractSigned === true
          || e.contractStatus === 'effective')) {
          fail(`nuclear memorandum ${e.id} must not be marked contract signed/effective`);
        }
        if ((e.type === 'preferred_bidder_for' || e.type === 'selected_for')
          && (e.projectStatus === 'contract_signed' || e.contractSigned === true
            || e.contractStatus === 'effective' || e.projectStatus === 'design'
            || e.projectStatus === 'licensing')) {
          fail(`nuclear preferred/selected ${e.id} must not remain after contract/design stage`);
        }
        if (e.type === 'consortium_member' && e.origin === 'auto_generated') {
          fail(`nuclear consortium_member ${e.id} must not be auto_generated`);
        }
        if (e.type === 'consortium_member' && (e.status === 'confirmed') && e.role !== 'epc') {
          warn(`nuclear consortium_member ${e.id} confirmed without EPC party role`);
        }
        if (e.companyContractValue != null && e.valueType === 'total_project_estimate') {
          fail(`nuclear ${e.id} must not put total project value into companyContractValue`);
        }
        const homepageOnly = (e.evidence || []).length && (e.evidence || []).every((ev) => {
          try {
            const u = new URL(ev.url || '');
            return (u.pathname === '/' || u.pathname === '')
              && ev.evidenceUsageType !== 'exact_project_document'
              && ev.evidenceUsageType !== 'exact_contract_document'
              && ev.evidenceUsageType !== 'official_role_page';
          } catch { return true; }
        });
        if (homepageOnly && e.relationClass === 'business' && e.status === 'confirmed') {
          fail(`nuclear ${e.id} homepage cannot confirm project role`);
        }
        if ((e.evidence || []).some((ev) => /products?\s*page|product page/i.test(String(ev.title || '') + String(ev.url || '')))
          && (e.status === 'confirmed' || e.status === 'reported')
          && PROJECT_ROLE_TYPES.has(e.type)
          && e.relationClass === 'business'
          && t?.type === 'nuclear_project') {
          fail(`nuclear ${e.id} must not prove project role via products page alone`);
        }
        // operator vs maintenance separation
        if (e.type === 'maintains' && (s?.id === 'kr:khnp' || s?.id === 'operator:khnp')
          && !e.noteKo?.includes('OSSA') && e.relationClass === 'business' && t?.type === 'nuclear_project') {
          warn(`nuclear KHNP maintains ${e.id} — prefer operator/support types unless OSSA evidence`);
        }
        if (e.type === 'operates' && s?.ticker === '051600') {
          fail(`nuclear KPS must not use operates (${e.id})`);
        }
        if (e.type === 'project_operator' && (s?.id === 'kr:khnp' || s?.id === 'operator:khnp')
          && t?.id?.includes('dukovany')) {
          fail(`nuclear KHNP must not be Dukovany project_operator (${e.id})`);
        }
      }
      if (e.type === 'equity_investment' && e.projectStatus === 'contract_signed') {
        fail(`nuclear equity_investment ${e.id} must not be labeled contract_signed`);
      }
      const tgt = nodeMap.get(e.target);
      if (tgt?.type === 'nuclear_project'
        && ['completed', 'cancelled', 'suspended'].includes(tgt.projectStatus)
        && e.defaultHidden === false
        && e.relationClass === 'business') {
        warn(`nuclear ended/suspended project edge ${e.id} should be defaultHidden`);
      }
      if (tgt?.type === 'smr_technology' && e.projectStatus === 'suspended' && e.defaultHidden === false) {
        warn(`nuclear suspended SMR edge ${e.id} should be defaultHidden`);
      }
      if (e.projectStatus && e.projectStatuses) {
        fail(`nuclear edge ${e.id} must not set multiple projectStatus fields`);
      }
      if (e.projectStatus && e.contractStatus && e.projectStatus === e.contractStatus
        && !['unknown'].includes(e.projectStatus)) {
        // allow overlap only if values intentionally same string in rare cases — warn
      }
    }

    // Profile leakage: powergrid-only types
    for (const e of edges) {
      if (['awarded_contract', 'used_in_grid_stage', 'supplies_transformer_to'].includes(e.type)) {
        fail(`nuclear must not contain powergrid edge type ${e.type}`);
      }
    }
  }

  if (sectorKey === 'renewable') {
    const PROJECT_STATUSES = new Set([
      'concept', 'memorandum', 'site_secured', 'development', 'feasibility_study',
      'permit_application', 'permitted', 'preferred_bidder', 'financing', 'financial_close',
      'contract_signed', 'notice_to_proceed', 'under_construction', 'commissioning',
      'operating', 'repowering', 'completed', 'suspended', 'cancelled', 'unknown',
    ]);
    const hasPublicKepco = nodes.some((n) => n.id === 'public:kepco');
    const hasKrxKepco = nodes.some((n) => n.id === 'krx:015760');
    if (hasPublicKepco) fail('renewable public:kepco must not be recreated');
    if (hasKrxKepco) {
      const k = nodes.find((n) => n.id === 'krx:015760');
      if (k.isMapConstituent !== false && !k.excludeFromMapCompanyCount) {
        fail('renewable krx:015760 must be excluded from map company count');
      }
    }

    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`renewable KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'renewable_project') {
        const ps = n.projectStatus || 'unknown';
        if (!PROJECT_STATUSES.has(ps)) fail(`renewable project ${n.id} invalid projectStatus ${ps}`);
        if (n.isStructuralBundle) fail(`renewable ${n.id} structural bundle must use type ecosystem`);
        if (ps === 'under_construction' && n.capacityType === 'operating') {
          fail(`renewable ${n.id} must not mark under_construction capacity as operating`);
        }
        if (ps === 'memorandum' && n.contractStatus === 'effective') {
          fail(`renewable ${n.id} MOU must not have effective contractStatus`);
        }
        if (ps === 'preferred_bidder' && n.contractSigned === true) {
          fail(`renewable ${n.id} preferred_bidder must not be contractSigned`);
        }
        if (n.capacityUnit === 'tH2_per_year' && n.technology !== 'hydrogen') {
          warn(`renewable ${n.id} hydrogen unit without hydrogen technology`);
        }
        if (n.manufacturingCapacity != null && n.capacityType === 'project_total') {
          fail(`renewable ${n.id} manufacturingCapacity must not be treated as project_total`);
        }
        if (n.equityCapacity != null) {
          const stakeEdge = edges.find((e) =>
            (e.type === 'owns_stake_in' || e.type === 'spv_shareholder')
            && (e.target === n.id || nodeMap.get(e.target)?.type === 'project_spv')
            && (e.ownershipPct != null || e.stakePct != null));
          const ownsSpvThenProject = edges.some((e) => {
            if (e.type !== 'owns_stake_in' && e.type !== 'spv_shareholder') return false;
            if (e.ownershipPct == null && e.stakePct == null) return false;
            const spv = nodeMap.get(e.target);
            if (spv?.type !== 'project_spv') return false;
            return edges.some((e2) => e2.type === 'project_owner' && e2.source === spv.id && e2.target === n.id);
          });
          if (!stakeEdge && !ownsSpvThenProject) {
            fail(`renewable ${n.id} equityCapacity without verified stakePct/ownershipPct edge`);
          }
          const total = n.projectTotalCapacity ?? (n.capacityType === 'project_total' ? n.capacityValue : null);
          if (total != null && Number(n.equityCapacity) > Number(total)) {
            fail(`renewable ${n.id} equityCapacity exceeds projectTotalCapacity`);
          }
        }
        if (n.commercialOperationDate && n.targetCommercialOperationDate
          && n.commercialOperationDate === n.targetCommercialOperationDate
          && ps !== 'operating' && ps !== 'commissioning') {
          warn(`renewable ${n.id} target COD used as commercialOperationDate while not operating`);
        }
      }
      if (n.type === 'project_portfolio' || n.type === 'supply_contract') {
        if (n.capacityType === 'project_total' && n.type === 'supply_contract') {
          fail(`renewable supply_contract ${n.id} must not use capacityType project_total`);
        }
        if (n.operatingCapacity != null || n.equityCapacity != null) {
          fail(`renewable ${n.type} ${n.id} must not carry operating/equity capacity as owned plant`);
        }
      }
      if (n.type === 'product' && (n.projectStatus === 'operating' || n.operatingCapacity != null)) {
        fail(`renewable product ${n.id} must not count as operating project`);
      }
      if (n.type === 'development_pipeline' && ['operating', 'under_construction'].includes(n.projectStatus)) {
        fail(`renewable development_pipeline ${n.id} must not use operating/UC projectStatus`);
      }
      if (n.type === 'ecosystem' && n.projectStatus && ['contract_signed', 'under_construction', 'operating'].includes(n.projectStatus)) {
        fail(`renewable ecosystem ${n.id} must not use award/operating projectStatus`);
      }
      if (n.type === 'project_spv' && n.isListedKorea === true) {
        fail(`renewable SPV ${n.id} must not be marked listed Korea`);
      }
      if ((n.type === 'technology' || n.type === 'equipment_category' || n.type === 'project_stage') && n.mcapWon != null) {
        fail(`renewable structural node ${n.id} must not have mcapWon`);
      }
    }

    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if ((e.editorialStatus === 'confirmed' || e.status === 'confirmed')) {
        if (!e.directEvidence || e.reviewStatus !== 'reviewed' || !e.reviewedAt || !e.reviewedBy) {
          fail(`renewable confirmed edge ${e.id} fails confirmed gate`);
        }
      }
      if (e.type === 'memorandum_with' && (e.projectStatus === 'contract_signed' || e.contractSigned === true)) {
        fail(`renewable MOU edge ${e.id} must not use contract_signed`);
      }
      if (e.type === 'power_purchase_agreement' && e.agreementType === 'rec_agreement') {
        fail(`renewable edge ${e.id} REC must use rec_purchase_agreement not PPA`);
      }
      if (e.type === 'consortium_member' && e.ownershipPct != null && e.editorialStatus === 'confirmed') {
        fail(`renewable consortium_member ${e.id} must not imply confirmed ownershipPct without owns_stake_in`);
      }
      if (e.type === 'owns_stake_in' && (e.ownershipPct == null) && e.editorialStatus === 'confirmed') {
        fail(`renewable confirmed owns_stake_in ${e.id} needs ownershipPct`);
      }
      if (e.ownershipPct != null && (e.ownershipPct < 0 || e.ownershipPct > 100)) {
        fail(`renewable ownershipPct out of range on ${e.id}`);
      }
      if (e.type === 'epc_for' && e.capacityType === 'equity_attributable') {
        fail(`renewable EPC edge ${e.id} must not use equity_attributable capacity`);
      }
      if (['epc_for', 'engineering_for', 'constructs'].includes(e.type) && e.equityCapacity != null) {
        fail(`renewable EPC edge ${e.id} must not carry equityCapacity`);
      }
      if ((e.capacityUnit === 'tH2_per_year' || e.capacityUnit === 'tH2')
        && (e.capacityType === 'project_total' || e.capacityType === 'epc_scope')) {
        fail(`renewable edge ${e.id} must not mix tH2 with MW project/EPC capacity types`);
      }
      if ((e.evidence || []).some((ev) => /homepage|^https?:\/\/[^/]+\/?$/i.test(ev.url || '')
        && ev.evidenceUsageType === 'exact_project_document'
        && ['epc_for', 'owns_stake_in', 'project_owner', 'power_purchase_agreement'].includes(e.type))) {
        fail(`renewable edge ${e.id} homepage cannot be exact_project_document for project role`);
      }
      if (['awarded_contract', 'used_in_grid_stage', 'supplies_nsss_to', 'supports_lifecycle_stage'].includes(e.type)) {
        fail(`renewable must not contain foreign sector edge type ${e.type}`);
      }
      if (e.type === 'peer' && e.defaultHidden === false) {
        warn(`renewable peer edge ${e.id} should be defaultHidden`);
      }
      if (t?.type === 'renewable_project' && t.projectStatus === 'completed' && e.defaultHidden === false
        && !['reference', 'ended'].includes(e.type)) {
        warn(`renewable completed project edge ${e.id} should prefer defaultHidden`);
      }
      if (s?.type === 'listed_company' && t?.type === 'project_spv' && e.type === 'project_owner') {
        fail(`renewable listed company ${e.source} must not be project_owner of SPV project via wrong hop — use owns_stake_in → SPV → project_owner`);
      }
    }
  }

  if (sectorKey === 'construction') {
    const PROJECT_TYPES = new Set(['construction_project', 'overseas_epc_project']);
    const PROJECT_STATUSES = new Set([
      'concept', 'land_secured', 'memorandum', 'feasibility_study', 'permit_application', 'permitted',
      'financing', 'financial_close', 'preferred_bidder', 'selected_bidder', 'contract_signed', 'presale',
      'notice_to_proceed', 'pre_construction', 'under_construction', 'commissioning', 'completed',
      'operating', 'suspended', 'cancelled', 'terminated', 'unknown',
    ]);
    const PRESS_OR_REPUB = new Set([
      'press', 'news', 'portal', 'disclosure_republication', 'company_announcement_via_press',
    ]);
    const CONTRACTING_TYPES = new Set([
      'main_contractor', 'epc_for', 'preferred_bidder_for', 'awarded_contract', 'constructs',
    ]);

    function auditEvidenceList(ownerId, evidence, { representativeOnlyWarn = true } = {}) {
      const list = evidence || [];
      list.forEach((ev, idx) => {
        if (ev.reviewStatus === 'reviewed' && (!ev.reviewedAt || !ev.reviewedBy)) {
          fail(`construction ${ownerId} reviewed evidence missing reviewedAt/reviewedBy`);
        }
        if (ev.directEvidence === true && ev.sourceOpened === false) {
          fail(`construction ${ownerId} directEvidence=true but sourceOpened=false`);
        }
        if (ev.primarySource === true && PRESS_OR_REPUB.has(ev.sourceType)) {
          fail(`construction ${ownerId} primarySource=true with non-primary sourceType=${ev.sourceType}`);
        }
        if (ev.rcpNo && ev.url && /rcpNo=(\d{14})/.test(ev.url)) {
          const urlRcp = ev.url.match(/rcpNo=(\d{14})/)[1];
          if (urlRcp !== String(ev.rcpNo)) {
            fail(`construction ${ownerId} rcpNo ${ev.rcpNo} != url rcpNo ${urlRcp}`);
          }
        }
        // Warn only when the representative (first) evidence is a superseded filing used as latest.
        if ((!representativeOnlyWarn || idx === 0)
          && ev.supersededBy
          && ev.evidenceUsageType === 'exact_project_document'
          && ev.primarySource === true
          && !ev.supersedes) {
          warn(`construction ${ownerId} may be using superseded filing as latest primary`);
        }
      });
    }

    for (const n of nodes) {
      if (n.type === 'apartment_brand' && n.isListedKorea) {
        fail(`construction brand ${n.id} must not be listed company`);
      }
      if (n.type === 'global_company' && n.ticker && /^[0-9]{6}$/.test(String(n.ticker))) {
        fail(`construction KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'consortium' && /SMDC|SNDC/i.test(`${n.consortiumName || ''}${n.nameEn || ''}${n.nameKo || ''}`)
        && !n.legalNameEn && !n.legalNameKo && n.entityStatus !== 'provisional') {
        warn(`construction JV acronym node ${n.id} lacks clear legal entity name`);
      }
      if (n.type === 'provisional_consortium') {
        if (n.entityStatus !== 'provisional') {
          fail(`construction provisional_consortium ${n.id} requires entityStatus=provisional`);
        }
        if (n.legalNameKo || n.legalNameEn) {
          fail(`construction provisional_consortium ${n.id} must not invent legalName`);
        }
        if (n.defaultHidden !== true) {
          fail(`construction provisional_consortium ${n.id} must be defaultHidden`);
        }
        if (n.reviewStatus !== 'needs_human_review') {
          warn(`construction provisional_consortium ${n.id} should have reviewStatus=needs_human_review`);
        }
        if (/SMDC|SNDC/i.test(`${n.consortiumName || ''}${n.nameEn || ''}${n.nameKo || ''}`)) {
          fail(`construction provisional_consortium ${n.id} must not use SMDC/SNDC as display legal name`);
        }
      }
      if (PROJECT_TYPES.has(n.type)) {
        const ps = n.projectStatus || 'unknown';
        if (!PROJECT_STATUSES.has(ps)) fail(`construction project ${n.id} invalid projectStatus ${ps}`);
        if (ps === 'preferred_bidder' && n.contractSigned === true) {
          fail(`construction ${n.id} preferred_bidder must not be contractSigned`);
        }
        if (n.contractSigned === false && n.contractStatus === 'effective') {
          fail(`construction ${n.id} contractSigned=false but contractStatus=effective`);
        }
        if ((ps === 'preferred_bidder' || n.contractStatus === 'pre_contract') && n.contractSigned === true) {
          fail(`construction ${n.id} preferred_bidder/pre_contract cannot have contractSigned=true`);
        }
        if (n.contractStatus === 'pre_contract'
          && n.contractValue != null
          && n.valueType !== 'undisclosed'
          && n.valueType !== 'potential_value') {
          fail(`construction ${n.id} pre_contract must not carry firm contractValue`);
        }
        const cpDisc = n.counterpartyDisclosure || n.counterpartyStatus;
        if (cpDisc === 'exact') {
          const hasLegal = !!(n.counterpartyLegalName || n.loiCounterpartyLegalName
            || n.legalContractingEntity);
          if (!hasLegal) {
            fail(`construction ${n.id} counterpartyDisclosure=exact but no legal name field`);
          }
          const relOk = (n.evidence || []).some((ev) =>
            ev.relationshipSupported && /\|/.test(ev.relationshipSupported));
          if ((n.evidence || []).length && !relOk) {
            fail(`construction ${n.id} exact counterparty lacks evidence.relationshipSupported`);
          }
        }
        const projectTotal = n.projectTotalValue ?? n.totalProjectValue;
        if (projectTotal != null && n.companyContractValue != null
          && Number(n.companyContractValue) === Number(projectTotal)
          && n.companyParticipationPct == null
          && (n.valueType === 'total_project_estimate' || n.valueType === 'project_total')) {
          fail(`construction ${n.id} projectTotalValue aggregated as companyContractValue without share`);
        }
        if (n.companyShareValue != null
          && n.companyParticipationPct == null && n.equityStakePct == null
          && n.participationPct == null
          && n.valueType === 'equity_attributable') {
          fail(`construction ${n.id} equity-attributed companyShareValue without stakePct`);
        }
        if ((ps === 'preferred_bidder' || ps === 'selected_bidder')
          && n.companyContractValue != null && n.valueType === 'signed_contract') {
          fail(`construction ${n.id} preferred_bidder must not carry signed_contract valueType`);
        }
        if (n.aggregationType === 'multi_block_contract' && Array.isArray(n.aggregatedComponents)) {
          const sumTotal = n.aggregatedComponents.reduce((a, c) => a + (Number(c.componentContractValue) || 0), 0);
          const sumShare = n.aggregatedComponents.reduce((a, c) => a + (Number(c.componentCompanyShareValue) || 0), 0);
          const total = n.totalContractValue ?? n.contractValue;
          if (total != null && sumTotal !== Number(total)) {
            fail(`construction ${n.id} aggregatedComponents total ${sumTotal} != contractValue ${total}`);
          }
          if (n.companyShareValue != null && sumShare !== Number(n.companyShareValue)) {
            fail(`construction ${n.id} aggregatedComponents share sum ${sumShare} != companyShareValue ${n.companyShareValue}`);
          }
        }
        if (n.companyShareDisclosureStatus === 'unknown' && n.companyShareValue != null) {
          fail(`construction ${n.id} companyShareDisclosureStatus=unknown but companyShareValue set`);
        }
        if (n.valueDisclosureStatus === 'not_disclosed' && n.contractValue != null) {
          fail(`construction ${n.id} valueDisclosureStatus=not_disclosed but contractValue set`);
        }
        for (const ev of n.evidence || []) {
          if (!ev.claimSupport && network.phase5a3CuratedAt) {
            fail(`construction ${n.id} evidence ${ev.evidenceId || ev.title} missing claimSupport after 5A.3`);
          }
        }
        auditEvidenceList(n.id, n.evidence);
      }
      if (n.type === 'equipment_category' && n.projectStatus) {
        fail(`construction equipment ${n.id} must not carry projectStatus`);
      }
    }
    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if ((e.editorialStatus === 'confirmed' || e.status === 'confirmed')) {
        if (!e.directEvidence || e.reviewStatus !== 'reviewed' || !e.reviewedAt || !e.reviewedBy) {
          fail(`construction confirmed edge ${e.id} fails confirmed gate`);
        }
      }
      if (e.reviewStatus === 'reviewed' && (!e.reviewedAt || !e.reviewedBy)) {
        fail(`construction edge ${e.id} reviewed missing reviewedAt/reviewedBy`);
      }
      if (e.directEvidence === true && e.sourceOpened === false) {
        fail(`construction edge ${e.id} directEvidence=true but sourceOpened=false`);
      }
      if (e.type === 'main_contractor' && s?.lane === 'machinery') {
        fail(`construction machinery company ${e.source} must not be main_contractor`);
      }
      if (e.type === 'epc_for' && e.capacityType === 'equity_attributable') {
        fail(`construction EPC edge ${e.id} must not use equity_attributable capacity`);
      }
      if (e.type === 'memorandum_with' && (e.projectStatus === 'contract_signed' || e.contractSigned === true)) {
        fail(`construction MOU edge ${e.id} must not use contract_signed`);
      }
      if (e.type === 'preferred_bidder_for' && (e.projectStatus === 'contract_signed' || e.contractSigned === true)) {
        fail(`construction preferred edge ${e.id} must not claim contract_signed`);
      }
      if (e.type === 'preferred_bidder_for' && e.companyContractValue != null
        && e.valueType === 'signed_contract') {
        fail(`construction preferred edge ${e.id} must not aggregate signed contract value`);
      }
      if (e.contractSigned === false && e.contractStatus === 'effective') {
        fail(`construction edge ${e.id} contractSigned=false but contractStatus=effective`);
      }
      if (e.contractStatus === 'pre_contract'
        && e.contractValue != null
        && e.valueType !== 'undisclosed'
        && e.valueType !== 'potential_value') {
        fail(`construction edge ${e.id} pre_contract must not carry firm contractValue`);
      }
      if (e.companyShareValue != null
        && e.companyParticipationPct == null && e.participationPct == null && e.equityStakePct == null
        && e.consortiumContractValue != null) {
        fail(`construction ${e.id} companyShareValue without consortium share pct`);
      }
      if (e.companyContractValue != null && e.consortiumContractValue != null
        && Number(e.companyContractValue) === Number(e.consortiumContractValue)
        && e.companyParticipationPct == null && e.participationPct == null) {
        fail(`construction ${e.id} applies full consortium amount as company contract without participationPct`);
      }
      if ((e.type === 'finances' || e.type === 'arranges_pf' || e.type === 'guarantees')
        && e.valueType === 'company_contract_share'
        && (e.companyContractValue != null || e.contractValue != null)) {
        fail(`construction ${e.id} financing/guarantee must not aggregate as contract award`);
      }
      if ((e.evidence || []).some((ev) => /homepage|^https?:\/\/[^/]+\/?$/i.test(ev.url || '')
        && ev.evidenceUsageType === 'exact_project_document'
        && ['main_contractor', 'epc_for', 'owns_stake_in', 'pfv_shareholder', 'project_owner'].includes(e.type))) {
        fail(`construction edge ${e.id} homepage cannot be exact_project_document for project role`);
      }
      if (e.type === 'peer' && e.defaultHidden === false) {
        warn(`construction peer edge ${e.id} should be defaultHidden`);
      }
      if (t && PROJECT_TYPES.has(t.type) && ['completed', 'terminated', 'cancelled'].includes(t.projectStatus)
        && e.defaultHidden === false && !['reference', 'ended'].includes(e.type)) {
        fail(`construction historical project edge ${e.id} must not be default-visible`);
      }
      if (s?.type === 'apartment_brand' && ['main_contractor', 'epc_for', 'project_owner', 'project_developer'].includes(e.type)) {
        fail(`construction brand ${e.source} must not be contracting party`);
      }
      if (t?.type === 'apartment_brand' && ['main_contractor', 'epc_for', 'project_owner'].includes(e.type)) {
        fail(`construction brand ${e.target} must not be contracting party`);
      }
      if (CONTRACTING_TYPES.has(e.type) && (s?.type === 'provisional_consortium' || t?.type === 'provisional_consortium')) {
        fail(`construction ${e.id} must not use provisional_consortium as contracting party`);
      }
      if (CONTRACTING_TYPES.has(e.type) && (s?.role === 'project_sponsor_operator' || t?.role === 'project_sponsor_operator')
        && e.type !== 'preferred_bidder_for' && e.type !== 'project_owner') {
        warn(`construction ${e.id} uses sponsor/operator node as contracting counterparty`);
      }
      if (e.counterpartyDisclosure === 'exact' || e.counterpartyStatus === 'exact') {
        const relOk = (e.evidence || []).some((ev) => ev.relationshipSupported);
        if ((e.evidence || []).length && !relOk) {
          fail(`construction edge ${e.id} exact counterparty lacks evidence.relationshipSupported`);
        }
      }
      auditEvidenceList(e.id, e.evidence);
    }
    const actual = nodes.filter((n) => PROJECT_TYPES.has(n.type));
    if (actual.length > 12) fail(`construction uniqueActualProjectCount ${actual.length} exceeds Phase 5A cap 12`);
  }

  if (sectorKey === 'auto') {
    const SUPPLY = new Set([
      'supplies_component_to', 'supplies_system_to', 'supplies_material_to',
      'supplies_tire_to', 'supplies_lighting_to', 'supplies_electronics_to',
      'awarded_contract', 'nominated_supplier_for',
    ]);
    const MASS = new Set(['mass_production', 'pre_production', 'sample_supply']);
    for (const n of nodes) {
      if (n.type === 'global_company' && n.ticker && TICKER_RE.test(String(n.ticker))) {
        fail(`auto KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`auto listed_company id must be krx: ${n.id}`);
      }
    }
    const listedTickers = new Map();
    for (const n of nodes) {
      if (n.type !== 'listed_company') continue;
      if (listedTickers.has(n.ticker)) fail(`auto duplicate listed ticker ${n.ticker}`);
      listedTickers.set(n.ticker, n.id);
    }
    for (const e of edges) {
      if (e.type === 'group_member') {
        if (e.stakePct != null) fail(`auto group_member ${e.id} must not carry stakePct`);
        if ((e.status === 'confirmed' || e.status === 'reported') && SUPPLY.has(e.labelType)) {
          fail(`auto group_member ${e.id} mislabeled as supply`);
        }
        for (const ev of e.evidence || []) {
          if (ev.evidenceUsageType === 'official_roster' && !/ftc\.go\.kr/i.test(String(ev.url || ''))) {
            warn(`auto group_member ${e.id} official_roster without ftc.go.kr URL`);
          }
        }
      }
      if (e.type === 'peer' && !e.defaultHidden) {
        fail(`auto peer edge ${e.id} must be defaultHidden`);
      }
      if (e.type === 'peer' && (e.status === 'confirmed' || e.status === 'reported')) {
        fail(`auto peer ${e.id} must not count as business confirmed/reported`);
      }
      if (e.type === 'used_in_vehicle') {
        const hasEv = (e.evidence || []).some((ev) => ev.directEvidence && ev.claimSupport?.vehicle);
        if (!hasEv && e.status === 'confirmed') {
          fail(`auto used_in_vehicle ${e.id} needs direct vehicle evidence`);
        }
        if (!(e.evidence || []).length) fail(`auto used_in_vehicle ${e.id} missing evidence`);
      }
      if (SUPPLY.has(e.type)) {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        const oemNameOnly = (e.evidence || []).some((ev) =>
          /oem name only|customer name only|주요 고객/i.test(String(ev.title || ev.note || '')));
        if (oemNameOnly && e.status === 'confirmed') {
          fail(`auto supply ${e.id} cannot be confirmed from OEM name only`);
        }
        if (e.status === 'confirmed') {
          const ok = (e.evidence || []).some((ev) =>
            ev.directEvidence === true
            && ev.reviewStatus === 'reviewed'
            && ev.reviewedAt
            && ev.reviewedBy
            && ev.sourceOpened !== false
            && (ev.claimSupport?.relationship || ev.relationshipSupported));
          if (!ok) fail(`auto confirmed supply ${e.id} fails confirmed gate`);
        }
        if ((e.lifecycleStatus === 'memorandum' || e.lifecycleStatus === 'development')
          && MASS.has(e.massProductionStatus)) {
          fail(`auto ${e.id} development/MOU must not be mass_production`);
        }
        if (e.lifecycleStatus === 'memorandum' && e.contractStatus === 'effective') {
          fail(`auto MOU edge ${e.id} must not be active supply contract`);
        }
        if (src?.type === 'apartment_brand' || tgt?.type === 'apartment_brand' || src?.type === 'brand' || tgt?.type === 'brand') {
          fail(`auto brand node must not be supply counterparty on ${e.id}`);
        }
      }
      if ((e.type === 'owns' || e.type === 'owns_stake_in') && e.status === 'confirmed') {
        if (e.stakePct == null) fail(`auto confirmed ownership ${e.id} needs stakePct`);
        if ((e.ownershipKind === 'indirect' || e.directOrIndirect === 'indirect') && !e.intermediateNodeId) {
          fail(`auto indirect ownership ${e.id} missing intermediateNodeId`);
        }
      }
      if ((e.type === 'owns' || e.type === 'owns_stake_in') && e.companyShareValue != null && e.stakePct == null) {
        fail(`auto equity-attributed value without stakePct on ${e.id}`);
      }
      if (e.status === 'ended' && !e.defaultHidden) {
        fail(`auto ended edge ${e.id} must be defaultHidden`);
      }
      if (e.status === 'inferred' && !e.defaultHidden) {
        warn(`auto inferred edge ${e.id} should be defaultHidden`);
      }
      for (const ev of e.evidence || []) {
        if (ev.primarySource === true && ['news', 'press', 'portal', 'media'].includes(ev.sourceType)) {
          fail(`auto ${e.id} primarySource=true with non-primary sourceType=${ev.sourceType}`);
        }
        if (ev.directEvidence === true && (ev.sourceOpened === false || !ev.reviewStatus)) {
          fail(`auto ${e.id} directEvidence missing sourceOpened/review meta`);
        }
        if (ev.counterpartyDisclosure === 'exact' && !ev.claimSupport && !ev.relationshipSupported) {
          fail(`auto ${e.id} exact counterparty missing claimSupport/relationshipSupported`);
        }
      }
      if (e.type === 'supplies_cells_to') {
        warn(`auto ${e.id} battery cell supply may duplicate battery sector — prefer pack/module/thermal`);
      }
    }
    // Peers / group_member must not clear business or direct commercial orphans
    const orphan = computeListedRelationOrphanMetrics(network);
    for (const id of orphan.details?.businessRelationOrphans || []) {
      const peerOnly = edges.some((e) =>
        (e.source === id || e.target === id) && e.type === 'peer' && !e.defaultHidden);
      if (peerOnly) fail(`auto peer visibility must not clear orphan ${id}`);
    }
    for (const gmEdge of edges.filter((e) => e.type === 'group_member')) {
      const src = gmEdge.source;
      const hasDirectCommercial = edges.some((e) =>
        (e.source === src || e.target === src) && DIRECT_RELATION_EDGE_TYPES.has(e.type));
      if (!hasDirectCommercial && !orphan.details?.directRelationshipOrphans?.includes(src)) {
        fail(`auto group_member ${gmEdge.id} cleared direct commercial orphan for ${src}`);
      }
    }
    // peerOnly metric must mean strict peer-only edges (not hasPeerButNoBusiness)
    for (const id of orphan.details?.peerOnly || []) {
      const inc = edges.filter((e) => e.source === id || e.target === id);
      if (!inc.length || !inc.every((e) => e.type === 'peer')) {
        fail(`auto peerOnlyCompanyCount includes ${id} but has non-peer edges`);
      }
    }
    for (const id of orphan.details?.hasPeerButNoBusiness || []) {
      const hasPeer = edges.some((e) => (e.source === id || e.target === id) && e.type === 'peer');
      const hasBusiness = edges.some((e) => {
        if (e.source !== id && e.target !== id) return false;
        if (e.status !== 'confirmed' && e.status !== 'reported') return false;
        if (STRUCTURAL_EDGE_TYPES.has(e.type)) return false;
        const otherId = e.source === id ? e.target : e.source;
        const other = nodeMap.get(otherId);
        return other && COMPANY_OR_PROJECT_TYPES.has(other.type);
      });
      if (!hasPeer || hasBusiness) {
        fail(`auto hasPeerButNoBusinessCompanyCount includes ${id} incorrectly`);
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const [key, val] of Object.entries(cc)) {
      if (key === 'metricNotes') continue;
      if (!val || typeof val !== 'object' || !('denominator' in val)) continue;
      const err = validateCoverageMetric(val, `auto.${key}`);
      if (err) fail(err);
    }
    if (metrics.supplyRelationshipDirectEvidenceCoverage === 1
      && cc.supplyDirectEvidenceCoverage?.denominator === 0) {
      fail('auto supplyRelationshipDirectEvidenceCoverage must not be 100% on 0 denominator');
    }
  }

  if (sectorKey === 'elec') {
    const listedTickers = new Set();
    const productLabelById = new Map();
    for (const n of nodes) {
      if (n.ticker && /^\d{6}$/.test(String(n.ticker)) && n.type === 'global_company') {
        fail(`elec KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`elec listed_company id must be krx: ${n.id}`);
      }
    }
    for (const n of nodes) {
      if (n.type !== 'listed_company') continue;
      if (listedTickers.has(n.ticker)) fail(`elec duplicate listed ticker ${n.ticker}`);
      listedTickers.add(n.ticker);
    }
    const FORBIDDEN_ELEC_PRODUCT = new Set([
      'product:item', 'product:product', 'product:component', 'product:electronics',
      'product:module', 'product:parts', 'component:item', 'technology:item', 'market:item',
    ]);
    for (const n of nodes) {
      if ((n.type === 'product' || n.type === 'component') && FORBIDDEN_ELEC_PRODUCT.has(n.id)) {
        fail(`elec forbidden generic product ID ${n.id}`);
      }
      if (n.type === 'product' || n.type === 'component') {
        const label = n.nameKo || n.nameEn || '';
        const prev = productLabelById.get(n.id);
        if (prev && prev !== label) {
          fail(`elec product ${n.id} used with conflicting labels: "${prev}" vs "${label}"`);
        }
        productLabelById.set(n.id, label);
      }
      if (n.type === 'business_category' && edges.some((e) => e.target === n.id && e.type === 'manufactures')) {
        warn(`elec business_category ${n.id} is manufactures target — prefer specializes_in/member_of`);
      }
    }
    for (const e of edges) {
      if (e.type === 'group_member') {
        if (e.stakePct != null) fail(`elec group_member ${e.id} must not carry stakePct`);
        if (/^supplies_/.test(e.type)) fail(`elec group_member ${e.id} mislabeled as supply`);
      }
      if (e.type === 'peer' && e.defaultHidden !== true) {
        fail(`elec peer edge ${e.id} must be defaultHidden`);
      }
      if (e.type === 'peer' && (e.status === 'confirmed' || e.status === 'reported')) {
        fail(`elec peer ${e.id} must not count as business confirmed/reported`);
      }
      if (['supplies_component_to', 'supplies_module_to', 'supplies_material_to', 'supplies_equipment_to', 'manufactures_for', 'awarded_contract', 'nominated_supplier_for'].includes(e.type)) {
        if (e.status === 'confirmed' && !(e.evidence || []).some((ev) => ev.directEvidence && ev.reviewStatus === 'reviewed')) {
          fail(`elec confirmed supply ${e.id} fails confirmed gate`);
        }
        if (e.status === 'confirmed' && (e.evidence || []).some((ev) => ev.sourceType === 'product_page' && ev.primarySource)) {
          fail(`elec ${e.id} product_page cannot be primary for customer supply`);
        }
      }
      if (['used_in_device', 'used_in_product_family'].includes(e.type) && e.status === 'confirmed') {
        if (!(e.evidence || []).some((ev) => ev.claimSupport?.device || ev.claimSupport?.component)) {
          fail(`elec ${e.type} ${e.id} needs device/component claimSupport`);
        }
      }
      if (e.type === 'cross_sector_reference' && e.status === 'confirmed') {
        fail(`elec cross_sector_reference ${e.id} must not be confirmed business`);
      }
      if (e.type === 'cross_sector_reference') {
        if (e.excludesFromBusinessCoverage !== true) {
          warn(`elec cross_sector_reference ${e.id} should set excludesFromBusinessCoverage`);
        }
        if (!String(e.target).startsWith('sector:')) {
          warn(`elec cross_sector_reference ${e.id} should reference sector anchor not company node`);
        }
      }
      if (['supplies_component_to', 'supplies_module_to', 'supplies_material_to'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)) {
        const cs = (e.evidence || []).some((ev) => ev.claimSupport?.relationship && ev.claimSupport?.product);
        if (!cs) fail(`elec ${e.id} supply edge missing relationship/product claimSupport`);
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const key of Object.keys(cc)) {
      if (key === 'metricNotes') continue;
      const val = cc[key];
      if (!val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `elec.${key}`);
      if (err) fail(err);
    }
    for (const e of edges.filter((x) => x.type === 'cross_sector_reference')) {
      const src = e.source;
      const cleared = edges.some((x) => x.source === src
        && ['confirmed', 'reported'].includes(x.status)
        && !['peer', 'reference', 'cross_sector_reference', 'member_of', 'specializes_in', 'manufactures', 'produces', 'exposed_to'].includes(x.type));
      if (cleared) fail(`elec cross_sector_reference ${e.id} must not substitute for business edge on ${src}`);
    }
    if (metrics.actualSupplyRelationshipCount > 12) {
      warn(`elec business supply count ${metrics.actualSupplyRelationshipCount} exceeds Phase 5C cap 12`);
    }
    for (const e of edges) {
      if (e.type === 'supplies_component_to' && e.status === 'confirmed' && String(e.target).includes('semiconductor')) {
        warn(`elec ${e.id} may duplicate semiconductor supply chain`);
      }
    }
  }

  if (sectorKey === 'metal') {
    const listedTickers = new Set();
    const productLabelById = new Map();
    const FORBIDDEN_METAL = new Set([
      'metal_product:item', 'commodity:item', 'alloy:item', 'process:item',
      'metal:item', 'material:item', 'metal_product:product', 'commodity:metal',
    ]);
    for (const n of nodes) {
      if (n.ticker && /^\d{6}$/.test(String(n.ticker)) && n.type === 'global_company') {
        fail(`metal KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`metal listed_company id must be krx: ${n.id}`);
      }
    }
    for (const n of nodes) {
      if (n.type !== 'listed_company') continue;
      if (listedTickers.has(n.ticker)) fail(`metal duplicate listed ticker ${n.ticker}`);
      listedTickers.add(n.ticker);
    }
    for (const n of nodes) {
      if ((n.type === 'metal_product' || n.type === 'commodity' || n.type === 'alloy') && FORBIDDEN_METAL.has(n.id)) {
        fail(`metal forbidden generic ID ${n.id}`);
      }
      if (n.type === 'metal_product' || n.type === 'commodity') {
        const label = n.nameKo || n.nameEn || '';
        const prev = productLabelById.get(n.id);
        if (prev && prev !== label) {
          fail(`metal node ${n.id} used with conflicting labels: "${prev}" vs "${label}"`);
        }
        productLabelById.set(n.id, label);
      }
    }
    for (const e of edges) {
      if (e.type === 'peer' && e.defaultHidden !== true) {
        fail(`metal peer edge ${e.id} must be defaultHidden`);
      }
      if (e.type === 'peer' && (e.status === 'confirmed' || e.status === 'reported')) {
        fail(`metal peer ${e.id} must not count as business confirmed/reported`);
      }
      if (e.type === 'exposed_to_commodity' && ['confirmed', 'reported'].includes(e.status)) {
        fail(`metal ${e.id} commodity exposure must be reference not business`);
      }
      if (e.type === 'cross_sector_reference') {
        if (e.excludesFromBusinessCoverage !== true) {
          warn(`metal cross_sector_reference ${e.id} should set excludesFromBusinessCoverage`);
        }
        if (e.status === 'confirmed' || e.status === 'reported') {
          fail(`metal cross_sector_reference ${e.id} must not be confirmed business`);
        }
      }
      if (['supplies_material_to', 'supplies_metal_product_to', 'offtake_agreement_with'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)) {
        const cs = (e.evidence || []).some((ev) => ev.claimSupport?.relationship && (ev.claimSupport?.product || ev.claimSupport?.counterparty));
        if (!cs) fail(`metal ${e.id} supply edge missing relationship/product/counterparty claimSupport`);
      }
      if ((e.type === 'owns' || e.type === 'owns_stake_in') && e.status === 'confirmed') {
        if (e.stakePct == null && e.type === 'owns_stake_in') {
          fail(`metal confirmed ownership ${e.id} needs stakePct`);
        }
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const key of Object.keys(cc)) {
      if (key === 'metricNotes') continue;
      const val = cc[key];
      if (!val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `metal.${key}`);
      if (err) fail(err);
    }
    for (const e of edges.filter((x) => x.type === 'cross_sector_reference')) {
      const src = e.source;
      const cleared = edges.some((x) => x.source === src
        && ['confirmed', 'reported'].includes(x.status)
        && !['peer', 'reference', 'cross_sector_reference', 'member_of', 'specializes_in', 'produces', 'exposed_to_commodity', 'used_in_end_market'].includes(x.type));
      if (cleared) fail(`metal cross_sector_reference ${e.id} must not substitute for business edge on ${src}`);
    }
    if (metrics.confirmedBusinessEdgeCount > 12) {
      warn(`metal confirmed business count ${metrics.confirmedBusinessEdgeCount} exceeds Phase 5D cap 12`);
    }
  }

  if (sectorKey === 'cosmetics') {
    const listedTickers = new Set();
    const labelById = new Map();
    const FORBIDDEN_COSMETICS = new Set([
      'brand:item', 'product:item', 'beauty_product:item', 'ingredient:item',
      'market:item', 'channel:item', 'packaging:item', 'manufacturing_service:item',
    ]);
    for (const n of nodes) {
      if (n.ticker && /^\d{6}$/.test(String(n.ticker)) && n.type === 'global_company') {
        fail(`cosmetics KR ticker on global_company ${n.id}`);
      }
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`cosmetics listed_company id must be krx: ${n.id}`);
      }
      if (n.type === 'brand' && n.id.startsWith('krx:')) {
        fail(`cosmetics brand must not use listed company id ${n.id}`);
      }
    }
    for (const n of nodes) {
      if (n.type !== 'listed_company') continue;
      if (listedTickers.has(n.ticker)) fail(`cosmetics duplicate listed ticker ${n.ticker}`);
      listedTickers.add(n.ticker);
    }
    for (const n of nodes) {
      if (FORBIDDEN_COSMETICS.has(n.id)) fail(`cosmetics forbidden generic ID ${n.id}`);
      if (['brand', 'product_category', 'manufacturing_service', 'retail_channel'].includes(n.type)) {
        const label = n.nameKo || n.nameEn || '';
        const prev = labelById.get(n.id);
        if (prev && prev !== label) {
          fail(`cosmetics node ${n.id} used with conflicting labels: "${prev}" vs "${label}"`);
        }
        labelById.set(n.id, label);
      }
    }
    for (const e of edges) {
      if (e.type === 'peer' && e.defaultHidden !== true) {
        fail(`cosmetics peer edge ${e.id} must be defaultHidden`);
      }
      if (e.type === 'peer' && (e.status === 'confirmed' || e.status === 'reported')) {
        fail(`cosmetics peer ${e.id} must not count as business confirmed/reported`);
      }
      if (['exposed_to_market', 'sold_through_channel'].includes(e.type) && ['confirmed', 'reported'].includes(e.status)) {
        fail(`cosmetics ${e.id} market/channel exposure must be reference not business`);
      }
      if (['provides_odm_for', 'provides_oem_for', 'manufactures_for'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)) {
        const anon = e.counterpartyDisclosure === 'anonymous' || e.metadata?.counterpartyDisclosure === 'anonymous';
        if (anon && e.target.startsWith('brand:')) {
          fail(`cosmetics ${e.id} must not map anonymous ODM to specific brand`);
        }
      }
      if (e.type === 'cross_sector_reference') {
        if (e.excludesFromBusinessCoverage !== true) {
          warn(`cosmetics cross_sector_reference ${e.id} should set excludesFromBusinessCoverage`);
        }
        if (e.status === 'confirmed' || e.status === 'reported') {
          fail(`cosmetics cross_sector_reference ${e.id} must not be confirmed business`);
        }
      }
      if (['distributes_for', 'exclusive_distributor_for'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)) {
        const cs = (e.evidence || []).some((ev) => ev.claimSupport?.relationship && (ev.claimSupport?.territory || ev.claimSupport?.exclusivity));
        if (!cs) fail(`cosmetics ${e.id} distribution edge missing territory/exclusivity claimSupport`);
      }
      if ((e.type === 'owns_brand') && e.status === 'confirmed') {
        if (!(e.evidence || []).some((ev) => ev.claimSupport?.legalOwner || ev.claimSupport?.ownershipType)) {
          fail(`cosmetics confirmed owns_brand ${e.id} needs legalOwner claimSupport`);
        }
      }
      if (['endorses_brand', 'collaborates_with_brand'].includes(e.type) && e.status === 'confirmed') {
        if (!(e.evidence || []).some((ev) => ev.claimSupport?.validFrom && ev.claimSupport?.validTo)) {
          fail(`cosmetics endorsement ${e.id} needs validFrom/validTo`);
        }
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const key of Object.keys(cc)) {
      if (key === 'metricNotes') continue;
      const val = cc[key];
      if (!val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `cosmetics.${key}`);
      if (err) fail(err);
    }
    for (const e of edges.filter((x) => x.type === 'cross_sector_reference')) {
      const src = e.source;
      const cleared = edges.some((x) => x.source === src
        && ['confirmed', 'reported'].includes(x.status)
        && !['peer', 'reference', 'cross_sector_reference', 'member_of', 'specializes_in',
          'owns_brand', 'operates_brand', 'licenses_brand', 'provides_odm', 'provides_oem',
          'used_in_product_category', 'exposed_to_market', 'sold_through_channel'].includes(x.type));
      if (cleared) fail(`cosmetics cross_sector_reference ${e.id} must not substitute for business edge on ${src}`);
    }
    if (metrics.confirmedBusinessEdgeCount > 12) {
      warn(`cosmetics confirmed business count ${metrics.confirmedBusinessEdgeCount} exceeds Phase 5E cap 12`);
    }
  }

  if (sectorKey === 'kconsume') {
    const listedTickers = new Set();
    const FORBIDDEN = new Set([
      'brand:item', 'product:item', 'consumer_product:item', 'category:item',
      'channel:item', 'market:item', 'franchise:item',
    ]);
    for (const n of nodes) {
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`kconsume listed_company id must be krx: ${n.id}`);
      }
      if (n.type === 'brand' && String(n.id).startsWith('krx:')) {
        fail(`kconsume brand must not use listed company id ${n.id}`);
      }
      if (FORBIDDEN.has(n.id)) fail(`kconsume forbidden generic ID ${n.id}`);
      if (n.type === 'listed_company') {
        if (listedTickers.has(n.ticker)) fail(`kconsume duplicate listed ticker ${n.ticker}`);
        listedTickers.add(n.ticker);
      }
    }
    for (const e of edges) {
      if (e.type === 'peer' && e.defaultHidden !== true) {
        fail(`kconsume peer edge ${e.id} must be defaultHidden`);
      }
      if (['exposed_to_market', 'sold_through_channel'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)) {
        fail(`kconsume ${e.id} market/channel exposure must be reference not business`);
      }
      if (e.type === 'owns_brand' && e.status === 'confirmed') {
        if (!(e.evidence || []).some((ev) => ev.claimSupport?.legalOwner || ev.claimSupport?.ownershipType)) {
          fail(`kconsume confirmed owns_brand ${e.id} needs legalOwner claimSupport`);
        }
      }
      if (e.type === 'cross_sector_reference') {
        if (e.excludesFromBusinessCoverage !== true) {
          warn(`kconsume cross_sector_reference ${e.id} should set excludesFromBusinessCoverage`);
        }
        if (e.status === 'confirmed' || e.status === 'reported') {
          fail(`kconsume cross_sector_reference ${e.id} must not be confirmed business`);
        }
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const key of Object.keys(cc)) {
      if (key === 'metricNotes') continue;
      const val = cc[key];
      if (!val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `kconsume.${key}`);
      if (err) fail(err);
    }
    if (metrics.confirmedBusinessEdgeCount > 12) {
      warn(`kconsume confirmed business count ${metrics.confirmedBusinessEdgeCount} exceeds Phase 5F cap 12`);
    }
  }

  if (sectorKey === 'kcontent') {
    const listedTickers = new Set();
    const FORBIDDEN = new Set([
      'artist:item', 'content:item', 'ip:item', 'platform:item',
      'production:item', 'market:item', 'creator:item', 'franchise_ip:item',
    ]);
    for (const n of nodes) {
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`kcontent listed_company id must be krx: ${n.id}`);
      }
      if ((n.type === 'artist_or_group' || n.type === 'content_ip') && String(n.id).startsWith('krx:')) {
        fail(`kcontent artist/IP must not use listed company id ${n.id}`);
      }
      if (FORBIDDEN.has(n.id)) fail(`kcontent forbidden generic ID ${n.id}`);
      if (n.type === 'listed_company') {
        if (listedTickers.has(n.ticker)) fail(`kcontent duplicate listed ticker ${n.ticker}`);
        listedTickers.add(n.ticker);
      }
    }
    for (const e of edges) {
      if (e.type === 'peer' && e.defaultHidden !== true) {
        fail(`kcontent peer edge ${e.id} must be defaultHidden`);
      }
      if (['streams_on', 'broadcasts_on', 'publishes_on'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)
        && e.exclusivity === true) {
        const hasTerm = (e.evidence || []).some((ev) => ev.claimSupport?.validFrom || ev.claimSupport?.exclusivity);
        if (!hasTerm) {
          fail(`kcontent ${e.id} exclusive platform edge needs exclusivity/term claimSupport`);
        }
      }
      if (['represents_artist', 'manages_artist'].includes(e.type)
        && e.status === 'confirmed'
        && e.exclusive === true
        && !(e.validFrom || (e.evidence || []).some((ev) => ev.claimSupport?.validFrom))) {
        fail(`kcontent confirmed exclusive artist edge ${e.id} needs validFrom`);
      }
      if (e.type === 'owns_ip' && e.status === 'confirmed') {
        if (!(e.evidence || []).some((ev) => ev.claimSupport?.legalOwner || ev.claimSupport?.ownershipType || ev.claimSupport?.ip)) {
          fail(`kcontent confirmed owns_ip ${e.id} needs ownership/ip claimSupport`);
        }
      }
      if (e.type === 'cross_sector_reference') {
        if (e.excludesFromBusinessCoverage !== true) {
          warn(`kcontent cross_sector_reference ${e.id} should set excludesFromBusinessCoverage`);
        }
        if (e.status === 'confirmed' || e.status === 'reported') {
          fail(`kcontent cross_sector_reference ${e.id} must not be confirmed business`);
        }
      }
      if (['collaborates_with_brand', 'endorses_brand', 'licenses_ip_for_merchandise'].includes(e.type)
        && ['confirmed', 'reported'].includes(e.status)) {
        // Brand collab must not clear business orphans implicitly — structural check via metrics elsewhere
        if (!(e.evidence || []).some((ev) => ev.claimSupport?.validFrom)) {
          warn(`kcontent brand collab ${e.id} should record validFrom when confirmed`);
        }
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const key of Object.keys(cc)) {
      if (key === 'metricNotes') continue;
      const val = cc[key];
      if (!val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `kcontent.${key}`);
      if (err) fail(err);
    }
    if (metrics.confirmedBusinessEdgeCount > 15) {
      warn(`kcontent confirmed business count ${metrics.confirmedBusinessEdgeCount} exceeds Phase 5F cap 15`);
    }
  }

  if (sectorKey === 'medtech') {
    const listedTickers = new Set();
    const FORBIDDEN = new Set([
      'device:item', 'product:item', 'medical_device:item', 'technology:item',
      'indication:item', 'market:item', 'clearance:item', 'device_category:item', 'specialty:item',
    ]);
    const REGULATORY = new Set(['approved_or_cleared_by', 'registered_in_market', 'approved_in']);
    for (const n of nodes) {
      if (n.type === 'listed_company' && n.id && !String(n.id).startsWith('krx:')) {
        fail(`medtech listed_company id must be krx: ${n.id}`);
      }
      if ((n.type === 'device_category' || n.type === 'clinical_specialty' || n.type === 'medical_device'
        || n.type === 'regulatory_clearance') && String(n.id).startsWith('krx:')) {
        fail(`medtech device/specialty/clearance must not use listed company id ${n.id}`);
      }
      if (FORBIDDEN.has(n.id)) fail(`medtech forbidden generic ID ${n.id}`);
      if (n.type === 'listed_company') {
        if (listedTickers.has(n.ticker)) fail(`medtech duplicate listed ticker ${n.ticker}`);
        listedTickers.add(n.ticker);
      }
      if (n.type === 'regulatory_clearance' && !n.identifier && !String(n.id).includes(':')) {
        fail(`medtech clearance node ${n.id} missing identifier`);
      }
    }
    for (const e of edges) {
      if (e.type === 'peer' && e.defaultHidden !== true) {
        fail(`medtech peer edge ${e.id} must be defaultHidden`);
      }
      if (REGULATORY.has(e.type) && ['confirmed', 'reported'].includes(e.status)) {
        fail(`medtech ${e.id} regulatory edge must not be confirmed/reported business`);
      }
      if (['exposed_to_market'].includes(e.type) && ['confirmed', 'reported'].includes(e.status)) {
        fail(`medtech ${e.id} market exposure must be reference not business`);
      }
      if (e.type === 'exclusive_distributor_for' && ['confirmed', 'reported'].includes(e.status)) {
        const hasExcl = e.exclusivity === true
          && (e.evidence || []).some((ev) => ev.claimSupport?.exclusivity || ev.claimSupport?.territory);
        if (!hasExcl) fail(`medtech ${e.id} exclusive distributor needs exclusivity/territory evidence`);
      }
      if (e.type === 'cross_sector_reference') {
        if (e.excludesFromBusinessCoverage !== true) {
          warn(`medtech cross_sector_reference ${e.id} should set excludesFromBusinessCoverage`);
        }
        if (e.excludesFromOrphanResolution !== true) {
          warn(`medtech cross_sector_reference ${e.id} should set excludesFromOrphanResolution`);
        }
        if (e.status === 'confirmed' || e.status === 'reported') {
          fail(`medtech cross_sector_reference ${e.id} must not be confirmed business`);
        }
      }
      if ((e.type === 'owns' || e.type === 'owns_stake_in') && e.status === 'confirmed') {
        if (e.stakePct == null || !e.asOf) {
          fail(`medtech confirmed ownership ${e.id} needs stakePct/asOf`);
        }
      }
    }
    const metrics = network.metrics || {};
    const cc = metrics.claimCoverage || {};
    for (const key of Object.keys(cc)) {
      if (key === 'metricNotes') continue;
      const val = cc[key];
      if (!val || typeof val !== 'object') continue;
      const err = validateCoverageMetric(val, `medtech.${key}`);
      if (err) fail(err);
    }
    if (metrics.confirmedBusinessEdgeCount > 12) {
      warn(`medtech confirmed business count ${metrics.confirmedBusinessEdgeCount} exceeds Phase 5G cap 12`);
    }
  }

  const orphanListed = listedIds.filter((id) => (degree.get(id) || 0) === 0);
  const hubNodes = [...degree.entries()]
    .filter(([, d]) => d >= 12)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, d]) => ({ id, degree: d, name: nodeMap.get(id)?.nameKo }));

  const peerEdges = edges.filter((e) => e.type === 'peer' || e.status === 'peer');
  if (peerEdges.length > listedIds.length * 3 && sectorKey === 'bio') {
    warn('bio peer edge density high — ensure defaultHidden');
  }

  for (const [url, info] of urlUsage) {
    if (info.count < 10) continue;
    if (info.rosterEligible) {
      // Official group-designation / statutory roster may back many group_member edges.
      // Still require each edge to name its parties in relationshipSupported.
      for (const e of info.edges) {
        const ev = (e.evidence || []).find((x) => x.url === url);
        const rs = String(ev?.relationshipSupported || '');
        if (!rs) {
          warn(`official_roster evidence on ${e.id} missing relationshipSupported`);
          continue;
        }
        if (!rs.includes(e.source) || !rs.includes(e.target)) {
          warn(`official_roster evidence on ${e.id} relationshipSupported must name source and target`);
        }
      }
      continue;
    }
    warn(`evidence URL reused on ${info.count} confirmed/reported edges: ${url.slice(0, 80)}…`);
  }

  const entityIssues = auditEntityIssues(network);
  for (const ei of entityIssues) {
    if (ei.kind === 'dangling_edge_source' || ei.kind === 'dangling_edge_target') {
      fail(`entity ${ei.kind} edge ${ei.edgeId}`);
    } else if (ei.kind === 'kr_ticker_on_global') {
      fail(`node ${ei.nodeId} has KR ticker on global_company`);
    } else if (ei.kind === 'duplicate_ticker') {
      warn(`duplicate ticker ${ei.ticker}: ${ei.nodeIds.join(', ')}`);
    } else if (ei.kind === 'alias_canonical_collision') {
      fail(`node ${ei.nodeId} alias collides with canonical id ${ei.alias}`);
    }
  }

  for (const n of nodes) {
    if (n.type === 'domestic_anchor' && !n.ticker) {
      fail(`domestic_anchor ${n.id} missing ticker`);
    }
    if (n.type === 'listed_company' && n.ticker && !n.isListedKorea) {
      warn(`listed_company ${n.id} missing isListedKorea flag`);
    }
    if ((n.type === 'product_category' || n.type === 'end_market' || n.type === 'technology') && n.mcapWon != null) {
      fail(`non-company node ${n.id} should not have mcapWon`);
    }
  }

  if (sectorKey === 'bigchip') {
    if (!nodeMap.has('krx:005930')) fail('bigchip missing krx:005930');
    if (!nodeMap.has('krx:000660')) fail('bigchip missing krx:000660');
    for (const bad of ['anchor:005930', 'anchor:000660', 'global:samsung_d', 'global:skhynix_d']) {
      if (nodeMap.has(bad)) fail(`bigchip must not include duplicate node ${bad}`);
    }
    for (const id of ['krx:005930', 'krx:000660']) {
      const n = nodeMap.get(id);
      if (n?.type === 'global_company') fail(`${id} must not be global_company`);
      if (n && !n.excludeFromGlobalCount) warn(`${id} should excludeFromGlobalCount`);
    }
    for (const e of edges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      const companyTypes = new Set(['listed_company', 'global_company', 'domestic_unlisted_company', 'subsidiary', 'joint_venture']);
      const structTypes = new Set(['product_category', 'technology', 'equipment_category', 'material_category', 'end_market']);
      if (['supplies_to', 'equipment_for', 'material_for', 'customer_of'].includes(e.type)) {
        if (structTypes.has(src?.type) || structTypes.has(tgt?.type)) {
          fail(`bigchip ${e.id}: company relation type on product/market node`);
        }
      }
      if (['produces', 'exposed_to', 'used_in_market'].includes(e.type)) {
        if (e.type === 'produces' && !structTypes.has(tgt?.type) && tgt?.type !== 'product_category') {
          warn(`bigchip produces ${e.id} target should be product_category`);
        }
      }
      if (e.status === 'ended' && e.defaultHidden === false) {
        warn(`bigchip ended edge ${e.id} should be defaultHidden`);
      }
    }
  }

  for (const e of edges) {
    if (e.status === 'confirmed') {
      for (const ev of e.evidence || []) {
        if (!ev.relationshipSupported) {
          warn(`confirmed edge ${e.id} missing relationshipSupported`);
        }
      }
    }
  }

  const metrics = aggregateEvidenceMetrics(edges);
  const orphanMetrics = computeListedRelationOrphanMetrics(network);

  const summary = {
    sector: sectorKey,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    statusCounts,
    typeCounts,
    evidenceFieldCoverage: metrics.evidenceFieldCoverage,
    directEvidenceCoverage: metrics.directEvidenceCoverage,
    primarySourceCoverage: metrics.primarySourceCoverage,
    staleEdgeCount: edges.filter((e) => e.validTo && e.validTo < today).length,
    orphanListedCompanyCount: orphanListed.length,
    structuralOrphanCount: orphanMetrics.structuralOrphanCount,
    businessRelationOrphanCount: orphanMetrics.businessRelationOrphanCount,
    directRelationshipOrphanCount: orphanMetrics.directRelationshipOrphanCount,
    classificationOnlyCompanyCount: orphanMetrics.classificationOnlyCompanyCount,
    weakRelationOnlyCompanyCount: orphanMetrics.weakRelationOnlyCompanyCount,
    legacyFallback: legacyFallback > 0 || !!network._legacyFallback,
    hubNodes,
    overusedEvidenceUrls: metrics.overusedEvidenceUrls,
  };

  return { failures, warnings, summary };
}

/** @deprecated use validateNetworkReport */
export function validateNetwork(network, opts = {}) {
  const { failures, warnings, summary } = validateNetworkReport(network);
  return {
    failures,
    stats: {
      nodes: summary.nodeCount,
      edges: summary.edgeCount,
      confirmedEdges: summary.statusCounts?.confirmed || 0,
      inferredEdges: summary.statusCounts?.inferred || 0,
      referenceEdges: summary.statusCounts?.reference || 0,
      evidenceCoverage: summary.evidenceFieldCoverage,
      orphanListed: [],
      staleEdges: [],
      legacyFallbackCount: summary.legacyFallback ? 1 : 0,
      hubNodes: summary.hubNodes,
      duplicateEdges: 0,
      warnings,
    },
  };
}

export function validateNetworkFile(filePath) {
  const network = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return validateNetworkReport(network);
}
