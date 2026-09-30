alter table public.documents
  add column if not exists client_document_id text;

create unique index if not exists idx_documents_partner_client_id
  on public.documents(partner_id, client_document_id)
  where partner_id is not null and client_document_id is not null;

create unique index if not exists idx_partners_owner_unique
  on public.partners(owner_id)
  where owner_id is not null;

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
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_pristine on auth.users;
create trigger on_auth_user_created_pristine
after insert on auth.users
for each row execute function public.handle_new_pristine_user();

insert into public.partners(owner_id, company_name, email)
select u.id, coalesce(u.raw_user_meta_data->>'company_name',''), u.email
from auth.users u
where not exists (
  select 1 from public.partners p where p.owner_id = u.id
);

drop policy if exists "partners_owner_insert" on public.partners;
create policy "partners_owner_insert" on public.partners
for insert to authenticated
with check (owner_id = auth.uid());
