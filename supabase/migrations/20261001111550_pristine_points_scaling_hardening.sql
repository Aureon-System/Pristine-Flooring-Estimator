create index if not exists distributor_reward_programs_updated_by_idx
  on public.distributor_reward_programs(updated_by) where updated_by is not null;
create index if not exists distributor_reward_catalog_created_by_idx
  on public.distributor_reward_catalog(created_by) where created_by is not null;
create index if not exists distributor_reward_campaigns_created_by_idx
  on public.distributor_reward_campaigns(created_by) where created_by is not null;

create or replace function public.request_reward_redemption(
  p_partner_id uuid,
  p_distributor_id uuid,
  p_reward_id uuid,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reward public.distributor_reward_catalog%rowtype;
  v_balance bigint;
  v_redemption_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_partner_id::text),hashtext(p_distributor_id::text));

  select * into v_reward
  from public.distributor_reward_catalog
  where id=p_reward_id and distributor_id=p_distributor_id and active=true
  for share;

  if not found then
    raise exception 'Reward is unavailable';
  end if;

  select coalesce(sum(points),0)::bigint into v_balance
  from public.reward_points_ledger
  where partner_id=p_partner_id
    and distributor_id=p_distributor_id
    and (expires_at is null or expires_at>now());

  if v_balance < v_reward.points_cost then
    raise exception 'Insufficient points';
  end if;

  insert into public.reward_redemptions(
    partner_id,distributor_id,reward_catalog_id,points,reward_type,reward_label,reward_value,status,notes
  ) values (
    p_partner_id,p_distributor_id,v_reward.id,v_reward.points_cost,v_reward.reward_type,v_reward.label,v_reward.reward_value,'pending',p_notes
  ) returning id into v_redemption_id;

  insert into public.reward_points_ledger(
    partner_id,distributor_id,points,event_type,reference_type,reference_id,description
  ) values (
    p_partner_id,p_distributor_id,-v_reward.points_cost,'redemption_reserved','reward_redemption',v_redemption_id::text,
    'Points reserved for reward: '||v_reward.label
  );

  return v_redemption_id;
end;
$$;

revoke all on function public.request_reward_redemption(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_reward_redemption(uuid,uuid,uuid,text) to service_role;
