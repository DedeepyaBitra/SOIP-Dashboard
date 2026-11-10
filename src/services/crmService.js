import { db, unwrap, applyEq, applyDateRange } from './db.js';

/**
 * CRM leads. By default reads v_crm_leads_clean (duplicate leads excluded, per KPI_DEFINITIONS.md).
 * Pass includeDuplicates: true to read the raw table (for data-quality inspection).
 * filters: { source, owner, region, status, pipeline_stage, company_id, from, to } (from/to apply to created_date).
 */
export async function getLeads({ includeDuplicates = false, from, to, ...filters } = {}) {
  let q = db().from(includeDuplicates ? 'crm_leads' : 'v_crm_leads_clean').select('*').order('created_date', { ascending: true });
  q = applyEq(q, filters);
  q = applyDateRange(q, 'created_date', from, to);
  return unwrap(q);
}

export async function getCompanies() {
  return unwrap(db().from('crm_companies').select('*').order('company_id'));
}
