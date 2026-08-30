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

async function krxFetch(jar, url, { method = 'GET', referer, body, contentType } = {}) {
  const headers = {
    'User-Agent': KRX_USER_AGENT,
    Referer: referer || KRX_MDI_REFERER,
    Cookie: cookieHeader(jar),
  };
  if (contentType) headers['Content-Type'] = contentType;
  const res = await fetch(url, { method, headers, body });
  storeCookies(jar, res);
  return res;
}

async function warmupSession(jar) {
  await krxFetch(jar, LOGIN_PAGE, { referer: 'https://data.krx.co.kr/' });
  await krxFetch(jar, LOGIN_JSP, { referer: LOGIN_PAGE });
  await krxFetch(jar, 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd', {
    referer: 'https://data.krx.co.kr/',
  });
  await krxFetch(jar, KRX_MDI_REFERER, { referer: 'https://data.krx.co.kr/' });
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
  let data = await res.json().catch(() => ({}));
  if (data._error_code === 'CD011') {
    payload.skipDup = 'Y';
    res = await krxFetch(jar, LOGIN_URL, {
      method: 'POST',
      referer: LOGIN_JSP,
      contentType: 'application/x-www-form-urlencoded',
      body: new URLSearchParams(payload),
    });
    data = await res.json().catch(() => ({}));
  }
  return data._error_code === 'CD001';
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
  if (!ok) throw new Error('KRX data.krx.co.kr login failed — check KRX_ID/KRX_PW');
  state = { jar, loggedIn: true, expiresAt: now + 50 * 60_000 };
  return state;
}

/** Authenticated POST (form) to data.krx.co.kr. */
export async function krxDataPost(env, url, fields, referer = KRX_MDI_REFERER) {
  const session = await getKrxDataSession(env);
  const body = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  const res = await krxFetch(session.jar, url, {
    method: 'POST',
    referer,
    contentType: 'application/x-www-form-urlencoded',
    body,
  });
  return { res, session };
}

export function resetKrxDataSession() {
  state = null;
}
