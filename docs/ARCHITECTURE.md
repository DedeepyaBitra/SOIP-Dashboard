# Architecture

## 1. System overview

SOIP is a browser-based React dashboard backed by Supabase PostgreSQL. Synthetic source files are normalized and imported through a Node.js script using a server-side service-role credential. The dashboard reads curated tables/views through the Supabase browser client. The AI Analyst is a separate server-side request path through a Supabase Edge Function.

```text
Synthetic CSV / JSON files
          |
          v
Node.js validation + transformation + importer
          |
          | service-role credential (local trusted environment)
          v
Supabase PostgreSQL
  - normalized source tables
  - client mapping/reference tables
  - KPI and reconciliation views
  - refresh and quality metadata
          |
          | anon key + RLS-protected SELECT
          v
React + Vite dashboard
  - Overview
  - Sales Intelligence
  - Operations Intelligence
  - Client Intelligence
  - Data Health

React AI Analyst drawer
          |
          | aggregated synthetic metrics only
          v
Supabase Edge Function: ai-analyst
          |
          | GEMINI_API_KEY stored as Supabase secret
          v
Gemini API
          |
          v
Validated analysis response -> AI Analyst drawer
```

## 2. Frontend

The frontend uses React 18 and Vite. Reusable UI components render KPI cards, filters, charts, tables, data-status information and the AI Analyst drawer. Recharts renders visualizations. Service modules isolate Supabase reads and KPI/data transformations from the page components.

The five pages have distinct responsibilities:

- **Overview:** cross-functional summary and a deterministic rule-based insight.
- **Sales Intelligence:** lead trends and distribution, pipeline measures and stale-lead follow-up.
- **Operations Intelligence:** project status, workload, overdue and at-risk projects.
- **Client Intelligence:** cross-system client comparison through the canonical mapping table and unmatched-record visibility.
- **Data Health:** table counts, latest refresh and validation findings.

Filters are intended to change the metrics/charts they control. The dashboard's Refresh Data action reloads data already stored in Supabase; it does not itself execute the privileged CSV import.

## 3. Data ingestion

The approved source files are stored under `data/synthetic/`. The import workflow:

1. Validates source records and compares findings with the defect manifest.
2. Transforms source rows into the normalized database payload.
3. Calls `soip_import_all` using the service-role credential.
4. Upserts by primary key inside a transaction and records refresh/quality metadata.
5. Re-reads table counts and compares them with expected counts.

The import is run from a trusted command line using `npm run data:import`. The browser does not receive the service-role key and cannot perform the privileged import. See `IMPORT_AND_REFRESH.md`.

## 4. Database and read path

Supabase PostgreSQL stores CRM, operations, mapping, reference and import metadata. Views expose clean lead/project data, KPI aggregations, sales-to-operations summaries, unmatched records and latest refresh/quality status.

The browser uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Row Level Security is enabled. The current prototype allows read access to synthetic records; it has no user login or per-user authorization and is not appropriate for confidential production data.

## 5. AI Analyst request flow

1. A user opens the AI Analyst drawer and explicitly requests an analysis.
2. The frontend prepares a compact summary of the currently selected page's aggregated synthetic metrics.
3. The frontend invokes the `ai-analyst` Supabase Edge Function.
4. The function validates the input and reads `GEMINI_API_KEY` and optional `GEMINI_MODEL` from Supabase secrets.
5. The function sends the metrics to the Gemini API and validates the structured response before returning it.
6. The drawer displays the headline, summary, findings, supporting evidence, recommended actions and caveats.

The current function defaults to `gemini-2.5-flash` when `GEMINI_MODEL` is not configured. The API key is not embedded in frontend code. AI calls are manual/user-triggered; quota exhaustion or provider failure can make the AI feature temporarily unavailable. The dashboard remains usable without a successful AI call.

## 6. Data boundaries and trust

- The dataset is synthetic and contains deliberately injected defects.
- CRM company IDs and operations client IDs are separate namespaces.
- Cross-system client analysis uses `client_mapping`; unmatched records remain visible.
- CRM deal value and operations project amount are separate measures and must not be added together.
- AI receives aggregated metrics, not individual lead or project records.
- AI findings are advisory and should cite visible evidence; possible explanations must not be presented as proven causes.

## 7. Deployment topology and current status

The frontend is deployed to Vercel from the GitHub repository. The Vercel project uses the following browser environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The `ai-analyst` Edge Function is deployed in Supabase. `GEMINI_API_KEY` and optional `GEMINI_MODEL` are stored as Supabase Edge Function secrets. The service-role credential is reserved for trusted server-side/local import operations and is not included in the browser build.

The GitHub repository contains the source code and project documentation. A screen-recorded dashboard demonstration has also been prepared for the assignment submission.

**Verification note:** Vercel deployment has completed. Before final submission, perform and record a hosted smoke test covering page loading, Supabase data reads, filters, and the AI Analyst. AI availability remains subject to provider quota and service availability.

## 8. Technology choices

- **React + Vite:** component-based dashboard development and a straightforward static production build.
- **Recharts:** dashboard chart rendering.
- **Supabase PostgreSQL:** relational storage for normalized source records, mappings, views, and refresh/quality metadata.
- **Supabase JS client:** browser access using the public anon key and database policies.
- **Node.js importer:** repeatable validation, transformation, and privileged data loading from a trusted environment.
- **Supabase Edge Functions:** server-side boundary for the AI request and provider secret.
- **Gemini API:** AI-assisted analysis of aggregated synthetic metrics.
- **Vercel:** hosting for the Vite frontend and integration with the GitHub repository.
