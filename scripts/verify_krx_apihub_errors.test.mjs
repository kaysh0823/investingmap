import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { fetchMarketDay, historyFieldsFromKrxRow } from '../functions/lib/krx_yoy.mjs';

// All calls are intercepted. Never read credentials or make live KRX requests here.
const AUTH_KEY = 'offline-test-auth-key-do-not-log';
const PRIVATE_BODY = 'untrusted-upstream-body-do-not-log';
const PRIVATE_HEADER = 'untrusted-upstream-header-do-not-log';
const BAS_DD = '20261103';
const KOSPI = '/sto/stk_bydd_trd';
const KOSDAQ = '/sto/ksq_bydd_trd';
const KOSPI_ROW = {
  ISU_SRT_CD: '005930',
  TDD_OPNPRC: '70,000', TDD_HGPRC: '72,000', TDD_LWPRC: '69,000', TDD_CLSPRC: '71,000',
  ACC_TRDVOL: '1,000', LIST_SHRS: '100', ACC_TRDVAL: '71,000,000',
};
const KOSDAQ_ROW = { ISU_SRT_CD: '0009K0', TDD_CLSPRC: '12,300', MKTCAP: '123,000' };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockMarkets(t, responder) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const parsed = new URL(url);
    const endpoint = parsed.pathname.replace('/svc/apis', '');
    assert.equal(parsed.origin, 'https://data-dbg.krx.co.kr');
    assert.ok([KOSPI, KOSDAQ].includes(endpoint));
    assert.equal(options.headers.AUTH_KEY, AUTH_KEY);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    const call = { endpoint, method: options.method, url: parsed, options };
    calls.push(call);
    return responder(call);
  });
  return calls;
}

function assertDiagnostic(error, expected) {
  assert.equal(error.name, 'KrxApiHubError');
  for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value, key);
  assert.match(error.message, /KRX apihub/);
  assert.ok(error.message.includes(`basDd=${expected.basDd ?? BAS_DD}`));
  assert.ok(error.message.includes(`status=${expected.status ?? 'unavailable'}`));
  assert.ok(error.message.includes(`category=${expected.category}`));
  assert.equal(error.cause, undefined);
  const visible = `${String(error)} ${JSON.stringify(error)} ${inspect(error, { depth: 5 })}`;
  for (const secret of [AUTH_KEY, PRIVATE_BODY, PRIVATE_HEADER]) assert.equal(visible.includes(secret), false);
  return true;
}

test('HTTP 200 empty arrays in both markets remain a genuine empty market day', async (t) => {
  const calls = mockMarkets(t, () => jsonResponse({ OutBlock_1: [] }));
  const market = await fetchMarketDay(AUTH_KEY, BAS_DD);
  assert.equal(market.size, 0);
  assert.deepEqual(calls.map((c) => [c.endpoint, c.method]), [[KOSPI, 'POST'], [KOSDAQ, 'POST']]);
});

test('successful KOSPI and KOSDAQ rows retain fields, identifiers and history conversion', async (t) => {
  const isinRow = { ISU_CD: 'KR7000660001', TDD_CLSPRC: '200,000' };
  mockMarkets(t, ({ endpoint }) => jsonResponse({
    OutBlock_1: endpoint === KOSPI ? [KOSPI_ROW, isinRow] : [KOSDAQ_ROW],
  }));
  const market = await fetchMarketDay(AUTH_KEY, BAS_DD);
  assert.deepEqual([...market.entries()], [['005930', KOSPI_ROW], ['000660', isinRow], ['0009K0', KOSDAQ_ROW]]);
  assert.deepEqual(historyFieldsFromKrxRow(market.get('005930')), {
    open: 70000, high: 72000, low: 69000, close: 71000,
    volume: 1000, mcap_won: 7100000, turnover_won: 71000000,
  });
});

test('one genuinely empty market does not discard valid rows from the other', async (t) => {
  mockMarkets(t, ({ endpoint }) => jsonResponse({ OutBlock_1: endpoint === KOSPI ? [] : [KOSDAQ_ROW] }));
  assert.deepEqual([...(await fetchMarketDay(AUTH_KEY, BAS_DD)).entries()], [['0009K0', KOSDAQ_ROW]]);
});

test('POST HTTP failure still supports successful GET compatibility fallback', async (t) => {
  const calls = mockMarkets(t, ({ endpoint, method }) => method === 'POST'
    ? new Response(PRIVATE_BODY, { status: 405 })
    : jsonResponse({ OutBlock_1: [endpoint === KOSPI ? KOSPI_ROW : KOSDAQ_ROW] }));
  assert.equal((await fetchMarketDay(AUTH_KEY, BAS_DD)).size, 2);
  for (const endpoint of [KOSPI, KOSDAQ]) {
    const marketCalls = calls.filter((c) => c.endpoint === endpoint);
    assert.deepEqual(marketCalls.map((c) => c.method), ['POST', 'GET']);
    assert.deepEqual(JSON.parse(marketCalls[0].options.body), { basDd: BAS_DD });
    assert.equal(marketCalls[1].url.searchParams.get('basDd'), BAS_DD);
    assert.equal(marketCalls[1].options.body, undefined);
  }
});

for (const [status, category] of [
  [400, 'http'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'http'],
  [429, 'rate_limited'], [500, 'upstream'], [503, 'upstream'],
]) {
  test(`HTTP ${status} rejects with safe diagnostics and no compatibility retry`, async (t) => {
    const calls = mockMarkets(t, ({ endpoint }) => endpoint === KOSDAQ
      ? jsonResponse({ OutBlock_1: [KOSDAQ_ROW] })
      : new Response(`${PRIVATE_BODY} ${AUTH_KEY}`, {
        status, statusText: PRIVATE_HEADER, headers: { 'x-secret': PRIVATE_HEADER },
      }));
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method: 'POST', status, category,
    }));
    assert.deepEqual(calls.map((c) => [c.endpoint, c.method]), [[KOSPI, 'POST'], [KOSDAQ, 'POST']]);
  });
}

test('a failing KOSDAQ request rejects the complete day rather than returning partial KOSPI rows', async (t) => {
  mockMarkets(t, ({ endpoint }) => endpoint === KOSPI
    ? jsonResponse({ OutBlock_1: [KOSPI_ROW] }) : new Response(PRIVATE_BODY, { status: 403 }));
  await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
    endpoint: KOSDAQ, basDd: BAS_DD, method: 'POST', status: 403, category: 'forbidden',
  }));
});

test('a different GET failure retains the original POST status without upstream content', async (t) => {
  mockMarkets(t, ({ endpoint, method }) => endpoint === KOSDAQ
    ? jsonResponse({ OutBlock_1: [] }) : new Response(PRIVATE_BODY, { status: method === 'POST' ? 405 : 401 }));
  await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => {
    assertDiagnostic(error, { endpoint: KOSPI, method: 'GET', status: 401, category: 'unauthorized', postStatus: 405 });
    assert.match(error.message, /postStatus=405/);
    return true;
  });
});

for (const method of ['POST', 'GET']) {
  test(`${method} transport failures do not expose the original exception`, async (t) => {
    mockMarkets(t, (call) => {
      if (call.endpoint === KOSDAQ) return jsonResponse({ OutBlock_1: [] });
      if (call.method !== method) return new Response(PRIVATE_BODY, { status: 405 });
      throw new TypeError(`${AUTH_KEY} ${PRIVATE_BODY} ${PRIVATE_HEADER}`);
    });
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method, status: null, category: 'transport',
      ...(method === 'GET' ? { postStatus: 405 } : {}),
    }));
  });
}

for (const method of ['POST', 'GET']) {
  test(`${method} invalid JSON is an error, not an empty day, and excludes raw parse details`, async (t) => {
    mockMarkets(t, (call) => {
      if (call.endpoint === KOSDAQ) return jsonResponse({ OutBlock_1: [] });
      if (call.method !== method) return new Response(PRIVATE_BODY, { status: 405 });
      return new Response(`<html>${AUTH_KEY} ${PRIVATE_BODY} ${PRIVATE_HEADER}</html>`, { status: 200 });
    });
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method, status: 200, category: 'invalid_json',
    }));
  });
}

for (const [description, payload] of [
  ['null envelope', null], ['array envelope', []], ['missing rows', { message: PRIVATE_BODY }],
  ['null rows', { OutBlock_1: null }], ['object rows', { OutBlock_1: {} }],
  ['string rows', { OutBlock_1: PRIVATE_BODY }], ['null row', { OutBlock_1: [null] }],
  ['primitive row', { OutBlock_1: [PRIVATE_BODY] }], ['array row', { OutBlock_1: [[]] }],
  ['unidentifiable row', { OutBlock_1: [{ error: PRIVATE_BODY }] }],
  ['non-scalar identifier', { OutBlock_1: [{ ISU_SRT_CD: { toString: AUTH_KEY } }] }],
  ['mixed valid and invalid rows', { OutBlock_1: [KOSPI_ROW, null] }],
]) {
  test(`invalid schema (${description}) rejects with no raw payload`, async (t) => {
    mockMarkets(t, ({ endpoint }) => jsonResponse(endpoint === KOSPI ? payload : { OutBlock_1: [] }));
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method: 'POST', status: 200, category: 'invalid_schema',
    }));
  });
}

test('invalid basDd values cannot leak arbitrary caller text through diagnostics', async (t) => {
  mockMarkets(t, () => new Response(PRIVATE_BODY, { status: 400 }));
  await assert.rejects(fetchMarketDay(AUTH_KEY, AUTH_KEY), (error) => assertDiagnostic(error, {
    basDd: 'invalid', method: 'POST', status: 400, category: 'http',
  }));
});

for (const status of [301, 302, 303, 304, 307, 308]) {
  test(`HTTP ${status} refuses redirect without forwarding AUTH_KEY or retrying GET`, async (t) => {
    const calls = mockMarkets(t, ({ endpoint }) => endpoint === KOSDAQ
      ? jsonResponse({ OutBlock_1: [] })
      : new Response(null, {
        status, headers: { Location: `https://untrusted.example/${PRIVATE_HEADER}?key=${AUTH_KEY}` },
      }));
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method: 'POST', status, category: 'redirect',
    }));
    assert.deepEqual(calls.filter((c) => c.endpoint === KOSPI).map((c) => c.method), ['POST']);
    assert.equal(calls.length, 2);
  });
}

test('GET compatibility fallback also refuses redirects with original POST status', async (t) => {
  const calls = mockMarkets(t, ({ endpoint, method }) => endpoint === KOSDAQ
    ? jsonResponse({ OutBlock_1: [] })
    : new Response(null, {
      status: method === 'POST' ? 405 : 302,
      headers: { Location: `https://untrusted.example/?key=${AUTH_KEY}` },
    }));
  await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
    endpoint: KOSPI, basDd: BAS_DD, method: 'GET', status: 302, category: 'redirect', postStatus: 405,
  }));
  assert.deepEqual(calls.filter((c) => c.endpoint === KOSPI).map((c) => c.method), ['POST', 'GET']);
  assert.equal(calls.length, 3);
});

test('every request, including GET fallback, receives a fresh 20-second timeout signal', async (t) => {
  const timeouts = [];
  const signals = [];
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    timeouts.push(milliseconds);
    const signal = new AbortController().signal;
    signals.push(signal);
    return signal;
  });
  const calls = mockMarkets(t, ({ method }) => method === 'POST'
    ? new Response(null, { status: 405 }) : jsonResponse({ OutBlock_1: [] }));
  assert.equal((await fetchMarketDay(AUTH_KEY, BAS_DD)).size, 0);
  assert.deepEqual(timeouts, [20000, 20000, 20000, 20000]);
  assert.deepEqual(calls.map((c) => c.options.signal), signals);
  assert.equal(new Set(signals).size, 4);
});

for (const method of ['POST', 'GET']) {
  test(`${method} timeout errors have a sanitized timeout category`, async (t) => {
    mockMarkets(t, (call) => {
      if (call.endpoint === KOSDAQ) return jsonResponse({ OutBlock_1: [] });
      if (call.method !== method) return new Response(null, { status: 405 });
      throw new DOMException(`${AUTH_KEY} ${PRIVATE_BODY}`, 'TimeoutError');
    });
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method, status: null, category: 'timeout',
    }));
  });

  test(`${method} body socket failure is transport, not invalid JSON`, async (t) => {
    mockMarkets(t, (call) => {
      if (call.endpoint === KOSDAQ) return jsonResponse({ OutBlock_1: [] });
      if (call.method !== method) return new Response(null, { status: 405 });
      return new Response(new ReadableStream({
        start(controller) { controller.error(new TypeError(`${AUTH_KEY} ${PRIVATE_BODY}`)); },
      }), { status: 200 });
    });
    await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
      endpoint: KOSPI, basDd: BAS_DD, method, status: 200, category: 'transport',
    }));
  });
}

test('aborted request signal identifies timeout even when fetch reports a generic abort error', async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  mockMarkets(t, ({ endpoint }) => {
    if (endpoint === KOSDAQ) return jsonResponse({ OutBlock_1: [] });
    controller.abort();
    throw new DOMException(`${AUTH_KEY} ${PRIVATE_BODY}`, 'AbortError');
  });
  await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
    endpoint: KOSPI, basDd: BAS_DD, method: 'POST', status: null, category: 'timeout',
  }));
});

test('response-body timeouts retain HTTP status and use timeout category', async (t) => {
  mockMarkets(t, ({ endpoint }) => endpoint === KOSDAQ
    ? jsonResponse({ OutBlock_1: [] })
    : new Response(new ReadableStream({
      start(controller) { controller.error(new DOMException(`${AUTH_KEY} ${PRIVATE_BODY}`, 'TimeoutError')); },
    }), { status: 200 }));
  await assert.rejects(fetchMarketDay(AUTH_KEY, BAS_DD), (error) => assertDiagnostic(error, {
    endpoint: KOSPI, basDd: BAS_DD, method: 'POST', status: 200, category: 'timeout',
  }));
});
