import { db, unwrap, applyEq } from './db.js';

/** Findings summary of the latest successful refresh: rows of { dataset, type, classification, finding_count }. */
export async function getLatestQualitySummary() {
  return unwrap(db().from('v_data_quality_latest').select('*').order('dataset').order('type'));
}

/** Detailed findings for one refresh run. filters: { classification: 'intentional' | 'unexpected', type, dataset } */
export async function getFindings(runId, filters = {}) {
  let q = db().from('data_quality_results').select('*').eq('run_id', runId).order('dataset').order('record_id');
  q = applyEq(q, filters);
  return unwrap(q);
}
