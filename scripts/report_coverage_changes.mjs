/**
 * Weekly coverage diff: curated cp_list ∩ mcap ≥ MIN_MCAP_WON vs prior snapshot.
 *
 * Writes:
 *   docs/reports/coverage_weekly_diff.md
 *   data/coverage_snapshot.json
 *
 * Usage: node scripts/report_coverage_changes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCpListUniverse, normalizeTicker } from '../lib/cp_list_universe.mjs';
import {
  loadMergedKrxMap,
  resolveLatestCsv,
  extractYmdFromFilename,
} from '../lib/krx_data_sources.mjs';
import { MIN_MCAP_WON } from '../lib/mcap_policy.mjs';
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { listHubCompanies } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const CP_LIST_DIR = path.join(ROOT, 'cp_list');
const SNAPSHOT_PATH = path.join(DATA_DIR, 'coverage_snapshot.json');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'coverage_weekly_diff.md');

function padTicker(t) {
  const n = normalizeTicker(t);
  if (!n) return null;
  if (/^[0-9]+$/.test(n) && n.length <= 6) return n.padStart(6, '0');
  return n;
}

function fmtMcapJo(won) {
  if (!Number.isFinite(won) || won <= 0) return '—';
  return `${(won / 1e12).toFixed(2)}조`;
}

function sectorLabel(sectorId) {
  if (!sectorId) return '—';
  const m = SECTOR_META[sectorId];
  return m ? `${sectorId} (${m.ko})` : sectorId;
}

function csvYmdLabel(dataDir) {
  const dates = [];
  for (const prefix of ['data_4937_', 'data_4848_']) {
    try {
      const fp = resolveLatestCsv(dataDir, prefix);
      const ymd = extractYmdFromFilename(path.basename(fp));
      if (ymd) dates.push(`${ymd.y}${String(ymd.mo).padStart(2, '0')}${String(ymd.d).padStart(2, '0')}`);
    } catch {
      /* missing prefix */
    }
  }
  dates.sort();
  return dates[dates.length - 1] || null;
}

function ymdToDash(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** Collect curated tickers: cp_list + sector additions + hub (already mapped). */
function loadCuratedUniverse() {
  const byTicker = new Map();

  const upsert = (tickerRaw, patch) => {
    const ticker = padTicker(tickerRaw);
    if (!ticker) return;
    const prev = byTicker.get(ticker) || { ticker, name: '', sector: '' };
    if (patch.name && !prev.name) prev.name = patch.name;
    if (patch.sector && !prev.sector) prev.sector = patch.sector;
    byTicker.set(ticker, prev);
  };

  const universe = loadCpListUniverse(CP_LIST_DIR);
  for (const [industry, indMap] of universe) {
    for (const [ticker, entry] of indMap) {
      upsert(ticker, { name: entry.nameKo || '', sector: industry });
    }
  }

  const additionFiles = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const dir = path.join(ROOT, d.name);
      return fs
        .readdirSync(dir)
        .filter((f) => /^cp_list_.*_additions\.json$/i.test(f))
        .map((f) => ({ sector: d.name === 'semiconductor' ? 'semi' : d.name, file: path.join(dir, f) }));
    });

  for (const { sector, file } of additionFiles) {
    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || !row.ticker) continue;
      upsert(row.ticker, { name: row.name || row.nameEn || '', sector });
    }
  }

  const hubPath = path.join(DATA_DIR, 'hub_index.json');
  if (fs.existsSync(hubPath)) {
    try {
      const hub = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
      for (const c of listHubCompanies(hub)) {
        upsert(c.ticker, { name: c.name || c.nameEn || '', sector: c.sectorId || '' });
      }
    } catch {
      /* hub optional for sector enrichment */
    }
  }

  return byTicker;
}

function loadPreviousSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function buildMarkdown({ asOfDash, csvYmd, floorWon, isBaseline, added, removed, coverCount, prevCount }) {
  const lines = [];
  lines.push(`# 주간 시총 커버리지 편입/편출`);
  lines.push('');
  lines.push(`- **기준일**: ${asOfDash}`);
  lines.push(`- **KRX CSV**: ${csvYmd ? ymdToDash(csvYmd) : '—'}`);
  lines.push(`- **하한**: ${(floorWon / 1e8).toLocaleString('ko-KR')}억원`);
  lines.push(`- **현재 커버셋**: ${coverCount}종목`);
  if (prevCount != null) lines.push(`- **이전 커버셋**: ${prevCount}종목`);
  lines.push('');

  if (isBaseline) {
    lines.push('> 최초 스냅샷입니다. 이전 비교 대상이 없어 편입/편출 목록은 비어 있습니다.');
    lines.push('');
  }

  lines.push(`## 편입 (신규 통과) — ${added.length}건`);
  lines.push('');
  if (!added.length) {
    lines.push('_없음_');
  } else {
    lines.push('| 티커 | 종목 | 섹터 | 시총 |');
    lines.push('| --- | --- | --- | ---: |');
    for (const r of added) {
      lines.push(`| ${r.ticker} | ${r.name} | ${sectorLabel(r.sector)} | ${fmtMcapJo(r.mcapWon)} |`);
    }
  }
  lines.push('');

  lines.push(`## 편출 (시총 미달) — ${removed.length}건`);
  lines.push('');
  if (!removed.length) {
    lines.push('_없음_');
  } else {
    lines.push('| 티커 | 종목 | 섹터 | 현재 시총 |');
    lines.push('| --- | --- | --- | ---: |');
    for (const r of removed) {
      lines.push(`| ${r.ticker} | ${r.name} | ${sectorLabel(r.sector)} | ${fmtMcapJo(r.mcapWon)} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('자동 생성: `scripts/report_coverage_changes.mjs` (맵 자동 추가는 하지 않음).');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const krx = loadMergedKrxMap(DATA_DIR);
  const csvYmd = csvYmdLabel(DATA_DIR);
  const asOf = new Date().toISOString();
  const asOfDash = asOf.slice(0, 10);

  const curated = loadCuratedUniverse();
  const coverage = {};

  for (const [ticker, meta] of curated) {
    const row = krx.get(ticker);
    const mcapWon = row && row.mcap > 0 ? row.mcap : 0;
    if (mcapWon < MIN_MCAP_WON) continue;
    coverage[ticker] = {
      name: (row && row.name) || meta.name || ticker,
      sector: meta.sector || '',
      mcapWon,
      market: (row && row.market) || '',
    };
  }

  const prev = loadPreviousSnapshot();
  const isBaseline = !prev || !prev.coverage || typeof prev.coverage !== 'object';
  const prevCoverage = isBaseline ? {} : prev.coverage;

  const added = [];
  for (const [ticker, cur] of Object.entries(coverage)) {
    if (prevCoverage[ticker]) continue;
    added.push({ ticker, ...cur });
  }
  added.sort((a, b) => b.mcapWon - a.mcapWon || a.ticker.localeCompare(b.ticker));

  const removed = [];
  for (const [ticker, old] of Object.entries(prevCoverage)) {
    const row = krx.get(ticker);
    const mcapWon = row && row.mcap > 0 ? row.mcap : 0;
    if (mcapWon >= MIN_MCAP_WON) continue;
    removed.push({
      ticker,
      name: (row && row.name) || old.name || ticker,
      sector: old.sector || curated.get(ticker)?.sector || '',
      mcapWon,
    });
  }
  removed.sort((a, b) => a.mcapWon - b.mcapWon || a.ticker.localeCompare(b.ticker));

  const snapshot = {
    generatedAt: asOf,
    krxCsvDate: csvYmd,
    floorWon: MIN_MCAP_WON,
    coverageCount: Object.keys(coverage).length,
    coverage,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    buildMarkdown({
      asOfDash,
      csvYmd,
      floorWon: MIN_MCAP_WON,
      isBaseline,
      added: isBaseline ? [] : added,
      removed: isBaseline ? [] : removed,
      coverCount: snapshot.coverageCount,
      prevCount: isBaseline ? null : Object.keys(prevCoverage).length,
    }),
    'utf8',
  );
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log('coverage weekly diff');
  console.log(`  KRX CSV date: ${csvYmd ? ymdToDash(csvYmd) : '—'}`);
  console.log(`  curated:      ${curated.size}`);
  console.log(`  cover set:    ${snapshot.coverageCount}`);
  console.log(`  baseline:     ${isBaseline}`);
  console.log(`  편입:         ${isBaseline ? 0 : added.length}`);
  console.log(`  편출:         ${isBaseline ? 0 : removed.length}`);
  console.log(`  report:       ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(`  snapshot:     ${path.relative(ROOT, SNAPSHOT_PATH)}`);
}

main();
