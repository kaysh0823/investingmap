-- Regular-session OHLCV snapshot for live candle tooltip / same-day bar patch.
-- Written only while the regular session is open; post-15:30 sync must not overwrite.
ALTER TABLE public.stock_quotes_latest
  ADD COLUMN IF NOT EXISTS session_open numeric,
  ADD COLUMN IF NOT EXISTS session_high numeric,
  ADD COLUMN IF NOT EXISTS session_low numeric,
  ADD COLUMN IF NOT EXISTS session_volume bigint;

COMMENT ON COLUMN public.stock_quotes_latest.session_open IS
  'Regular-session open (Naver); null outside live regular sync';
COMMENT ON COLUMN public.stock_quotes_latest.session_high IS
  'Regular-session high (Naver); null outside live regular sync';
COMMENT ON COLUMN public.stock_quotes_latest.session_low IS
  'Regular-session low (Naver); null outside live regular sync';
COMMENT ON COLUMN public.stock_quotes_latest.session_volume IS
  'Regular-session accumulated volume (Naver); null outside live regular sync';
