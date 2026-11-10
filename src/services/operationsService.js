import { db, unwrap, applyEq, applyDateRange } from './db.js';

/**
 * Operations projects from v_ops_projects_clean (adds is_open, is_overdue, amount_valid, sla_status_recomputed).
 * filters: { status, service_type, assigned_team, client_id, from, to } (from/to apply to created_date).
 */
export async function getProjects({ from, to, ...filters } = {}) {
  let q = db().from('v_ops_projects_clean').select('*').order('created_date', { ascending: true });
  q = applyEq(q, filters);
  q = applyDateRange(q, 'created_date', from, to);
  return unwrap(q);
}
