create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','finance','support')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_costs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  vendor text,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  cadence text not null default 'one_time' check (cadence in ('one_time','monthly','annual')),
  cost_date date not null default current_date,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique,
  event_type text not null,
  partner_id uuid references public.partners(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pro_entitlements
  add column if not exists partner_id uuid references public.partners(id) on delete set null,
  add column if not exists monthly_amount numeric(12,2) not null default 12.99,
  add column if not exists currency text not null default 'USD';

create table if not exists public.ai_automation_rules (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  rule_key text not null,
  enabled boolean not null default false,
  trigger_event text not null,
  delay_hours integer not null default 24 check (delay_hours >= 0 and delay_hours <= 720),
  channel text not null default 'email' check (channel in ('email','sms')),
  approval_mode text not null default 'review' check (approval_mode in ('review','automatic')),
  tone text not null default 'professional',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_id, rule_key)
);

create table if not exists public.ai_activity (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  rule_key text,
  event_type text,
  model text,
  status text not null default 'completed',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(12,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_costs_cost_date on public.platform_costs(cost_date desc);
create index if not exists idx_billing_events_occurred_at on public.billing_events(occurred_at desc);
create index if not exists idx_billing_events_partner on public.billing_events(partner_id);
create index if not exists idx_pro_entitlements_partner on public.pro_entitlements(partner_id);
create index if not exists idx_ai_rules_partner on public.ai_automation_rules(partner_id);
create index if not exists idx_ai_activity_partner on public.ai_activity(partner_id, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.platform_costs enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_automation_rules enable row level security;
alter table public.ai_activity enable row level security;

drop policy if exists "platform_admins_self_read" on public.platform_admins;
create policy "platform_admins_self_read" on public.platform_admins
for select to authenticated
using (user_id = auth.uid() and active = true);

drop policy if exists "platform_costs_admin_all" on public.platform_costs;
create policy "platform_costs_admin_all" on public.platform_costs
for all to authenticated
using (exists(select 1 from public.platform_admins a where a.user_id=auth.uid() and a.active))
with check (exists(select 1 from public.platform_admins a where a.user_id=auth.uid() and a.active));

drop policy if exists "billing_events_admin_read" on public.billing_events;
create policy "billing_events_admin_read" on public.billing_events
for select to authenticated
using (exists(select 1 from public.platform_admins a where a.user_id=auth.uid() and a.active));

drop policy if exists "ai_rules_owner_all" on public.ai_automation_rules;
create policy "ai_rules_owner_all" on public.ai_automation_rules
for all to authenticated
using (exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=auth.uid()))
with check (exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=auth.uid()));

drop policy if exists "ai_activity_owner_read" on public.ai_activity;
create policy "ai_activity_owner_read" on public.ai_activity
for select to authenticated
using (
  exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=auth.uid())
  or exists(select 1 from public.platform_admins a where a.user_id=auth.uid() and a.active)
);
