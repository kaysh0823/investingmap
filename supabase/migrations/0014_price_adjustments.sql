-- Corporate-action price overlays for candle OHLC continuity (split / merge / bonus).
-- ratio = shares_after / shares_before; apply to bars with trade_date < effective_date.
create table if not exists price_adjustments (
  ticker          text not null,
  effective_date  date not null,
  ratio           numeric not null,
  type            text not null check (type in ('split', 'merge', 'bonus')),
  source          text not null,
  note            text,
  primary key (ticker, effective_date)
);

create index if not exists price_adjustments_ticker_eff_idx
  on price_adjustments (ticker, effective_date);

comment on table price_adjustments is 'Split/merge/bonus factors for backward-adjusting stock_price_history OHLCV in ticker_ohlc API';
comment on column price_adjustments.ratio is 'shares_after / shares_before; bars before effective_date divide OHLC by cumulative product and multiply volume';

alter table price_adjustments enable row level security;

create policy "public read" on price_adjustments
  for select using (true);
