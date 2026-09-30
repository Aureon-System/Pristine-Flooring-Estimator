create table if not exists public.catalog_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text,
  website text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.catalog_manufacturers(id) on delete cascade,
  collection text not null,
  category text not null,
  style_family text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(manufacturer_id, collection, category)
);

create table if not exists public.catalog_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  sku text not null unique,
  name text not null,
  size text not null,
  material_type text,
  finish text,
  edges text,
  pieces_per_box numeric,
  boxes_per_pallet numeric,
  sqft_per_box numeric,
  sqft_per_pallet numeric,
  selling_unit text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  manufacturer_id uuid references public.catalog_manufacturers(id) on delete set null,
  office_address text,
  warehouse_address text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.distributor_territories (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  territory_name text not null,
  state_code text,
  county_name text,
  zip_prefixes text[] not null default '{}',
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.distributor_offers (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  full_pallet_price_sqft numeric,
  cut_order_price_sqft numeric,
  fob_brazil_price_sqft numeric,
  availability text not null default 'unknown' check (availability in ('in_stock','limited','out_of_stock','special_order','unknown')),
  stock_sqft numeric,
  lead_time_days integer,
  effective_date date,
  source_label text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(distributor_id, variant_id)
);

create table if not exists public.installation_accessories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('thinset','grout','leveling','membrane','spacer','trim','delivery','other')),
  sku text,
  unit text,
  coverage_sqft numeric,
  coverage_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_variants_product on public.catalog_variants(product_id);
create index if not exists idx_catalog_variants_size on public.catalog_variants(size);
create index if not exists idx_catalog_variants_material on public.catalog_variants(material_type);
create index if not exists idx_distributor_offers_variant on public.distributor_offers(variant_id);
create index if not exists idx_distributor_territories_county on public.distributor_territories(state_code, county_name);

alter table public.catalog_manufacturers enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.distributors enable row level security;
alter table public.distributor_territories enable row level security;
alter table public.distributor_offers enable row level security;
alter table public.installation_accessories enable row level security;

drop policy if exists "authenticated catalog manufacturers read" on public.catalog_manufacturers;
create policy "authenticated catalog manufacturers read" on public.catalog_manufacturers for select to authenticated using (active);

drop policy if exists "authenticated catalog products read" on public.catalog_products;
create policy "authenticated catalog products read" on public.catalog_products for select to authenticated using (active);

drop policy if exists "authenticated catalog variants read" on public.catalog_variants;
create policy "authenticated catalog variants read" on public.catalog_variants for select to authenticated using (active);

drop policy if exists "authenticated distributors read" on public.distributors;
create policy "authenticated distributors read" on public.distributors for select to authenticated using (active);

drop policy if exists "authenticated territories read" on public.distributor_territories;
create policy "authenticated territories read" on public.distributor_territories for select to authenticated using (active);

drop policy if exists "authenticated distributor offers read" on public.distributor_offers;
create policy "authenticated distributor offers read" on public.distributor_offers for select to authenticated using (active);

drop policy if exists "authenticated accessories read" on public.installation_accessories;
create policy "authenticated accessories read" on public.installation_accessories for select to authenticated using (active);
