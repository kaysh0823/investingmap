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
const FIELDS = { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', trdDd: '20261103' };
const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const originalWarn = console.warn;
let requests;
let diagnostics;

function fixtureFetch(handler, loginPayload = '{"_error_code":"CD001"}') {
  requests = [];
  diagnostics = [];
  resetKrxDataSession();
  console.info = console.warn = (...args) => diagnostics.push(args.join(' '));
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://data.krx.co.kr');
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    requests.push({ url, options });
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
