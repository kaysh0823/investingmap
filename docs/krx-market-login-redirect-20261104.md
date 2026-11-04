# KRX market-page login redirect compatibility

## Observed failure and cause

The November 4 post-close job stopped before login/data retrieval with `REDIRECT_REFUSED stage=warmup status=302 request=market_page redirect=unapproved_target`.

The public warmup sequence reproduces a redirect to the existing KRX login page:

`https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd?locale=ko_KR&redirectURL=<opaque-relative-return-route>`

The return value resolves relative to the market page, under `/contents/MDC/MDI/mdiLoader/`. It is a server-generated opaque token, not a URL rooted at the domain. Its value is not committed or logged here.

## Scope

Only that login variant is accepted, only when emitted by the existing market warmup GET. It requires exactly one `locale=ko_KR` and one `redirectURL`, an HTTPS same-origin return route in the known loader namespace, no return query/fragment/credentials, and a bounded token alphabet/length. The return route itself is never fetched by the redirect handler.

Existing explicit endpoints, hop/time limits and POST redirect rejection remain in force. Collection schedules, datasets, database writes, return calculations and chart features are unchanged.

## Validation

- 96 offline transport/API tests, including relative/root-relative/absolute return routes, refused external/action destinations, extra/duplicate query parameters, and non-market callers.
- One bounded live JSON dataset request for November 4, after normal login: HTTP 200, 2,876 parsed rows. The check did not run a collector, retry a dataset, write Supabase records, or change schedules.
- The first credentialed check stopped at warmup before any data request; resolving the return value against the original market URL corrected that remaining relative-address difference.
- Existing chart/distribution and corporate-action regression checks run before publication.
