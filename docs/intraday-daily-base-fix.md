# Corporate-action daily return fix

## Scope and reproduction

This patch is based on main commit `a1091624f6326bdde047dfc67207487004f9328d`.
It changes calculation and quote provenance, not collection schedules, source
endpoints, credentials, or historical data. It has not been deployed or pushed.

The reported price/base mismatch is reproducible offline:

- A last price of 4,930 divided by the pre-consolidation close of 1,044 produces
  +372.22%.
- The same last price divided by a current-session base of 5,220 produces -5.56%.
- The fix is generic. No ticker, split ratio, or price is hardcoded in production.

There were three related defects:

1. The API preferred the refs tip whenever refs were current, even when a quote
   carried the adjusted daily base.
2. The quote sync replaced the provider's daily base with historical close.
3. `adjustedKrxClose` multiplied by the share ratio, although stored adjustments
   define it as shares-after/shares-before. Price adjustment must divide.

## Data contract

Naver `/basic` supplies a regular-market price, signed comparison amount, and
provider trade timestamp. The parser preserves that one-response pair rather
than combining a current basic price with an older PC/mobile baseline. The
comparison direction and any reported percentage must be consistent. Lower and
upper limit codes are supported. The daily base is never reverse-engineered from
a rounded percentage.

Live pairs require positive finite price/base, explicit timestamp timezone,
same KST session date, regular-market provenance, no future timestamp, and an age
of at most 15 minutes. Missing or untrusted pairs produce a null daily return
in live or provisional current-session calculations; existing official-refs
fallback remains available outside those paths.
Pre-market, after-market and independently merged metadata cannot supply a pair.
The provider timestamp is preserved in `as_of`; a retry/cache read does not make
an old provider print fresh.

The sync stores the price, daily base, source timestamp and regular-session flag
together. It does not overwrite the base with raw history. When the pair is
unavailable it omits these stored-price fields rather than destroying the last
stored price. The API and intraday sector captures use the same daily inputs.
The public `prevClose` field follows the selected baseline too.

A same-session base remains usable after the close, including when today's
history row or refs arrives before the stored closing-auction snapshot. Official
price selection itself is preserved. A verified 15:30 snapshot remains usable
after the close, before next open and over weekends.

Future-effective adjustment rows are excluded from a current-date adjustment.
Browser and server cache versions are bumped. A live-minute data-version token
prevents an unchanged quote timestamp from serving a formerly fresh daily return
indefinitely through HTTP 304 responses after it becomes stale.

## Validation

All verification is offline, using fixtures or mocked fetches. The environment
blocked real Node HTTP/fetch connections; no KRX, KIS or production endpoint was
queried and no operational workflow was run.

- `npm run verify:intraday-corporate-actions`: 17 cases, including current/stale
  refs, ordinary and corporate-action prices, missing/invalid/future/stale pairs,
  source merging, cached refresh, actual quotes/sector API handlers, intraday
  capture parity, split/reverse-split arithmetic, official close arrival,
  same-day refs advancement, and unchanged 5D/20D/50D/120D/200D calculations.
- Existing returns-core/session-price-policy, quotes-returns, returns-stale,
  intraday freshness, regular-close snapshot, Naver session, PostgREST key groups,
  price-adjustment logic, sector-weighting, sector-weighting UI and returns
  source lint checks passed.
- The full static build and its dist checks passed in a separate disposable copy
  with snapshot refresh disabled and network blocked. Generated website files
  were not copied into the patch.
- `git diff --check` passed. No workflow file or existing collection worktree was
  changed.

## Release limits

Publishing and any live-data validation require separate authorization. This
patch does not dispatch a collection, repair a database, or rewrite history.

- The database has no provider-provenance column. Old tuples whose baseline was
  already overwritten are not distinguishable from a corrected tuple using the
  existing schema. A release is not a proven live repair until the first normal
  corrected quote sync stores a valid pair. This limitation is deliberate; no
  migration or synthetic timestamp cutoff was introduced.
- Illiquid or suspended names with a provider print older than 15 minutes may
  show no daily return. This is a conservative availability tradeoff, not an
  assertion that the provider price itself is wrong.
- Longer-horizon historical adjustments and sector share counts still depend
  on their existing data pipeline. This patch does not infer or backfill either
  from the daily quote base. Stale share counts can still distort the relative
  weights of a multi-stock cap-weighted sector on a corporate-action day.
- Existing historical intraday captures are unchanged. The corrected logic
  applies to newly computed returns/captures, not old stored graph points.
