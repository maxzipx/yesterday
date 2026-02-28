# Yesterday Briefs

Next.js App Router app for publishing and viewing daily briefs.

## Stack

- Next.js (App Router)
- TypeScript
- ESLint
- Supabase (`@supabase/supabase-js`)

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
- Admin ranking supports `Rank Clusters`, updates `story_clusters.score`, and snapshots top 30 in `cluster_candidates`.
- Admin candidates pool supports browsing top candidates, viewing cluster members, and assigning a cluster to Story #1..#5 in the brief editor.
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

- Endpoint: `POST /api/cron/nightly`
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
```
