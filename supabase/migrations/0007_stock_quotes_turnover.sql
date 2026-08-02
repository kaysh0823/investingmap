-- Add daily turnover (거래대금, won) to latest quotes snapshot.
alter table stock_quotes_latest
  add column if not exists turnover_won numeric;
