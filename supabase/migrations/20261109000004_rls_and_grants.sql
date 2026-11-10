-- SOIP Milestone 3 - Row Level Security and grants (repeatable).
-- PROTOTYPE POLICY: the data is synthetic, so anon/authenticated may READ everything.
-- Nobody but service_role (which bypasses RLS) can write. There is no per-user or per-role access control yet.

do $$
declare t text;
begin
  foreach t in array array['crm_companies', 'crm_leads', 'ops_clients', 'ops_projects', 'client_mapping',
                           'sales_targets_forecasts', 'campaign_mapping', 'account_segments',
                           'data_refresh_runs', 'data_quality_results']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'soip_prototype_read_' || t, t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   'soip_prototype_read_' || t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end
$$;

grant select on public.v_table_counts, public.v_crm_leads_clean, public.v_kpi_leads_by_dimension,
  public.v_ops_projects_clean, public.v_kpi_projects_by_dimension, public.v_sales_to_ops_by_client,
  public.v_unmatched_records, public.v_latest_refresh, public.v_latest_success_refresh,
  public.v_data_quality_latest to anon, authenticated;

-- The import function must never be callable from the browser.
revoke all on function public.soip_import_all(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.soip_import_all(jsonb, jsonb) to service_role;
