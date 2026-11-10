import { db, unwrap } from './db.js';

/** Canonical client mapping (CRM company <-> Operations client). */
export async function getClientMapping() {
  return unwrap(db().from('client_mapping').select('*').order('canonical_client_id'));
}

/** Records that cannot be matched across systems (kept for data-quality reporting, never hidden). */
export async function getUnmatchedRecords() {
  return unwrap(db().from('v_unmatched_records').select('*').order('unmatched_type').order('record_id'));
}
