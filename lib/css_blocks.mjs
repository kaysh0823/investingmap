/**
 * CSS brace-depth helpers for build patches / verify.
 * Comments (/* ... *\/) are skipped when counting braces.
 */

/** Remove /* ... *\/ comments (non-greedy, non-nested). */
export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Walk css; optional onBrace(i, depthAfter, ch). Returns final depth.
 */
export function scanBraceDepth(css, onBrace) {
  let i = 0;
  let depth = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (css[i] === '{') {
      depth += 1;
      if (onBrace) onBrace(i, depth, '{');
    } else if (css[i] === '}') {
      depth -= 1;
      if (onBrace) onBrace(i, depth, '}');
    }
    i += 1;
  }
  return depth;
}

/** Depth immediately before index `pos`. */
export function depthAt(css, pos) {
  return scanBraceDepth(css.slice(0, Math.max(0, pos)));
}

/** Comment-stripped braces never go negative and end at 0. */
export function isCssBalanced(css) {
  let depth = 0;
  let i = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
    i += 1;
  }
  return depth === 0;
}

function matchStart(css, startMarker, fromIndex) {
  if (typeof startMarker === 'string') {
    const commentRe = new RegExp(
      String.raw`\/\*\s*${startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\*\/`,
      'g',
    );
    commentRe.lastIndex = fromIndex;
    const m = commentRe.exec(css);
    return m && m.index >= fromIndex ? m : null;
  }
  const re = new RegExp(startMarker.source, startMarker.flags.includes('g') ? startMarker.flags : `${startMarker.flags}g`);
  re.lastIndex = fromIndex;
  const m = re.exec(css);
  return m && m.index >= fromIndex ? m : null;
}

function matchEnd(css, endMarker, fromIndex) {
  if (endMarker == null) return null;
  if (typeof endMarker === 'string') {
    const commentRe = new RegExp(
      String.raw`\/\*\s*${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\*\/`,
    );
    const rest = css.slice(fromIndex);
    const m = commentRe.exec(rest);
    return m ? { index: fromIndex + m.index, length: m[0].length } : null;
  }
  const rest = css.slice(fromIndex);
  const m = endMarker.exec(rest);
  return m ? { index: fromIndex + m.index, length: m[0].length } : null;
}

function expandLeadingWs(css, startIdx) {
  let sliceStart = startIdx;
  while (sliceStart > 0 && /[ \t]/.test(css[sliceStart - 1])) sliceStart -= 1;
  if (sliceStart > 0 && (css[sliceStart - 1] === '\n' || css[sliceStart - 1] === '\r')) {
    if (css[sliceStart - 1] === '\n' && sliceStart > 1 && css[sliceStart - 2] === '\r') sliceStart -= 2;
    else sliceStart -= 1;
  }
  return sliceStart;
}

/**
 * Find a marked CSS block.
 *
 * - If endMarker is provided: start comment → end comment (marker-based, depth-agnostic).
 * - If endMarker is null: start comment → last `}` that returns to the depth at start
 *   (completed rule units only), stopping before the next `/* investingmap-` or `@media`.
 *
 * @returns {{ start: number, end: number, block: string } | null}
 */
export function findTopLevelBlock(css, startMarker, endMarkerOrBalanced = null, fromIndex = 0) {
  const sm = matchStart(css, startMarker, fromIndex);
  if (!sm) return null;

  const sliceStart = expandLeadingWs(css, sm.index);
  const afterStart = sm.index + sm[0].length;

  if (endMarkerOrBalanced != null) {
    const em = matchEnd(css, endMarkerOrBalanced, afterStart);
    if (em) {
      return { start: sliceStart, end: em.index + em.length, block: css.slice(sliceStart, em.index + em.length) };
    }
  }

  // Brace-balanced tail: consume complete rules until boundary.
  const depthAtStart = depthAt(css, sm.index);
  let i = afterStart;
  let depth = depthAtStart;
  let seenOpen = false;
  let lastBalancedEnd = -1;

  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      // Always stop before the next investingmap- marked section (even if braces are
      // currently unbalanced — that is the repair case for a truncated sticky-base).
      if (i > afterStart && /\/\*\s*investingmap-/.test(css.slice(i, Math.min(css.length, i + 120)))) {
        const end =
          depth === depthAtStart && lastBalancedEnd >= 0 ? lastBalancedEnd : i;
        return { start: sliceStart, end, block: css.slice(sliceStart, end) };
      }
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (depth === depthAtStart && /^@media\b/.test(css.slice(i))) {
      const end = lastBalancedEnd >= 0 ? lastBalancedEnd : i;
      return { start: sliceStart, end, block: css.slice(sliceStart, end) };
    }
    if (css[i] === '{') {
      depth += 1;
      seenOpen = true;
      i += 1;
      continue;
    }
    if (css[i] === '}') {
      depth -= 1;
      i += 1;
      if (seenOpen && depth === depthAtStart) {
        lastBalancedEnd = i;
        let j = i;
        while (j < css.length && /[ \t\r\n]/.test(css[j])) j += 1;
        if (j >= css.length) {
          return { start: sliceStart, end: lastBalancedEnd, block: css.slice(sliceStart, lastBalancedEnd) };
        }
        if (css[j] === '/' && css[j + 1] === '*') {
          return { start: sliceStart, end: lastBalancedEnd, block: css.slice(sliceStart, lastBalancedEnd) };
        }
        if (/^@media\b/.test(css.slice(j))) {
          return { start: sliceStart, end: lastBalancedEnd, block: css.slice(sliceStart, lastBalancedEnd) };
        }
        // Another rule at same depth — continue (same marked block).
      }
      continue;
    }
    i += 1;
  }

  if (lastBalancedEnd >= 0) {
    return { start: sliceStart, end: lastBalancedEnd, block: css.slice(sliceStart, lastBalancedEnd) };
  }
  const rest = css.slice(afterStart);
  const bound = rest.search(/\/\*\s*investingmap-|(?:^|\n)\s*@media\b/);
  const end = bound < 0 ? css.length : afterStart + bound;
  return { start: sliceStart, end, block: css.slice(sliceStart, end) };
}

/**
 * True if `selector` opens a rule at brace depth 0.
 */
export function hasTopLevelRule(css, selector) {
  let from = 0;
  while (from < css.length) {
    const idx = css.indexOf(selector, from);
    if (idx < 0) return false;
    const lastOpen = css.lastIndexOf('/*', idx);
    const lastClose = css.lastIndexOf('*/', idx);
    if (lastOpen > lastClose) {
      from = idx + selector.length;
      continue;
    }
    const after = css.slice(idx + selector.length);
    const braceRel = after.search(/\{/);
    if (braceRel < 0) return false;
    const between = after.slice(0, braceRel);
    if (/[{}]/.test(stripCssComments(between))) {
      from = idx + selector.length;
      continue;
    }
    const openIdx = idx + selector.length + braceRel;
    if (depthAt(css, openIdx) === 0) return true;
    from = idx + selector.length;
  }
  return false;
}

/** Top-level selectors (text before `{` when depth goes 0→1). */
export function topLevelSelectors(css) {
  const selectors = new Set();
  let i = 0;
  let depth = 0;
  let selStart = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      if (depth === 0) selStart = i;
      continue;
    }
    if (css[i] === '{') {
      if (depth === 0) {
        const sel = stripCssComments(css.slice(selStart, i)).replace(/\s+/g, ' ').trim();
        if (sel) selectors.add(sel);
      }
      depth += 1;
      i += 1;
      continue;
    }
    if (css[i] === '}') {
      depth -= 1;
      i += 1;
      if (depth === 0) selStart = i;
      continue;
    }
    i += 1;
  }
  return selectors;
}

/**
 * Remove only orphan `}` (depth already 0 at that `}`) immediately before matches of nextRe.
 * Legitimate closers (depth ≥ 1) are kept — this replaces the old blanket
 * `}\n /* editorial` / `}\n @media` deletes that ate hover-rule braces.
 */
export function stripOrphanCloseBefore(css, nextRe) {
  const re = new RegExp(nextRe.source, nextRe.flags.includes('g') ? nextRe.flags : `${nextRe.flags}g`);
  const hits = [];
  let m;
  while ((m = re.exec(css))) hits.push(m.index);
  let out = css;
  for (let h = hits.length - 1; h >= 0; h -= 1) {
    const idx = hits[h];
    let i = idx;
    while (i > 0 && /[ \t]/.test(out[i - 1])) i -= 1;
    if (i > 0 && (out[i - 1] === '\n' || out[i - 1] === '\r')) {
      if (out[i - 1] === '\n' && i > 1 && out[i - 2] === '\r') i -= 2;
      else i -= 1;
    }
    while (i > 0 && /[ \t]/.test(out[i - 1])) i -= 1;
    if (i <= 0 || out[i - 1] !== '}') continue;
    const closeIdx = i - 1;
    if (depthAt(out, closeIdx) !== 0) continue;
    let from = closeIdx;
    if (from > 0 && out[from - 1] === '\n') {
      if (from > 1 && out[from - 2] === '\r') from -= 2;
      else from -= 1;
    }
    out = out.slice(0, from) + out.slice(idx);
  }
  return out;
}

/**
 * Insert `block` at depth 0 immediately before the first top-level
 * `@media (max-width: 768px)`.
 */
export function insertBlockAtTopLevelBeforeMobileMedia(css, block) {
  let i = 0;
  let depth = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (css[i] === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (css[i] === '}') {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && /^@media\s*\(\s*max-width:\s*768px\s*\)/i.test(css.slice(i))) {
      const trimmed = block.trim();
      const prefix = css.slice(0, i).replace(/\s*$/, '\n\n    ');
      return `${prefix}${trimmed}\n    ${css.slice(i)}`;
    }
    i += 1;
  }
  return `${css.replace(/\s*$/, '')}\n\n    ${block.trim()}\n`;
}

/** Apply a transform to the first <style>…</style> body; leave the rest intact. */
export function mapFirstStyle(html, transformCss) {
  const re = /<style\b[^>]*>/i;
  const open = re.exec(html);
  if (!open) return html;
  const start = open.index + open[0].length;
  const close = html.indexOf('</style>', start);
  if (close < 0) return html;
  const css = html.slice(start, close);
  const next = transformCss(css);
  if (next === css) return html;
  return html.slice(0, start) + next + html.slice(close);
}
