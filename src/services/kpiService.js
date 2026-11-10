import { db, unwrap, applyEq, applyDateRange } from './db.js';

// Aggregated rows (grouped by month and dimensions) so dashboards can filter and re-aggregate in the browser.
// Rules follow docs/KPI_DEFINITIONS.md; the view definitions live in supabase/migrations/..._views_and_helpers.sql.

/** One row per created_month/source/owner/region/pipeline_stage/status with lead_count, deal_value_sum, etc. */
export async function getLeadKpiRows({ from, to, ...filters } = {}) {
  let q = db().from('v_kpi_leads_by_dimension').select('*').order('created_month', { ascending: true });
  q = applyEq(q, filters);
  q = applyDateRange(q, 'created_month', from, to);
  return unwrap(q);
}

/** One row per created_month/client/status/service/team/SLA with counts (open, overdue, completed) and valid amounts. */
export async function getProjectKpiRows({ from, to, ...filters } = {}) {
  let q = db().from('v_kpi_projects_by_dimension').select('*').order('created_month', { ascending: true });
  q = applyEq(q, filters);
  q = applyDateRange(q, 'created_month', from, to);
  return unwrap(q);
}

/** Per canonical client: CRM leads/won value and Operations projects/amount, joined only through client_mapping. */
export async function getSalesToOpsByClient() {
  return unwrap(db().from('v_sales_to_ops_by_client').select('*').order('canonical_client_id'));
}
