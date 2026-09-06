-- Add daily trading value (거래대금) to price history for 5d turnover rankings.
ALTER TABLE public.stock_price_history
  ADD COLUMN IF NOT EXISTS turnover_won numeric;

COMMENT ON COLUMN public.stock_price_history.turnover_won IS 'KRX ACC_TRDVAL (거래대금)';
