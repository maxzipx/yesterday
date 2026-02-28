-- ---------------------------------------------------------------------
-- Week 2: Candidate pipeline schema (ingestion + clustering)
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto;

-- 1) feed_sources
create table if not exists public.feed_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) articles
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid null references public.feed_sources(id) on delete set null,
  url text not null unique,
  title text not null,
  publisher text null,
  published_at timestamptz null,
  snippet text null,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists articles_published_at_desc_idx
  on public.articles (published_at desc);

create index if not exists articles_source_id_idx
  on public.articles (source_id);

-- 3) story_clusters
create table if not exists public.story_clusters (
  id uuid primary key default gen_random_uuid(),
  window_date date not null,
  label text null,
  category text null,
  score numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists story_clusters_window_date_score_desc_idx
  on public.story_clusters (window_date, score desc);

-- 4) cluster_articles
create table if not exists public.cluster_articles (
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  primary key (cluster_id, article_id)
);

create index if not exists cluster_articles_article_id_idx
  on public.cluster_articles (article_id);

-- 5) cluster_candidates (stable ranking snapshots)
create table if not exists public.cluster_candidates (
  id uuid primary key default gen_random_uuid(),
  window_date date not null,
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  rank int not null,
  created_at timestamptz not null default now()
);

create index if not exists cluster_candidates_window_date_rank_idx
  on public.cluster_candidates (window_date, rank);

-- ---------------------------------------------------------------------
-- RLS: admin-only for MVP (public/anon blocked)
-- ---------------------------------------------------------------------

-- Requires public.admins from supabase/rls.sql

alter table public.feed_sources enable row level security;
alter table public.articles enable row level security;
alter table public.story_clusters enable row level security;
alter table public.cluster_articles enable row level security;
alter table public.cluster_candidates enable row level security;

drop policy if exists feed_sources_admin_all on public.feed_sources;
create policy feed_sources_admin_all
on public.feed_sources
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists articles_admin_all on public.articles;
create policy articles_admin_all
on public.articles
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists story_clusters_admin_all on public.story_clusters;
create policy story_clusters_admin_all
on public.story_clusters
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists cluster_articles_admin_all on public.cluster_articles;
create policy cluster_articles_admin_all
on public.cluster_articles
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists cluster_candidates_admin_all on public.cluster_candidates;
create policy cluster_candidates_admin_all
on public.cluster_candidates
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
