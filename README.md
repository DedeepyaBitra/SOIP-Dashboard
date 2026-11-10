# SOIP — Sales & Operations Intelligence Platform

SOIP is a browser-based business intelligence prototype that brings sales, operations, client-mapping, and data-quality information into one dashboard. It was developed as a time-boxed assignment prototype using **synthetic data only**.

> **Prototype notice:** SOIP is not connected to Braahmam's live CRM, operations systems, Google Sheets, or other company data. It is not a production-ready application.

## Project links

- **GitHub repository:** https://github.com/DedeepyaBitra/SOIP-Dashboard
- **Live dashboard:** https://soip-dashboard.vercel.app/
- **Demo video:** https://drive.google.com/file/d/1aBFRiafLb6_cBcv_UuqoxwmjzkK7vurJ/view?usp=drivesdk

## What the prototype demonstrates

The dashboard contains five areas:

1. **Overview** — a cross-functional summary of sales and operations KPIs.
2. **Sales Intelligence** — lead trends and distributions, pipeline measures, and stale-lead follow-up information.
3. **Operations Intelligence** — project status, workload, overdue and at-risk project information.
4. **Client Intelligence** — comparison of CRM companies and operations clients using a canonical mapping table, with unmatched records kept visible.
5. **Data Health** — source-table counts, refresh information, and validation findings.

The prototype also includes an **AI Analyst**. The frontend sends aggregated synthetic metrics to a Supabase Edge Function, which calls the Gemini API and returns a structured analysis. The AI feature is advisory; its output should be checked against the visible dashboard evidence.

## Technology stack and rationale

| Technology | Role in SOIP | Rationale |
|---|---|---|
| React | Dashboard UI | Component-based structure for dashboard pages and reusable interface elements. |
| Vite | Frontend tooling and build | Provides the development server and production build for the React application. |
| Recharts | Charts and visualizations | Renders sales and operations charts within the dashboard. |
| Supabase PostgreSQL | Database | Stores normalized source data, mapping/reference data, views, and refresh/quality metadata. |
| Supabase JS client | Browser data access | Lets the frontend read dashboard data using public client credentials and database policies. |
| Node.js import script | Data validation and ingestion | Runs repeatable source-file validation, transformation, and import from a trusted local environment. |
| Supabase Edge Functions | Server-side AI endpoint | Keeps the Gemini API key on the server side rather than in the browser bundle. |
| Gemini API | AI-assisted analysis | Produces structured, advisory insights from aggregated synthetic metrics. |
| Vercel | Frontend hosting | Hosts the Vite production build. |

## Data and modelling

The project uses synthetic CSV/JSON source files under `data/synthetic/`. The source representations include CRM, operations, and spreadsheet-style reference data.

The import process validates and transforms source records before loading normalized data into Supabase PostgreSQL. Cross-system client matching uses a canonical mapping table; CRM company IDs and operations client IDs are treated as separate identifier namespaces. Unmatched records remain visible rather than being silently force-matched.

The synthetic data includes deliberately injected defects documented in the defect manifest. These findings demonstrate data-quality validation and reporting.

## Architecture at a glance

```text
Synthetic CSV / JSON files
          |
          v
Node.js validation + transformation + importer
          |
          v
Supabase PostgreSQL
  - normalized source tables
  - mapping/reference tables
  - KPI and reconciliation views
  - refresh and quality metadata
          |
          v
React + Vite dashboard on Vercel
  - Overview
  - Sales Intelligence
  - Operations Intelligence
  - Client Intelligence
  - Data Health

React AI Analyst
          |
          v
Supabase Edge Function
          |
          v
Gemini API
          |
          v
Structured advisory analysis in the dashboard
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detailed request flows and security boundaries.

## Local setup

### Prerequisites

- Node.js and npm
- Access to the SOIP Supabase project for the configured database
- Supabase CLI only if you need to apply migrations or deploy the Edge Function

### 1. Clone the repository

```bash
git clone https://github.com/DedeepyaBitra/SOIP-Dashboard.git
cd SOIP-Dashboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure browser environment variables

Create a local `.env` file using `.env.example` as the template:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Use the actual project URL and public anon/publishable key from Supabase project settings. Do not commit `.env`.

### 4. Run the dashboard locally

```bash
npm run dev
```

Vite prints the local development URL in the terminal.

### 5. Build the frontend

```bash
npm run build
```

The production build is generated in `dist/`.

## Synthetic data import

The source files are in `data/synthetic/`. The project provides validation/import scripts.

To validate without importing:

```bash
npm run data:import:dry
```

To run the import from a trusted local environment, configure these server-side variables locally:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then run:

```bash
npm run data:import
```

**Security:** `SUPABASE_SERVICE_ROLE_KEY` is privileged. Never expose it in frontend code, prefix it with `VITE_`, commit it to Git, or add it to Vercel as a browser-facing variable. Keep it only in a trusted local/server-side environment. The browser uses the public anon/publishable key and database policies.

## AI Analyst configuration

The AI Analyst is implemented as the Supabase Edge Function `ai-analyst` under `supabase/functions/ai-analyst/`.

Configure the Gemini API key as a Supabase Edge Function secret, not as a Vite frontend variable:

```bash
npx supabase secrets set GEMINI_API_KEY=your-gemini-api-key
```

The function supports `GEMINI_MODEL`; the documented default in the current implementation is `gemini-2.5-flash` when that variable is not configured.

Deploy the function with:

```bash
npx supabase functions deploy ai-analyst
```

AI availability depends on provider availability and quota. The dashboard should remain usable if an AI request fails.

## Deployment

The Vite frontend has been deployed to Vercel and is connected to the GitHub repository. Configure these browser variables in the Vercel project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The AI secret belongs in Supabase Edge Function secrets. Do not put `GEMINI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in the frontend environment.

After changing environment variables or frontend code, redeploy the Vercel project. Perform a hosted smoke test after deployment to verify page loading, database reads, filters, and the AI Analyst (subject to API quota).

## Documentation

The `docs/` folder contains the supporting project documentation:

- `ARCHITECTURE.md` — frontend, database, import, AI, and deployment architecture.
- `DATA_DICTIONARY.md` — source datasets, fields, keys, and relationships.
- `KPI_DEFINITIONS.md` — KPI formulas, denominators, and limitations.
- `DATA_QUALITY.md` — validation rules, intentional defects, and handling.
- `ASSUMPTIONS.md` — scope, date, currency, mapping, and known limitations.
- `DATABASE.md` — database tables, views, relationships, and security.
- `IMPORT_AND_REFRESH.md` — repeatable source-data import procedure.
- `SUPABASE_SETUP.md` — environment variables, migrations, Edge Function, and hosting setup.
- `TEST_REPORT.md` — recorded tests and remaining verification.
- `ROADMAP.md` — production-readiness work beyond the prototype.

## Known limitations and production considerations

- The prototype uses synthetic data only and has no live source-system integrations.
- The dataset is small and illustrative; rates and distributions should not be treated as real business performance.
- Some metrics are limited by available synthetic fields and documented cohort/date assumptions.
- The prototype does not implement production authentication, role-based access, tenant isolation, audit, retention, or full operational monitoring.
- AI analysis is advisory, provider-dependent, and subject to API quota and latency.
- Production use would require real integrations, stronger identity/matching rules, security and access controls, monitoring, testing, governance, and operational ownership.

See [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md) for details.
