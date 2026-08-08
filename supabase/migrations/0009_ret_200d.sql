-- Add 200-trading-day return columns (keep ret_250d_pct for now; app code uses 200d only).

ALTER TABLE public.stock_quotes_latest
  ADD COLUMN IF NOT EXISTS ret_200d_pct numeric;

ALTER TABLE public.sector_returns
  ADD COLUMN IF NOT EXISTS ret_200d_pct numeric;

COMMENT ON COLUMN public.stock_quotes_latest.ret_200d_pct IS
  'Return over ~200 KRX trading days (replaces ret_250d_pct in app code)';
COMMENT ON COLUMN public.sector_returns.ret_200d_pct IS
  'Sector mcap-weighted return over ~200 KRX trading days';
