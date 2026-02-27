-- Enable UUID generation for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date unique not null,
  status text not null check (status in ('draft', 'published')),
  title text null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brief_stories (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.daily_briefs(id) on delete cascade,
  position int not null check (position between 1 and 5),
  headline text not null,
  summary text not null,
  why_it_matters text null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, position)
);

-- Useful for: latest published brief by brief_date
create index if not exists daily_briefs_published_brief_date_desc_idx
  on public.daily_briefs (brief_date desc)
  where status = 'published';

-- Useful for: stories for a brief ordered by position
create index if not exists brief_stories_brief_id_position_idx
  on public.brief_stories (brief_id, position);

-- Keep updated_at current on updates
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_briefs_set_updated_at on public.daily_briefs;
create trigger daily_briefs_set_updated_at
before update on public.daily_briefs
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists brief_stories_set_updated_at on public.brief_stories;
create trigger brief_stories_set_updated_at
before update on public.brief_stories
for each row
execute function public.set_updated_at_timestamp();

-- ---------------------------------------------------------------------
-- Seed example: one published brief with 5 stories
-- ---------------------------------------------------------------------

with upserted_brief as (
  insert into public.daily_briefs (brief_date, status, title, published_at)
  values (
    '2026-02-26',
    'published',
    'Daily Markets and Policy Snapshot',
    now()
  )
  on conflict (brief_date)
  do update set
    status = excluded.status,
    title = excluded.title,
    published_at = excluded.published_at,
    updated_at = now()
  returning id
),
cleared_stories as (
  delete from public.brief_stories
  where brief_id in (select id from upserted_brief)
)
insert into public.brief_stories (
  brief_id,
  position,
  headline,
  summary,
  why_it_matters,
  sources
)
select
  b.id,
  s.position,
  s.headline,
  s.summary,
  s.why_it_matters,
  s.sources::jsonb
from upserted_brief b
cross join (
  values
    (
      1,
      'Inflation Data Cooled Slightly',
      'Latest monthly inflation prints came in below consensus expectations.',
      'A softer print can affect rate expectations and equity sector leadership.',
      '[{"label":"BLS CPI Release","url":"https://www.bls.gov/cpi/"},{"label":"Fed Calendar","url":"https://www.federalreserve.gov/newsevents/calendar.htm"}]'
    ),
    (
      2,
      'Large-Cap Earnings Beat on Margins',
      'Several large-cap names reported stronger-than-expected operating margins.',
      'Margin resilience may support valuations despite slower top-line growth.',
      '[{"label":"Company IR","url":"https://investor.apple.com/"},{"label":"SEC Filings","url":"https://www.sec.gov/edgar/search/"}]'
    ),
    (
      3,
      'Energy Prices Traded in a Narrow Range',
      'Crude and natural gas volatility stayed lower than the prior week.',
      'Lower volatility can improve planning for transport and industrial sectors.',
      '[{"label":"EIA Dashboard","url":"https://www.eia.gov/"},{"label":"CME Energy","url":"https://www.cmegroup.com/markets/energy.html"}]'
    ),
    (
      4,
      'AI Infrastructure Spend Continued',
      'Cloud and semiconductor capex commentary remained elevated in updates.',
      'Persistent infrastructure spend can shape medium-term growth expectations.',
      '[{"label":"NVIDIA IR","url":"https://investor.nvidia.com/"},{"label":"Microsoft IR","url":"https://www.microsoft.com/en-us/investor"}]'
    ),
    (
      5,
      'Consumer Discounting Stayed Elevated',
      'Retail channels continued selective promotions ahead of seasonal resets.',
      'Promotional intensity affects gross margins and inventory turnover.',
      '[{"label":"US Census Retail","url":"https://www.census.gov/retail/"},{"label":"NRF Data","url":"https://nrf.com/research-and-data"}]'
    )
) as s(position, headline, summary, why_it_matters, sources);
