-- Week 4 (Mobile Push Preferences)
-- Run in Supabase SQL editor.

create table if not exists public.user_push_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text null,
  notifications_enabled boolean not null default true,
  notify_time_local time not null default '08:00'::time,
  timezone text not null default 'UTC',
  last_sent_for_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_push_prefs_notify_time_idx
  on public.user_push_prefs (notifications_enabled, notify_time_local);

create index if not exists user_push_prefs_last_sent_idx
  on public.user_push_prefs (last_sent_for_date);

drop trigger if exists set_user_push_prefs_updated_at on public.user_push_prefs;
create trigger set_user_push_prefs_updated_at
before update on public.user_push_prefs
for each row
execute function public.set_updated_at();

alter table public.user_push_prefs enable row level security;

drop policy if exists "user_push_prefs_select_own" on public.user_push_prefs;
create policy "user_push_prefs_select_own"
on public.user_push_prefs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_push_prefs_insert_own" on public.user_push_prefs;
create policy "user_push_prefs_insert_own"
on public.user_push_prefs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_push_prefs_update_own" on public.user_push_prefs;
create policy "user_push_prefs_update_own"
on public.user_push_prefs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_push_prefs_delete_own" on public.user_push_prefs;
create policy "user_push_prefs_delete_own"
on public.user_push_prefs
for delete
to authenticated
using (auth.uid() = user_id);
