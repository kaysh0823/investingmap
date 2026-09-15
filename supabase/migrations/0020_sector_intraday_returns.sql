-- Cap-weighted sector 1D returns captured each sync run (same math as /api/hub_sectors).
create table if not exists public.sector_intraday_returns (
  sector_id   text not null,
  ts          timestamptz not null,
  ret_1d_pct  numeric not null,
  anchor_dd   text,
  trade_date  date not null,
  session_kind text not null default 'regular', -- regular | aftermarket
  primary key (sector_id, ts)
);

create index if not exists sector_intraday_returns_trade_date_idx
  on public.sector_intraday_returns (trade_date);

create index if not exists sector_intraday_returns_sector_date_idx
  on public.sector_intraday_returns (sector_id, trade_date, ts);

alter table public.sector_intraday_returns enable row level security;

drop policy if exists "public read sector_intraday_returns" on public.sector_intraday_returns;
create policy "public read sector_intraday_returns"
  on public.sector_intraday_returns for select using (true);
