drop trigger if exists trg_pristine_partner_network_assets on public.partners;

create or replace function public.handle_new_pristine_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
        updated_at = now();

  return new;
end;
$$;

revoke execute on function public.handle_new_pristine_user() from public, anon, authenticated;
