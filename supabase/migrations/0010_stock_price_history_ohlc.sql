-- Candlestick OHLC + volume on daily price history (keep close / mcap_won).

ALTER TABLE public.stock_price_history
  ADD COLUMN IF NOT EXISTS open numeric,
  ADD COLUMN IF NOT EXISTS high numeric,
  ADD COLUMN IF NOT EXISTS low numeric,
  ADD COLUMN IF NOT EXISTS volume numeric;

COMMENT ON COLUMN public.stock_price_history.open IS 'KRX TDD_OPNPRC';
COMMENT ON COLUMN public.stock_price_history.high IS 'KRX TDD_HGPRC';
COMMENT ON COLUMN public.stock_price_history.low IS 'KRX TDD_LWPRC';
COMMENT ON COLUMN public.stock_price_history.volume IS 'KRX ACC_TRDVOL';
