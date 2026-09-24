-- KRX [12021] PER/PBR/배당수익률 (MDCSTAT03501) — daily valuation by ticker.
create table if not exists public.stock_valuation_daily (
  ticker      text not null,
  trade_date  date not null,
  close       numeric,
  eps         numeric,
  per         numeric,
  bps         numeric,
  pbr         numeric,
  dps         numeric,
  dvd_yld     numeric,
  source      text not null default 'mdcstat',
  primary key (ticker, trade_date)
);

comment on table public.stock_valuation_daily is
  'KRX MDCSTAT03501 PER/PBR/배당 — first write for the day is authoritative (no overwrite)';

create index if not exists stock_valuation_daily_trade_date_idx
  on public.stock_valuation_daily (trade_date);

alter table public.stock_valuation_daily enable row level security;

drop policy if exists "public read stock_valuation_daily" on public.stock_valuation_daily;
create policy "public read stock_valuation_daily"
  on public.stock_valuation_daily for select using (true);
