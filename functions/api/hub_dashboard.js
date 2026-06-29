/**
 * Cloudflare Pages Function: GET /api/hub_dashboard
 * Sector mcap-weighted 1Y return + top-10 price position (single response).
 */

import { buildHubDashboard, loadHubIndexFromRequest } from '../lib/hub_dashboard_core.mjs';
import { getAuthKey } from '../lib/krx_yoy.mjs';
import { krxSessionInfo } from '../lib/krx_session.mjs';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const ch = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: ch });
  }

  const session = krxSessionInfo();

  try {
    const hubIndex = await loadHubIndexFromRequest(request, env);
    const payload = await buildHubDashboard(hubIndex, env);
    const maxAge = session.regular ? 300 : 86400;
    return new Response(JSON.stringify(payload), {
      headers: {
        ...ch,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${maxAge}`,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'hub_dashboard_failed',
        message: e && e.message ? String(e.message) : 'unknown',
        asOf: new Date().toISOString(),
        krxConfigured: !!getAuthKey(env),
        regularSession: session.regular,
        sectors: {},
        top10: [],
      }),
      { status: 502, headers: { ...ch, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
