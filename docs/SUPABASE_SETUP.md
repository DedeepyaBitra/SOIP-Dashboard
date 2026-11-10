# Supabase setup and deployment

## Current prototype status

The project owner has created and configured a Supabase project, applied the SOIP migrations, imported the synthetic dataset and deployed the `ai-analyst` Edge Function. The dashboard has successfully read the imported data, and the Gemini-backed analysis has been tested. Verify the live project again before submission; this document does not include project URLs or secret values.

## 1. Browser environment

Create `.env` locally from `.env.example` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

These are the only Supabase values intended for the browser build. The anon key is public by design and must rely on correctly configured RLS policies.

## 2. Import-only environment

For the local import script, set these in the trusted local environment or `.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

The service-role key bypasses RLS. Never use a `VITE_` prefix, put it in frontend code, share it in screenshots, or commit it to Git.

## 3. Database migrations and import

The migration files are in `supabase/migrations/`. They create the schema, views/helpers, import function and RLS/grants. Apply them in filename order if setting up a new project.

Then run:

```bash
npm install
npm run data:validate
npm run data:import:dry
npm run data:import
```

The project owner has already completed this sequence for the prototype database. Expected source counts are documented in `DATA_DICTIONARY.md`; normalized database counts include 14 derived operations clients and metadata tables.

## 4. AI Analyst Edge Function

The Edge Function is located at `supabase/functions/ai-analyst/index.ts` and is deployed as `ai-analyst`.

Set secrets in Supabase Edge Functions secrets (or with the Supabase CLI):

```bash
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
npx supabase secrets set GEMINI_MODEL=gemini-2.5-flash
```

Deploy or redeploy:

```bash
npx supabase functions deploy ai-analyst
```

Do not put `GEMINI_API_KEY` in Vite environment variables or frontend source. The model name is configurable; the function defaults to `gemini-2.5-flash` if `GEMINI_MODEL` is not set. Provider quotas can limit requests, so the AI feature should be treated as optional and user-triggered.

## 5. Vercel frontend deployment

Vercel deployment is the remaining hosting step at the time this guide was prepared.

1. Push the project to a private or public Git repository after checking `.gitignore` and scanning for secrets.
2. Import the repository into Vercel.
3. Use the Vite framework preset.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables for the required deployment environments.
7. Deploy and test the hosted URL.

Only browser-safe public values belong in Vercel's Vite build environment. Do not add `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to frontend environment variables.

## 6. Post-deployment checks

- Overview and all four other pages load.
- Supabase data status shows expected table counts and latest successful refresh.
- Filters update the relevant metrics/charts.
- Client matching and unmatched records remain visible.
- Tables paginate correctly where pagination is implemented.
- AI Analyst opens and returns an analysis when provider quota is available.
- If Gemini is unavailable, the rest of the dashboard continues to work and the error is understandable.
- Browser developer tools show no exposed service-role or Gemini key.

## 7. Prototype security limits

The current prototype is based on synthetic data and does not implement user authentication or per-user/tenant data isolation. Read policies allow access to the synthetic dataset to clients using the anon key. This is not suitable for confidential business records. Production use requires authentication, least-privilege RLS, authorization tests, audit logging, retention controls, backup/recovery and a formal security review.
