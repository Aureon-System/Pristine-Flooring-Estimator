create table if not exists public.distributor_installers (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  assigned_sales_user_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(distributor_id,partner_id)
);

create unique index if not exists distributor_installers_one_active_distributor_idx
  on public.distributor_installers(partner_id)
  where status in ('invited','active','suspended');

create index if not exists distributor_installers_distributor_status_idx
  on public.distributor_installers(distributor_id,status,updated_at desc);

create table if not exists public.distributor_installer_invites (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  invite_token text not null unique,
  installer_email text,
  installer_company text,
  status text not null default 'pending' check (status in ('pending','redeemed','revoked','expired')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now()+interval '30 days'),
  redeemed_partner_id uuid references public.partners(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists distributor_installer_invites_distributor_status_idx
  on public.distributor_installer_invites(distributor_id,status,created_at desc);

create table if not exists public.distributor_role_permissions (
  role text not null,
  permission text not null,
  allowed boolean not null default true,
  primary key(role,permission)
);

insert into public.distributor_role_permissions(role,permission,allowed) values
  ('owner','manage_members',true),
  ('owner','manage_installers',true),
  ('owner','manage_catalog',true),
  ('owner','manage_inventory',true),
  ('owner','manage_pricing',true),
  ('owner','manage_quotes',true),
  ('owner','manage_orders',true),
  ('owner','request_industry_supply',true),
  ('manager','manage_installers',true),
  ('manager','manage_catalog',true),
  ('manager','manage_inventory',true),
  ('manager','manage_pricing',true),
  ('manager','manage_quotes',true),
  ('manager','manage_orders',true),
  ('manager','request_industry_supply',true),
  ('sales','view_installers',true),
  ('sales','invite_installers',true),
  ('sales','manage_quotes',true),
  ('sales','manage_orders',true),
  ('warehouse','manage_inventory',true),
  ('warehouse','manage_orders',true),
  ('warehouse','request_industry_supply',true)
on conflict(role,permission) do update set allowed=excluded.allowed;

create table if not exists public.distributor_catalog_permissions (
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  allowed boolean not null default true,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(distributor_id,variant_id)
);

create index if not exists distributor_catalog_permissions_variant_idx
  on public.distributor_catalog_permissions(variant_id,allowed);

create table if not exists public.industry_inventory_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_type text not null default 'upload' check (source_type in ('upload','api','manual')),
  status text not null default 'uploaded' check (status in ('uploaded','validated','published','failed','rolled_back')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  published_at timestamptz,
  notes text
);

create table if not exists public.industry_inventory_import_rows (
  id bigserial primary key,
  batch_id uuid not null references public.industry_inventory_batches(id) on delete cascade,
  row_number integer not null,
  sku text,
  warehouse_code text,
  on_hand_sqft numeric,
  on_hand_boxes integer,
  on_hand_pallets numeric,
  availability text,
  eta_date date,
  valid boolean not null default false,
  severity text not null default 'error' check (severity in ('ok','warning','error')),
  issue text,
  raw_data jsonb,
  unique(batch_id,row_number)
);

create index if not exists industry_inventory_import_rows_batch_valid_idx
  on public.industry_inventory_import_rows(batch_id,valid,row_number);

create table if not exists public.industry_inventory (
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  warehouse_code text not null default 'PRIMARY',
  on_hand_sqft numeric not null default 0 check (on_hand_sqft>=0),
  on_hand_boxes integer not null default 0 check (on_hand_boxes>=0),
  on_hand_pallets numeric not null default 0 check (on_hand_pallets>=0),
  availability text not null default 'unknown' check (availability in ('in_stock','limited','out_of_stock','special_order','unknown')),
  eta_date date,
  batch_id uuid references public.industry_inventory_batches(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(variant_id,warehouse_code)
);

create index if not exists industry_inventory_availability_idx
  on public.industry_inventory(availability,updated_at desc);

create table if not exists public.inventory_events (
  id bigserial primary key,
  scope text not null check (scope in ('industry','distributor')),
  distributor_id uuid references public.distributors(id) on delete cascade,
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  batch_id uuid references public.industry_inventory_batches(id) on delete set null,
  event_type text not null,
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_events_variant_created_idx
  on public.inventory_events(variant_id,created_at desc);
create index if not exists inventory_events_distributor_created_idx
  on public.inventory_events(distributor_id,created_at desc) where distributor_id is not null;

create table if not exists public.reward_points_ledger (
  id bigserial primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  distributor_id uuid references public.distributors(id) on delete set null,
  points integer not null check(points<>0),
  event_type text not null,
  reference_type text,
  reference_id text,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reward_points_ledger_partner_created_idx
  on public.reward_points_ledger(partner_id,created_at desc);
create index if not exists reward_points_ledger_distributor_partner_idx
  on public.reward_points_ledger(distributor_id,partner_id,created_at desc);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  distributor_id uuid references public.distributors(id) on delete set null,
  points integer not null check(points>0),
  reward_type text not null default 'custom',
  reward_label text not null,
  reward_value numeric,
  status text not null default 'pending' check(status in ('pending','approved','fulfilled','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  notes text
);

create index if not exists reward_redemptions_partner_status_idx
  on public.reward_redemptions(partner_id,status,requested_at desc);

alter table public.distributor_installers enable row level security;
alter table public.distributor_installer_invites enable row level security;
alter table public.distributor_role_permissions enable row level security;
alter table public.distributor_catalog_permissions enable row level security;
alter table public.industry_inventory_batches enable row level security;
alter table public.industry_inventory_import_rows enable row level security;
alter table public.industry_inventory enable row level security;
alter table public.inventory_events enable row level security;
alter table public.reward_points_ledger enable row level security;
alter table public.reward_redemptions enable row level security;

revoke all on public.distributor_installers from anon,authenticated;
revoke all on public.distributor_installer_invites from anon,authenticated;
revoke all on public.distributor_role_permissions from anon,authenticated;
revoke all on public.distributor_catalog_permissions from anon,authenticated;
revoke all on public.industry_inventory_batches from anon,authenticated;
revoke all on public.industry_inventory_import_rows from anon,authenticated;
revoke all on public.industry_inventory from anon,authenticated;
revoke all on public.inventory_events from anon,authenticated;
revoke all on public.reward_points_ledger from anon,authenticated;
revoke all on public.reward_redemptions from anon,authenticated;

grant select,insert,update,delete on public.distributor_installers to service_role;
grant select,insert,update,delete on public.distributor_installer_invites to service_role;
grant select,insert,update,delete on public.distributor_role_permissions to service_role;
grant select,insert,update,delete on public.distributor_catalog_permissions to service_role;
grant select,insert,update,delete on public.industry_inventory_batches to service_role;
grant select,insert,update,delete on public.industry_inventory_import_rows to service_role;
grant select,insert,update,delete on public.industry_inventory to service_role;
grant select,insert,update,delete on public.inventory_events to service_role;
grant select,insert,update,delete on public.reward_points_ledger to service_role;
grant select,insert,update,delete on public.reward_redemptions to service_role;
grant usage,select on sequence public.industry_inventory_import_rows_id_seq to service_role;
grant usage,select on sequence public.inventory_events_id_seq to service_role;
grant usage,select on sequence public.reward_points_ledger_id_seq to service_role;

insert into public.distributor_installers(distributor_id,partner_id,referral_code_id,status,joined_at,last_activity_at)
select
  rc_partner.distributor_id,
  p.id,
  rc.id,
  'active',
  coalesce(pp.created_at,now()),
  pp.updated_at
from public.partner_profiles pp
join public.partners p on p.id=pp.partner_id
join public.referral_codes rc on rc.code=pp.referred_by_code and rc.active=true
join lateral (
  select dm.distributor_id
  from public.distributor_members dm
  join public.partners owner_partner on owner_partner.owner_id=dm.user_id
  where owner_partner.id=rc.partner_id and dm.active=true
  order by case dm.role when 'owner' then 1 when 'manager' then 2 else 3 end
  limit 1
) rc_partner on true
where pp.referred_by_code is not null
on conflict(distributor_id,partner_id) do update set
  referral_code_id=excluded.referral_code_id,
  status='active',
  updated_at=now();
