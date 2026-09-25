/**
 * Cloudflare Pages middleware: redirect production pages.dev host → www.
 * Preview deployments (*.investing-map.pages.dev) and localhost are left alone.
 * Host-based redirects are not supported by _redirects (Pages docs).
 */
const PROD_PAGES_HOST = 'investing-map.pages.dev';
const CANONICAL_HOST = 'www.investingmap.kr';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === PROD_PAGES_HOST) {
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
