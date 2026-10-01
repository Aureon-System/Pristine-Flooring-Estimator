create table if not exists public.distributor_reward_programs (
  distributor_id uuid primary key references public.distributors(id) on delete cascade,
  program_name text not null default 'Pristine Points',
  points_label text not null default 'Points',
  active boolean not null default false,
  earn_basis text not null default 'subtotal' check (earn_basis in ('subtotal','total')),
  points_per_dollar numeric(12,4) not null default 1 check (points_per_dollar >= 0),
  minimum_purchase numeric(12,2) not null default 0 check (minimum_purchase >= 0),
  expiration_months integer check (expiration_months is null or expiration_months > 0),
  terms text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distributor_reward_catalog (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  label text not null,
  reward_type text not null default 'store_credit'
    check (reward_type in ('store_credit','cash_equivalent','free_delivery','product','service','custom')),
  points_cost integer not null check (points_cost > 0),
  reward_value numeric(12,2),
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists distributor_reward_catalog_distributor_active_idx
  on public.distributor_reward_catalog(distributor_id,active,points_cost,sort_order);

create table if not exists public.distributor_reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  name text not null,
  campaign_type text not null default 'multiplier'
    check (campaign_type in ('multiplier','fixed_bonus')),
  multiplier numeric(8,3) not null default 1 check (multiplier >= 1),
  bonus_points integer not null default 0 check (bonus_points >= 0),
  minimum_purchase numeric(12,2) not null default 0 check (minimum_purchase >= 0),
  variant_id uuid references public.catalog_variants(id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists distributor_reward_campaigns_active_idx
  on public.distributor_reward_campaigns(distributor_id,active,starts_at,ends_at);
create index if not exists distributor_reward_campaigns_variant_idx
  on public.distributor_reward_campaigns(variant_id) where variant_id is not null;

create unique index if not exists reward_points_ledger_unique_purchase_idx
  on public.reward_points_ledger(partner_id,distributor_id,event_type,reference_type,reference_id)
  where reference_id is not null and event_type='purchase_earned';

create unique index if not exists reward_points_ledger_unique_redemption_idx
  on public.reward_points_ledger(partner_id,event_type,reference_type,reference_id)
  where reference_id is not null and event_type in ('redemption_reserved','redemption_refund');

alter table public.distributor_reward_programs enable row level security;
alter table public.distributor_reward_catalog enable row level security;
alter table public.distributor_reward_campaigns enable row level security;

revoke all on public.distributor_reward_programs from anon,authenticated;
revoke all on public.distributor_reward_catalog from anon,authenticated;
revoke all on public.distributor_reward_campaigns from anon,authenticated;

grant select,insert,update,delete on public.distributor_reward_programs to service_role;
grant select,insert,update,delete on public.distributor_reward_catalog to service_role;
grant select,insert,update,delete on public.distributor_reward_campaigns to service_role;

insert into public.distributor_role_permissions(role,permission,allowed) values
  ('owner','manage_rewards',true),
  ('manager','manage_rewards',true),
  ('sales','view_rewards',true)
on conflict(role,permission) do update set allowed=excluded.allowed;

insert into public.distributor_reward_programs(distributor_id,program_name,points_label,active,earn_basis,points_per_dollar,minimum_purchase,terms)
select d.id,'Pristine Points','Points',false,'subtotal',1,0,
       'Example model: 1 point per eligible dollar. Distributor controls earning rates, campaigns and reward values.'
from public.distributors d
on conflict(distributor_id) do nothing;

insert into public.distributor_reward_catalog(distributor_id,label,reward_type,points_cost,reward_value,description,active,sort_order)
select d.id,t.label,t.reward_type,t.points_cost,t.reward_value,t.description,false,t.sort_order
from public.distributors d
cross join (values
  ('$25 Store Credit','store_credit',2500,25::numeric,'Example reward template. Adjust points and value to your margin.',10),
  ('Free Delivery','free_delivery',4000,null::numeric,'Example reward template. Distributor defines eligibility and service area.',20),
  ('$50 Store Credit','store_credit',5000,50::numeric,'Example reward template. Adjust points and value to your margin.',30)
) as t(label,reward_type,points_cost,reward_value,description,sort_order)
where not exists (
  select 1 from public.distributor_reward_catalog r
  where r.distributor_id=d.id and r.label=t.label
);
