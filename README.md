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
# Optional for server-only privileged access:
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

Public pages read directly from Supabase on the server. Configure the variables above before running the app.

## Admin Access

- `/admin` uses Supabase Auth email/password sign-in.
- Authorization is checked server-side against `ADMIN_EMAILS`.
- Logged-in users not in `ADMIN_EMAILS` see `Not authorized`.
- Admin editor supports loading a date, creating drafts, editing 5 stories, saving drafts, publishing, and unpublishing.

## Supabase Setup

Run the SQL in [supabase/setup.sql](./supabase/setup.sql) inside the Supabase SQL Editor.  
It creates:

- `daily_briefs`
- `brief_stories`
- indexes for latest published brief lookups and ordered story retrieval
- `updated_at` triggers
- a seed row for one published brief with 5 stories

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
