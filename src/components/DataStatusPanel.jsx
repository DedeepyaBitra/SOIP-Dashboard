import { isSupabaseConfigured } from '../lib/supabaseClient.js';
import { useDataStatus } from '../hooks/useDataStatus.js';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '-');

function Notice({ tone, title, children }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}

/** Data-availability foundation (Milestone 3). Not a dashboard: shows connection, record counts, refresh and DQ status. */
export default function DataStatusPanel() {
  const { data, error, loading, reload } = useDataStatus();

  if (!isSupabaseConfigured) {
    return (
      <Notice tone="warn" title="Supabase is not configured">
        Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
      </Notice>
    );
  }
  if (loading) return <Notice tone="info" title="Checking data availability..." />;
  if (error) {
    return (
      <div className="space-y-3">
        <Notice tone="error" title="Could not load data status">{error.message}</Notice>
        <button type="button" onClick={reload} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Retry</button>
      </div>
    );
  }

  const { availability, counts, latestRun, latestSuccess, quality } = data;
  const unexpected = quality.filter((q) => q.classification === 'unexpected').reduce((n, q) => n + q.finding_count, 0);
  const intentional = quality.filter((q) => q.classification === 'intentional').reduce((n, q) => n + q.finding_count, 0);
  const lastFailed = latestRun && latestRun.status === 'failed';

  return (
    <div className="space-y-4">
      {availability === 'empty' && (
        <Notice tone="warn" title="No data loaded yet">
          The tables are empty. Apply the migrations and run <code>npm run data:import</code> (see docs/SUPABASE_SETUP.md), then re-check.
        </Notice>
      )}
      {availability === 'partial' && <Notice tone="warn" title="Some tables are empty">Re-run the import to load all datasets.</Notice>}
      {availability === 'ready' && <Notice tone="ok" title="Synthetic data available">All tables contain records. This is static sample data, refreshed only by the import script.</Notice>}
      {lastFailed && <Notice tone="error" title="The most recent refresh failed">{latestRun.error_message} ({fmtTime(latestRun.started_at)})</Notice>}

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Last successful refresh</dt><dd className="font-medium">{fmtTime(latestSuccess?.finished_at)}</dd></div>
        <div><dt className="text-slate-500">Data-quality findings (latest success)</dt>
          <dd className="font-medium">{latestSuccess ? `${intentional} intentional, ${unexpected} unexpected` : '-'}</dd></div>
      </dl>

      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="py-1">Table</th><th className="py-1 text-right">Rows</th></tr></thead>
        <tbody>
          {Object.entries(counts).sort().map(([name, n]) => (
            <tr key={name} className="border-b border-slate-100"><td className="py-1">{name}</td><td className="py-1 text-right tabular-nums">{n}</td></tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={reload} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Re-check status</button>
    </div>
  );
}
