// Orchestrates one import against a Supabase client (service role). The client is injected so it can be tested.
// The real work (upsert + reconcile + run history) happens atomically inside the SQL function soip_import_all.

export class ImportError extends Error {
  constructor(message, { code, hint, cause } = {}) { super(message); this.name = 'ImportError'; this.code = code; this.hint = hint; this.cause = cause; }
}

export async function recordFailedRun(client, meta, message) {
  try {
    const { error } = await client.from('data_refresh_runs').insert({
      status: 'failed', triggered_by: meta.triggered_by ?? 'cli', source_checksum: meta.source_checksum ?? null,
      source_files: meta.source_files ?? {}, finished_at: new Date().toISOString(), error_message: String(message).slice(0, 2000),
    });
    return error ? { recorded: false, reason: error.message } : { recorded: true };
  } catch (e) { return { recorded: false, reason: e.message }; }
}

export async function runImport({ client, payload, meta, expected }) {
  const startedAt = new Date().toISOString();
  const { data, error } = await client.rpc('soip_import_all', { p_payload: payload, p_meta: meta });
  if (error) {
    const missingFn = error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');
    const hint = missingFn ? 'Apply the SQL migrations in supabase/migrations/ first (see docs/SUPABASE_SETUP.md).' : undefined;
    const failed = await recordFailedRun(client, meta, error.message);
    throw new ImportError(`Import failed and was rolled back: ${error.message}`, { code: error.code, hint, cause: { ...error, failed_run_recorded: failed.recorded } });
  }
  // Independent post-import check through the public view (not just trusting the function's own check).
  const { data: counts, error: cErr } = await client.from('v_table_counts').select('table_name,row_count');
  if (cErr) throw new ImportError(`Import committed but verification query failed: ${cErr.message}`, { code: cErr.code });
  const actual = Object.fromEntries(counts.map((c) => [c.table_name, c.row_count]));
  const mismatches = Object.entries(expected).filter(([k, v]) => actual[k] !== v).map(([table, exp]) => ({ table, expected: exp, actual: actual[table] ?? null }));
  return {
    status: mismatches.length ? 'reconciliation_mismatch' : 'success',
    started_at: startedAt, finished_at: new Date().toISOString(),
    run_id: data.run_id, counts_before: data.counts_before, counts_after: data.counts_after, row_stats: data.row_stats,
    dq_findings_total: data.dq_findings_total, dq_unexpected: data.dq_unexpected,
    expected, verified_counts: actual, mismatches,
  };
}
