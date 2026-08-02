-- Daily hub universe ranks for Top10 rank-delta (▲/▼/NEW).
-- metric: mcap | rs | position | turnover | gain1d | gain5d
-- Stores full ranked lists (not only Top10) so day-over-day deltas stay correct.
create table if not exists hub_rank_daily (
  metric      text not null,
  ticker      text not null,
  trade_date  date not null,
  rank        int not null,
  value       numeric,
  primary key (metric, ticker, trade_date)
);

create index if not exists hub_rank_daily_metric_trade_idx
  on hub_rank_daily (metric, trade_date);

alter table hub_rank_daily enable row level security;

create policy "public read" on hub_rank_daily
  for select using (true);
