-- Mini sparkline closes on latest quotes (last 20 trading days, oldest→newest).

ALTER TABLE public.stock_quotes_latest
  ADD COLUMN IF NOT EXISTS spark20 jsonb;

COMMENT ON COLUMN public.stock_quotes_latest.spark20 IS
  'Last 20 trading-day closes [oldest…newest] for table mini sparklines';
