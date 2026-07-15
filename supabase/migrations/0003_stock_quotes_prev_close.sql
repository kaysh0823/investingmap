-- Map pages: skip hub_rs_snapshot when /api/quotes carries prevClose for live 1D.
alter table stock_quotes_latest
  add column if not exists prev_close numeric;
