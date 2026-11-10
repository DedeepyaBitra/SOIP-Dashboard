# Database design

SOIP uses PostgreSQL on Supabase. The schema is defined in four repeatable migration files under `supabase/migrations/`.

## Tables

| Table | Primary key | Source/role | Last recorded rows |
|---|---|---|---:|
| `crm_companies` | `company_id` | CRM companies | 15 |
| `crm_leads` | `lead_id` | CRM leads | 60 |
| `ops_clients` | `ops_client_id` | Derived from project and mapping IDs | 14 |
| `ops_projects` | `project_id` | Operations projects | 40 |
| `client_mapping` | `canonical_client_id` | Cross-system identity map | 15 |
| `sales_targets_forecasts` | `period_month` | Monthly targets/forecasts | 24 |
| `campaign_mapping` | `campaign_id` | Lead source classification | 5 |
| `account_segments` | `canonical_client_id` | Account segmentation | 15 |
| `data_refresh_runs` | `run_id` | Import history | Per run |
| `data_quality_results` | `id` | Findings per refresh | Per run |

The eight source/business/reference tables total 188 normalized rows, including the 14 derived `ops_clients` records. Refresh and quality metadata tables are additional.

## Import metadata

The import adds technical fields such as `status_raw`, `source_row`, `dq_flags` and duplicate-tracking fields (`is_duplicate`, `duplicate_of`) where applicable. These support traceability without replacing the source business fields.

## Relationships

```text
crm_companies 1 --- * crm_leads
crm_companies 1 --- 1 client_mapping
ops_clients   1 --- 0..1 client_mapping
ops_clients   1 --- * ops_projects
client_mapping 1 --- 0..1 account_segments
crm_leads.source ~ campaign_mapping.lead_source
data_refresh_runs 1 --- * data_quality_results
```

CRM and Operations identifiers are separate namespaces. They meet only through `client_mapping`.

## Views and helpers

| View/helper | Purpose |
|---|---|
| `v_table_counts` | Counts for source/business tables |
| `v_crm_leads_clean` | Leads excluding flagged duplicates |
| `v_kpi_leads_by_dimension` | Lead metrics by month/source/owner/region/stage/status |
| `v_ops_projects_clean` | Project data with open/overdue/amount/SLA helper fields |
| `v_kpi_projects_by_dimension` | Project metrics by month/client/status/service/team/SLA |
| `v_sales_to_ops_by_client` | CRM and Operations measures per canonical client |
| `v_unmatched_records` | Orphan/unmatched lead, CRM company and Operations client records |
| `v_latest_refresh` and `v_latest_success_refresh` | Refresh status/time |
| `v_data_quality_latest` | Latest data-quality findings |
| `soip_as_of_date()` | Dataset as-of date used for stale/overdue rules |

## Design decisions

- Unmatched records are preserved and surfaced rather than silently discarded or force-matched.
- Bad source values are retained and flagged where possible.
- Duplicate leads remain in the raw normalized table but are excluded from clean views.
- The combined client view aggregates each system separately before joining.
- CRM `deal_value` and Operations `amount` are distinct measures and are never summed together.

## Security

RLS is enabled on the tables. The prototype read policy permits SELECT access to synthetic data through the anon/authenticated roles. Writes and the import RPC are restricted to the service role. This is prototype-only: no authentication or per-user/tenant access model is implemented. Verify policies against the live project after any migration changes. Never expose the service-role key.
