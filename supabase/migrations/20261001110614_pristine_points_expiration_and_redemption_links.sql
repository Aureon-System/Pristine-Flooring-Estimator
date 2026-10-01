alter table public.reward_points_ledger
  add column if not exists expires_at timestamptz;

alter table public.reward_redemptions
  add column if not exists reward_catalog_id uuid references public.distributor_reward_catalog(id) on delete set null;

create index if not exists reward_points_ledger_expires_idx
  on public.reward_points_ledger(partner_id,expires_at)
  where expires_at is not null;

create index if not exists reward_redemptions_catalog_idx
  on public.reward_redemptions(reward_catalog_id)
  where reward_catalog_id is not null;
