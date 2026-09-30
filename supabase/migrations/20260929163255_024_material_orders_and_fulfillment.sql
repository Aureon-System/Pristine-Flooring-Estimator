create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  material_lead_id uuid not null references public.material_leads(id) on delete cascade,
  quote_id uuid not null references public.material_quotes(id) on delete restrict,
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  partner_id uuid not null references public.partners(id) on delete restrict,
  status text not null default 'accepted'
    check (status in ('accepted','confirmed','processing','ready','out_for_delivery','delivered','picked_up','cancelled')),
  delivery_method text not null default 'delivery'
    check (delivery_method in ('delivery','pickup')),
  delivery_address text,
  delivery_city text,
  delivery_state text,
  delivery_zip text,
  quantity_sqft numeric not null default 0 check (quantity_sqft >= 0),
  boxes integer check (boxes is null or boxes >= 0),
  subtotal numeric not null default 0 check (subtotal >= 0),
  freight numeric not null default 0 check (freight >= 0),
  tax numeric not null default 0 check (tax >= 0),
  total numeric not null default 0 check (total >= 0),
  eta_days integer check (eta_days is null or eta_days >= 0),
  scheduled_for timestamptz,
  tracking_reference text,
  notes text,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (quote_id)
);

create index if not exists idx_material_orders_lead on public.material_orders(material_lead_id);
create index if not exists idx_material_orders_distributor_status on public.material_orders(distributor_id,status);
create index if not exists idx_material_orders_partner on public.material_orders(partner_id);

alter table public.material_orders enable row level security;

drop policy if exists "participants read material orders" on public.material_orders;
create policy "participants read material orders"
on public.material_orders for select to authenticated
using (
  partner_id in (
    select p.id from public.partners p
    where p.owner_id = (select auth.uid())
  )
  or distributor_id in (
    select dm.distributor_id from public.distributor_members dm
    where dm.user_id = (select auth.uid()) and dm.active
  )
);

grant select on public.material_orders to authenticated;
revoke insert, update, delete on public.material_orders from authenticated;
