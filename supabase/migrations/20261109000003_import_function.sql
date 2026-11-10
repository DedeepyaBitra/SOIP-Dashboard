-- SOIP Milestone 3 - atomic import function (repeatable: CREATE OR REPLACE).
-- Called by scripts/import-data.js (service-role key) or by supabase/seed/synthetic_seed.sql (SQL editor).
-- One transaction: any error rolls back ALL changes (including the run row). The caller then records a 'failed' run.
-- Idempotent: rows are upserted by primary key, so re-running never creates duplicates. Rows that are no longer
-- in the payload are deleted (the files are the source of truth for this synthetic prototype).
-- Payload keys (all JSON arrays): crm_companies, ops_clients, client_mapping, account_segments, crm_leads,
-- ops_projects, sales_targets_forecasts, campaign_mapping, data_quality_results.

create or replace function public.soip_import_all(p_payload jsonb, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_run_id uuid;
  v_before jsonb;
  v_after  jsonb;
  v_stats  jsonb := '{}'::jsonb;
  v_key    text;
  v_ins    integer;
  v_upd    integer;
  v_del    integer;
  v_total  integer;
  v_unexpected integer;
  v_all_keys  text[] := array['crm_companies', 'ops_clients', 'client_mapping', 'account_segments', 'crm_leads',
                              'ops_projects', 'sales_targets_forecasts', 'campaign_mapping', 'data_quality_results'];
  v_core_keys text[] := array['crm_companies', 'ops_clients', 'client_mapping', 'account_segments', 'crm_leads',
                              'ops_projects', 'sales_targets_forecasts', 'campaign_mapping'];
begin
  foreach v_key in array v_all_keys loop
    if jsonb_typeof(p_payload -> v_key) is distinct from 'array' then
      raise exception 'soip_import_all: payload key "%" is missing or not an array', v_key;
    end if;
  end loop;

  v_before := public.soip_table_counts();

  insert into public.data_refresh_runs (status, triggered_by, source_checksum, source_files, counts_before)
  values ('running', coalesce(p_meta ->> 'triggered_by', 'unknown'), p_meta ->> 'source_checksum',
          coalesce(p_meta -> 'source_files', '{}'::jsonb), v_before)
  returning run_id into v_run_id;

  -- 1. Remove rows missing from the payload, children first.
  delete from public.account_segments t where not exists (
    select 1 from jsonb_populate_recordset(null::public.account_segments, p_payload -> 'account_segments') r
    where r.canonical_client_id = t.canonical_client_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_account_segments', v_del);

  delete from public.ops_projects t where not exists (
    select 1 from jsonb_populate_recordset(null::public.ops_projects, p_payload -> 'ops_projects') r
    where r.project_id = t.project_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_ops_projects', v_del);

  delete from public.crm_leads t where not exists (
    select 1 from jsonb_populate_recordset(null::public.crm_leads, p_payload -> 'crm_leads') r
    where r.lead_id = t.lead_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_crm_leads', v_del);

  delete from public.client_mapping t where not exists (
    select 1 from jsonb_populate_recordset(null::public.client_mapping, p_payload -> 'client_mapping') r
    where r.canonical_client_id = t.canonical_client_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_client_mapping', v_del);

  delete from public.ops_clients t where not exists (
    select 1 from jsonb_populate_recordset(null::public.ops_clients, p_payload -> 'ops_clients') r
    where r.ops_client_id = t.ops_client_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_ops_clients', v_del);

  delete from public.crm_companies t where not exists (
    select 1 from jsonb_populate_recordset(null::public.crm_companies, p_payload -> 'crm_companies') r
    where r.company_id = t.company_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_crm_companies', v_del);

  delete from public.sales_targets_forecasts t where not exists (
    select 1 from jsonb_populate_recordset(null::public.sales_targets_forecasts, p_payload -> 'sales_targets_forecasts') r
    where r.period_month = t.period_month);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_sales_targets_forecasts', v_del);

  delete from public.campaign_mapping t where not exists (
    select 1 from jsonb_populate_recordset(null::public.campaign_mapping, p_payload -> 'campaign_mapping') r
    where r.campaign_id = t.campaign_id);
  get diagnostics v_del = row_count;
  v_stats := v_stats || jsonb_build_object('deleted_campaign_mapping', v_del);

  -- 2. Upsert, parents first. "inserted" counts new rows (xmax = 0), "updated" counts rows that already existed.
  with up as (
    insert into public.crm_companies as t (company_id, company_name, industry, region, updated_at)
    select r.company_id, r.company_name, r.industry, r.region, now()
    from jsonb_populate_recordset(null::public.crm_companies, p_payload -> 'crm_companies') r
    on conflict (company_id) do update set
      company_name = excluded.company_name, industry = excluded.industry, region = excluded.region, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('crm_companies', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.ops_clients as t (ops_client_id, ops_client_name, updated_at)
    select r.ops_client_id, r.ops_client_name, now()
    from jsonb_populate_recordset(null::public.ops_clients, p_payload -> 'ops_clients') r
    on conflict (ops_client_id) do update set
      ops_client_name = excluded.ops_client_name, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('ops_clients', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.client_mapping as t (canonical_client_id, crm_company_id, crm_company_name, ops_client_id,
                                            ops_client_name, match_method, match_status, notes, updated_at)
    select r.canonical_client_id, r.crm_company_id, r.crm_company_name, r.ops_client_id,
           r.ops_client_name, r.match_method, r.match_status, r.notes, now()
    from jsonb_populate_recordset(null::public.client_mapping, p_payload -> 'client_mapping') r
    on conflict (canonical_client_id) do update set
      crm_company_id = excluded.crm_company_id, crm_company_name = excluded.crm_company_name,
      ops_client_id = excluded.ops_client_id, ops_client_name = excluded.ops_client_name,
      match_method = excluded.match_method, match_status = excluded.match_status,
      notes = excluded.notes, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('client_mapping', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.account_segments as t (canonical_client_id, account_segment, manual_category, updated_at)
    select r.canonical_client_id, r.account_segment, r.manual_category, now()
    from jsonb_populate_recordset(null::public.account_segments, p_payload -> 'account_segments') r
    on conflict (canonical_client_id) do update set
      account_segment = excluded.account_segment, manual_category = excluded.manual_category, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('account_segments', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.crm_leads as t (lead_id, created_date, source, owner, company_id, source_company_id, company,
                                       region, pipeline_stage, deal_value, status, status_raw, last_activity_date,
                                       is_duplicate, duplicate_of, dq_flags, source_row, updated_at)
    select r.lead_id, r.created_date, r.source, r.owner, r.company_id, r.source_company_id, r.company,
           r.region, r.pipeline_stage, r.deal_value, r.status, r.status_raw, r.last_activity_date,
           coalesce(r.is_duplicate, false), r.duplicate_of, coalesce(r.dq_flags, '[]'::jsonb), r.source_row, now()
    from jsonb_populate_recordset(null::public.crm_leads, p_payload -> 'crm_leads') r
    on conflict (lead_id) do update set
      created_date = excluded.created_date, source = excluded.source, owner = excluded.owner,
      company_id = excluded.company_id, source_company_id = excluded.source_company_id, company = excluded.company,
      region = excluded.region, pipeline_stage = excluded.pipeline_stage, deal_value = excluded.deal_value,
      status = excluded.status, status_raw = excluded.status_raw, last_activity_date = excluded.last_activity_date,
      is_duplicate = excluded.is_duplicate, duplicate_of = excluded.duplicate_of, dq_flags = excluded.dq_flags,
      source_row = excluded.source_row, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('crm_leads', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.ops_projects as t (project_id, client_id, status, status_raw, service_type, created_date,
                                          due_date, completed_date, amount, assigned_team, sla_status, dq_flags,
                                          source_row, updated_at)
    select r.project_id, r.client_id, r.status, r.status_raw, r.service_type, r.created_date,
           r.due_date, r.completed_date, r.amount, r.assigned_team, r.sla_status,
           coalesce(r.dq_flags, '[]'::jsonb), r.source_row, now()
    from jsonb_populate_recordset(null::public.ops_projects, p_payload -> 'ops_projects') r
    on conflict (project_id) do update set
      client_id = excluded.client_id, status = excluded.status, status_raw = excluded.status_raw,
      service_type = excluded.service_type, created_date = excluded.created_date, due_date = excluded.due_date,
      completed_date = excluded.completed_date, amount = excluded.amount, assigned_team = excluded.assigned_team,
      sla_status = excluded.sla_status, dq_flags = excluded.dq_flags, source_row = excluded.source_row,
      updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('ops_projects', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.sales_targets_forecasts as t (period_month, target_amount, forecast_amount, currency, updated_at)
    select r.period_month, r.target_amount, r.forecast_amount, coalesce(r.currency, 'USD'), now()
    from jsonb_populate_recordset(null::public.sales_targets_forecasts, p_payload -> 'sales_targets_forecasts') r
    on conflict (period_month) do update set
      target_amount = excluded.target_amount, forecast_amount = excluded.forecast_amount,
      currency = excluded.currency, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('sales_targets_forecasts', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  with up as (
    insert into public.campaign_mapping as t (campaign_id, campaign_name, lead_source, channel, manual_category, updated_at)
    select r.campaign_id, r.campaign_name, r.lead_source, r.channel, r.manual_category, now()
    from jsonb_populate_recordset(null::public.campaign_mapping, p_payload -> 'campaign_mapping') r
    on conflict (campaign_id) do update set
      campaign_name = excluded.campaign_name, lead_source = excluded.lead_source, channel = excluded.channel,
      manual_category = excluded.manual_category, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_ins, v_upd from up;
  v_stats := v_stats || jsonb_build_object('campaign_mapping', jsonb_build_object('inserted', v_ins, 'updated', v_upd));

  -- 3. Reconcile: table counts must equal the payload sizes, otherwise roll everything back.
  v_after := public.soip_table_counts();
  foreach v_key in array v_core_keys loop
    if coalesce((v_after ->> v_key)::integer, -1) <> jsonb_array_length(p_payload -> v_key) then
      raise exception 'soip_import_all: reconciliation failed for %: table has %, payload has %',
        v_key, v_after ->> v_key, jsonb_array_length(p_payload -> v_key);
    end if;
  end loop;

  -- 4. Data-quality findings of this run (history is kept per run).
  insert into public.data_quality_results (run_id, dataset, record_id, field, type, detail, classification)
  select v_run_id, r.dataset, r.record_id, r.field, r.type, r.detail, r.classification
  from jsonb_to_recordset(p_payload -> 'data_quality_results')
       as r(dataset text, record_id text, field text, type text, detail text, classification text);

  select count(*)::integer, (count(*) filter (where classification = 'unexpected'))::integer
    into v_total, v_unexpected
  from public.data_quality_results where run_id = v_run_id;

  update public.data_refresh_runs
     set status = 'success', finished_at = clock_timestamp(), counts_after = v_after, row_stats = v_stats,
         dq_findings_total = v_total, dq_unexpected = v_unexpected
   where run_id = v_run_id;

  return jsonb_build_object('run_id', v_run_id, 'status', 'success', 'counts_before', v_before,
                            'counts_after', v_after, 'row_stats', v_stats,
                            'dq_findings_total', v_total, 'dq_unexpected', v_unexpected);
end;
$$;
