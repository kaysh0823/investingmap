-- Pre-aggregated sector mcap by trade date for hub sparkline trends (20D–250D).
create table if not exists sector_mcap_daily (
  sector_id   text not null,
  trade_date  date not null,
  mcap_sum    numeric not null,
  primary key (sector_id, trade_date)
);

create index if not exists sector_mcap_daily_trade_date_idx
  on sector_mcap_daily (trade_date);

alter table sector_mcap_daily enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sector_mcap_daily'
      and policyname = 'public read'
  ) then
    create policy "public read" on sector_mcap_daily
      for select using (true);
  end if;
end $$;
