alter table public.material_leads
  drop constraint if exists material_leads_status_check;

alter table public.material_leads
  add constraint material_leads_status_check
  check (status = any (array[
    'new','distributor_review','awaiting_manufacturer','quote_ready',
    'quoted','accepted','declined','ordered','fulfilled','lost'
  ]::text[]));

alter table public.material_leads
  add column if not exists last_activity_at timestamptz not null default now();

create index if not exists idx_material_leads_assigned_distributor
  on public.material_leads(assigned_distributor_id, status, created_at desc);
create index if not exists idx_material_leads_last_activity
  on public.material_leads(last_activity_at desc);

create table if not exists public.distributor_members (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'sales'
    check (role = any (array['owner','manager','sales','warehouse']::text[])),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(distributor_id,user_id)
);

create index if not exists idx_distributor_members_user
  on public.distributor_members(user_id, active);
create index if not exists idx_distributor_members_distributor
  on public.distributor_members(distributor_id, active);

create table if not exists public.material_quotes (
  id uuid primary key default gen_random_uuid(),
  material_lead_id uuid not null references public.material_leads(id) on delete cascade,
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status = any (array['draft','submitted','accepted','declined','expired','cancelled']::text[])),
  quantity_sqft numeric not null default 0 check (quantity_sqft >= 0),
  boxes integer check (boxes is null or boxes >= 0),
  unit_price_sqft numeric check (unit_price_sqft is null or unit_price_sqft >= 0),
  subtotal numeric not null default 0 check (subtotal >= 0),
  freight numeric not null default 0 check (freight >= 0),
  tax numeric not null default 0 check (tax >= 0),
  total numeric not null default 0 check (total >= 0),
  eta_days integer check (eta_days is null or eta_days >= 0),
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  accepted_at timestamptz
);

create index if not exists idx_material_quotes_lead
  on public.material_quotes(material_lead_id, created_at desc);
create index if not exists idx_material_quotes_distributor
  on public.material_quotes(distributor_id, status, created_at desc);

create table if not exists public.manufacturer_supply_requests (
  id uuid primary key default gen_random_uuid(),
  material_lead_id uuid not null references public.material_leads(id) on delete cascade,
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  manufacturer_id uuid references public.catalog_manufacturers(id) on delete set null,
  catalog_variant_id uuid references public.catalog_variants(id) on delete set null,
  requested_sqft numeric not null default 0 check (requested_sqft >= 0),
  requested_boxes integer check (requested_boxes is null or requested_boxes >= 0),
  status text not null default 'requested'
    check (status = any (array['requested','confirmed','partial','unavailable','cancelled']::text[])),
  available_sqft numeric check (available_sqft is null or available_sqft >= 0),
  cost_sqft numeric check (cost_sqft is null or cost_sqft >= 0),
  eta_days integer check (eta_days is null or eta_days >= 0),
  request_notes text,
  response_notes text,
  requested_by uuid references auth.users(id) on delete set null,
  responded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists idx_supply_requests_lead
  on public.manufacturer_supply_requests(material_lead_id, created_at desc);
create index if not exists idx_supply_requests_distributor
  on public.manufacturer_supply_requests(distributor_id, status, created_at desc);
create index if not exists idx_supply_requests_manufacturer
  on public.manufacturer_supply_requests(manufacturer_id, status, created_at desc);

create table if not exists public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  material_lead_id uuid not null references public.material_leads(id) on delete cascade,
  actor_type text not null
    check (actor_type = any (array['installer','distributor','industry','admin','system']::text[])),
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_opportunity_events_lead
  on public.opportunity_events(material_lead_id, created_at asc);

alter table public.distributor_members enable row level security;
alter table public.material_quotes enable row level security;
alter table public.manufacturer_supply_requests enable row level security;
alter table public.opportunity_events enable row level security;

grant select on public.distributor_members to authenticated;
grant select,insert,update on public.material_quotes to authenticated;
grant select,insert,update on public.manufacturer_supply_requests to authenticated;
grant select on public.opportunity_events to authenticated;

grant select,insert,update,delete on public.distributor_members to service_role;
grant select,insert,update,delete on public.material_quotes to service_role;
grant select,insert,update,delete on public.manufacturer_supply_requests to service_role;
grant select,insert,update,delete on public.opportunity_events to service_role;

drop policy if exists "distributor members read own membership" on public.distributor_members;
create policy "distributor members read own membership"
on public.distributor_members for select to authenticated
using ((select auth.uid()) = user_id and active);

drop policy if exists "assigned distributor reads material leads" on public.material_leads;
create policy "assigned distributor reads material leads"
on public.material_leads for select to authenticated
using (
  assigned_distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
);

drop policy if exists "assigned distributor updates material leads" on public.material_leads;
create policy "assigned distributor updates material leads"
on public.material_leads for update to authenticated
using (
  assigned_distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
)
with check (
  assigned_distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
);

drop policy if exists "participants read material quotes" on public.material_quotes;
create policy "participants read material quotes"
on public.material_quotes for select to authenticated
using (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
  or material_lead_id in (
    select ml.id
    from public.material_leads ml
    join public.partners p on p.id = ml.partner_id
    where p.owner_id = (select auth.uid())
  )
);

drop policy if exists "distributor creates material quotes" on public.material_quotes;
create policy "distributor creates material quotes"
on public.material_quotes for insert to authenticated
with check (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.material_leads ml
    where ml.id = material_lead_id and ml.assigned_distributor_id = distributor_id
  )
);

drop policy if exists "distributor updates material quotes" on public.material_quotes;
create policy "distributor updates material quotes"
on public.material_quotes for update to authenticated
using (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
)
with check (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
);

drop policy if exists "distributor reads supply requests" on public.manufacturer_supply_requests;
create policy "distributor reads supply requests"
on public.manufacturer_supply_requests for select to authenticated
using (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
);

drop policy if exists "distributor creates supply requests" on public.manufacturer_supply_requests;
create policy "distributor creates supply requests"
on public.manufacturer_supply_requests for insert to authenticated
with check (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
  and requested_by = (select auth.uid())
  and exists (
    select 1 from public.material_leads ml
    where ml.id = material_lead_id and ml.assigned_distributor_id = distributor_id
  )
);

drop policy if exists "distributor updates supply requests" on public.manufacturer_supply_requests;
create policy "distributor updates supply requests"
on public.manufacturer_supply_requests for update to authenticated
using (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
)
with check (
  distributor_id in (
    select dm.distributor_id
    from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
);

drop policy if exists "participants read opportunity events" on public.opportunity_events;
create policy "participants read opportunity events"
on public.opportunity_events for select to authenticated
using (
  material_lead_id in (
    select ml.id
    from public.material_leads ml
    where ml.assigned_distributor_id in (
      select dm.distributor_id
      from public.distributor_members dm
      where dm.user_id = (select auth.uid()) and dm.active
    )
  )
  or material_lead_id in (
    select ml.id
    from public.material_leads ml
    join public.partners p on p.id = ml.partner_id
    where p.owner_id = (select auth.uid())
  )
);
