-- ---------------------------------------------------------------------
-- RLS setup for briefs + admins allowlist
-- ---------------------------------------------------------------------

-- 1) Admin table (allowlist)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Authenticated users can see only their own admin membership row.
drop policy if exists admins_select_own on public.admins;
create policy admins_select_own
on public.admins
for select
to authenticated
using (auth.uid() = user_id);

-- Existing admins can manage admin memberships.
drop policy if exists admins_manage_by_admin on public.admins;
create policy admins_manage_by_admin
on public.admins
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- 2) Enable RLS on content tables
alter table public.daily_briefs enable row level security;
alter table public.brief_stories enable row level security;

-- 3) Public (anon) read access: published only
drop policy if exists daily_briefs_select_published_anon on public.daily_briefs;
create policy daily_briefs_select_published_anon
on public.daily_briefs
for select
to anon
using (status = 'published');

drop policy if exists brief_stories_select_published_anon on public.brief_stories;
create policy brief_stories_select_published_anon
on public.brief_stories
for select
to anon
using (
  exists (
    select 1
    from public.daily_briefs b
    where b.id = brief_stories.brief_id
      and b.status = 'published'
  )
);

-- 4) Admin full CRUD access (authenticated role only when in admins table)
drop policy if exists daily_briefs_admin_all on public.daily_briefs;
create policy daily_briefs_admin_all
on public.daily_briefs
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists brief_stories_admin_all on public.brief_stories;
create policy brief_stories_admin_all
on public.brief_stories
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Bootstrap instructions:
-- 1) Sign in once via your app.
-- 2) Run this query to find your user id (in SQL Editor):
--    select id, email from auth.users order by created_at desc;
-- 3) Add yourself as admin:
--    insert into public.admins (user_id) values ('YOUR_USER_UUID_HERE')
--    on conflict (user_id) do nothing;
-- ---------------------------------------------------------------------
