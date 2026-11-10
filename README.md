# SOIP — Sales & Operations Intelligence Platform

SOIP is a prototype business-intelligence dashboard prepared for the Braahmam International Limited assignment. It brings synthetic CRM, operations and reference-sheet data into one place so a reviewer can explore sales performance, operational delivery, client matching, data quality and AI-assisted observations.

> **Prototype status (10 November 2026):** The five-page React dashboard, Supabase-backed data layer and Gemini-powered AI Analyst have been implemented. Synthetic data has been imported into Supabase and the AI Analyst Edge Function has been deployed and tested by the project owner. A production build has been run by the project owner. Vercel deployment, final hosted smoke testing, GitHub publication and the final demo recording are still submission steps, not claimed as completed here.

## Dashboard pages

1. **Overview** — cross-functional KPI summary and rule-based business insight.
2. **Sales Intelligence** — lead trends and distributions, pipeline measures, stale leads and follow-up records.
3. **Operations Intelligence** — project volume, status, service/team workload, overdue and at-risk work.
4. **Client Intelligence** — matched sales-to-operations client view and unmatched records.
5. **Data Health** — source-table counts, refresh status and data-quality findings.

The top-right **AI Analyst** opens a drawer for an AI-assisted analysis of the selected page. The frontend sends aggregated synthetic metrics to a Supabase Edge Function; the function calls the configured Gemini API model. The API key is kept server-side in Supabase secrets. The feature is user-triggered, not an automatic background call. A rule-based insight remains available on the Overview page.

## Technology stack

- React 18, JavaScript and Vite
- Tailwind CSS and project CSS
- Recharts for charts
- Supabase PostgreSQL and `@supabase/supabase-js`
- Supabase Edge Functions (Deno/TypeScript) for the AI Analyst server-side request
- Gemini API for AI-assisted analysis
- Node.js scripts for deterministic synthetic-data generation, validation and import
- Vercel as the intended static frontend hosting platform

## Data scope

All records are synthetic. The prototype does not connect to a live CRM, operations platform or Google Sheets account. The source datasets contain 174 records across leads, companies, projects, mappings, targets, campaigns and account segments. The Supabase normalized schema contains 188 rows across its eight business/reference tables at the last recorded import, plus refresh and quality metadata tables.

The data includes deliberately injected quality issues so that validation, normalization, unmatched-record handling and dashboard transparency can be demonstrated. The latest documented validation result is 32 intentional findings and zero unexpected findings. See [DATA_QUALITY.md](docs/DATA_QUALITY.md).

All amounts are USD. The dataset as-of date used by stale/overdue logic is 31 October 2026. See [ASSUMPTIONS.md](docs/ASSUMPTIONS.md) and [KPI_DEFINITIONS.md](docs/KPI_DEFINITIONS.md).

## Run locally

Requirements: Node.js 18.18+ (20 LTS recommended) and npm 9+.

```bash
npm install
```

Create a local `.env` file based on `.env.example` and set the two browser-safe Supabase values:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Then start the development server:

```bash
npm run dev
```

Vite prints the local URL (commonly `http://localhost:5173`).

To create a production build:

```bash
npm run build
npm run preview
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in any `VITE_` variable or frontend file.

## Data scripts

```bash
npm run data:generate    # generate deterministic synthetic source files if absent
npm run data:validate    # validate source files and intentional defects
npm run data:import:dry  # transform and validate without writing to Supabase
npm run data:import      # import/refresh using server-side service-role credentials
npm run data:emit-sql    # generate SQL seed payload
npm run test:import      # run the offline importer tests
```

The import command requires `SUPABASE_URL` (or the documented URL fallback) and `SUPABASE_SERVICE_ROLE_KEY` in the trusted local environment. Never expose the service-role key in the browser or commit it. See [IMPORT_AND_REFRESH.md](docs/IMPORT_AND_REFRESH.md).

## AI Analyst configuration

The AI Analyst is implemented as a Supabase Edge Function named `ai-analyst`. The browser calls the function through the Supabase client; the Edge Function reads `GEMINI_API_KEY` and optionally `GEMINI_MODEL` from Supabase secrets. The configured model in the current implementation defaults to `gemini-2.5-flash`.

The model receives aggregated synthetic metrics rather than individual CRM or project records. The response includes a headline, summary, findings, evidence, recommendations and caveats. Availability depends on the Gemini API project's quota and service status. If the AI service is unavailable, the dashboard's non-AI functionality and Overview rule-based insight remain available.

See [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for deployment configuration and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the request flow.

## Repository layout

```text
.
├── data/synthetic/             # Synthetic CRM, operations and reference CSV/JSON
├── docs/                       # Architecture, data dictionary, KPI and setup documentation
├── reports/                    # Generated validation/import reports
├── scripts/                    # Data generation, validation, transformation and import
├── src/
│   ├── components/             # Dashboard UI components
│   ├── hooks/                  # Data-loading hooks
│   ├── lib/                    # Supabase browser client
│   ├── services/               # Data access and KPI services
│   └── styles/                 # Dashboard styles
├── supabase/
│   ├── functions/ai-analyst/    # Server-side AI Analyst Edge Function
│   ├── migrations/              # PostgreSQL schema, views, import and security
│   └── seed/                    # Synthetic seed SQL
└── package.json
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [KPI definitions](docs/KPI_DEFINITIONS.md)
- [Data quality](docs/DATA_QUALITY.md)
- [Assumptions and limitations](docs/ASSUMPTIONS.md)
- [Import and refresh](docs/IMPORT_AND_REFRESH.md)
- [Supabase setup and deployment](docs/SUPABASE_SETUP.md)
- [Test report](docs/TEST_REPORT.md)
- [Production roadmap](docs/ROADMAP.md)

## Security and limitations

- Synthetic data only; no real client or company records are included.
- The Supabase anon key is intended for browser use and is protected by the project's read policies. Because the dataset is synthetic and the prototype has no user authentication, the current read access is not suitable for confidential production data.
- Service-role and Gemini API keys are server-side secrets and must never be committed.
- No production CRM/operations/Google Sheets connectors, user roles, tenant isolation, audit trail, formal retention policy or production monitoring are implemented.
- KPI rates are illustrative because the sample is small. Some metrics use cohort dates or explicit assumptions because close-date/stage-history data is not present.
- AI output is advisory and must be checked against the displayed evidence; it is not a forecast or a substitute for business review.

## Assignment deliverables

The project submission should include the deployed dashboard URL, Git repository URL, a 3–5 minute screen-recorded demo link and this documentation. The hosted URL and demo link should be added to the final submission message once deployment and recording are complete.
