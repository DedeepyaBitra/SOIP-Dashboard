// Milestone 3 tests. Run: npm run test:import   (Node built-in test runner, no extra dependencies)
// NOTE: these tests cannot execute PostgreSQL or reach Supabase. The SQLite section is a PROXY check of the
// schema constraints against the real payload; the PL/pgSQL import function itself is NOT executed here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, buildPayload, getValidatorFindings, normalizeDate, normalizeAmount, ImportDataError } from './lib/transform.js';
import { runImport, ImportError } from './lib/importer.js';
import { setDbClient } from '../src/services/db.js';
import { getLeads } from '../src/services/crmService.js';
import { getProjects } from '../src/services/operationsService.js';
import { getClientMapping, getUnmatchedRecords } from '../src/services/mappingService.js';
import { getTargetsForecasts } from '../src/services/targetsService.js';
import { getCampaigns, getAccountSegments } from '../src/services/referenceService.js';
import { getLeadKpiRows, getProjectKpiRows, getSalesToOpsByClient } from '../src/services/kpiService.js';
import { getLatestQualitySummary, getFindings } from '../src/services/dataQualityService.js';
import { getTableCounts, getLatestRefresh, getRefreshHistory, getDataStatus } from '../src/services/refreshService.js';

const validator = getValidatorFindings();
const built = buildPayload({ findings: validator.findings });
const { payload, expected, meta } = built;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/synthetic/defect_manifest.json'), 'utf8')).defects;
const find = (list, key, id) => list.find((r) => r[key] === id);
const defectIds = (dataset, type) => manifest.filter((d) => d.dataset === dataset && d.type === type).map((d) => d.record_id);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ------------------------------------------------------------------ payload and normalization
test('payload record counts match the approved Milestone 2 datasets', () => {
  assert.deepEqual(expected, { crm_companies: 15, ops_clients: 14, client_mapping: 15, account_segments: 15, crm_leads: 60, ops_projects: 40, sales_targets_forecasts: 24, campaign_mapping: 5 });
  const base = 15 + 60 + 40 + 15 + 24 + 5 + 15;
  assert.equal(base, 174);
  assert.equal(payload.crm_companies.length + payload.crm_leads.length + payload.ops_projects.length + payload.client_mapping.length
    + payload.sales_targets_forecasts.length + payload.campaign_mapping.length + payload.account_segments.length, 174);
});

test('payload is deterministic (re-running builds the identical payload)', () => {
  const again = buildPayload({ findings: getValidatorFindings().findings });
  assert.equal(JSON.stringify(again.payload), JSON.stringify(payload));
  assert.equal(again.meta.source_checksum, meta.source_checksum);
});

test('primary keys are unique inside the payload (upsert cannot create duplicates)', () => {
  const keys = { crm_companies: 'company_id', ops_clients: 'ops_client_id', client_mapping: 'canonical_client_id', account_segments: 'canonical_client_id', crm_leads: 'lead_id', ops_projects: 'project_id', sales_targets_forecasts: 'period_month', campaign_mapping: 'campaign_id' };
  for (const [t, k] of Object.entries(keys)) assert.equal(new Set(payload[t].map((r) => r[k])).size, payload[t].length, t);
});

test('normalization: dates, statuses, amounts; raw values and source ids preserved', () => {
  assert.equal(normalizeDate('15-Mar-2025'), '2025-03-15');
  assert.equal(normalizeDate('2025-02-30'), null);
  assert.equal(normalizeDate(''), null);
  assert.equal(normalizeAmount(''), null);
  assert.equal(normalizeAmount('-500'), -500);
  for (const id of defectIds('crm_leads', 'non_iso_date')) {
    const l = find(payload.crm_leads, 'lead_id', id);
    assert.match(l.created_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(l.source_row.created_date, l.created_date, 'raw value kept in source_row');
  }
  for (const id of defectIds('crm_leads', 'status_variant')) {
    const l = find(payload.crm_leads, 'lead_id', id);
    assert.ok(['Open', 'Won', 'Lost'].includes(l.status));
    assert.notEqual(l.status_raw, l.status);
  }
  for (const id of defectIds('ops_projects', 'status_variant')) {
    const p = find(payload.ops_projects, 'project_id', id);
    assert.equal(p.status, 'Completed');
    assert.notEqual(p.status_raw, 'Completed');
  }
  assert.ok(payload.crm_leads.every((l) => /^L-\d{4}$/.test(l.lead_id)));
  assert.ok(payload.ops_projects.every((p) => /^P-\d+$/.test(p.project_id) && /^OPS-CL-\d+$/.test(p.client_id)));
});

test('problem records are preserved, not dropped or silently fixed', () => {
  const orphan = find(payload.crm_leads, 'lead_id', defectIds('crm_leads', 'orphan_company_id')[0]);
  assert.equal(orphan.company_id, null);
  assert.equal(orphan.source_company_id, 'CRM-C099');
  for (const id of defectIds('crm_leads', 'missing_required')) assert.ok(find(payload.crm_leads, 'lead_id', id));
  const neg = find(payload.ops_projects, 'project_id', defectIds('ops_projects', 'invalid_amount')[0]);
  assert.ok(neg.amount < 0);
  assert.ok(neg.dq_flags.includes('invalid_amount'));
  for (const id of manifest.filter((d) => d.dataset === 'ops_projects' && d.field === 'completed_date' && d.type === 'missing_required').map((d) => d.record_id)) {
    const p = find(payload.ops_projects, 'project_id', id);
    assert.equal(p.completed_date, null);
    assert.ok(p.dq_flags.includes('missing_required'));
  }
});

test('duplicate leads are flagged and linked to their original; none other', () => {
  const flagged = payload.crm_leads.filter((l) => l.is_duplicate).map((l) => l.lead_id).sort();
  assert.deepEqual(flagged, defectIds('crm_leads', 'duplicate_record').sort());
  const validatorDups = validator.findings.filter((f) => f.type === 'duplicate_record').map((f) => f.record_id).sort();
  assert.deepEqual(flagged, validatorDups, 'import duplicate detection agrees with the Milestone 2 validator');
  for (const l of payload.crm_leads.filter((x) => x.is_duplicate)) assert.ok(find(payload.crm_leads, 'lead_id', l.duplicate_of) && !find(payload.crm_leads, 'lead_id', l.duplicate_of).is_duplicate);
});

test('client mapping: 12 matched, 3 CRM-only, 2 unmapped Ops clients, IDs stay separate', () => {
  assert.equal(payload.client_mapping.filter((m) => m.match_status === 'matched').length, 12);
  assert.equal(payload.client_mapping.filter((m) => m.match_status === 'crm_only').length, 3);
  const mappedOps = payload.client_mapping.map((m) => m.ops_client_id).filter(Boolean);
  assert.equal(new Set(mappedOps).size, mappedOps.length, 'no Ops client mapped twice (double-counting guard)');
  const unmapped = payload.ops_clients.filter((c) => !mappedOps.includes(c.ops_client_id)).map((c) => c.ops_client_id);
  assert.deepEqual(unmapped, ['OPS-CL-113', 'OPS-CL-114']);
  assert.equal(payload.ops_projects.filter((p) => unmapped.includes(p.client_id)).length, defectIds('ops_projects', 'unmapped_ops_client').length);
  assert.ok(payload.client_mapping.every((m) => m.crm_company_id.startsWith('CRM-') && (!m.ops_client_id || m.ops_client_id.startsWith('OPS-'))));
});

test('referential integrity of the payload', () => {
  const companies = new Set(payload.crm_companies.map((c) => c.company_id));
  const opsClients = new Set(payload.ops_clients.map((c) => c.ops_client_id));
  const canon = new Set(payload.client_mapping.map((m) => m.canonical_client_id));
  assert.ok(payload.crm_leads.every((l) => l.company_id === null || companies.has(l.company_id)));
  assert.ok(payload.ops_projects.every((p) => opsClients.has(p.client_id)));
  assert.ok(payload.client_mapping.every((m) => companies.has(m.crm_company_id) && (!m.ops_client_id || opsClients.has(m.ops_client_id))));
  assert.ok(payload.account_segments.every((s) => canon.has(s.canonical_client_id)));
  const sources = new Set(payload.campaign_mapping.map((c) => c.lead_source));
  assert.ok(payload.crm_leads.every((l) => sources.has(l.source)));
});

test('data-quality reconciliation: 32 intentional findings, 0 unexpected, all in payload', () => {
  assert.equal(validator.summary.findings_unexpected, 0);
  assert.equal(validator.undetected.length, 0);
  assert.equal(payload.data_quality_results.length, validator.findings.length);
  assert.equal(payload.data_quality_results.filter((d) => d.classification === 'intentional').length, 32);
  assert.equal(payload.data_quality_results.filter((d) => d.classification === 'unexpected').length, 0);
  const keys = payload.data_quality_results.map((d) => [d.dataset, d.record_id, d.field, d.type].join('|'));
  assert.equal(new Set(keys).size, keys.length, 'fits the UNIQUE (run_id, dataset, record_id, field, type) constraint');
});

test('unknown status values fail loudly instead of being stored wrongly', async () => {
  const { normalizeAmount: _n } = await import('./lib/transform.js');
  assert.throws(() => buildPayload({ findings: [], dataDir: makeBadDataDir() }), ImportDataError);
});
function makeBadDataDir() {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'soip-bad-'));
  fs.cpSync(path.join(ROOT, 'data/synthetic'), tmp, { recursive: true });
  const p = path.join(tmp, 'crm/crm_leads.csv');
  fs.writeFileSync(p, read('data/synthetic/crm/crm_leads.csv').replace(',Open,', ',Pending,'));
  return tmp;
}

// ------------------------------------------------------------------ schema vs payload (static) and constraints (SQLite proxy)
const migration = read('supabase/migrations/20261109000001_core_schema.sql');
function tableBlocks(sql) {
  const out = {};
  for (const m of sql.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) out[m[1]] = m[2];
  return out;
}
const blocks = tableBlocks(migration);
const colsOf = (block) => block.split('\n').map((l) => /^ {2}([a-z_]+)\s+\S/.exec(l)).filter(Boolean).map((m) => m[1]).filter((c) => !['constraint', 'primary', 'unique', 'check', 'foreign'].includes(c));

test('every payload column exists in the SQL schema', () => {
  for (const t of Object.keys(expected)) {
    assert.ok(blocks[t], `table ${t} defined in migration`);
    const cols = new Set(colsOf(blocks[t]));
    for (const k of new Set(payload[t].flatMap((r) => Object.keys(r)))) assert.ok(cols.has(k), `${t}.${k} missing in schema`);
  }
});

function sqliteDdl(block) {
  return colsOf(block) && block.split('\n').filter((l) => l.trim() !== '').map((l) => l
    .replace(/public\./g, '').replace(/numeric\(14,2\)/g, 'numeric').replace(/timestamptz/g, 'text').replace(/jsonb/g, 'text')
    .replace(/default now\(\)/g, 'default CURRENT_TIMESTAMP').replace(/'\[\]'::text/g, "'[]'")
    .replace(/extract\(day from period_month\) = 1/g, "cast(strftime('%d', period_month) as integer) = 1")).join('\n');
}
function openSqlite() {
  const dbh = new DatabaseSync(':memory:');
  dbh.exec('PRAGMA foreign_keys = ON');
  for (const t of ['crm_companies', 'ops_clients', 'client_mapping', 'account_segments', 'crm_leads', 'ops_projects', 'sales_targets_forecasts', 'campaign_mapping'])
    dbh.exec(`create table ${t} (${sqliteDdl(blocks[t])})`);
  return dbh;
}
const PK = { crm_companies: 'company_id', ops_clients: 'ops_client_id', client_mapping: 'canonical_client_id', account_segments: 'canonical_client_id', crm_leads: 'lead_id', ops_projects: 'project_id', sales_targets_forecasts: 'period_month', campaign_mapping: 'campaign_id' };
const ORDER = ['crm_companies', 'ops_clients', 'client_mapping', 'account_segments', 'crm_leads', 'ops_projects', 'sales_targets_forecasts', 'campaign_mapping'];
const sqlVal = (v) => (v === null || v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' ? JSON.stringify(v) : v);
function upsertAll(dbh, pl) {
  const stats = {};
  for (const t of ORDER) {
    const cols = Object.keys(pl[t][0]);
    const sql = `insert into ${t} (${cols.join(',')}) values (${cols.map(() => '?').join(',')}) on conflict(${PK[t]}) do update set ${cols.filter((c) => c !== PK[t]).map((c) => `${c}=excluded.${c}`).join(',')}`;
    const st = dbh.prepare(sql); const exists = dbh.prepare(`select count(*) n from ${t} where ${PK[t]} = ?`);
    let ins = 0, upd = 0;
    for (const r of pl[t]) { exists.get(r[PK[t]]).n ? upd++ : ins++; st.run(...cols.map((c) => sqlVal(r[c]))); }
    stats[t] = { inserted: ins, updated: upd };
  }
  return stats;
}
const countAll = (dbh) => Object.fromEntries(ORDER.map((t) => [t, dbh.prepare(`select count(*) n from ${t}`).get().n]));

test('SQLite proxy: payload satisfies the schema constraints; repeated import creates no duplicates', () => {
  const dbh = openSqlite();
  const first = upsertAll(dbh, payload);
  assert.deepEqual(countAll(dbh), expected);
  assert.ok(Object.values(first).every((s) => s.updated === 0));
  const second = upsertAll(dbh, payload);
  assert.deepEqual(countAll(dbh), expected, 'counts unchanged after second import');
  assert.ok(Object.entries(second).every(([t, s]) => s.inserted === 0 && s.updated === expected[t]));
  assert.equal(dbh.prepare('select count(*) n from crm_leads where is_duplicate = 1').get().n, 2);
  assert.equal(dbh.prepare('select count(*) n from crm_leads where company_id is null').get().n, 1);
});

test('SQLite proxy: constraints actually reject bad data (negative tests)', () => {
  const dbh = openSqlite(); upsertAll(dbh, payload);
  assert.throws(() => dbh.exec("update crm_leads set status = 'WON ' where lead_id = 'L-0002'"), /CHECK/);
  assert.throws(() => dbh.exec("update ops_projects set client_id = 'OPS-CL-999' where project_id = 'P-2001'"), /FOREIGN KEY/);
  assert.throws(() => dbh.exec("update crm_leads set is_duplicate = 1 where lead_id = 'L-0002'"), /CHECK/);
  assert.throws(() => dbh.exec("update client_mapping set ops_client_id = 'OPS-CL-101' where canonical_client_id = 'CL-013'"), /UNIQUE|CHECK/);
  assert.throws(() => dbh.exec("insert into campaign_mapping (campaign_id, campaign_name, lead_source) values ('CMP-99','x','Website')"), /UNIQUE/);
});

// ------------------------------------------------------------------ importer orchestration (fake client)
function fakeImportClient({ rpcError = null, counts = expected, failInsert = false } = {}) {
  const log = { rpc: [], inserts: [] };
  return {
    log,
    rpc: async (name, args) => { log.rpc.push([name, args]); return rpcError ? { data: null, error: rpcError } : { data: { run_id: 'run-1', counts_before: {}, counts_after: counts, row_stats: {}, dq_findings_total: 32, dq_unexpected: 0 }, error: null }; },
    from: (table) => ({
      insert: async (row) => { log.inserts.push([table, row]); return { error: failInsert ? { message: 'insert denied' } : null }; },
      select: async () => ({ data: Object.entries(counts).map(([table_name, row_count]) => ({ table_name, row_count })), error: null }),
    }),
  };
}
test('importer: success path calls the atomic function once and reconciles counts', async () => {
  const c = fakeImportClient();
  const r = await runImport({ client: c, payload, meta, expected });
  assert.equal(r.status, 'success'); assert.equal(c.log.rpc.length, 1); assert.equal(c.log.rpc[0][0], 'soip_import_all'); assert.equal(c.log.inserts.length, 0);
});
test('importer: reports count mismatch', async () => {
  const r = await runImport({ client: fakeImportClient({ counts: { ...expected, crm_leads: 59 } }), payload, meta, expected });
  assert.equal(r.status, 'reconciliation_mismatch'); assert.deepEqual(r.mismatches, [{ table: 'crm_leads', expected: 60, actual: 59 }]);
});
test('importer: failure records a failed run and throws a clear error', async () => {
  const c = fakeImportClient({ rpcError: { code: 'PGRST202', message: 'Could not find the function public.soip_import_all' } });
  await assert.rejects(runImport({ client: c, payload, meta, expected }), (e) => e instanceof ImportError && /migrations/.test(e.hint));
  assert.equal(c.log.inserts.length, 1); assert.equal(c.log.inserts[0][1].status, 'failed');
});
test('importer: failure still throws if the failed-run insert is itself denied', async () => {
  await assert.rejects(runImport({ client: fakeImportClient({ rpcError: { message: 'boom' }, failInsert: true }), payload, meta, expected }), ImportError);
});

// ------------------------------------------------------------------ service layer (fake client)
function fakeQueryClient(tables = {}, error = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, ops: [] }; calls.push(call);
      const b = new Proxy({}, { get: (_, op) => op === 'then' ? (res, rej) => Promise.resolve({ data: error ? null : (tables[table] ?? []), error }).then(res, rej) : (...a) => { call.ops.push([op, ...a]); return b; } });
      return b;
    },
  };
}
test('services: queries target the right tables/views and apply filters', async () => {
  const c = fakeQueryClient({ v_crm_leads_clean: [{ lead_id: 'L-0001' }] }); setDbClient(c);
  assert.deepEqual(await getLeads({ source: 'Website', from: '2025-01-01', to: '2025-12-31' }), [{ lead_id: 'L-0001' }]);
  assert.equal(c.calls[0].table, 'v_crm_leads_clean');
  assert.deepEqual(c.calls[0].ops.filter((o) => o[0] === 'eq'), [['eq', 'source', 'Website']]);
  assert.ok(c.calls[0].ops.some((o) => o[0] === 'gte') && c.calls[0].ops.some((o) => o[0] === 'lte'));
  await getLeads({ includeDuplicates: true }); assert.equal(c.calls[1].table, 'crm_leads');
  await getProjects({ status: 'Completed' }); assert.equal(c.calls[2].table, 'v_ops_projects_clean');
  await getClientMapping(); await getUnmatchedRecords(); await getTargetsForecasts(); await getCampaigns(); await getAccountSegments();
  await getLeadKpiRows(); await getProjectKpiRows(); await getSalesToOpsByClient(); await getLatestQualitySummary(); await getFindings('r1', { classification: 'unexpected' });
  await getTableCounts(); await getLatestRefresh(); await getRefreshHistory(5);
  assert.deepEqual(c.calls.slice(3).map((x) => x.table), ['client_mapping', 'v_unmatched_records', 'sales_targets_forecasts', 'campaign_mapping', 'account_segments',
    'v_kpi_leads_by_dimension', 'v_kpi_projects_by_dimension', 'v_sales_to_ops_by_client', 'v_data_quality_latest', 'data_quality_results', 'v_table_counts', 'v_latest_refresh', 'data_refresh_runs']);
});
test('services: errors become readable ServiceErrors; empty and missing-schema cases handled', async () => {
  setDbClient(fakeQueryClient({}, { code: 'PGRST205', message: "Could not find the table 'public.v_crm_leads_clean' in the schema cache" }));
  await assert.rejects(getLeads(), (e) => e.code === 'schema_missing' && /migrations/.test(e.message));
  setDbClient(fakeQueryClient({ v_crm_leads_clean: [] })); assert.deepEqual(await getLeads(), []);
  setDbClient(null); await assert.rejects(getLeads(), (e) => e.code === 'not_configured');
  assert.equal((await getDataStatus()).availability, 'not_configured');
});
test('services: data availability states', async () => {
  const mk = (counts) => fakeQueryClient({ v_table_counts: Object.entries(counts).map(([table_name, row_count]) => ({ table_name, row_count })), v_latest_refresh: [], v_latest_success_refresh: [], v_data_quality_latest: [] });
  setDbClient(mk({ a: 0, b: 0 })); assert.equal((await getDataStatus()).availability, 'empty');
  setDbClient(mk({ a: 3, b: 0 })); assert.equal((await getDataStatus()).availability, 'partial');
  setDbClient(mk({ a: 3, b: 1 })); assert.equal((await getDataStatus()).availability, 'ready');
  setDbClient(null);
});

// ------------------------------------------------------------------ static SQL / security checks
const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
test('migrations: files in order, balanced parentheses/dollar quotes, no destructive statements', () => {
  assert.equal(migrationFiles.length, 4);
  for (const f of migrationFiles) {
    const sql = read(`supabase/migrations/${f}`);
    assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, `${f} dollar quotes`);
    const stripped = sql.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
    assert.equal((stripped.match(/\(/g) || []).length, (stripped.match(/\)/g) || []).length, `${f} parentheses`);
    assert.doesNotMatch(stripped, /\bdrop\s+(table|schema|view|column)\b/i, `${f} must not drop objects`);
    assert.doesNotMatch(stripped, /\btruncate\s+table\b/i);
  }
  const creates = [...read('supabase/migrations/20261109000001_core_schema.sql').matchAll(/create (?:table|index) (?!if not exists)/gi)];
  assert.equal(creates.length, 0, 'all creates are IF NOT EXISTS (repeatable)');
});
test('migrations: RLS enabled and writes locked for every table; import function not callable by anon', () => {
  const rls = read('supabase/migrations/20261109000004_rls_and_grants.sql');
  for (const t of Object.keys(blocks)) assert.ok(rls.includes(`'${t}'`), `${t} covered by RLS block`);
  assert.match(rls, /revoke all on function public\.soip_import_all\(jsonb, jsonb\) from public, anon, authenticated/);
  assert.match(rls, /grant execute on function public\.soip_import_all\(jsonb, jsonb\) to service_role/);
  assert.doesNotMatch(rls, /for (insert|update|delete|all)/i, 'no write policies');
  for (const v of read('supabase/migrations/20261109000002_views_and_helpers.sql').matchAll(/create or replace view public\.(\w+)/g)) assert.ok(rls.includes(v[1]), `grant for view ${v[1]}`);
});
test('security: no service-role key in frontend code, .env.example, or tracked files', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(ROOT, 'src'))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /SERVICE_ROLE|service_role/, f);
  assert.doesNotMatch(read('.env.example'), /VITE_\w*SERVICE/);
  assert.ok(!fs.existsSync(path.join(ROOT, '.env')), 'no .env file in the project');
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.doesNotMatch(read('supabase/seed/synthetic_seed.sql'), /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like keys in seed');
});
test('seed SQL embeds the same payload checksum as the current files', () => {
  const seed = read('supabase/seed/synthetic_seed.sql');
  assert.ok(seed.includes(meta.source_checksum), 'seed is up to date (run npm run data:emit-sql if this fails)');
});
