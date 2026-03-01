# Yesterday Briefs

Next.js App Router app for publishing and viewing daily briefs.

## Stack

- Next.js (App Router)
- TypeScript
- ESLint
- Supabase (`@supabase/supabase-js`)

## Product Direction (Admin Local + iPhone App Public)

- Admin workflow stays on your local machine (including Ollama).
- Public consumption happens in a React Native / Expo iPhone app.
- Supabase is the shared backend between local admin publishing and the public mobile app.
- Push notifications are sent to users at their chosen local time (for example 7:00 or 8:00), with the same daily brief message.

## Environment Variables

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CRON_SECRET=a_long_random_secret
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
```

Public pages and admin APIs use Supabase with RLS. Configure the variables above before running the app.
Do not expose service-role keys in browser code or Vercel public env vars.

## Ollama (Week 3 AI Drafting)

AI drafting uses **Ollama only** (no OpenAI API) and runs server-side in admin routes.

Local setup:

```bash
ollama serve
ollama pull qwen2.5:7b
```

Then set:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
```

In `/admin`, use **Ping Ollama** before AI generation to verify connectivity.
If Ollama is down or unreachable, the app returns:
`Ollama not reachable at <OLLAMA_BASE_URL>. Start Ollama and ensure model <OLLAMA_MODEL> is installed.`

Important deployment note:
- Vercel cannot reach `127.0.0.1` on your laptop.
- For deployed AI drafting, run Ollama on a reachable host (LAN/server/VPS) and set `OLLAMA_BASE_URL` to that reachable URL.
- Do not expose Ollama publicly without network protection (VPN, firewall allowlist, reverse proxy auth).

## Admin Access

- `/admin` uses Supabase Auth email/password sign-in.
- Authorization is checked server-side against `public.admins(user_id)`.
- Logged-in users not in `public.admins` see `Not authorized`.
- Admin editor supports loading a date, creating drafts, editing 5 stories, saving drafts, publishing, and unpublishing.
- Admin RSS ingestion supports `Ingest RSS for Yesterday` from enabled `feed_sources`.
- Admin clustering supports `Cluster Yesterday's Articles` with safe replace mode for that date.
- Admin ranking supports `Rank Clusters`, updates `story_clusters.score`, and snapshots top 15 in `cluster_candidates`.
- Admin candidates pool shows top 15 ranked clusters, supports drag-and-drop manual ordering, and persists order for `Generate Draft From Top 5`.
- Admin candidates pool supports viewing cluster members and assigning a cluster to Story #1..#5 in the brief editor.
- Admin draft generation supports one-click `Generate Draft From Top 5` using ranked candidates.
- Admin AI drafting supports:
  - `Generate AI Drafts` for the loaded brief
  - per-story `Regenerate`
  - confidence + flags display and publish warnings
  - one-click `Generate Full Draft` (ingest -> cluster -> rank -> draft -> AI)

## Supabase Setup

Run the SQL in [supabase/setup.sql](./supabase/setup.sql) inside the Supabase SQL Editor.  
It creates:

- `daily_briefs`
- `brief_stories`
- indexes for latest published brief lookups and ordered story retrieval
- `updated_at` triggers
- a seed row for one published brief with 5 stories

Then run [supabase/rls.sql](./supabase/rls.sql) to enable RLS policies and create the `admins` allowlist table.

For Week 2 candidate pipeline schema (ingestion + clustering), run:

- [supabase/week2_pipeline.sql](./supabase/week2_pipeline.sql)
- [supabase/week3_ai.sql](./supabase/week3_ai.sql)
- [supabase/week4_mobile_push.sql](./supabase/week4_mobile_push.sql)

Add feed source rows before running ingestion:

```sql
insert into public.feed_sources (name, url, is_enabled)
values
  ('BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', true),
  ('Reuters World', 'https://feeds.reuters.com/Reuters/worldNews', true);
```

After your first sign-in, add your account as admin:

```sql
select id, email from auth.users order by created_at desc;

insert into public.admins (user_id)
values ('YOUR_USER_UUID_HERE')
on conflict (user_id) do nothing;
```

## Vercel Deployment

1. Import this repository in Vercel.
2. Add environment variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
3. Run SQL in Supabase SQL editor:
   - [supabase/setup.sql](./supabase/setup.sql)
   - [supabase/rls.sql](./supabase/rls.sql)
4. Sign in once via `/admin`, then insert your `auth.users.id` into `public.admins`.
5. Deploy.

Health check endpoints after deploy:
- `/health` (human-readable page)
- `/api/health` (JSON status)

## Nightly Cron

- Endpoint: `GET /api/cron/nightly` (used by Vercel cron) and `POST /api/cron/nightly`
- Auth: `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`
- Default behavior: runs pipeline for yesterday (UTC):
  1. RSS ingest
  2. clustering
  3. ranking
  4. draft generation (does not publish)

Manual test example:

```bash
curl -X POST "https://YOUR_DOMAIN/api/cron/nightly" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Vercel cron schedule is configured in [vercel.json](./vercel.json) to call `/api/cron/nightly` daily at `09:00 UTC`.

## Expo Mobile App Roadmap (Phased)

### Phase 1: Mobile Foundation

Goal: create the Expo app and connect to Supabase for read-only published brief consumption.

Deliverables:
- New Expo app project (`apps/mobile` or separate repo).
- Supabase client setup in Expo.
- Screens:
  - Latest Brief
  - Archive (published dates)
  - Brief Detail (`YYYY-MM-DD`)
- App reads only published data via existing RLS.

Current status:
- Implemented in `apps/mobile` as an Expo TypeScript app.
- Navigation included:
  - bottom tabs (`Latest`, `Archive`, `Settings`)
  - stack detail route for `/brief/YYYY-MM-DD` style viewing
- Views included:
  - Latest published brief
  - Archive list of published briefs
  - Brief detail by selected date
- Source links are tappable in story cards.

Mobile env setup (`apps/mobile/.env.local`):

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_EAS_PROJECT_ID=your_eas_project_id_optional_but_recommended
```

Run mobile app:

```bash
cd apps/mobile
npm install
npm run start
```

### Phase 2: Auth + Notification Preferences

Goal: let users sign in and set their preferred notification time.

Deliverables:
- Email auth in app (Supabase Auth).
- Settings screen:
  - notifications on/off
  - preferred time (`HH:mm`)
  - timezone (IANA string from device, e.g. `America/New_York`)
- Persist preferences in Supabase.

Current status:
- Implemented in mobile `Settings` tab:
  - email/password sign in
  - account creation
  - sign out
  - notification preference editor and save flow
  - Expo push token registration and persistence to `user_push_prefs.expo_push_token`
- Requires running SQL migration:
  - [supabase/week4_mobile_push.sql](./supabase/week4_mobile_push.sql)

Suggested table:

```sql
create table if not exists public.user_push_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text,
  notifications_enabled boolean not null default true,
  notify_time_local time not null default '08:00',
  timezone text not null default 'UTC',
  last_sent_for_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS direction:
- User can `select/update` only their own row.
- Service role / trusted function can read rows to send pushes.

### Phase 3: Push Delivery Pipeline (Per-User Local Time)

Goal: send the same brief notification to each user at their chosen local time.

Deliverables:
- Supabase Edge Function (scheduled every 5-15 minutes):
  - loads latest published brief
  - finds users whose local time matches their `notify_time_local`
  - skips users already sent for that brief date (`last_sent_for_date`)
  - sends via Expo Push API
  - updates `last_sent_for_date`
- Handles timezone and DST via stored IANA timezone.

Current status:
- Implemented edge function:
  - [supabase/functions/send-daily-brief/index.ts](./supabase/functions/send-daily-brief/index.ts)
  - [supabase/functions/send-daily-brief/config.toml](./supabase/functions/send-daily-brief/config.toml) (`verify_jwt = false` for cron/header-auth access)
- Function behavior:
  - validates `CRON_SECRET` (`x-cron-secret` or bearer token)
  - loads latest published brief
  - matches due users by local timezone + preferred minute
  - sends via Expo Push API
  - updates `last_sent_for_date` to avoid duplicates
  - clears invalid tokens (`DeviceNotRegistered`)

Deploy function (Supabase CLI):

```bash
supabase functions deploy send-daily-brief
supabase secrets set CRON_SECRET=your_secret_value
```

Manual test:

```bash
curl -X GET "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-brief?dryRun=true" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Scheduling:
- In Supabase Dashboard, schedule the function every 5 minutes.
- Keep the same `CRON_SECRET` header in scheduled invocation.

Why this approach:
- Server-controlled timing and reliability.
- Works even when app is closed.
- Avoids per-device local scheduling drift.

### Phase 4: Publish-to-Push Integration

Goal: when you publish in admin, users still receive notification at their own scheduled time.

Deliverables:
- Keep publish action unchanged for content.
- Optional: record a lightweight `published_briefs_events` row for observability.
- Scheduler always targets the latest published brief for that date/window.

### Phase 5: Quality, Safety, and Analytics

Goal: production hardening.

Deliverables:
- Retry logic + dead-token cleanup (invalid Expo tokens).
- Basic metrics:
  - users matched
  - sent
  - failed
  - skipped (already sent / disabled)
- Audit logs for scheduled runs.
- App UX polish (loading, caching, offline fallback for last brief).

### Phase 6: App Store + Operations

Goal: ship and operate.

Deliverables:
- EAS build profiles for iOS.
- TestFlight rollout.
- Release checklist for content pipeline + push pipeline.
- On-call playbook for failed sends and token churn.

## Recommended Execution Order

1. Build Phase 1 and verify read-only mobile brief flow.
2. Build Phase 2 and persist user preferences + push token.
3. Build Phase 3 scheduler and validate timed delivery with test users in different timezones.
4. Add Phase 4 integration and Phase 5 observability.
5. Ship via Phase 6.

## Post-Deploy QA Checklist

1. Open `/admin` as an allowlisted admin user.
2. Load yesterday's date and click `Create draft for this date` if none exists.
3. Fill all 5 stories (headline, summary, optional why-it-matters, sources) and click `Save Draft`.
4. Confirm draft saves and remains editable in `/admin`.
5. Confirm draft is not visible on public `/brief` and `/archive`.
6. Click `Publish` in `/admin`.
7. Verify `/brief` shows the newly published brief immediately.
8. Verify `/archive` lists the newly published brief at the top.
9. Open `/brief/YYYY-MM-DD` and confirm the published story content is displayed.
10. Sign in with a non-admin account and confirm `/admin` shows `Not authorized` and cannot edit.
11. Open `/health` and ensure status is `OK`.
12. In `/admin`, click `Ping Ollama` and verify a successful response.
13. Click `Generate Full Draft` and confirm all 5 stories are AI-filled (headline, summary, why-it-matters, confidence, flags).

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
npm run smoke:week3
```
