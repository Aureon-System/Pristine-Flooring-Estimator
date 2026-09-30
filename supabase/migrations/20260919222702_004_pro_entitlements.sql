create table if not exists public.pro_entitlements (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  email text,
  status text not null default 'pending' check (status in ('pending','active','past_due','canceled','incomplete','unpaid')),
  access_token_hash text,
  activated_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pro_entitlements enable row level security;

create index if not exists idx_pro_entitlements_email on public.pro_entitlements(lower(email));
create index if not exists idx_pro_entitlements_access_hash on public.pro_entitlements(access_token_hash);
create index if not exists idx_pro_entitlements_subscription on public.pro_entitlements(stripe_subscription_id);
