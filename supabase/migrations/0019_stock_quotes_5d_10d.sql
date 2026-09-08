-- 5-day / 10-day rolling high/low for momentum matrix 5D·10D BOX modes.

ALTER TABLE public.stock_quotes_latest
  ADD COLUMN IF NOT EXISTS high_5d numeric,
  ADD COLUMN IF NOT EXISTS low_5d numeric,
  ADD COLUMN IF NOT EXISTS high_10d numeric,
  ADD COLUMN IF NOT EXISTS low_10d numeric;

COMMENT ON COLUMN public.stock_quotes_latest.high_5d IS
  'Maximum daily high over the latest 5 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.low_5d IS
  'Minimum daily low over the latest 5 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.high_10d IS
  'Maximum daily high over the latest 10 complete history bars';
COMMENT ON COLUMN public.stock_quotes_latest.low_10d IS
  'Minimum daily low over the latest 10 complete history bars';
