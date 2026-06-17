import { handleQuotesRequest } from '../lib/krx_quotes.js';

export async function onRequest(context) {
  return handleQuotesRequest(context.request, context.env);
}
