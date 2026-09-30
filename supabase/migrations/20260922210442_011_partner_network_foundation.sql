create table if not exists public.partner_profiles (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  business_type text check (business_type in ('installer','flooring_contractor','general_contractor','remodeler','retailer','designer','property_manager','other')),
  material_purchase_frequency text check (material_purchase_frequency in ('always','often','sometimes','rarely','never')),
  usual_material_buyer text check (usual_material_buyer in ('my_company','homeowner','general_contractor','retailer_designer','another_company','varies')),
  referral_interest text check (referral_interest in ('yes','maybe','no')),
  service_area text,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null unique references public.partners(id) on delete cascade,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  material_lead_id uuid references public.material_leads(id) on delete set null,
  event_type text not null check (event_type in (
    'profile_completed',
    'referral_link_opened',
    'material_opportunity',
    'quote_requested',
    'customer_referred',
    'material_already_purchased',
    'sale_attributed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.material_leads
  add column if not exists opportunity_type text
    check (opportunity_type in ('quote_for_me','send_to_customer','already_purchased')),
  add column if not exists buyer_role text
    check (buyer_role in ('my_company','homeowner','general_contractor','retailer_designer','another_company','unknown')),
  add column if not exists referral_code_id uuid references public.referral_codes(id) on delete set null,
  add column if not exists estimate_no text,
  add column if not exists estimate_total numeric(12,2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_partner_profiles_business_type on public.partner_profiles(business_type);
create index if not exists idx_referral_codes_code on public.referral_codes(code);
create index if not exists idx_referral_events_partner_created on public.referral_events(partner_id,created_at desc);
create index if not exists idx_referral_events_lead on public.referral_events(material_lead_id);
create index if not exists idx_material_leads_referral_code on public.material_leads(referral_code_id);
create index if not exists idx_material_leads_opportunity on public.material_leads(opportunity_type,status,created_at desc);

alter table public.partner_profiles enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_events enable row level security;

drop policy if exists "partner_profiles_owner_all" on public.partner_profiles;
create policy "partner_profiles_owner_all" on public.partner_profiles
for all to authenticated
using (
  exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid()))
)
with check (
  exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid()))
);

drop policy if exists "referral_codes_owner_select" on public.referral_codes;
create policy "referral_codes_owner_select" on public.referral_codes
for select to authenticated
using (
  exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid()))
);

drop policy if exists "referral_events_owner_select" on public.referral_events;
create policy "referral_events_owner_select" on public.referral_events
for select to authenticated
using (
  exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid()))
);

create or replace function public.ensure_pristine_partner_network_assets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  insert into public.partner_profiles(partner_id)
  values (new.id)
  on conflict (partner_id) do nothing;

  if not exists(select 1 from public.referral_codes where partner_id=new.id) then
    loop
      candidate := 'PF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      begin
        insert into public.referral_codes(partner_id,code)
        values (new.id,candidate);
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_pristine_partner_network_assets() from public, anon, authenticated;

drop trigger if exists trg_pristine_partner_network_assets on public.partners;
create trigger trg_pristine_partner_network_assets
after insert on public.partners
for each row execute function public.ensure_pristine_partner_network_assets();

insert into public.partner_profiles(partner_id)
select p.id from public.partners p
on conflict (partner_id) do nothing;

do $$
declare
  p record;
  candidate text;
begin
  for p in select id from public.partners where id not in (select partner_id from public.referral_codes)
  loop
    loop
      candidate := 'PF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      begin
        insert into public.referral_codes(partner_id,code) values (p.id,candidate);
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end $$;
