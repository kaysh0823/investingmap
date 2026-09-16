/**
 * Unified Cache-Control / ETag / X-Data-Version for returns APIs.
 * All horizons/sessions use the same short TTL + must-revalidate.
 */

export const RETURNS_CACHE_CONTROL = 'public, max-age=60, must-revalidate';

/**
 * @param {string} s
 * @returns {string}
 */
export function simpleHash(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * @param {{ dataVersion?: string|null, horizon?: string|null, codesHash?: string|null }} opts
 * @returns {string}
 */
export function buildReturnsETag({ dataVersion, horizon, codesHash } = {}) {
  const parts = [String(dataVersion || '0')];
  if (horizon) parts.push(String(horizon));
  if (codesHash) parts.push(String(codesHash));
  return `W/"${parts.join(':')}"`;
}

/**
 * Normalize ETag / If-None-Match for weak comparison.
 * @param {string|null|undefined} v
 */
function normalizeEtagToken(v) {
  return String(v || '')
    .trim()
    .replace(/^W\//i, '')
    .replace(/^"|"$/g, '');
}

/**
 * @param {{
 *   cors?: Record<string, string>,
 *   dataVersion?: string|null,
 *   horizon?: string|null,
 *   codesHash?: string|null,
 *   extra?: Record<string, string>,
 * }} opts
 */
export function returnsResponseHeaders({
  cors = {},
  dataVersion = null,
  horizon = null,
  codesHash = null,
  extra = {},
} = {}) {
  const etag = buildReturnsETag({ dataVersion, horizon, codesHash });
  return {
    ...cors,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': RETURNS_CACHE_CONTROL,
    Vary: 'Accept-Encoding',
    ETag: etag,
    'X-Data-Version': String(dataVersion || ''),
    'Access-Control-Expose-Headers': 'ETag, X-Data-Version',
    ...extra,
  };
}

/**
 * @param {Request} request
 * @param {Record<string, string>} headers
 * @returns {Response|null}
 */
export function maybeNotModified(request, headers) {
  const inm = request.headers.get('If-None-Match');
  const etag = headers.ETag || headers.etag;
  if (!inm || !etag) return null;
  const want = normalizeEtagToken(etag);
  // If-None-Match may be a comma-separated list.
  const candidates = String(inm).split(',').map((p) => normalizeEtagToken(p));
  if (candidates.includes('*') || candidates.includes(want)) {
    return new Response(null, { status: 304, headers });
  }
  return null;
}

/**
 * Build JSON response with returns cache headers + optional 304.
 * @param {Request} request
 * @param {object} body
 * @param {Parameters<typeof returnsResponseHeaders>[0]} opts
 * @param {number} [status=200]
 */
export function returnsJsonResponse(request, body, opts = {}, status = 200) {
  const headers = returnsResponseHeaders(opts);
  const notMod = maybeNotModified(request, headers);
  if (notMod) return notMod;
  return new Response(JSON.stringify(body), { status, headers });
}
