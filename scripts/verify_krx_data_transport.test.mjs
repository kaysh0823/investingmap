import assert from 'node:assert/strict';
import test from 'node:test';
import {
  krxDataPost, resetKrxDataSession, KrxDataError,
} from '../functions/lib/krx_data_session.mjs';
import { fetchKrxDailyOhlc } from '../functions/lib/krx_daily_ohlc.mjs';
import { fetchKrxInvestorNet } from '../functions/lib/krx_investor.mjs';
import { fetchKrxForeignRatio } from '../functions/lib/krx_foreign_ratio.mjs';
import { fetchKrxValuationDay } from '../functions/lib/krx_valuation.mjs';

// Every request in this file is mocked. These strings are synthetic fixtures.
const ENV = { KRX_ID: 'fixture-user', KRX_PW: 'fixture-password' };
const JSON_URL = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
const LOGIN_URL = 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001D1.cmd';
const WARMUP_URLS = [
  'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd',
  'https://data.krx.co.kr/contents/MDC/COMS/client/view/login.jsp?site=mdc',
  'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd',
  'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020102',
];
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const WARMUP_LABELS = new Map(WARMUP_URLS.map((url, index) => [
  url, ['login_page', 'login_view', 'main_page', 'market_page'][index],
]));
const REDIRECT_REASONS = [
  'missing_location', 'invalid_location', 'userinfo', 'insecure_scheme',
  'different_origin', 'fragment', 'unapproved_target', 'not_permitted', 'loop', 'hop_limit',
];
const FIELDS = { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', trdDd: '20261103' };
const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const originalWarn = console.warn;
let requests;
let diagnostics;

function fixtureFetch(handler, loginPayload = '{"_error_code":"CD001"}', intercept = () => undefined) {
  requests = [];
  diagnostics = [];
  resetKrxDataSession();
  console.info = console.warn = (...args) => diagnostics.push(args.join(' '));
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://data.krx.co.kr');
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    requests.push({ url, options });
    const intercepted = await intercept(String(url), options);
    if (intercepted !== undefined) return intercepted;
    if (String(url).includes('MDCCOMS001D1.cmd')) {
      return new Response(loginPayload, {
        headers: { 'Set-Cookie': 'sid=fixture-session; Secure; Path=/' },
      });
    }
    if (!String(url).includes('/comm/')) return new Response('<html>warmup</html>');
    return handler(String(url), options);
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.info = originalInfo;
  console.warn = originalWarn;
  resetKrxDataSession();
});

function hasCode(code) {
  return (error) => {
    assert.ok(error instanceof KrxDataError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /fixture-password|fixture-session|fixture-otp|secret-body/);
    assert.equal(error.cause, undefined);
    return true;
  };
}

test('rejects insecure or different destinations before login or cookie transmission', async () => {
  fixtureFetch(() => { throw new Error('must not be called'); });
  for (const url of [
    JSON_URL.replace('https:', 'http:'),
    JSON_URL.replace('data.krx.co.kr', 'example.com'),
    JSON_URL.replace('https://', 'https://fixture-user:fixture-password@'),
  ]) {
    await assert.rejects(krxDataPost(ENV, url, FIELDS), hasCode('UNSAFE_DESTINATION'));
  }
  assert.equal(requests.length, 0);
});

test('valid JSON stays readable and genuine empty data is explicitly counted', async () => {
  fixtureFetch(() => new Response('{"OutBlock_1":[]}'));
  const { res } = await krxDataPost(ENV, JSON_URL, FIELDS);
  assert.deepEqual(await res.json(), { OutBlock_1: [] });
  assert.match(diagnostics.join('\n'), /dataset=MDCSTAT01501 date=20261103 status=200 rows=0/);
  assert.doesNotMatch(diagnostics.join('\n'), /fixture-password|fixture-session/);
});

test('malformed login envelopes fail with safe typed diagnostics', async () => {
  for (const body of ['null', '[]', '"fixture-password"', '{}', '{"_error_code":123}']) {
    fixtureFetch(() => { throw new Error('data query must not run'); }, body);
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), hasCode('UNEXPECTED_SCHEMA'));
    assert.equal(requests.filter((r) => r.url.includes('/comm/')).length, 0);
  }
});

test('never follows a data redirect or forwards session cookies to its destination', async () => {
  for (const location of ['http://data.krx.co.kr/next', 'https://example.com/next']) {
    fixtureFetch(() => new Response(null, { status: 302, headers: { Location: location } }));
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), hasCode('REDIRECT_REFUSED'));
    assert.equal(requests.filter((r) => r.url.includes('/comm/')).length, 1);
    assert.equal(requests.some((r) => r.url === location), false);
  }
});

// Redirect tests remain fully offline. None of these fixture destinations claim
// to be the Location returned by the operational KRX failure.
function redirectResponse(location, status = 302, cookie = 'hop=fixture-intermediate') {
  return new Response('secret-body', {
    status,
    headers: { ...(location === undefined ? {} : { Location: location }), 'Set-Cookie': `${cookie}; Secure; Path=/` },
  });
}

function assertSanitizedFailure(error, code, stage = 'warmup') {
  hasCode(code)(error);
  assert.equal(error.stage, stage);
  if (code.startsWith('REDIRECT_')) {
    assert.equal(error.request, WARMUP_LABELS.get(requests.at(-1).url) || 'other');
    assert.ok(REDIRECT_REASONS.includes(error.redirect), 'redirect reason must be a fixed safe label');
    assert.ok(error.message.includes(` request=${error.request} redirect=${error.redirect}`));
    if (code === 'REDIRECT_LOOP') assert.equal(error.redirect, 'loop');
    if (code === 'REDIRECT_LIMIT') assert.equal(error.redirect, 'hop_limit');
  }
  const diagnostic = `${error.message} ${JSON.stringify(error)} ${diagnostics.join(' ')} ${error.stack}`;
  assert.doesNotMatch(diagnostic, /secret-body|secret-location|secret-cookie|fixture-user|fixture-password|fixture-session|fixture-intermediate|https?:\/\/|[?&#]/);
  return true;
}

for (const status of REDIRECT_STATUSES) {
  test(`warmup GETs follow only approved relative and absolute ${status} destinations`, async () => {
    for (const [index, source] of WARMUP_URLS.entries()) {
      const destination = WARMUP_URLS[(index + 1) % WARMUP_URLS.length];
      for (const absolute of [false, true]) {
        const parsed = new URL(destination);
        const relative = index === 0 ? 'view/login.jsp?site=mdc' : `${parsed.pathname}${parsed.search}`;
        let redirected = false;
        fixtureFetch(() => new Response('{"OutBlock_1":[]}'), undefined, (url, options) => {
          if (options.method === 'GET' && url === source && !redirected) {
            redirected = true;
            return redirectResponse(absolute ? destination : relative, status);
          }
        });
        const { res, session } = await krxDataPost(ENV, JSON_URL, FIELDS);
        assert.deepEqual(await res.json(), { OutBlock_1: [] });
        const expected = [...WARMUP_URLS];
        expected.splice(index + 1, 0, destination);
        assert.deepEqual(requests.filter((r) => r.options.method === 'GET').map((r) => r.url), expected);
        const first = requests[index];
        const next = requests[index + 1];
        assert.equal(next.options.signal, first.options.signal, 'redirect must share the original deadline');
        assert.equal(next.options.method, 'GET');
        assert.equal(next.options.body, undefined);
        assert.match(next.options.headers.Cookie, /(?:^|; )hop=fixture-intermediate(?:;|$)/);
        assert.equal(session.jar.get('hop'), 'fixture-intermediate');
        assert.doesNotMatch(diagnostics.join(' '), /fixture-intermediate|fixture-password|fixture-session/);
      }
    }
  });
}

test('warmup chains allow two hops, preserve approved cookies, and allocate one 20-second signal per chain', async (t) => {
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    const signal = new AbortController().signal;
    timeouts.push({ milliseconds, signal });
    return signal;
  });
  let hop = 0;
  fixtureFetch(() => new Response('{"OutBlock_1":[]}'), undefined, (url, options) => {
    if (options.method !== 'GET') return;
    if (hop === 0 && url === WARMUP_URLS[0]) {
      hop++;
      return redirectResponse(WARMUP_URLS[1], 302, 'first=fixture-intermediate');
    }
    if (hop === 1 && url === WARMUP_URLS[1]) {
      hop++;
      return redirectResponse(WARMUP_URLS[2], 307, 'second=fixture-intermediate');
    }
  });
  const { session } = await krxDataPost(ENV, JSON_URL, FIELDS);
  assert.deepEqual(requests.slice(0, 3).map((r) => r.url), WARMUP_URLS.slice(0, 3));
  assert.equal(requests[0].options.signal, requests[1].options.signal);
  assert.equal(requests[1].options.signal, requests[2].options.signal);
  assert.notEqual(requests[2].options.signal, requests[3].options.signal);
  assert.equal(timeouts.length, 6, 'four warmup chains, one login, one data request');
  assert.ok(timeouts.every(({ milliseconds }) => milliseconds === 20_000));
  assert.match(requests[2].options.headers.Cookie, /first=fixture-intermediate/);
  assert.match(requests[2].options.headers.Cookie, /second=fixture-intermediate/);
  assert.equal(session.jar.get('first'), 'fixture-intermediate');
  assert.equal(session.jar.get('second'), 'fixture-intermediate');
});

const unsafeWarmupLocations = [
  ['HTTP downgrade', WARMUP_URLS[1].replace('https:', 'http:')],
  ['external origin', WARMUP_URLS[1].replace('data.krx.co.kr', 'example.com')],
  ['external protocol-relative origin', '//example.com/secret-location'],
  ['userinfo', WARMUP_URLS[1].replace('https://', 'https://fixture-user:fixture-password@')],
  ['nondefault port', WARMUP_URLS[1].replace('data.krx.co.kr', 'data.krx.co.kr:444')],
  ['unlisted path', 'https://data.krx.co.kr/secret-location'],
  ['login POST endpoint', LOGIN_URL],
  ['data JSON endpoint', JSON_URL],
  ['missing required query', WARMUP_URLS[1].split('?')[0]],
  ['unexpected query value', WARMUP_URLS[1].replace('site=mdc', 'site=secret-location')],
  ['extra query parameter', `${WARMUP_URLS[1]}&token=secret-location`],
  ['duplicate query parameter', `${WARMUP_URLS[1]}&site=mdc`],
  ['encoded query key', WARMUP_URLS[1].replace('site=', '%73ite=')],
  ['encoded query value', WARMUP_URLS[1].replace('site=mdc', 'site=%6Ddc')],
  ['extra query separator', `${WARMUP_URLS[1]}&`],
  ['query on queryless destination', `${WARMUP_URLS[2]}?token=secret-location`],
  ['wrong MDI menu', WARMUP_URLS[3].replace('MDC0201020102', 'secret-location')],
  ['fragment', `${WARMUP_URLS[1]}#secret-location`],
  ['empty fragment', `${WARMUP_URLS[1]}#`],
  ['malformed URL', 'https://[secret-location'],
  ['non-HTTP URL', 'javascript:secret-location'],
];
for (const [label, location] of unsafeWarmupLocations) {
  test(`warmup refuses ${label} before reading cookies or sending another request`, async () => {
    let cookieReads = 0;
    fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, () => {
      const response = redirectResponse(location, 302, 'blocked=secret-cookie');
      response.headers.getSetCookie = () => { cookieReads++; return ['blocked=secret-cookie']; };
      return response;
    });
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_REFUSED'));
    assert.equal(requests.length, 1);
    assert.equal(cookieReads, 0, 'rejected redirect cookies must never enter the jar');
  });
}

test('warmup rejects missing or empty Location and every unsupported 3xx status', async () => {
  for (const [status, location] of [
    [302, undefined], [302, ''],
    ...[300, 304, 305, 306, 309, 399].map((status) => [status, WARMUP_URLS[1]]),
  ]) {
    let cookieReads = 0;
    fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, () => {
      // Fetch Response forbids a body for 304.
      const response = new Response(null, { status, headers: location === undefined ? {} : { Location: location } });
      response.headers.getSetCookie = () => { cookieReads++; return ['blocked=secret-cookie']; };
      return response;
    });
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_REFUSED'));
    assert.equal(requests.length, 1);
    assert.equal(cookieReads, 0);
  }
});

test('warmup detects self-redirect and multi-URL loops without replaying the destination', async () => {
  for (const locations of [[WARMUP_URLS[0]], [WARMUP_URLS[1], WARMUP_URLS[0]]]) {
    let cookieReads = 0;
    fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, () => {
      const response = redirectResponse(locations[requests.length - 1]);
      response.headers.getSetCookie = () => { cookieReads++; return ['hop=fixture-intermediate']; };
      return response;
    });
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_LOOP'));
    assert.equal(requests.length, locations.length);
    assert.equal(cookieReads, locations.length - 1, 'do not store cookies on the rejected loop edge');
  }
});

test('warmup refuses a third redirect hop before reading its cookies or fetching the fourth URL', async () => {
  let cookieReads = 0;
  fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, () => {
    const response = redirectResponse(WARMUP_URLS[requests.length]);
    response.headers.getSetCookie = () => { cookieReads++; return ['hop=fixture-intermediate']; };
    return response;
  });
  await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_LIMIT'));
  assert.deepEqual(requests.map((r) => r.url), WARMUP_URLS.slice(0, 3));
  assert.equal(cookieReads, 2);
  assert.equal(new Set(requests.map((r) => r.options.signal)).size, 1);
});

test('an approved first hop cannot authorize an unsafe second hop or its cookies', async () => {
  let blockedCookieReads = 0;
  fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, (url, options) => {
    if (requests.length === 1) return redirectResponse(WARMUP_URLS[1]);
    assert.equal(url, WARMUP_URLS[1]);
    assert.match(options.headers.Cookie, /hop=fixture-intermediate/);
    const response = redirectResponse('https://example.com/secret-location?token=secret-location', 307, 'blocked=secret-cookie');
    response.headers.getSetCookie = () => { blockedCookieReads++; return ['blocked=secret-cookie']; };
    return response;
  });
  await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_REFUSED'));
  assert.deepEqual(requests.map((r) => r.url), WARMUP_URLS.slice(0, 2));
  assert.equal(blockedCookieReads, 0);
});

test('warmup timeout during a redirect chain is sanitized and never receives a fresh deadline', async (t) => {
  const controller = new AbortController();
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    timeouts.push(milliseconds);
    return controller.signal;
  });
  fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, (url, options) => {
    if (requests.length === 1) return redirectResponse(WARMUP_URLS[1]);
    assert.equal(url, WARMUP_URLS[1]);
    assert.equal(options.signal, controller.signal);
    controller.abort(new DOMException('secret-body fixture-password', 'TimeoutError'));
    throw options.signal.reason;
  });
  await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'TIMEOUT'));
  assert.deepEqual(timeouts, [20_000]);
  assert.equal(requests.length, 2);
});

test('warmup abort and transport errors do not expose redirect destinations or upstream errors', async () => {
  for (const [name, code] of [['AbortError', 'TIMEOUT'], ['Error', 'TRANSPORT_ERROR']]) {
    fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, () => {
      if (requests.length === 1) return redirectResponse(WARMUP_URLS[1]);
      const error = new Error('secret-body fixture-password https://example.com/secret-location?token=secret-location');
      error.name = name;
      throw error;
    });
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, code));
    assert.equal(requests.length, 2);
  }
});

test('login POST redirects stay blocked even when their destination is an approved warmup URL', async () => {
  for (const status of REDIRECT_STATUSES) {
    let cookieReads = 0;
    fixtureFetch(() => { throw new Error('data request must not run'); }, undefined, (url, options) => {
      if (url !== LOGIN_URL) return;
      assert.equal(options.method, 'POST');
      const response = redirectResponse(WARMUP_URLS[1], status, 'blocked=secret-cookie');
      response.headers.getSetCookie = () => { cookieReads++; return ['blocked=secret-cookie']; };
      return response;
    });
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_REFUSED', 'login'));
    assert.deepEqual(requests.map((r) => r.url), [...WARMUP_URLS, LOGIN_URL]);
    assert.equal(cookieReads, 0);
  }
});

test('OTP, CSV, JSON, arbitrary POSTs, and POSTs to warmup URLs never inherit redirect permission', async () => {
  for (const [url, stage] of [
    ['https://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd', 'otp'],
    ['https://data.krx.co.kr/comm/fileDn/download_csv/download.cmd', 'csv'],
    [JSON_URL, 'json'],
    ['https://data.krx.co.kr/contents/secret-location', 'warmup'],
    ...WARMUP_URLS.map((url) => [url, 'warmup']),
  ]) {
    for (const status of REDIRECT_STATUSES) {
      let cookieReads = 0;
      fixtureFetch(() => { throw new Error('must be handled by the POST fixture'); }, undefined, (target, options) => {
        if (target !== url || options.method !== 'POST') return;
        const response = redirectResponse(WARMUP_URLS[1], status, 'blocked=secret-cookie');
        response.headers.getSetCookie = () => { cookieReads++; return ['blocked=secret-cookie']; };
        return response;
      });
      await assert.rejects(krxDataPost(ENV, url, FIELDS), (error) => assertSanitizedFailure(error, 'REDIRECT_REFUSED', stage));
      assert.deepEqual(requests.map((r) => r.url), [...WARMUP_URLS, LOGIN_URL, url]);
      assert.equal(cookieReads, 0);
    }
  }
});

test('HTTP failures carry status but never upstream response bodies', async () => {
  for (const status of [401, 403, 429, 500]) {
    fixtureFetch(() => new Response('secret-body fixture-password', { status }));
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), (error) => {
      hasCode('HTTP_ERROR')(error);
      assert.equal(error.status, status);
      assert.equal(error.date, '20261103');
      assert.equal(error.dataset, 'MDCSTAT01501');
      return true;
    });
    assert.equal(requests.filter((r) => r.url.includes('/comm/')).length, 1);
  }
});

test('socket and timeout errors are sanitized rather than treated as no data', async () => {
  for (const [name, expected] of [['Error', 'TRANSPORT_ERROR'], ['TimeoutError', 'TIMEOUT']]) {
    fixtureFetch(() => { const error = new Error('secret-body fixture-password'); error.name = name; throw error; });
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), hasCode(expected));
  }
});

test('body-stream failures are sanitized too', async () => {
  fixtureFetch(() => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('secret-body fixture-session')); },
  })));
  await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), hasCode('TRANSPORT_ERROR'));
});

test('server logout is explicit even with a cached successful login; no forced relogin', async () => {
  for (const body of ['LOGOUT', '{"RESULT":"LOGOUT"}']) {
    fixtureFetch(() => new Response(body));
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), hasCode('SESSION_EXPIRED'));
    assert.equal(requests.filter((r) => r.url.includes('MDCCOMS001D1')).length, 1);
  }
});

test('HTML, malformed JSON, and unexpected schema remain distinct from empty data', async () => {
  for (const [body, code] of [
    ['<html>login secret-body</html>', 'HTML_RESPONSE'],
    ['not-json secret-body', 'INVALID_JSON'],
    ['{"error":"secret-body"}', 'UNEXPECTED_SCHEMA'],
    ['{"OutBlock_1":{}}', 'UNEXPECTED_SCHEMA'],
    ['null', 'UNEXPECTED_SCHEMA'],
    ['[]', 'UNEXPECTED_SCHEMA'],
    ['{"OutBlock_1":[null]}', 'UNEXPECTED_SCHEMA'],
    ['{"OutBlock_1":["fixture-password"]}', 'UNEXPECTED_SCHEMA'],
    ['{"OutBlock_1":[[]]}', 'UNEXPECTED_SCHEMA'],
  ]) {
    fixtureFetch(() => new Response(body));
    await assert.rejects(krxDataPost(ENV, JSON_URL, FIELDS), hasCode(code));
  }
});

test('request context never logs arbitrary input fields', async () => {
  fixtureFetch(() => new Response('secret-body', { status: 403 }));
  await assert.rejects(krxDataPost(ENV, JSON_URL, { trdDd: 'fixture-password', bld: 'fixture-session' }), (error) => {
    hasCode('HTTP_ERROR')(error);
    assert.equal(error.date, 'unknown');
    assert.equal(error.dataset, 'unknown');
    return true;
  });
});

test('an empty OTP still permits the existing JSON fallback and preserves financial fields', async () => {
  fixtureFetch((url) => url.includes('GenerateOTP') ? new Response('') : new Response(JSON.stringify({
    OutBlock_1: [{
      ISU_SRT_CD: '005930', TDD_CLSPRC: '100', TDD_OPNPRC: '99', TDD_HGPRC: '101',
      TDD_LWPRC: '98', ACC_TRDVOL: '1234', ACC_TRDVAL: '123400', MKTCAP: '1000000', LIST_SHRS: '10000',
    }],
  })));
  const map = await fetchKrxDailyOhlc('20261103', ENV);
  assert.equal(map.size, 1);
  assert.deepEqual(map.get('005930'), {
    open: 99, high: 101, low: 98, close: 100, volume: 1234,
    turnover_won: 123400, mcap_won: 1000000, list_shrs: 10000,
  });
  assert.match(diagnostics.join('\n'), /INVALID_OTP_RESPONSE/);
});

test('all MDCSTAT consumers propagate classified failures rather than return empty data', async () => {
  const consumers = [
    () => fetchKrxDailyOhlc('20261103', ENV),
    () => fetchKrxInvestorNet('20261103', '9000', ENV),
    () => fetchKrxForeignRatio('20261103', ENV),
    () => fetchKrxValuationDay('20261103', ENV),
  ];
  for (const consume of consumers) {
    fixtureFetch((url) => {
      if (url.includes('GenerateOTP')) return new Response('');
      throw new Error('secret-body fixture-password');
    });
    await assert.rejects(consume(), hasCode('TRANSPORT_ERROR'));
  }
});

test('successful investor, foreign, and valuation JSON values remain unchanged', async () => {
  fixtureFetch((url, options) => {
    if (url.includes('GenerateOTP')) return new Response('');
    const bld = options.body.get('bld');
    const row = { ISU_SRT_CD: '005930', NETBID_TRDVAL: '1234', FORN_SHR_RT: '42.5', TDD_CLSPRC: '100', PER: '10', PBR: '2' };
    return new Response(JSON.stringify(bld.endsWith('03501') ? { OutBlock_1: [row] } : { output: [row] }));
  });
  assert.deepEqual(await fetchKrxInvestorNet('20261103', '9000', ENV), [{ ticker: '005930', net_val: 1234 }]);
  assert.deepEqual(await fetchKrxForeignRatio('20261103', ENV), [{ ticker: '005930', hold_ratio: 42.5 }]);
  const valuation = (await fetchKrxValuationDay('20261103', ENV)).get('005930');
  assert.equal(valuation.close, 100);
  assert.equal(valuation.per, 10);
  assert.equal(valuation.pbr, 2);
});

test('nonempty but unusable records are not reported as a genuine empty dataset', async () => {
  const consumers = [
    () => fetchKrxDailyOhlc('20261103', ENV),
    () => fetchKrxInvestorNet('20261103', '9000', ENV),
    () => fetchKrxForeignRatio('20261103', ENV),
    () => fetchKrxValuationDay('20261103', ENV),
  ];
  for (const consume of consumers) {
    fixtureFetch((url, options) => {
      if (url.includes('GenerateOTP')) return new Response('');
      const bld = options.body.get('bld');
      const raw = [{ error: 'secret-body fixture-password' }];
      return new Response(JSON.stringify(/01501|03501/.test(bld) ? { OutBlock_1: raw } : { output: raw }));
    });
    await assert.rejects(consume(), (error) => {
      hasCode('UNUSABLE_ROWS')(error);
      assert.equal(error.date, '20261103');
      assert.match(error.dataset, /^MDCSTAT\d+$/);
      return true;
    });
  }
});

test('genuinely empty JSON datasets still return empty results in every consumer', async () => {
  const consumers = [
    () => fetchKrxDailyOhlc('20261103', ENV),
    () => fetchKrxInvestorNet('20261103', '9000', ENV),
    () => fetchKrxForeignRatio('20261103', ENV),
    () => fetchKrxValuationDay('20261103', ENV),
  ];
  for (const consume of consumers) {
    fixtureFetch((url, options) => {
      if (url.includes('GenerateOTP')) return new Response('');
      const bld = options.body.get('bld');
      return new Response(JSON.stringify(/01501|03501/.test(bld) ? { OutBlock_1: [] } : { output: [] }));
    });
    const result = await consume();
    assert.equal(result instanceof Map ? result.size : result.length, 0);
  }
});
