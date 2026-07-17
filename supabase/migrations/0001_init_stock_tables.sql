-- 최신 시세/지표 스냅샷 (한 종목당 1행, 매번 UPSERT)
create table stock_quotes_latest (
  ticker           text primary key,
  last             numeric,
  prev_close       numeric,
  high_52w         numeric,
  low_52w          numeric,
  mcap_won         numeric,
  per              numeric,
  pbr              numeric,
  chg_1d_pct       numeric,
  ret_5d_pct       numeric,
  ret_20d_pct      numeric,
  ret_50d_pct      numeric,
  ret_120d_pct     numeric,
  ret_250d_pct     numeric,
  rs               numeric,
  as_of            timestamptz,
  regular_session  boolean,
  updated_at       timestamptz not null default now()
);

-- 일별 종가 히스토리 (RS/기간수익률 계산 + 향후 차트용)
create table stock_price_history (
  ticker      text not null,
  trade_date  date not null,
  close       numeric not null,
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
  ret_250d_pct  numeric,
  updated_at    timestamptz not null default now()
);

alter table stock_quotes_latest enable row level security;
alter table stock_price_history enable row level security;
alter table sector_returns enable row level security;

create policy "public read" on stock_quotes_latest for select using (true);
create policy "public read" on stock_price_history for select using (true);
create policy "public read" on sector_returns for select using (true);
