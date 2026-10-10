/**
 * FnGuide consensus via Naver WiseReport annual financial table (cF1001).
 * Estimate columns are titled YYYY/MM(E). Only fiscal period-ends after
 * today are assigned to FY1 / FY2 / FY3.
 */

const YEAR_COL = /(\d{4})\/(\d{2})\s*(\(E\))?/;

export function extractEncparam(html) {
  const m = String(html || '').match(/encparam\s*:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowCells(trHtml) {
  const cells = [];
  const re = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = re.exec(trHtml))) {
    const attrs = m[1] || '';
    const titleMatch = /title="([^"]*)"/.exec(attrs);
    cells.push({
      title: titleMatch ? titleMatch[1] : null,
      text: stripTags(m[2]),
    });
  }
  return cells;
}

function splitRows(html) {
  const rows = [];
  const re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    rows.push(rowCells(m[2]));
  }
  return rows;
}

/** Last calendar day of YYYY-MM, as YYYY-MM-DD. */
export function fiscalPeriodEnd(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const dt = new Date(Date.UTC(y, m, 0));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

function parseHeader(cell) {
  const m = YEAR_COL.exec(cell?.text || '');
  if (!m) return null;
  const end = fiscalPeriodEnd(m[1], m[2]);
  if (!end) return null;
  return { end, estimate: !!m[3] };
}

/**
 * Blank, dash, or non-numeric → null. Negatives (loss estimates) are kept.
 * Prefers the cell title (unrounded) over the visible rounded span.
 */
export function parseEpsNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/&nbsp;/gi, ' ').replace(/,/g, '').trim();
  if (!s || s === '-' || s === '—' || s === '–' || /^n\/a$/i.test(s)) return null;
  if (s.startsWith('(') && s.endsWith(')')) s = `-${s.slice(1, -1).trim()}`;
  s = s.replace(/[^\d.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellEps(cell) {
  const fromTitle = parseEpsNumber(cell?.title);
  if (fromTitle != null) return fromTitle;
  if (cell?.title != null && String(cell.title).trim() !== '') return null;
  return parseEpsNumber(cell?.text);
}

function isEpsLabel(text) {
  return /^EPS\b/i.test(String(text || '').trim());
}

/**
 * @param {string} html
 * @param {string} todayDash YYYY-MM-DD (or YYYYMMDD)
 * @returns {{ fy1: {end: string, eps: number|null}|null, fy2: {end: string, eps: number|null}|null, fy3: {end: string, eps: number|null}|null }}
 */
export function parseConsensusAnnual(html, todayDash) {
  const empty = { fy1: null, fy2: null, fy3: null };
  const today = String(todayDash || '').replace(/\D/g, '');
  const todayIso = today.length >= 8
    ? `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`
    : '';
  const rows = splitRows(html);
  let header = null;
  let epsRow = null;
  for (const cells of rows) {
    const years = cells.map(parseHeader).filter(Boolean);
    if (years.length) header = years;
    const label = cells.find((c) => isEpsLabel(c.text));
    if (label) {
      epsRow = cells;
      break;
    }
  }
  if (!epsRow || !header) return empty;

  const dataCells = isEpsLabel(epsRow[0]?.text) ? epsRow.slice(1) : epsRow.filter((c) => !isEpsLabel(c.text));
  const future = [];
  const n = Math.min(header.length, dataCells.length);
  for (let i = 0; i < n; i += 1) {
    const col = header[i];
    if (!col.estimate) continue;
    if (!todayIso || !(col.end > todayIso)) continue;
    future.push({ end: col.end, eps: cellEps(dataCells[i]) });
  }
  future.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
  return {
    fy1: future[0] || null,
    fy2: future[1] || null,
    fy3: future[2] || null,
  };
}
