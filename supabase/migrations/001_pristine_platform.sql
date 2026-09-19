-- Pristine Flooring Estimator cloud platform
-- Apply with Supabase migrations after a dedicated project is authorized.

create extension if not exists pgcrypto;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  company_name text,
  email text,
  phone text,
  address text,
  license text,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  document_no text not null,
  document_type text not null check (document_type in ('ESTIMATE','INVOICE')),
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','invoiced','paid','expired')),
  project_name text,
  project_address text,
  payload jsonb not null default '{}'::jsonb,
  total numeric(12,2) not null default 0,
  public_token uuid not null default gen_random_uuid() unique,
  viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  accepted_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_partner on public.documents(partner_id);
create index if not exists idx_documents_public_token on public.documents(public_token);

create table if not exists public.material_leads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  requester_company text,
  requester_name text,
  phone text,
  email text,
  project_name text,
  project_address text,
  material text not null,
  measured_sqft numeric(12,2) not null default 0,
  waste_pct numeric(6,2) not null default 0,
  required_sqft numeric(12,2) not null default 0,
  notes text,
  status text not null default 'new' check (status in ('new','contacted','quoted','won','lost')),
  source text not null default 'Pristine Flooring Estimator',
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_material_leads_status on public.material_leads(status, created_at desc);

create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  recipient text not null,
  template_key text,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','clicked','failed','bounced')),
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pro_interest (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  company text,
  feature text,
  created_at timestamptz not null default now()
);

alter table public.partners enable row level security;
alter table public.customers enable row level security;
alter table public.documents enable row level security;
alter table public.material_leads enable row level security;
alter table public.communications enable row level security;
alter table public.pro_interest enable row level security;

create policy "partners_owner_select" on public.partners
for select to authenticated using (owner_id = auth.uid());
create policy "partners_owner_update" on public.partners
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "customers_partner_access" on public.customers
for all to authenticated
using (partner_id in (select id from public.partners where owner_id = auth.uid()))
with check (partner_id in (select id from public.partners where owner_id = auth.uid()));

create policy "documents_partner_access" on public.documents
for all to authenticated
using (partner_id in (select id from public.partners where owner_id = auth.uid()))
with check (partner_id in (select id from public.partners where owner_id = auth.uid()));

create policy "leads_partner_select" on public.material_leads
for select to authenticated
using (partner_id in (select id from public.partners where owner_id = auth.uid()));

create policy "communications_partner_select" on public.communications
for select to authenticated
using (partner_id in (select id from public.partners where owner_id = auth.uid()));

-- Public inserts and public document access are intentionally NOT granted.
-- Public/guest operations should go through protected Edge Functions using
-- service-role credentials and explicit input validation/rate limiting.
