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
import { computeListedRelationOrphanMetrics } from './orphan_metrics.mjs';

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
