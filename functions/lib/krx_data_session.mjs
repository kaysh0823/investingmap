/**
 * Authenticated data.krx.co.kr session (required since ~2026-02 for MDCSTAT* queries).
 * Credentials: KRX_ID + KRX_PW (free KRX Data Marketplace account).
 */
const LOGIN_PAGE = 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd';
const LOGIN_JSP = 'https://data.krx.co.kr/contents/MDC/COMS/client/view/login.jsp?site=mdc';
const LOGIN_URL = 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001D1.cmd';
export const KRX_MDI_REFERER =
  'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020102';
export const KRX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** @type {{ jar: Map<string,string>, loggedIn: boolean, expiresAt: number } | null} */
let state = null;

const KRX_ORIGIN = 'https://data.krx.co.kr';
const REQUEST_TIMEOUT_MS = 20_000;
const WARMUP_REDIRECT_LIMIT = 2;
const WARMUP_URLS = new Map([
  [LOGIN_PAGE, 'login_page'],
  [LOGIN_JSP, 'login_view'],
  [`${KRX_ORIGIN}/contents/MDC/MAIN/main/index.cmd`, 'main_page'],
  [KRX_MDI_REFERER, 'market_page'],
]);
const WARMUP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Safe diagnostics only: never include response bodies, cookies, or credentials. */
export class KrxDataError extends Error {
  constructor(code, stage, status = null) {
    super(`KRX_DATA ${code} stage=${stage}${status == null ? '' : ` status=${status}`}`);
    this.name = 'KrxDataError';
    this.code = code;
    this.stage = stage;
    this.status = status;
  }
}

function requestStage(url) {
  const pathname = new URL(url).pathname;
  if (pathname.includes('MDCCOMS001D1')) return 'login';
  if (pathname.includes('GenerateOTP')) return 'otp';
  if (pathname.includes('download_csv')) return 'csv';
  if (pathname.includes('getJsonData')) return 'json';
  return 'warmup';
}

function secureUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new KrxDataError('INVALID_URL', 'request'); }
  if (parsed.origin !== KRX_ORIGIN || parsed.username || parsed.password) {
    throw new KrxDataError('UNSAFE_DESTINATION', 'request');
  }
  return parsed.href;
}

function transportError(error, stage) {
  return new KrxDataError(
    error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'TIMEOUT' : 'TRANSPORT_ERROR',
    stage,
  );
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(jar, res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

function redirectFailure(code, stage, status, request, reason) {
  const error = new KrxDataError(code, stage, status);
  // Fixed labels only. Location may contain credentials or session identifiers.
  error.request = WARMUP_URLS.get(request) || 'other';
  error.redirect = reason;
  error.message += ` request=${error.request} redirect=${reason}`;
  return error;
}

function warmupRedirectTarget(location, current, stage, status) {
  const refuse = (reason) => {
    throw redirectFailure('REDIRECT_REFUSED', stage, status, current, reason);
  };
  if (!location) return refuse('missing_location');
  let target;
  try { target = new URL(location, current); } catch { return refuse('invalid_location'); }
  if (target.username || target.password) return refuse('userinfo');
  if (target.protocol !== 'https:') return refuse('insecure_scheme');
  if (target.origin !== KRX_ORIGIN) return refuse('different_origin');
  if (target.hash) return refuse('fragment');
  // Exact existing warmup URLs only, including their known query strings.
  // Same-origin alone would also allow logout or other action endpoints.
  if (!WARMUP_URLS.has(target.href)) return refuse('unapproved_target');
  return target.href;
}

async function krxFetch(jar, url, {
  method = 'GET', referer, body, contentType, allowWarmupRedirects = false,
} = {}) {
  // Validate before constructing or sending any Cookie header. Redirects are
  // opt-in on the four known warmup GETs, never inferred from requestStage().
  let target = secureUrl(url);
  const stage = requestStage(target);
  const canRedirect = allowWarmupRedirects && method === 'GET' && WARMUP_URLS.has(target);
  const visited = new Set([target]);
  // One deadline for the entire redirect chain, not a fresh timeout per hop.
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  for (let hops = 0; ; hops++) {
    const headers = {
      'User-Agent': KRX_USER_AGENT,
      Referer: referer || KRX_MDI_REFERER,
      Cookie: cookieHeader(jar),
    };
    if (contentType) headers['Content-Type'] = contentType;
    let res;
    try {
      res = await fetch(target, { method, headers, body, redirect: 'manual', signal });
    } catch (error) {
      throw transportError(error, stage);
    }
    if (res.status >= 300 && res.status < 400) {
      if (!canRedirect || !WARMUP_REDIRECT_STATUSES.has(res.status)) {
        throw redirectFailure('REDIRECT_REFUSED', stage, res.status, target, 'not_permitted');
      }
      const next = warmupRedirectTarget(res.headers.get('Location'), target, stage, res.status);
      if (visited.has(next)) {
        throw redirectFailure('REDIRECT_LOOP', stage, res.status, target, 'loop');
      }
      if (hops >= WARMUP_REDIRECT_LIMIT) {
        throw redirectFailure('REDIRECT_LIMIT', stage, res.status, target, 'hop_limit');
      }
      // Never retain redirect cookies until its destination has been approved.
      storeCookies(jar, res);
      visited.add(next);
      referer = target;
      target = next;
      continue;
    }
    if (!res.ok) throw new KrxDataError('HTTP_ERROR', stage, res.status);
    storeCookies(jar, res);
    return res;
  }
}

async function warmupSession(jar) {
  await krxFetch(jar, LOGIN_PAGE, { referer: 'https://data.krx.co.kr/', allowWarmupRedirects: true });
  await krxFetch(jar, LOGIN_JSP, { referer: LOGIN_PAGE, allowWarmupRedirects: true });
  await krxFetch(jar, 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd', {
    referer: 'https://data.krx.co.kr/', allowWarmupRedirects: true,
  });
  await krxFetch(jar, KRX_MDI_REFERER, { referer: 'https://data.krx.co.kr/', allowWarmupRedirects: true });
}

async function loginSession(jar, loginId, loginPw) {
  await warmupSession(jar);
  const payload = {
    mbrNm: '',
    telNo: '',
    di: '',
    certType: '',
    mbrId: loginId,
    pw: loginPw,
  };
  let res = await krxFetch(jar, LOGIN_URL, {
    method: 'POST',
    referer: LOGIN_JSP,
    contentType: 'application/x-www-form-urlencoded',
    body: new URLSearchParams(payload),
  });
  let data = await readLoginJson(res);
  if (data._error_code === 'CD011') {
    payload.skipDup = 'Y';
    res = await krxFetch(jar, LOGIN_URL, {
      method: 'POST',
      referer: LOGIN_JSP,
      contentType: 'application/x-www-form-urlencoded',
      body: new URLSearchParams(payload),
    });
    data = await readLoginJson(res);
  }
  return data._error_code === 'CD001';
}

async function readLoginJson(res) {
  let text;
  try { text = await res.text(); } catch (error) { throw transportError(error, 'login'); }
  let data;
  try { data = JSON.parse(text); } catch { throw new KrxDataError('INVALID_JSON', 'login', res.status); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data._error_code !== 'string') {
    throw new KrxDataError('UNEXPECTED_SCHEMA', 'login', res.status);
  }
  return data;
}

/**
 * @param {{ KRX_ID?: string, KRX_PW?: string }} env
 * @returns {Promise<{ jar: Map<string,string>, loggedIn: boolean }>}
 */
export async function getKrxDataSession(env = process.env) {
  const loginId = (env.KRX_ID || '').trim();
  const loginPw = (env.KRX_PW || '').trim();
  const now = Date.now();

  if (state && state.loggedIn && state.expiresAt > now + 60_000) {
    return state;
  }

  const jar = new Map();
  if (!loginId || !loginPw) {
    await warmupSession(jar);
    state = { jar, loggedIn: false, expiresAt: now + 5 * 60_000 };
    return state;
  }

  const ok = await loginSession(jar, loginId, loginPw);
  if (!ok) throw new KrxDataError('LOGIN_REJECTED', 'login');
  state = { jar, loggedIn: true, expiresAt: now + 50 * 60_000 };
  return state;
}

/** Authenticated POST (form) to data.krx.co.kr. */
export async function krxDataPost(env, url, fields, referer = KRX_MDI_REFERER) {
  secureUrl(url);
  const body = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  try {
    return await postKrxData(env, url, body, referer);
  } catch (error) {
    if (error instanceof KrxDataError) {
      const { dataset, date } = dataRequestContext(body);
      error.message += ` dataset=${dataset} date=${date}`;
      error.dataset = dataset;
      error.date = date;
    }
    throw error;
  }
}

function dataRequestContext(body) {
  const day = body.get('trdDd') || body.get('strtDd') || '';
  const bld = body.get('bld') || body.get('url') || '';
  return {
    date: /^\d{8}$/.test(day) ? day : 'unknown',
    dataset: /MDCSTAT\d+$/.exec(bld)?.[0] || 'unknown',
  };
}

/** Nonempty upstream records that yield no usable rows are a schema failure. */
export function validateKrxParsedRows(json, rows, dataset, date) {
  const raw = json?.OutBlock_1 || json?.output || json?.outBlock_1;
  if (!Array.isArray(rows) || (Array.isArray(raw) && raw.length > 0 && rows.length === 0)) {
    const error = new KrxDataError('UNUSABLE_ROWS', 'json', 200);
    const context = dataRequestContext(new URLSearchParams({ bld: dataset, trdDd: date }));
    error.message += ` dataset=${context.dataset} date=${context.date}`;
    error.dataset = context.dataset;
    error.date = context.date;
    throw error;
  }
  return rows;
}

async function postKrxData(env, url, body, referer) {
  const session = await getKrxDataSession(env);
  const res = await krxFetch(session.jar, url, {
    method: 'POST',
    referer,
    contentType: 'application/x-www-form-urlencoded',
    body,
  });
  const stage = requestStage(url);
  let text;
  try { text = await res.clone().text(); } catch (error) { throw transportError(error, stage); }
  const trimmed = text.trim();
  let json;
  let parsedJson = false;
  if (stage === 'json' || trimmed.startsWith('{')) {
    try { json = JSON.parse(trimmed); parsedJson = true; } catch { /* classified below */ }
  }
  if (trimmed === 'LOGOUT' || json?.RESULT === 'LOGOUT') {
    // Report the revoked session. Do not automatically force another login,
    // which could invalidate a concurrent job using the same KRX account.
    throw new KrxDataError('SESSION_EXPIRED', stage, res.status);
  }
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(trimmed)) {
    throw new KrxDataError('HTML_RESPONSE', stage, res.status);
  }
  if (stage === 'json') {
    if (!parsedJson) throw new KrxDataError('INVALID_JSON', stage, res.status);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new KrxDataError('UNEXPECTED_SCHEMA', stage, res.status);
    }
    const rows = json.OutBlock_1 ?? json.output ?? json.outBlock_1;
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new KrxDataError('UNEXPECTED_SCHEMA', stage, res.status);
    }
    const { dataset, date } = dataRequestContext(body);
    console.info(`KRX_DATA_RESPONSE stage=json dataset=${dataset} date=${date} status=${res.status} rows=${rows.length}`);
  }
  if (stage === 'otp' && (!trimmed || trimmed.length < 8 || /html/i.test(trimmed))) {
    // An unavailable OTP can still use the existing JSON fallback. Explicit
    // authentication, HTTP, and HTML errors above remain terminal failures.
    console.warn(`KRX_DATA INVALID_OTP_RESPONSE stage=otp status=${res.status}`);
  }
  return { res, session };
}

export function resetKrxDataSession() {
  state = null;
}
