revoke execute on function public.handle_new_pristine_user() from public, anon, authenticated;

drop policy if exists "pro_entitlements_owner_read" on public.pro_entitlements;
create policy "pro_entitlements_owner_read" on public.pro_entitlements
for select to authenticated
using (
  partner_id in (
    select p.id from public.partners p where p.owner_id = (select auth.uid())
  )
);

drop policy if exists "pro_interest_no_direct_access" on public.pro_interest;
create policy "pro_interest_no_direct_access" on public.pro_interest
for all to authenticated
using (false)
with check (false);

drop policy if exists "partners_owner_insert" on public.partners;
create policy "partners_owner_insert" on public.partners
for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "platform_admins_self_read" on public.platform_admins;
create policy "platform_admins_self_read" on public.platform_admins
for select to authenticated
using (user_id = (select auth.uid()) and active = true);

drop policy if exists "platform_costs_admin_all" on public.platform_costs;
create policy "platform_costs_admin_all" on public.platform_costs
for all to authenticated
using (exists(select 1 from public.platform_admins a where a.user_id=(select auth.uid()) and a.active))
with check (exists(select 1 from public.platform_admins a where a.user_id=(select auth.uid()) and a.active));

drop policy if exists "billing_events_admin_read" on public.billing_events;
create policy "billing_events_admin_read" on public.billing_events
for select to authenticated
using (exists(select 1 from public.platform_admins a where a.user_id=(select auth.uid()) and a.active));

drop policy if exists "ai_rules_owner_all" on public.ai_automation_rules;
create policy "ai_rules_owner_all" on public.ai_automation_rules
for all to authenticated
using (exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid())))
with check (exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid())));

drop policy if exists "ai_activity_owner_read" on public.ai_activity;
create policy "ai_activity_owner_read" on public.ai_activity
for select to authenticated
using (
  exists(select 1 from public.partners p where p.id=partner_id and p.owner_id=(select auth.uid()))
  or exists(select 1 from public.platform_admins a where a.user_id=(select auth.uid()) and a.active)
);

create index if not exists idx_ai_activity_document on public.ai_activity(document_id);
create index if not exists idx_platform_costs_created_by on public.platform_costs(created_by);
