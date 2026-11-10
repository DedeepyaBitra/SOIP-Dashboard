# Import and refresh

## Source of truth

The approved files under `data/synthetic/` are the prototype's source of truth. The import process reads and normalizes these files; it does not modify them.

## Commands

| Command | Purpose | Requires Supabase? |
|---|---|---|
| `npm run data:generate` | Generate deterministic synthetic files if absent | No |
| `npm run data:validate` | Validate source files and expected defects | No |
| `npm run data:import:dry` | Build payload and validate without writing | No |
| `npm run data:emit-sql` | Generate SQL seed payload | No |
| `npm run data:import` | Import/refresh normalized tables | Yes |
| `npm run test:import` | Run offline importer tests | No |

The live import requires `SUPABASE_URL` (or its documented URL fallback) and `SUPABASE_SERVICE_ROLE_KEY` in a trusted local environment.

## Refresh procedure

1. Run the validator and collect data-quality findings.
2. Transform source records into a normalized JSON payload.
3. Call `soip_import_all(payload, meta)` using the service-role credential.
4. The database function performs the import transaction, updates the normalized tables, records quality findings and marks the refresh run.
5. The script reads `v_table_counts` and compares actual counts with the expected payload.

The upsert keys and constraints are intended to make repeated imports idempotent. The recorded offline tests cover duplicate prevention in a schema proxy; live behavior should be rechecked after schema changes.

## Dashboard refresh versus source import

The dashboard's **Refresh Data** action reloads data from Supabase into the browser. It does not execute the privileged CSV import. To refresh source data from the approved files, run `npm run data:import` from the trusted project environment.

## Normalization and preservation

- ISO dates are retained; supported non-ISO date variants are normalized.
- Status values are trimmed and normalized to the documented vocabulary.
- Blank amounts remain NULL; invalid amounts are flagged rather than silently treated as zero.
- Raw status/source-row values are retained in import metadata for traceability.
- Orphan company references remain visible as unmatched; they are not force-matched.
- Duplicate leads are flagged and retained in the source table; clean views exclude them from KPI aggregation.
- CRM and Operations identifiers remain separate and are joined only through the canonical client mapping.

## Failure behavior and monitoring

The import function is designed to execute as a transaction so an error rolls back the attempted load. The script records a failed run when it can reach the database and reports an actionable error. If the database is unreachable, the script can only report the error locally.

The Data Health page reads refresh and quality metadata. The browser cannot safely perform a service-role import; do not move the service-role key into frontend code.
