import { db, unwrap, hasDbClient } from './db.js';
import { getLatestQualitySummary } from './dataQualityService.js';

export async function getTableCounts() {
  const rows = await unwrap(db().from('v_table_counts').select('table_name,row_count'));
  return Object.fromEntries(rows.map((r) => [r.table_name, r.row_count]));
}

export async function getLatestRefresh() {
  const rows = await unwrap(db().from('v_latest_refresh').select('*'));
  return rows[0] ?? null;
}

export async function getLatestSuccessfulRefresh() {
  const rows = await unwrap(db().from('v_latest_success_refresh').select('*'));
  return rows[0] ?? null;
}

export async function getRefreshHistory(limit = 20) {
  return unwrap(db().from('data_refresh_runs').select('*').order('started_at', { ascending: false }).limit(limit));
}

/**
 * Basic data-availability check used by the UI.
 * availability: 'not_configured' | 'empty' (no rows anywhere) | 'partial' (some tables empty) | 'ready'.
 */
export async function getDataStatus() {
  if (!hasDbClient()) return { availability: 'not_configured', counts: {}, latestRun: null, latestSuccess: null, quality: [] };
  const [counts, latestRun, latestSuccess, quality] = await Promise.all([
    getTableCounts(), getLatestRefresh(), getLatestSuccessfulRefresh(), getLatestQualitySummary(),
  ]);
  const values = Object.values(counts);
  const availability = values.length === 0 || values.every((n) => n === 0) ? 'empty' : values.some((n) => n === 0) ? 'partial' : 'ready';
  return { availability, counts, latestRun, latestSuccess, quality };
}
