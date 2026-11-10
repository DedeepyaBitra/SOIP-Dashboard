# Migrations

Run in file-name order. All are repeatable (safe to run again).

| File | Purpose |
|---|---|
| `20261109000001_core_schema.sql` | Tables, keys, constraints, indexes |
| `20261109000002_views_and_helpers.sql` | As-of date helper, count helper, KPI and data-quality views |
| `20261109000003_import_function.sql` | `soip_import_all(payload, meta)`: atomic, idempotent import |
| `20261109000004_rls_and_grants.sql` | RLS read-only policies, grants, import function lock-down |

**Status: NOT executed against any Supabase project.** See `docs/SUPABASE_SETUP.md` for how to apply them.
