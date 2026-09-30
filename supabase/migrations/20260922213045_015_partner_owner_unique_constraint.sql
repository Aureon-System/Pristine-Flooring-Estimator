drop index if exists public.idx_partners_owner_unique;
    alter table public.partners drop constraint if exists partners_owner_id_key;
    alter table public.partners add constraint partners_owner_id_key unique (owner_id);
