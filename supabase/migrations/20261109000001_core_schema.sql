-- SOIP Milestone 3 - core schema (SYNTHETIC DATA ONLY)
-- Repeatable: every statement uses IF NOT EXISTS / OR REPLACE. Safe to run more than once.
-- Source systems keep separate ID namespaces:
--   CRM:        crm_companies.company_id   (CRM-Cxxx), crm_leads.lead_id (L-xxxx)
--   Operations: ops_clients.ops_client_id  (OPS-CL-xxx), ops_projects.project_id (P-xxxx)
--   Canonical:  client_mapping.canonical_client_id (CL-xxx) is the ONLY bridge between the two.
-- Problem records are preserved, never rejected: constraints only cover things the approved data satisfies
-- (enumerations, keys, uniqueness). Data-quality problems are recorded in dq_flags / data_quality_results.

-- ---------------------------------------------------------------- CRM
create table if not exists public.crm_companies (
  company_id   text primary key,
  company_name text not null,
  industry     text,
  region       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.crm_leads (
  lead_id            text primary key,
  created_date       date,
  source             text,
  owner              text,
  company_id         text references public.crm_companies (company_id) on update cascade on delete restrict,
  source_company_id  text,
  company            text,
  region             text,
  pipeline_stage     text not null,
  deal_value         numeric(14,2),
  status             text not null,
  status_raw         text,
  last_activity_date date,
  is_duplicate       boolean not null default false,
  duplicate_of       text,
  dq_flags           jsonb not null default '[]'::jsonb,
  source_row         jsonb not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint crm_leads_status_chk check (status in ('Open', 'Won', 'Lost')),
  constraint crm_leads_stage_chk check (pipeline_stage in ('New', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost')),
  constraint crm_leads_dup_chk check ((is_duplicate and duplicate_of is not null) or (not is_duplicate and duplicate_of is null))
);
comment on column public.crm_leads.company_id is 'FK to crm_companies; NULL when the source company_id has no CRM company (orphan, preserved).';
comment on column public.crm_leads.source_company_id is 'company_id exactly as exported by the CRM (kept even when orphaned).';
comment on column public.crm_leads.status_raw is 'status exactly as exported (before trim/case normalization).';
comment on column public.crm_leads.is_duplicate is 'True for later copies of a lead with the same company/created/source/stage/value; excluded from KPIs by views.';

-- ---------------------------------------------------------------- Operations
-- Derived from ops_projects.client_id and client_mapping.ops_client_id so Operations client IDs can be referenced.
create table if not exists public.ops_clients (
  ops_client_id   text primary key,
  ops_client_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.ops_projects (
  project_id     text primary key,
  client_id      text not null references public.ops_clients (ops_client_id) on update cascade on delete restrict,
  status         text not null,
  status_raw     text,
  service_type   text,
  created_date   date,
  due_date       date,
  completed_date date,
  amount         numeric(14,2),
  assigned_team  text,
  sla_status     text,
  dq_flags       jsonb not null default '[]'::jsonb,
  source_row     jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ops_projects_status_chk check (status in ('Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled')),
  constraint ops_projects_sla_chk check (sla_status is null or sla_status in ('Met', 'Breached', 'At Risk', 'On Track', 'N/A'))
);
comment on column public.ops_projects.amount is 'Stored as exported, including invalid (negative) values, which are flagged in dq_flags.';

-- ---------------------------------------------------------------- Client mapping
create table if not exists public.client_mapping (
  canonical_client_id text primary key,
  crm_company_id      text not null unique references public.crm_companies (company_id) on update cascade on delete restrict,
  crm_company_name    text,
  ops_client_id       text unique references public.ops_clients (ops_client_id) on update cascade on delete restrict,
  ops_client_name     text,
  match_method        text not null,
  match_status        text not null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint client_mapping_method_chk check (match_method in ('normalized_name', 'manual_review', 'none')),
  constraint client_mapping_status_chk check (match_status in ('matched', 'crm_only')),
  constraint client_mapping_consistency_chk check ((match_status = 'matched') = (ops_client_id is not null))
);

-- ---------------------------------------------------------------- Google Sheets-style reference data
create table if not exists public.sales_targets_forecasts (
  period_month    date primary key,
  target_amount   numeric(14,2) not null,
  forecast_amount numeric(14,2) not null,
  currency        text not null default 'USD',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sales_targets_month_chk check (extract(day from period_month) = 1),
  constraint sales_targets_amount_chk check (target_amount >= 0 and forecast_amount >= 0)
);

create table if not exists public.campaign_mapping (
  campaign_id     text primary key,
  campaign_name   text not null,
  lead_source     text not null unique,
  channel         text,
  manual_category text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.account_segments (
  canonical_client_id text primary key references public.client_mapping (canonical_client_id) on update cascade on delete restrict,
  account_segment     text not null,
  manual_category     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint account_segments_segment_chk check (account_segment in ('Enterprise', 'Mid-Market', 'SMB'))
);

-- ---------------------------------------------------------------- Refresh history and data quality
create table if not exists public.data_refresh_runs (
  run_id          uuid primary key default gen_random_uuid(),
  status          text not null,
  triggered_by    text,
  started_at      timestamptz not null default clock_timestamp(),
  finished_at     timestamptz,
  source_checksum text,
  source_files    jsonb not null default '{}'::jsonb,
  counts_before   jsonb,
  counts_after    jsonb,
  row_stats       jsonb,
  dq_findings_total integer,
  dq_unexpected     integer,
  error_message   text,
  constraint data_refresh_runs_status_chk check (status in ('running', 'success', 'failed'))
);

create table if not exists public.data_quality_results (
  id             bigint generated always as identity primary key,
  run_id         uuid not null references public.data_refresh_runs (run_id) on delete cascade,
  dataset        text not null,
  record_id      text not null,
  field          text not null,
  type           text not null,
  detail         text,
  classification text not null,
  created_at     timestamptz not null default now(),
  constraint data_quality_results_class_chk check (classification in ('intentional', 'unexpected')),
  constraint data_quality_results_unique unique (run_id, dataset, record_id, field, type)
);

-- ---------------------------------------------------------------- Indexes (primary keys and unique constraints already indexed)
create index if not exists crm_leads_created_date_idx   on public.crm_leads (created_date);
create index if not exists crm_leads_company_id_idx     on public.crm_leads (company_id);
create index if not exists crm_leads_source_idx         on public.crm_leads (source);
create index if not exists crm_leads_owner_idx          on public.crm_leads (owner);
create index if not exists crm_leads_region_idx         on public.crm_leads (region);
create index if not exists crm_leads_status_idx         on public.crm_leads (status);
create index if not exists crm_leads_not_duplicate_idx  on public.crm_leads (created_date) where not is_duplicate;
create index if not exists ops_projects_client_id_idx   on public.ops_projects (client_id);
create index if not exists ops_projects_status_idx      on public.ops_projects (status);
create index if not exists ops_projects_created_idx     on public.ops_projects (created_date);
create index if not exists ops_projects_due_idx         on public.ops_projects (due_date);
create index if not exists ops_projects_team_idx        on public.ops_projects (assigned_team);
create index if not exists ops_projects_service_idx     on public.ops_projects (service_type);
create index if not exists data_refresh_runs_started_idx on public.data_refresh_runs (started_at desc);
create index if not exists data_quality_results_run_idx  on public.data_quality_results (run_id);
create index if not exists data_quality_results_type_idx on public.data_quality_results (dataset, type);
