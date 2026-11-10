# Data dictionary

All records are synthetic. Field names follow the assignment's sample data model and use `snake_case`. Dates are ISO `YYYY-MM-DD` unless stated. Currency is USD throughout.

## Source datasets

| Dataset | Represents | File | Records | Primary key |
|---|---|---|---:|---|
| CRM Leads | CRM | `crm/crm_leads.csv` | 60 | `lead_id` |
| CRM Companies | CRM | `crm/crm_companies.csv` | 15 | `company_id` |
| Operations Projects | Operations system | `operations/ops_projects.csv` | 40 | `project_id` |
| Sales Targets & Forecasts | Spreadsheet-style reference | `google-sheets/sales_targets_forecasts.csv` | 24 | `period_month` |
| Campaign Mapping | Spreadsheet-style reference | `google-sheets/campaign_mapping.csv` | 5 | `campaign_id` |
| Account Segments | Spreadsheet-style reference | `google-sheets/account_segments.csv` | 15 | `canonical_client_id` |
| Client Mapping | Mapping layer | `mappings/client_mapping.csv` | 15 | `canonical_client_id` |
| Defect manifest | Test metadata | `defect_manifest.json` | 32 defects | `defect_id` |

Total source data records: **174** (defect manifest is metadata, not a business dataset).

## `crm_leads`

| Field | Type | Meaning |
|---|---|---|
| `lead_id` | string | Lead/contact ID; primary key |
| `created_date` | date | Lead creation date |
| `source` | enum/string | Website, Referral, LinkedIn, Trade Show or Email Campaign |
| `owner` | string | Synthetic sales owner |
| `company_id` | string | Foreign key to `crm_companies.company_id`; may be missing for an orphan |
| `company` | string | Company name as recorded on the lead |
| `region` | enum/string | North America, Europe, APAC or Middle East |
| `pipeline_stage` | enum | New, Qualified, Proposal, Negotiation, Closed Won or Closed Lost |
| `deal_value` | number (USD) | Deal value; may be blank |
| `status` | enum | Open, Won or Lost; raw file includes a few variants |
| `last_activity_date` | date | Last logged activity; may be blank |

`company_id` supports a stable join; company-name text is retained for traceability.

## `crm_companies`

| Field | Type | Meaning |
|---|---|---|
| `company_id` | string | CRM company ID; primary key |
| `company_name` | string | Master company name |
| `industry` | string | Industry |
| `region` | enum/string | Company region |

## `ops_projects`

| Field | Type | Meaning |
|---|---|---|
| `project_id` | string | Project/order ID; primary key |
| `client_id` | string | Operations client ID (`OPS-CL-xxx`), not a CRM ID |
| `status` | enum | Not Started, In Progress, On Hold, Completed or Cancelled |
| `service_type` | enum | Implementation, Consulting, Support Retainer, Data Migration or Training |
| `created_date` | date | Project creation date |
| `due_date` | date | Contractual due date |
| `completed_date` | date | Completion date; blank unless completed |
| `amount` | number (USD) | Project amount |
| `assigned_team` | enum | Team Alpha, Bravo, Charlie or Delta |
| `sla_status` | enum | Met, Breached, At Risk, On Track or N/A |

## `client_mapping`

| Field | Type | Meaning |
|---|---|---|
| `canonical_client_id` | string | Canonical client key (`CL-001`..`CL-015`) |
| `crm_company_id` | string | CRM-side company key |
| `crm_company_name` | string | CRM company name for traceability |
| `ops_client_name` | string | Operations client name for traceability |
| `ops_client_id` | string | Operations-side key; blank where unmatched |
| `match_method` | enum | `normalized_name`, `manual_review` or `none` |
| `match_status` | enum | `matched` or `crm_only` |
| `notes` | string | Reviewer note |

## Spreadsheet-style reference data

- `sales_targets_forecasts.csv`: `period_month` (`YYYY-MM`, 2024-11 through 2026-10), `target_amount`, `forecast_amount`, `currency`. Values are monthly company totals.
- `campaign_mapping.csv`: `campaign_id`, `campaign_name`, `lead_source`, `channel`, `manual_category`.
- `account_segments.csv`: `canonical_client_id`, `account_segment` (Enterprise, Mid-Market, SMB), `manual_category` (Strategic, Growth, Maintain).

## Relationships

```text
crm_leads.company_id -> crm_companies.company_id
crm_companies.company_id -> client_mapping.crm_company_id
client_mapping.ops_client_id -> ops_projects.client_id
client_mapping.canonical_client_id -> account_segments.canonical_client_id
crm_leads.source -> campaign_mapping.lead_source
sales_targets_forecasts.period_month <- month bucket of lead created_date
```

CRM company IDs and Operations client IDs are different namespaces. Cross-system comparison is performed only through `client_mapping`.

## Database normalization note

The source files contain 174 business/reference records. The normalized database also creates 14 `ops_clients` rows derived from project and mapping IDs. This explains why the last recorded database import showed 188 rows across the eight source/business tables rather than 174.
