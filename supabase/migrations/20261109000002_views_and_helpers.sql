-- SOIP Milestone 3 - helper function and read-only views (repeatable: CREATE OR REPLACE).
-- Views apply the KPI rules in docs/KPI_DEFINITIONS.md. They are security_invoker so RLS of the caller applies.

-- Fixed as-of date of the synthetic dataset (see docs/ASSUMPTIONS.md). Single place to change it.
create or replace function public.soip_as_of_date()
returns date
language sql
immutable
as $$ select date '2026-10-31' $$;

-- Row counts of the eight data tables (used by the import reconciliation and the frontend).
create or replace view public.v_table_counts with (security_invoker = true) as
select 'crm_companies'::text as table_name, count(*)::integer as row_count from public.crm_companies
union all select 'crm_leads', count(*)::integer from public.crm_leads
union all select 'ops_clients', count(*)::integer from public.ops_clients
union all select 'ops_projects', count(*)::integer from public.ops_projects
union all select 'client_mapping', count(*)::integer from public.client_mapping
union all select 'sales_targets_forecasts', count(*)::integer from public.sales_targets_forecasts
union all select 'campaign_mapping', count(*)::integer from public.campaign_mapping
union all select 'account_segments', count(*)::integer from public.account_segments;

create or replace function public.soip_table_counts()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(table_name, row_count), '{}'::jsonb) from public.v_table_counts
$$;

-- ---------------------------------------------------------------- CRM
-- Duplicate leads are excluded (KPI rule 1).
create or replace view public.v_crm_leads_clean with (security_invoker = true) as
select l.*
from public.crm_leads l
where not l.is_duplicate;

create or replace view public.v_kpi_leads_by_dimension with (security_invoker = true) as
select
  date_trunc('month', created_date)::date as created_month,
  source, owner, region, pipeline_stage, status,
  count(*)::integer as lead_count,
  coalesce(sum(deal_value), 0)::numeric(14,2) as deal_value_sum,
  (count(*) filter (where deal_value is null))::integer as missing_deal_value_count,
  (count(*) filter (where status = 'Open'
     and (last_activity_date is null or last_activity_date < public.soip_as_of_date() - 30)))::integer as stale_open_count
from public.v_crm_leads_clean
group by 1, 2, 3, 4, 5, 6;

-- ---------------------------------------------------------------- Operations
create or replace view public.v_ops_projects_clean with (security_invoker = true) as
select
  p.*,
  (p.status in ('Not Started', 'In Progress', 'On Hold')) as is_open,
  (p.status in ('Not Started', 'In Progress', 'On Hold')
     and p.due_date is not null
     and p.due_date < public.soip_as_of_date()
     and not (p.dq_flags @> '["date_order"]'::jsonb)) as is_overdue,
  case when p.amount is not null and p.amount > 0 and not (p.dq_flags @> '["invalid_amount"]'::jsonb)
       then p.amount end as amount_valid,
  case
    when p.status = 'Completed' and p.completed_date is not null and p.due_date is not null
      then case when p.completed_date <= p.due_date then 'Met' else 'Breached' end
    when p.status = 'Cancelled' then 'N/A'
    when p.status in ('Not Started', 'In Progress', 'On Hold') and p.due_date is not null
         and not (p.dq_flags @> '["date_order"]'::jsonb)
      then case when p.due_date < public.soip_as_of_date() then 'Breached'
                when p.due_date - public.soip_as_of_date() <= 7 then 'At Risk'
                else 'On Track' end
    else p.sla_status
  end as sla_status_recomputed
from public.ops_projects p;

create or replace view public.v_kpi_projects_by_dimension with (security_invoker = true) as
select
  date_trunc('month', created_date)::date as created_month,
  client_id, status, service_type, assigned_team, sla_status_recomputed,
  count(*)::integer as project_count,
  (count(*) filter (where is_open))::integer as open_count,
  (count(*) filter (where is_overdue))::integer as overdue_count,
  (count(*) filter (where status = 'Completed'))::integer as completed_count,
  (count(*) filter (where status = 'Completed' and completed_date is not null and due_date is not null
                    and completed_date <= due_date))::integer as completed_on_time_count,
  (count(*) filter (where status = 'Completed' and completed_date is null))::integer as completed_missing_date_count,
  coalesce(sum(amount_valid), 0)::numeric(14,2) as amount_valid_sum,
  (count(*) filter (where amount_valid is null))::integer as invalid_or_missing_amount_count
from public.v_ops_projects_clean
group by 1, 2, 3, 4, 5, 6;

-- ---------------------------------------------------------------- Combined view (only through client_mapping)
-- Leads and projects are aggregated separately BEFORE joining, so neither side is multiplied (no double counting).
create or replace view public.v_sales_to_ops_by_client with (security_invoker = true) as
select
  m.canonical_client_id, m.crm_company_id, m.crm_company_name, m.ops_client_id, m.ops_client_name, m.match_status,
  s.account_segment,
  coalesce(l.lead_count, 0)::integer as lead_count,
  coalesce(l.won_value, 0)::numeric(14,2) as won_value,
  coalesce(p.project_count, 0)::integer as project_count,
  coalesce(p.project_amount, 0)::numeric(14,2) as project_amount_valid
from public.client_mapping m
left join public.account_segments s on s.canonical_client_id = m.canonical_client_id
left join (
  select company_id, count(*) as lead_count, sum(deal_value) filter (where status = 'Won') as won_value
  from public.v_crm_leads_clean where company_id is not null group by company_id
) l on l.company_id = m.crm_company_id
left join (
  select client_id, count(*) as project_count, sum(amount_valid) as project_amount
  from public.v_ops_projects_clean group by client_id
) p on p.client_id = m.ops_client_id;

-- Records that cannot be matched across systems, kept visible for data-quality reporting.
create or replace view public.v_unmatched_records with (security_invoker = true) as
select 'crm_company_without_ops_client'::text as unmatched_type, 'crm'::text as source_system,
       m.crm_company_id as record_id, m.crm_company_name as detail, 0::integer as related_record_count
from public.client_mapping m where m.match_status = 'crm_only'
union all
select 'ops_client_without_mapping', 'operations', c.ops_client_id, c.ops_client_name,
       (select count(*)::integer from public.ops_projects p where p.client_id = c.ops_client_id)
from public.ops_clients c
where not exists (select 1 from public.client_mapping m where m.ops_client_id = c.ops_client_id)
union all
select 'lead_without_crm_company', 'crm', l.lead_id, l.source_company_id, 1
from public.crm_leads l where l.company_id is null;

-- ---------------------------------------------------------------- Refresh and data quality
create or replace view public.v_latest_refresh with (security_invoker = true) as
select r.*
from public.data_refresh_runs r
where r.run_id = (select run_id from public.data_refresh_runs order by started_at desc limit 1);

create or replace view public.v_latest_success_refresh with (security_invoker = true) as
select r.*
from public.data_refresh_runs r
where r.run_id = (select run_id from public.data_refresh_runs where status = 'success' order by started_at desc limit 1);

-- Findings of the latest successful run, summarised by dataset/type/classification.
create or replace view public.v_data_quality_latest with (security_invoker = true) as
select q.dataset, q.type, q.classification, count(*)::integer as finding_count
from public.data_quality_results q
where q.run_id = (select run_id from public.data_refresh_runs where status = 'success' order by started_at desc limit 1)
group by q.dataset, q.type, q.classification;
