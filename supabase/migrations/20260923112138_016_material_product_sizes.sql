alter table public.material_leads
  add column if not exists product_sizes jsonb not null default '[]'::jsonb;

create index if not exists idx_material_leads_product_sizes
  on public.material_leads using gin(product_sizes);
