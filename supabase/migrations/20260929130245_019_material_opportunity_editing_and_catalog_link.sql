alter table public.material_leads
      add column if not exists catalog_variant_id uuid references public.catalog_variants(id) on delete set null,
      add column if not exists product_sku text,
      add column if not exists product_name text,
      add column if not exists unit_price_sqft numeric,
      add column if not exists calculated_boxes integer;

    create index if not exists idx_material_leads_catalog_variant_id
      on public.material_leads(catalog_variant_id);

    drop policy if exists "partner can update own material leads" on public.material_leads;
    create policy "partner can update own material leads"
      on public.material_leads
      for update
      to authenticated
      using (
        exists (
          select 1 from public.partners p
          where p.id = material_leads.partner_id
            and p.owner_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.partners p
          where p.id = material_leads.partner_id
            and p.owner_id = auth.uid()
        )
      );
