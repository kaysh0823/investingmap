-- sector pulse: 1D mcap-weighted return from stock_quotes_latest.chg_1d_pct
alter table sector_returns
  add column if not exists ret_1d_pct numeric;
