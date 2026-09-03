-- KRX [12023] foreign ownership ratio by ticker (MDCSTAT03701).
create table if not exists stock_foreign_ratio (
  trade_date date not null,
  ticker text not null,
  hold_ratio numeric,
  primary key (trade_date, ticker)
);

create index if not exists stock_foreign_ratio_ticker_idx
  on stock_foreign_ratio (ticker, trade_date);

comment on table stock_foreign_ratio is
  'KRX MDCSTAT03701 daily foreign ownership ratio (%) per ticker';
comment on column stock_foreign_ratio.hold_ratio is
  'Foreign ownership share ratio (지분율), 0~100';

alter table stock_foreign_ratio enable row level security;

create policy "public read" on stock_foreign_ratio
  for select using (true);
