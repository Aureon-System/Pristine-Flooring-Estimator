alter table public.partner_profiles
  add column if not exists referred_by_partner_id uuid references public.partners(id) on delete set null,
  add column if not exists referred_by_code text;

alter table public.referral_events
  drop constraint if exists referral_events_event_type_check;

alter table public.referral_events
  add constraint referral_events_event_type_check check (
    event_type in (
      'profile_completed',
      'referral_link_opened',
      'partner_signup',
      'material_opportunity',
      'quote_requested',
      'customer_referred',
      'material_already_purchased',
      'sale_attributed'
    )
  );

create or replace function public.handle_new_pristine_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_partner_id uuid;
  ref_code text;
  referrer_partner_id uuid;
  ref_code_id uuid;
begin
  insert into public.partners(owner_id, company_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    new.email
  )
  on conflict (owner_id) do update
    set email = excluded.email,
        company_name = case
          when coalesce(public.partners.company_name,'')='' then excluded.company_name
          else public.partners.company_name
        end,
        updated_at = now()
  returning id into new_partner_id;

  ref_code := nullif(upper(trim(coalesce(new.raw_user_meta_data->>'referred_by_code',''))),'');
  if ref_code is not null then
    select rc.id, rc.partner_id
      into ref_code_id, referrer_partner_id
    from public.referral_codes rc
    where upper(rc.code)=ref_code and rc.active=true
    limit 1;

    if referrer_partner_id is not null and referrer_partner_id <> new_partner_id then
      update public.partner_profiles
      set referred_by_partner_id=referrer_partner_id,
          referred_by_code=ref_code,
          updated_at=now()
      where partner_id=new_partner_id;

      insert into public.referral_events(
        partner_id, referral_code_id, event_type, metadata
      )
      values (
        referrer_partner_id,
        ref_code_id,
        'partner_signup',
        jsonb_build_object(
          'referred_partner_id', new_partner_id,
          'referred_email', new.email
        )
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_pristine_user() from public, anon, authenticated;

create index if not exists idx_partner_profiles_referred_by on public.partner_profiles(referred_by_partner_id);
