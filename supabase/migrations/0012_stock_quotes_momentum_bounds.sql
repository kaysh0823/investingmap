-- Rolling price-range boundaries for the momentum matrix.
-- The frontend combines these persisted boundaries with the latest price.

ALTER TABLE public.stock_quotes_latest
  ADD COLUMN IF NOT EXISTS high_120d numeric,
  ADD COLUMN IF NOT EXISTS low_120d numeric,
  ADD COLUMN IF NOT EXISTS high_50d numeric,
  ADD COLUMN IF NOT EXISTS low_50d numeric,
  ADD COLUMN IF NOT EXISTS bb_upper numeric,
  ADD COLUMN IF NOT EXISTS bb_lower numeric;

COMMENT ON COLUMN public.stock_quotes_latest.high_120d IS
  'Maximum daily high over the latest 120 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.low_120d IS
  'Minimum daily low over the latest 120 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.high_50d IS
  'Maximum daily high over the latest 50 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.low_50d IS
  'Minimum daily low over the latest 50 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.bb_upper IS
  'Latest 20-close SMA plus two population standard deviations';
COMMENT ON COLUMN public.stock_quotes_latest.bb_lower IS
  'Latest 20-close SMA minus two population standard deviations';
