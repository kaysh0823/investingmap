-- Hub movers: 5거래일 수익률 (허브 '5일 상승/하락률 Top 10' 카드용)
alter table stock_quotes_latest
  add column if not exists ret_5d_pct numeric;
