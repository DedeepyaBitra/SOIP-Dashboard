// Shared plumbing for the service layer. Services never import React and never import the client directly:
// the client is injected once (see services/init.js), which also keeps services unit-testable.

export class ServiceError extends Error {
  constructor(code, message, cause) { super(message); this.name = 'ServiceError'; this.code = code; this.cause = cause; }
}

let client = null;
export function setDbClient(c) { client = c; }
export function hasDbClient() { return client !== null; }
export function db() {
  if (!client) throw new ServiceError('not_configured', 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.');
  return client;
}

/** Awaits a Supabase query and returns its rows, or throws a ServiceError with a readable message. */
export async function unwrap(query) {
  const { data, error } = await query;
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '');
    throw new ServiceError(
      missing ? 'schema_missing' : (error.code || 'query_failed'),
      missing ? 'Database tables or views not found. Apply the SQL migrations in supabase/migrations/ first.' : error.message,
      error,
    );
  }
  return data ?? [];
}

/** Applies { column: value } equality filters, ignoring empty values. */
export function applyEq(q, filters = {}) {
  for (const [col, v] of Object.entries(filters)) if (v !== undefined && v !== null && v !== '') q = q.eq(col, v);
  return q;
}
export function applyDateRange(q, column, from, to) {
  if (from) q = q.gte(column, from);
  if (to) q = q.lte(column, to);
  return q;
}
