-- 최신 시세/지표 스냅샷 (한 종목당 1행, 매번 UPSERT)
create table stock_quotes_latest (
  ticker           text primary key,
  last             numeric,
  prev_close       numeric,
  high_52w         numeric,
  low_52w          numeric,
  mcap_won         numeric,
  turnover_won     numeric,
  per              numeric,
  pbr              numeric,
  chg_1d_pct       numeric,
  ret_5d_pct       numeric,
  ret_20d_pct      numeric,
  ret_50d_pct      numeric,
  ret_120d_pct     numeric,
  ret_200d_pct     numeric,
  ret_250d_pct     numeric,
  rs               numeric,
  as_of            timestamptz,
  regular_session  boolean,
  updated_at       timestamptz not null default now()
);

-- 일별 OHLC 히스토리 (RS/기간수익률 + 캔들차트용)
create table stock_price_history (
  ticker      text not null,
  trade_date  date not null,
  open        numeric,
  high        numeric,
  low         numeric,
  close       numeric not null,
  volume      numeric,
  mcap_won    numeric,
  primary key (ticker, trade_date)
);
create index on stock_price_history (trade_date);

-- 섹터별 시총가중 수익률 (허브 대시보드용, hub_sector_returns.json 대체)
create table sector_returns (
  sector_id     text primary key,
  ret_1d_pct    numeric,
  ret_20d_pct   numeric,
  ret_50d_pct   numeric,
  ret_120d_pct  numeric,
  ret_200d_pct  numeric,
  ret_250d_pct  numeric,
  updated_at    timestamptz not null default now()
);

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

-- Pre-aggregated sector mcap by trade date for hub sparkline trends (20D–200D).
create table if not exists sector_mcap_daily (
  sector_id   text not null,
  trade_date  date not null,
  mcap_sum    numeric not null,
  primary key (sector_id, trade_date)
);
create index if not exists sector_mcap_daily_trade_date_idx
  on sector_mcap_daily (trade_date);

alter table stock_quotes_latest enable row level security;
alter table stock_price_history enable row level security;
alter table sector_returns enable row level security;
alter table sector_intraday_snapshots enable row level security;
alter table sector_mcap_daily enable row level security;

create policy "public read" on stock_quotes_latest for select using (true);
create policy "public read" on stock_price_history for select using (true);
create policy "public read" on sector_returns for select using (true);
create policy "public read" on sector_intraday_snapshots for select using (true);
create policy "public read" on sector_mcap_daily for select using (true);
