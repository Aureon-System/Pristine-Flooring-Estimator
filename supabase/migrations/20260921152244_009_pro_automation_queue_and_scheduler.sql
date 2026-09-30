create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  rule_key text not null,
  status text not null default 'pending'
    check (status in ('pending','review','processing','sent','failed','skipped')),
  due_at timestamptz not null default now(),
  recipient text,
  subject text,
  message text,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_id, document_id, rule_key)
);

create index if not exists idx_automation_queue_due
  on public.automation_queue(status, due_at);
create index if not exists idx_automation_queue_partner
  on public.automation_queue(partner_id, created_at desc);

alter table public.automation_queue enable row level security;

drop policy if exists "automation_queue_owner_read" on public.automation_queue;
create policy "automation_queue_owner_read" on public.automation_queue
for select to authenticated
using (
  exists(
    select 1 from public.partners p
    where p.id=partner_id and p.owner_id=(select auth.uid())
  )
);

create table if not exists public.platform_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_config enable row level security;
drop policy if exists "platform_config_no_direct_access" on public.platform_config;
create policy "platform_config_no_direct_access" on public.platform_config
for all to authenticated
using (false)
with check (false);

insert into public.platform_config(key,value)
values ('automation_runner_secret', encode(gen_random_bytes(32),'hex'))
on conflict (key) do nothing;

do $block$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='pristine-automation-hourly' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end
$block$;

select cron.schedule(
  'pristine-automation-hourly',
  '0 * * * *',
  $job$
    select net.http_post(
      url := 'https://lueomnmkbbrllxbnpxph.supabase.co/functions/v1/pristine-api?action=automation-run',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-automation-secret',(select value from public.platform_config where key='automation_runner_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);
