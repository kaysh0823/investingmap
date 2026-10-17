-- Daily credit (신용융자) balance per ticker — KIS FHPST04760000 (daily-credit-balance).
-- trade_date = KIS deal_date (체결일); KIS publishes on the settlement date (T+2).
create table if not exists public.stock_credit_balance (
  trade_date   date not null,
  ticker       text not null,
  loan_shares  bigint,
  loan_amt_won bigint,
  loan_rate    numeric,
  credit_ratio numeric,
  primary key (trade_date, ticker)
);

create index if not exists stock_credit_balance_ticker_idx
  on public.stock_credit_balance (ticker, trade_date);

comment on table public.stock_credit_balance is
  'KIS daily credit loan balance per ticker (전체 융자 잔고)';
comment on column public.stock_credit_balance.loan_amt_won is
  'Loan balance amount in won (KIS whol_loan_rmnd_amt is 만원 × 10,000)';
comment on column public.stock_credit_balance.loan_rate is
  'KIS whol_loan_rmnd_rate: loan shares / listed shares (%), 2 decimals';
comment on column public.stock_credit_balance.credit_ratio is
  '신용잔고율 = loan_amt_won / mcap_won (same trade_date) × 100; falls back to loan_rate when mcap is missing';

alter table public.stock_credit_balance enable row level security;

drop policy if exists "public read stock_credit_balance" on public.stock_credit_balance;
create policy "public read stock_credit_balance"
  on public.stock_credit_balance for select using (true);
