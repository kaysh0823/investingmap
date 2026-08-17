-- KOSPI/KOSDAQ closes and regular-session intraday levels for hub trends.
create table if not exists market_index_daily (
  trade_date  date not null,
  index_code  text not null check (index_code in ('KOSPI', 'KOSDAQ')),
  close       numeric not null,
  primary key (trade_date, index_code)
);

create index if not exists market_index_daily_index_trade_idx
  on market_index_daily (index_code, trade_date);

create table if not exists market_index_intraday (
  captured_at  timestamptz not null,
  trade_date   date not null,
  index_code   text not null check (index_code in ('KOSPI', 'KOSDAQ')),
  value        numeric not null,
  prev_close   numeric not null,
  primary key (index_code, captured_at)
);

create index if not exists market_index_intraday_index_trade_captured_idx
  on market_index_intraday (index_code, trade_date, captured_at);

alter table market_index_daily enable row level security;
alter table market_index_intraday enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'market_index_daily'
      and policyname = 'public read'
  ) then
    create policy "public read" on market_index_daily
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'market_index_intraday'
      and policyname = 'public read'
  ) then
    create policy "public read" on market_index_intraday
      for select using (true);
  end if;
end $$;
