-- ---------------------------------------------------------------------
-- Week 3: AI drafting columns on brief_stories
-- ---------------------------------------------------------------------

alter table public.brief_stories
  add column if not exists cluster_id uuid null,
  add column if not exists confidence numeric null,
  add column if not exists flags jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brief_stories_cluster_id_fkey'
  ) then
    alter table public.brief_stories
      add constraint brief_stories_cluster_id_fkey
      foreign key (cluster_id) references public.story_clusters(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brief_stories_confidence_range_check'
  ) then
    alter table public.brief_stories
      add constraint brief_stories_confidence_range_check
      check (confidence is null or (confidence >= 0 and confidence <= 1));
  end if;
end
$$;

create index if not exists brief_stories_cluster_id_idx
  on public.brief_stories (cluster_id);
