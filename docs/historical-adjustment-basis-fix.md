# Historical corporate-action basis repair

## Scope

Shared runtime normalization for stock 5/20/50/120/200-session returns, cap/equal sector cards and daily charts, and the normal quote-sync return fields. No ticker, event date, price, or ratio is hard-coded. No history rows, event rows, existing capture rows, schedules, or workflows are changed by this patch.

## Safety model

- Read confirmed `price_adjustments` rows through the selected valuation date. Do not infer an event from a price gap or rounded daily percentage.
- New reference snapshots record each applied event identity and ratio separately from the share-count observation date.
- Apply genuinely new events to known raw-basis snapshots only when safe. If old prices were already rounded by another event, an event was revised/removed, or a newly discovered event falls inside a forward-filled snapshot, reconstruct from stored raw history instead.
- Legacy snapshots do not prove their adjustment basis. For event-affected tickers, reconstruct prices from bounded stored raw history, adjust once, then forward-fill at most 20 trading sessions. Raw database rows are never rewritten.
- Derive shares from a matched raw market-cap/close observation, then multiply only events after that observation and through the valuation date. Event-day shares are not scaled twice.
- Deduplicate equal same-day events. Conflicting/invalid events or unavailable required raw history produce unavailable long returns and share weights rather than an inflated return. A cold event-ledger failure fails unknown long bases closed. Trusted paired daily returns remain available.
- Return a cloned normalized refs view to stock and sector consumers. Never mutate the shared cached refs object. Event signature changes invalidate API versions. A shared five-minute generation also lets post-close raw-history repairs recover without a quote timestamp change. Reuse normalized refs for up to five minutes per immutable refs object/event revision/anchor/symbol set; the source refs themselves revalidate every minute.
- OHLC uses the same regular-session valuation date for today's live/after-close candle and the latest stored official/verified closing-quote basis before opening or on weekends. The browser refuses to append a quote on a different adjustment basis. Unavailable chart adjustment reads fail closed. It excludes future events, has phase-scoped body caches, and does not serve stale-while-revalidate bodies across the session boundary.

## Verification

All fixtures are offline with a network-denial guard. Coverage includes legacy raw/already-adjusted inputs, repeated normalization, duplicate/conflicting/revised/deleted events, price/share basis separation, pre-event/event-day/future events, multiple actions and rounding, suspended-stock forward fill, missing history/ledger, current/pre-open source selection, read-only caching, and actual quote/sector/trend/spark API handlers for cap and equal weights. A pure consolidation preserves market cap. The quote-sync fields and all stock/sector horizons use the same adjusted basis.

Existing daily-baseline, regular-close, stale-refs, return/session math, Naver-session, key-grouping, adjustment, sector-weighting/UI, and calendar tests are included in regression checks. Full site build runs in a disposable copy with network access denied and snapshot refresh disabled.

## Operational acceptance gate

This patch alone does not establish that a specific company's event exists in the production ledger. Before publication or declaring the Unison result corrected, inspect the existing stored event and raw history using authorized read-only access, verify the event's effective date and ratio against an official source, and check conflicts with any existing event. Do not insert a guessed event or rerun a collector.

At first preparation, one public stored-OHLC GET returned HTTP 403. Its response headers/body were not retained, so the rejection layer and cause remain unknown. No repeat request or alternate-route retry was made.

Owner-provided Supabase Table Editor screenshots on 2026-11-04 subsequently established the relevant stored state: the exact `ticker = 018000` adjustment filter returned zero records; raw history retained 1,044 through November 3 (including zero-volume suspended rows), while November 4 held regular close 5,000 with `mcap_won = NULL`. November 3's matched raw market cap was 304,756,208,388. The code now uses the latest matched raw share observation when the newest market cap is absent, rebases it once, and preserves that basis in subsequent snapshots. This case yields 58,382,415 rounded shares without excluding the stock from cap-weighted sectors.

The issuer's [October 2 consolidation notice](https://unison.co.kr/investment/notice_view) verifies five old shares for one new share and suspension from October 15 through November 3. Its legal effective date, October 18, is not the stored price boundary. The [company-attributed November 4 report](https://www.electimes.com/news/articleView.html?idxno=374322) gives reopening November 4, baseline 5,220, and listed shares 291,912,077 to 58,382,415. Together with the stored raw rows, the reviewed price-ledger entry is effective November 4, ratio 0.2, type merge. Do not substitute the slightly rounded share-total ratio for the exact price factor.

Publish and verify the reviewed code before registering that single reviewed event. Preserve all raw history. No event insertion, production deployment, or collector execution has been performed by this preparation task. Recheck the unique ticker/date entry immediately before saving to avoid overwriting a concurrent registration.

Broader RS percentile/volatility snapshots and previously captured intraday sector points are not rebuilt here. New normal scheduled snapshot runs will record basis metadata. Repairing a missing ledger event or historical capture requires separate verified data work. The performance calendar retains its existing shares-weighted methodology; this patch bounds its adjustment events but does not redefine it as the card's cap-weighted metric.
