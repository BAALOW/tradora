-- TRADORA — Supabase schema
-- Run this in the Supabase SQL editor.
-- profiles + accounts are live now. trades / trade_screenshots are prepared
-- for the next phase (Trading Journal wired to real data) and for the
-- future MT5 EA / Connector integration.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users(id) primary key,
  full_name text,
  email text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users manage their own profile" on profiles;
create policy "Users manage their own profile" on profiles
  for all using (auth.uid() = id);

-- ------------------------------------------------------------------
-- accounts
-- Every account belongs to auth.uid() via user_id.
-- MT5 fields are prepared now so the future EA/Connector can populate
-- them without a schema change. React never writes mt5_connected or
-- mt5_last_sync_at directly — those are reserved for the backend sync.
-- ------------------------------------------------------------------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  name text not null,
  firm text,
  account_type text not null default 'evaluation'
    check (account_type in ('evaluation', 'funded', 'personal', 'demo')),
  platform text not null default 'MT5'
    check (platform in ('MT5', 'MT4', 'TradingView', 'Other')),

  account_number text,
  server text,

  starting_balance numeric(14, 2) not null,
  current_balance numeric(14, 2) not null,
  current_equity numeric(14, 2),
  currency text not null default 'USD',
  leverage integer,

  profit_target_percent numeric(6, 2) default 0,
  daily_loss_limit_percent numeric(6, 2) default 0,
  max_drawdown_percent numeric(6, 2) default 0,

  status text not null default 'healthy'
    check (status in ('healthy', 'caution', 'at_risk', 'passed', 'failed', 'inactive')),

  mt5_connected boolean not null default false,
  mt5_last_sync_at timestamptz,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on accounts(user_id);

alter table accounts enable row level security;

drop policy if exists "Users can view their own accounts" on accounts;
create policy "Users can view their own accounts" on accounts
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own accounts" on accounts;
create policy "Users can insert their own accounts" on accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own accounts" on accounts;
create policy "Users can update their own accounts" on accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own accounts" on accounts;
create policy "Users can delete their own accounts" on accounts
  for delete using (auth.uid() = user_id);

-- Keep updated_at current on every row change.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists accounts_set_updated_at on accounts;
create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------
-- trades — prepared for the Trading Journal + future MT5 EA sync.
-- Every trade must link back to the correct account_id.
-- ------------------------------------------------------------------
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  account_id uuid references accounts(id) not null,

  mt5_ticket text, -- populated once the EA/Connector is live

  pair text not null,
  direction text not null check (direction in ('BUY', 'SELL')),
  setup text,
  session text,

  entry numeric(14, 5),
  sl numeric(14, 5),
  tp numeric(14, 5),
  lot_size numeric(10, 2),

  rr text,
  risk numeric(14, 2),
  risk_pct numeric(6, 2),
  pnl numeric(14, 2),
  result text check (result in ('WIN', 'LOSS', 'BE')),

  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trades_account_id_idx on trades(account_id);
create index if not exists trades_user_id_idx on trades(user_id);

alter table trades enable row level security;

drop policy if exists "Users manage their own trades" on trades;
create policy "Users manage their own trades" on trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- trade_screenshots — stored via Supabase Storage, referenced here.
-- ------------------------------------------------------------------
create table if not exists trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references trades(id) not null,
  user_id uuid references auth.users(id) not null,
  stage text check (stage in ('before', 'during', 'after')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table trade_screenshots enable row level security;

drop policy if exists "Users manage their own screenshots" on trade_screenshots;
create policy "Users manage their own screenshots" on trade_screenshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);