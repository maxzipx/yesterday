-- Week 4 push hardening tables (observability + delivery attempts)
-- Run in Supabase SQL editor after week4_mobile_push.sql

create table if not exists public.push_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  dry_run boolean not null default false,
  brief_id uuid null references public.daily_briefs(id) on delete set null,
  brief_date date null,
  recipients_matched int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  invalid_tokens_removed int not null default 0,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  error_text text null,
  duration_ms int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.push_delivery_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  local_date date not null,
  local_time time not null,
  timezone text not null,
  status text not null check (status in ('sent', 'failed')),
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists push_delivery_runs_created_idx
  on public.push_delivery_runs (created_at desc);

create index if not exists push_delivery_runs_brief_date_idx
  on public.push_delivery_runs (brief_date, created_at desc);

create index if not exists push_delivery_attempts_run_idx
  on public.push_delivery_attempts (run_id, created_at desc);

create index if not exists push_delivery_attempts_user_date_idx
  on public.push_delivery_attempts (user_id, local_date desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_push_delivery_runs_updated_at on public.push_delivery_runs;
create trigger set_push_delivery_runs_updated_at
before update on public.push_delivery_runs
for each row
execute function public.set_updated_at_timestamp();

alter table public.push_delivery_runs enable row level security;
alter table public.push_delivery_attempts enable row level security;

-- Restrict access to service role only for now (MVP operations)
drop policy if exists "push_delivery_runs_service_role_all" on public.push_delivery_runs;
create policy "push_delivery_runs_service_role_all"
on public.push_delivery_runs
for all
to service_role
using (true)
with check (true);

drop policy if exists "push_delivery_attempts_service_role_all" on public.push_delivery_attempts;
create policy "push_delivery_attempts_service_role_all"
on public.push_delivery_attempts
for all
to service_role
using (true)
with check (true);
