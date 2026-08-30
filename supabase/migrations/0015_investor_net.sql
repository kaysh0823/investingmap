-- KRX [12010] investor net purchase by ticker (OSC Phase 1).
create table if not exists stock_investor_net (
  trade_date    date not null,
  ticker        text not null,
  invst_tp_cd   text not null,
  net_val       numeric,
  primary key (trade_date, ticker, invst_tp_cd)
);

create index if not exists sin_ticker_date on stock_investor_net (ticker, trade_date);

comment on table stock_investor_net is 'KRX MDCSTAT02401 daily net purchase amount (KRW) by investor type per ticker';
comment on column stock_investor_net.invst_tp_cd is 'KRX investor code: 3000 trust, 3100 PE, 6000 pension, 9000 foreign, etc.';
comment on column stock_investor_net.net_val is 'Net purchase trading value in KRW (money=1)';

alter table stock_investor_net enable row level security;

create policy "public read" on stock_investor_net
  for select using (true);
