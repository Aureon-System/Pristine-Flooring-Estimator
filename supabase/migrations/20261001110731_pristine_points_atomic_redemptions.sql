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

create or replace function public.process_reward_redemption(
  p_redemption_id uuid,
  p_distributor_id uuid,
  p_status text,
  p_reviewer_id uuid,
  p_notes text default null
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.reward_redemptions%rowtype;
begin
  if p_status not in ('approved','fulfilled','cancelled') then
    raise exception 'Invalid redemption status';
  end if;

  select * into v_row
  from public.reward_redemptions
  where id=p_redemption_id and distributor_id=p_distributor_id
  for update;

  if not found then
    raise exception 'Redemption not found';
  end if;

  if v_row.status='fulfilled' or v_row.status='cancelled' then
    if v_row.status<>p_status then raise exception 'Redemption is already closed'; end if;
    return v_row.status;
  end if;

  update public.reward_redemptions
  set status=p_status,reviewed_by=p_reviewer_id,reviewed_at=now(),notes=coalesce(p_notes,notes)
  where id=p_redemption_id;

  if p_status='cancelled' then
    insert into public.reward_points_ledger(
      partner_id,distributor_id,points,event_type,reference_type,reference_id,description,created_by
    )
    select
      v_row.partner_id,v_row.distributor_id,v_row.points,'redemption_refund','reward_redemption',v_row.id::text,
      'Points returned after reward cancellation',p_reviewer_id
    where not exists (
      select 1 from public.reward_points_ledger
      where partner_id=v_row.partner_id
        and event_type='redemption_refund'
        and reference_type='reward_redemption'
        and reference_id=v_row.id::text
    );
  end if;

  return p_status;
end;
$$;

revoke all on function public.request_reward_redemption(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.process_reward_redemption(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.request_reward_redemption(uuid,uuid,uuid,text) to service_role;
grant execute on function public.process_reward_redemption(uuid,uuid,text,uuid,text) to service_role;
