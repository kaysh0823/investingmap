-- Hub sector 1D sparkline: intraday mcap sum snapshots (regular session only).
create table if not exists sector_intraday_snapshots (
  sector_id   text not null,
  ts          timestamptz not null,
  mcap_sum    numeric not null,
  trade_date  date not null,
  primary key (sector_id, ts)
);

create index if not exists sector_intraday_snapshots_trade_date_idx
  on sector_intraday_snapshots (trade_date);

create index if not exists sector_intraday_snapshots_sector_trade_idx
  on sector_intraday_snapshots (sector_id, trade_date, ts);

alter table sector_intraday_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sector_intraday_snapshots'
      and policyname = 'public read'
  ) then
    create policy "public read" on sector_intraday_snapshots
      for select using (true);
  end if;
end $$;
