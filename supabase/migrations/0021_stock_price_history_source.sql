-- Close provenance on daily bars (regular-session sources only for tip/refs).
ALTER TABLE public.stock_price_history
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.stock_price_history.source IS
  'apihub | mdcstat | naver | backfill — regular tip must be apihub|mdcstat|backfill';

CREATE INDEX IF NOT EXISTS stock_price_history_trade_date_source_idx
  ON public.stock_price_history (trade_date, source);
