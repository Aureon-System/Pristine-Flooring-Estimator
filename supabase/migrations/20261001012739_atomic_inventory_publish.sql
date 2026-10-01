create or replace function public.publish_industry_inventory_batch(p_batch_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status text;
  v_errors integer;
  v_count integer;
begin
  select status,error_rows into v_status,v_errors
  from public.industry_inventory_batches
  where id=p_batch_id
  for update;

  if not found then
    raise exception 'Inventory batch not found';
  end if;
  if v_status <> 'validated' then
    raise exception 'Inventory batch is not validated';
  end if;
  if coalesce(v_errors,0) > 0 then
    raise exception 'Inventory batch contains validation errors';
  end if;

  insert into public.industry_inventory(
    variant_id,warehouse_code,on_hand_sqft,on_hand_boxes,on_hand_pallets,availability,eta_date,batch_id,updated_at
  )
  select
    cv.id,
    coalesce(nullif(r.warehouse_code,''),'PRIMARY'),
    greatest(coalesce(r.on_hand_sqft,0),0),
    greatest(coalesce(r.on_hand_boxes,0),0),
    greatest(coalesce(r.on_hand_pallets,0),0),
    case when r.availability in ('in_stock','limited','out_of_stock','special_order','unknown')
      then r.availability
      when coalesce(r.on_hand_sqft,0)<=0 then 'out_of_stock'
      else 'in_stock'
    end,
    r.eta_date,
    p_batch_id,
    now()
  from public.industry_inventory_import_rows r
  join public.catalog_variants cv on upper(trim(cv.sku))=upper(trim(r.sku)) and cv.active=true
  where r.batch_id=p_batch_id and r.valid=true
  on conflict(variant_id,warehouse_code) do update set
    on_hand_sqft=excluded.on_hand_sqft,
    on_hand_boxes=excluded.on_hand_boxes,
    on_hand_pallets=excluded.on_hand_pallets,
    availability=excluded.availability,
    eta_date=excluded.eta_date,
    batch_id=excluded.batch_id,
    updated_at=excluded.updated_at;

  get diagnostics v_count = row_count;

  insert into public.inventory_events(scope,variant_id,batch_id,event_type,after_data,actor_user_id)
  select
    'industry',
    cv.id,
    p_batch_id,
    'daily_inventory_publish',
    jsonb_build_object(
      'warehouse_code',coalesce(nullif(r.warehouse_code,''),'PRIMARY'),
      'on_hand_sqft',greatest(coalesce(r.on_hand_sqft,0),0),
      'on_hand_boxes',greatest(coalesce(r.on_hand_boxes,0),0),
      'on_hand_pallets',greatest(coalesce(r.on_hand_pallets,0),0),
      'availability',r.availability,
      'eta_date',r.eta_date
    ),
    p_user_id
  from public.industry_inventory_import_rows r
  join public.catalog_variants cv on upper(trim(cv.sku))=upper(trim(r.sku)) and cv.active=true
  where r.batch_id=p_batch_id and r.valid=true;

  update public.industry_inventory_batches
  set status='published',published_by=p_user_id,published_at=now()
  where id=p_batch_id;

  return v_count;
end;
$$;

revoke all on function public.publish_industry_inventory_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_industry_inventory_batch(uuid,uuid) to service_role;
