-- 20-day rolling high/low for momentum matrix 20D BOX mode.

ALTER TABLE public.stock_quotes_latest
  ADD COLUMN IF NOT EXISTS high_20d numeric,
  ADD COLUMN IF NOT EXISTS low_20d numeric;

COMMENT ON COLUMN public.stock_quotes_latest.high_20d IS
  'Maximum daily high over the latest 20 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.low_20d IS
  'Minimum daily low over the latest 20 complete history bars';
