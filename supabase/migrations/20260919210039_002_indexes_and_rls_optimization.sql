create index if not exists idx_partners_owner_id on public.partners(owner_id);
create index if not exists idx_customers_partner_id on public.customers(partner_id);
create index if not exists idx_documents_customer_id on public.documents(customer_id);
create index if not exists idx_material_leads_partner_id on public.material_leads(partner_id);
create index if not exists idx_material_leads_document_id on public.material_leads(document_id);
create index if not exists idx_communications_partner_id on public.communications(partner_id);
create index if not exists idx_communications_document_id on public.communications(document_id);

drop policy if exists "partners_owner_select" on public.partners;
create policy "partners_owner_select" on public.partners
for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "partners_owner_update" on public.partners;
create policy "partners_owner_update" on public.partners
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "customers_partner_access" on public.customers;
create policy "customers_partner_access" on public.customers
for all to authenticated
using (partner_id in (select id from public.partners where owner_id = (select auth.uid())))
with check (partner_id in (select id from public.partners where owner_id = (select auth.uid())));

drop policy if exists "documents_partner_access" on public.documents;
create policy "documents_partner_access" on public.documents
for all to authenticated
using (partner_id in (select id from public.partners where owner_id = (select auth.uid())))
with check (partner_id in (select id from public.partners where owner_id = (select auth.uid())));

drop policy if exists "leads_partner_select" on public.material_leads;
create policy "leads_partner_select" on public.material_leads
for select to authenticated
using (partner_id in (select id from public.partners where owner_id = (select auth.uid())));

drop policy if exists "communications_partner_select" on public.communications;
create policy "communications_partner_select" on public.communications
for select to authenticated
using (partner_id in (select id from public.partners where owner_id = (select auth.uid())));
