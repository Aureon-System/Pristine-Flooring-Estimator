alter table public.material_leads
  add column if not exists product_sizes text[] not null default '{}'::text[],
  add column if not exists custom_size text;

create index if not exists idx_material_leads_product_sizes
  on public.material_leads using gin(product_sizes);
