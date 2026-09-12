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

export async function fetchSupabaseJson(config, pathAndQuery) {
  const res = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`supabase_fetch_failed:${res.status}:${body.slice(0, 120)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('supabase_invalid_response');
  }
  return data;
}
