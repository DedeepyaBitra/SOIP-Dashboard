# Test and verification report

## Status snapshot — 10 November 2026

This report separates recorded automated checks, project-owner verification and items still awaiting hosted deployment. It should be refreshed if additional tests are run.

## 1. Recorded automated data/import tests

The existing Milestone 3 test report records the following result for `npm run test:import`:

- 24 tests passed, 0 failed.
- Payload counts and deterministic generation were checked.
- Primary keys, normalization, preserved defect records and duplicate flags were checked.
- Client mapping cardinality and referential integrity were checked.
- The 32 documented quality findings were matched with zero unexpected/undetected findings.
- Schema/payload compatibility, importer orchestration and service-layer behavior were checked using test doubles/SQLite proxy checks.
- SQL static checks and secret-scanning checks were included.

These tests are offline checks. The SQLite proxy does not prove that PostgreSQL migrations or PL/pgSQL execute correctly on a live Supabase instance.

## 2. Data validation

The recorded `npm run data:validate` result is PASS:

| Check | Recorded result |
|---|---:|
| Source records | 174 |
| Intentional findings | 32 |
| Unexpected findings | 0 |
| Undetected documented defects | 0 |

The findings are intentionally injected synthetic data defects, not evidence that all source records are clean. See `DATA_QUALITY.md`.

## 3. Project-owner integration verification

The project owner has reported completing these steps:

- Applied the Supabase migrations to the project.
- Imported the synthetic data successfully.
- Confirmed normalized table counts in Supabase and the dashboard.
- Deployed the `ai-analyst` Supabase Edge Function.
- Corrected configuration/API-key issues and received a successful Gemini-generated analysis.
- Ran `npm run build` successfully after the latest UI changes.

These are owner-reported checks from the development workflow; this report does not contain fresh independent execution logs for them.

## 4. Remaining checks before submission

| Check | Status |
|---|---|
| Vercel production deployment | Pending |
| Hosted URL smoke test across all five pages | Pending |
| Hosted filter interaction test | Pending |
| Hosted AI Analyst request and graceful quota-error test | Pending |
| Final browser console/network review | Pending |
| Git repository secret scan and clean commit history review | Pending |
| Final 3–5 minute demo recording | Pending |

## 5. Recommended final commands

Run from the project root:

```bash
npm run data:validate
npm run test:import
npm run build
```

Then test the deployed site manually. Record the date, result and any failures in this document before final submission.

## 6. Known limitations

- The sample is small and synthetic; rates are illustrative.
- The database import test suite includes offline proxies/test doubles; those are not a replacement for hosted PostgreSQL verification.
- AI availability depends on the configured provider quota and network/service availability.
- There is no production authentication, tenant isolation, audit trail or operational monitoring.
