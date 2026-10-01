create index if not exists distributor_installers_referral_code_idx on public.distributor_installers(referral_code_id) where referral_code_id is not null;
create index if not exists distributor_installers_sales_user_idx on public.distributor_installers(assigned_sales_user_id) where assigned_sales_user_id is not null;
create index if not exists distributor_installer_invites_referral_code_idx on public.distributor_installer_invites(referral_code_id) where referral_code_id is not null;
create index if not exists distributor_installer_invites_created_by_idx on public.distributor_installer_invites(created_by) where created_by is not null;
create index if not exists distributor_installer_invites_redeemed_partner_idx on public.distributor_installer_invites(redeemed_partner_id) where redeemed_partner_id is not null;
create index if not exists distributor_catalog_permissions_updated_by_idx on public.distributor_catalog_permissions(updated_by) where updated_by is not null;
create index if not exists industry_inventory_batch_idx on public.industry_inventory(batch_id) where batch_id is not null;
create index if not exists industry_inventory_batches_uploaded_by_idx on public.industry_inventory_batches(uploaded_by) where uploaded_by is not null;
create index if not exists industry_inventory_batches_published_by_idx on public.industry_inventory_batches(published_by) where published_by is not null;
create index if not exists inventory_events_batch_idx on public.inventory_events(batch_id) where batch_id is not null;
create index if not exists inventory_events_actor_idx on public.inventory_events(actor_user_id) where actor_user_id is not null;
create index if not exists reward_points_ledger_created_by_idx on public.reward_points_ledger(created_by) where created_by is not null;
create index if not exists reward_redemptions_distributor_idx on public.reward_redemptions(distributor_id) where distributor_id is not null;
create index if not exists reward_redemptions_reviewed_by_idx on public.reward_redemptions(reviewed_by) where reviewed_by is not null;

create or replace view public.distributor_network_stats
with (security_invoker=true)
as
select
  d.id as distributor_id,
  d.name,
  d.active,
  count(distinct di.partner_id) filter (where di.status='active') as active_installers,
  count(distinct di.partner_id) filter (where di.status='suspended') as suspended_installers,
  count(distinct dof.variant_id) filter (where dof.active) as active_catalog_items,
  coalesce(sum(dof.stock_sqft) filter (where dof.active),0)::numeric as local_stock_sqft
from public.distributors d
left join public.distributor_installers di on di.distributor_id=d.id and di.status<>'removed'
left join public.distributor_offers dof on dof.distributor_id=d.id
group by d.id,d.name,d.active;

revoke all on public.distributor_network_stats from anon,authenticated;
grant select on public.distributor_network_stats to service_role;
