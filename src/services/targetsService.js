import { db, unwrap, applyDateRange } from './db.js';

/** Monthly sales targets and forecasts. from/to are YYYY-MM-DD (period_month is the first day of the month). */
export async function getTargetsForecasts({ from, to } = {}) {
  let q = db().from('sales_targets_forecasts').select('*').order('period_month', { ascending: true });
  q = applyDateRange(q, 'period_month', from, to);
  return unwrap(q);
}
