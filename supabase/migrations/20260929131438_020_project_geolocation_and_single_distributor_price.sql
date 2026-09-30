alter table public.material_leads
      add column if not exists project_city text,
      add column if not exists project_state text,
      add column if not exists project_zip text,
      add column if not exists project_lat numeric,
      add column if not exists project_lng numeric,
      add column if not exists assigned_distributor_id uuid references public.distributors(id) on delete set null;

    create index if not exists idx_material_leads_project_zip on public.material_leads(project_zip);
    create index if not exists idx_material_leads_assigned_distributor on public.material_leads(assigned_distributor_id);

    alter table public.distributor_offers
      add column if not exists price_sqft numeric;

    update public.distributor_offers
    set price_sqft = cut_order_price_sqft
    where price_sqft is null and cut_order_price_sqft is not null;
