import { db, unwrap } from './db.js';

export async function getCampaigns() {
  return unwrap(db().from('campaign_mapping').select('*').order('campaign_id'));
}
export async function getAccountSegments() {
  return unwrap(db().from('account_segments').select('*').order('canonical_client_id'));
}
