-- FnGuide consensus EPS (WiseReport annual (E) columns) — latest snapshot per ticker.
create table if not exists public.stock_consensus_latest (
  ticker     text primary key,
  fy1_end    date,
  fy1_eps    numeric,
  fy2_end    date,
  fy2_eps    numeric,
  fy3_end    date,
  fy3_eps    numeric,
  source     text not null default 'wisereport',
  fetched_at timestamptz not null default now()
);

comment on table public.stock_consensus_latest is
  'WiseReport/FnGuide forward EPS. A failed fetch must not overwrite the previous row.';

alter table public.stock_consensus_latest enable row level security;

drop policy if exists "public read stock_consensus_latest" on public.stock_consensus_latest;
create policy "public read stock_consensus_latest"
  on public.stock_consensus_latest for select using (true);
