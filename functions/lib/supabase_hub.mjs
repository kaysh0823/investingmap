/**
 * Shared Supabase REST helpers for hub dashboard Pages Functions.
 */

export function getSupabaseConfig(env, opts = {}) {
  const url = (env?.SUPABASE_URL || '').replace(/\/$/, '');
  const preferService = !!opts.preferServiceRole;
  const anonKey = preferService
    ? (env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_ANON_KEY || '').trim()
    : (env?.SUPABASE_ANON_KEY || env?.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ warnIfTruncated?: string, preferCountExact?: boolean, paginate?: boolean, pageSize?: number }} [opts]
 *   warnIfTruncated — if Content-Range total > rows.length, console.warn this message
 *   paginate — follow limit/offset until all rows fetched (bypasses PostgREST max-rows=1000)
 */
export async function fetchSupabaseJson(config, pathAndQuery, opts = {}) {
  if (opts.paginate) {
    const pageSize = Math.max(1, Math.min(Number(opts.pageSize) || 1000, 1000));
    const out = [];
    let offset = 0;
    const base = String(pathAndQuery)
      .replace(/([?&])limit=\d+/gi, '$1')
      .replace(/([?&])offset=\d+/gi, '$1')
      .replace(/[?&]{2,}/g, (m) => m[0])
      .replace(/[?&]$/, '');
    for (;;) {
      const sep = base.includes('?') ? '&' : '?';
      const page = await fetchSupabaseJson(
        config,
        `${base}${sep}limit=${pageSize}&offset=${offset}`,
        { preferCountExact: false },
      );
      out.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
      if (offset > 100000) {
        if (opts.warnIfTruncated) console.warn(opts.warnIfTruncated);
        break;
      }
    }
    return out;
  }

  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
  };
  if (opts.preferCountExact !== false) {
    headers.Prefer = 'count=exact';
  }
  const res = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`supabase_fetch_failed:${res.status}:${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('supabase_invalid_response');
  }
  const range = res.headers.get('content-range') || '';
  const totalMatch = range.match(/\/(\d+)\s*$/);
  if (totalMatch && opts.warnIfTruncated) {
    const total = Number(totalMatch[1]);
    if (Number.isFinite(total) && total > data.length) {
      console.warn(opts.warnIfTruncated);
    }
  }
  return data;
}
