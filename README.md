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
```

Public pages read directly from Supabase on the server. Configure the variables above before running the app.

## Admin Access

- `/admin` uses Supabase Auth email/password sign-in.
- Authorization is checked server-side against `public.admins(user_id)`.
- Logged-in users not in `public.admins` see `Not authorized`.
- Admin editor supports loading a date, creating drafts, editing 5 stories, saving drafts, publishing, and unpublishing.

## Supabase Setup

Run the SQL in [supabase/setup.sql](./supabase/setup.sql) inside the Supabase SQL Editor.  
It creates:

- `daily_briefs`
- `brief_stories`
- indexes for latest published brief lookups and ordered story retrieval
- `updated_at` triggers
- a seed row for one published brief with 5 stories

Then run [supabase/rls.sql](./supabase/rls.sql) to enable RLS policies and create the `admins` allowlist table.

After your first sign-in, add your account as admin:

```sql
select id, email from auth.users order by created_at desc;

insert into public.admins (user_id)
values ('YOUR_USER_UUID_HERE')
on conflict (user_id) do nothing;
```

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
