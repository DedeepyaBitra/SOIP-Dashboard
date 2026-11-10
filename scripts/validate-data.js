// SOIP data validation (Milestone 2). Read-only: never modifies or deletes data.
// Findings are classified as INTENTIONAL (listed in data/synthetic/defect_manifest.json)
// or UNEXPECTED. Exit code 1 if any unexpected finding exists or an intentional
// defect was not detected.
//   node scripts/validate-data.js            human-readable report
//   node scripts/validate-data.js --json     JSON report

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES } from './data-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'synthetic');

// ---------- minimal CSV parser (RFC 4180 quotes) ----------
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const load = (key) => parseCSV(fs.readFileSync(path.join(OUT, FILES[key]), 'utf8'));

// ---------- date / value helpers ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function normDate(s) {
  if (!s) return { value: null, iso: false, valid: true };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let iso = true;
  let y, mo, d;
  if (m) { [, y, mo, d] = m; }
  else if ((m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s))) {
    iso = false; d = m[1]; y = m[3]; mo = String(MON.indexOf(m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) + 1).padStart(2, '0');
  } else return { value: null, iso: false, valid: false };
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (isNaN(dt) || dt.toISOString().slice(0, 10) !== `${y}-${mo}-${d}`) return { value: null, iso, valid: false };
  return { value: `${y}-${mo}-${d}`, iso, valid: true };
}
const num = (s) => (s === '' || s === undefined ? null : Number.isFinite(Number(s)) ? Number(s) : NaN);
const LEAD_STATUS = ['Open', 'Won', 'Lost'];
const OPEN_STAGES = ['New', 'Qualified', 'Proposal', 'Negotiation'];
const OPS_STATUS = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const SLA = ['Met', 'Breached', 'At Risk', 'On Track', 'N/A'];

// ---------- run ----------
const findings = [];
const add = (dataset, record_id, field, type, detail) => findings.push({ dataset, record_id, field, type, detail });
const missing = Object.entries(FILES).filter(([, f]) => !fs.existsSync(path.join(OUT, f)));
if (missing.length) {
  console.error('Missing dataset files: ' + missing.map(([k, f]) => `${k} (${f})`).join(', '));
  process.exit(1);
}
const manifestFile = JSON.parse(fs.readFileSync(path.join(OUT, FILES.defect_manifest), 'utf8'));
const [WIN_START, WIN_END] = manifestFile.window;

const companies = load('crm_companies');
const leads = load('crm_leads');
const projects = load('ops_projects');
const targets = load('sales_targets_forecasts');
const campaigns = load('campaign_mapping');
const segments = load('account_segments');
const mapping = load('client_mapping');

const expected = { crm_leads: 60, crm_companies: 15, ops_projects: 40, client_mapping: 15, sales_targets_forecasts: 24, campaign_mapping: 5, account_segments: 15 };
const actual = { crm_leads: leads.length, crm_companies: companies.length, ops_projects: projects.length, client_mapping: mapping.length, sales_targets_forecasts: targets.length, campaign_mapping: campaigns.length, account_segments: segments.length };
for (const k of Object.keys(expected)) if (expected[k] !== actual[k]) add(k, '-', '-', 'count_mismatch', `expected ${expected[k]}, found ${actual[k]}`);

function checkUnique(dataset, rows, idField) {
  const seen = new Set();
  for (const r of rows) {
    if (!r[idField]) add(dataset, '(blank)', idField, 'missing_required', 'identifier blank');
    else if (seen.has(r[idField])) add(dataset, r[idField], idField, 'duplicate_id', 'identifier not unique');
    seen.add(r[idField]);
  }
}
checkUnique('crm_leads', leads, 'lead_id');
checkUnique('crm_companies', companies, 'company_id');
checkUnique('ops_projects', projects, 'project_id');
checkUnique('client_mapping', mapping, 'canonical_client_id');
checkUnique('campaign_mapping', campaigns, 'campaign_id');
checkUnique('account_segments', segments, 'canonical_client_id');

function checkDate(dataset, id, field, raw) {
  const d = normDate(raw);
  if (!d.valid) add(dataset, id, field, 'invalid_date', `unparseable "${raw}"`);
  else if (d.value && !d.iso) add(dataset, id, field, 'non_iso_date', `"${raw}" normalizes to ${d.value}`);
  else if (d.value && d.value > WIN_END && field !== 'due_date') add(dataset, id, field, 'invalid_date', `${d.value} is after data as-of date ${WIN_END}`);
  return d.value;
}

// ----- CRM leads -----
const companyById = new Map(companies.map((c) => [c.company_id, c]));
const leadKeys = new Map();
for (const l of leads) {
  const id = l.lead_id;
  for (const f of ['created_date', 'source', 'owner', 'company_id', 'company', 'region', 'pipeline_stage', 'deal_value', 'status', 'last_activity_date']) {
    if (l[f] === '') add('crm_leads', id, f, 'missing_required', `${f} blank`);
  }
  const created = checkDate('crm_leads', id, 'created_date', l.created_date);
  const last = checkDate('crm_leads', id, 'last_activity_date', l.last_activity_date);
  if (created && last && last < created) add('crm_leads', id, 'last_activity_date', 'date_order', `${last} < created ${created}`);
  if (created && (created < WIN_START || created > WIN_END)) add('crm_leads', id, 'created_date', 'invalid_date', 'outside 24-month window');
  const v = num(l.deal_value);
  if (Number.isNaN(v) || (v !== null && v <= 0)) add('crm_leads', id, 'deal_value', 'invalid_amount', `deal_value "${l.deal_value}"`);
  if (l.status !== '' && !LEAD_STATUS.includes(l.status)) {
    if (LEAD_STATUS.includes(l.status.trim().replace(/^./, (c) => c.toUpperCase()).replace(/(?<=.)./g, (c) => c.toLowerCase()))) add('crm_leads', id, 'status', 'status_variant', `"${l.status}" normalizes to ${l.status.trim()[0].toUpperCase() + l.status.trim().slice(1).toLowerCase()}`);
    else add('crm_leads', id, 'status', 'status_invalid', `"${l.status}"`);
  }
  const ns = l.status.trim().toLowerCase();
  const stageOpen = OPEN_STAGES.includes(l.pipeline_stage);
  if (l.pipeline_stage && !stageOpen && !['Closed Won', 'Closed Lost'].includes(l.pipeline_stage)) add('crm_leads', id, 'pipeline_stage', 'status_invalid', `unknown stage "${l.pipeline_stage}"`);
  if ((stageOpen && ns !== 'open') || (l.pipeline_stage === 'Closed Won' && ns !== 'won') || (l.pipeline_stage === 'Closed Lost' && ns !== 'lost')) add('crm_leads', id, 'status', 'status_stage_mismatch', `${l.pipeline_stage} vs ${l.status}`);
  const co = companyById.get(l.company_id);
  if (l.company_id && !co) add('crm_leads', id, 'company_id', 'orphan_company_id', `${l.company_id} not in crm_companies`);
  else if (co && co.company_name !== l.company) add('crm_leads', id, 'company', 'company_name_mismatch', `"${l.company}" vs "${co.company_name}"`);
  else if (co && co.region !== l.region) add('crm_leads', id, 'region', 'region_mismatch', `${l.region} vs ${co.region}`);
  const key = [l.company_id, created ?? l.created_date, l.source, l.deal_value, l.pipeline_stage].join('|');
  if (leadKeys.has(key)) add('crm_leads', id, 'lead_id', 'duplicate_record', `matches ${leadKeys.get(key)} on company/created/source/stage/value`);
  else leadKeys.set(key, id);
  if (!campaigns.some((c) => c.lead_source === l.source) && l.source) add('crm_leads', id, 'source', 'unmapped_source', `${l.source} has no campaign_mapping`);
}

// ----- client mapping -----
for (const m of mapping) {
  if (!companyById.has(m.crm_company_id)) add('client_mapping', m.canonical_client_id, 'crm_company_id', 'orphan_company_id', 'not in crm_companies');
  if (m.match_status === 'crm_only' && m.ops_client_id === '') add('client_mapping', m.crm_company_id, 'ops_client_id', 'crm_company_unmatched', 'no Operations client');
  if (m.match_status === 'matched' && m.ops_client_id === '') add('client_mapping', m.canonical_client_id, 'ops_client_id', 'missing_required', 'matched without ops_client_id');
}
const mappedCrm = new Set(mapping.map((m) => m.crm_company_id));
for (const c of companies) if (!mappedCrm.has(c.company_id)) add('crm_companies', c.company_id, 'company_id', 'unmapped_crm_company', 'no client_mapping row');
const opsIds = mapping.map((m) => m.ops_client_id).filter(Boolean);
if (new Set(opsIds).size !== opsIds.length) add('client_mapping', '-', 'ops_client_id', 'duplicate_id', 'one Ops client mapped to several canonical clients (double-counting risk)');
const mappedOps = new Set(opsIds);

// ----- ops projects -----
for (const p of projects) {
  const id = p.project_id;
  for (const f of ['client_id', 'status', 'service_type', 'created_date', 'due_date', 'amount', 'assigned_team', 'sla_status']) {
    if (p[f] === '') add('ops_projects', id, f, 'missing_required', `${f} blank`);
  }
  const created = checkDate('ops_projects', id, 'created_date', p.created_date);
  const due = checkDate('ops_projects', id, 'due_date', p.due_date);
  const done = checkDate('ops_projects', id, 'completed_date', p.completed_date);
  if (created && due && due < created) add('ops_projects', id, 'due_date', 'date_order', `${due} < created ${created}`);
  if (created && done && done < created) add('ops_projects', id, 'completed_date', 'date_order', `${done} < created ${created}`);
  const a = num(p.amount);
  if (Number.isNaN(a) || (a !== null && a <= 0)) add('ops_projects', id, 'amount', 'invalid_amount', `amount "${p.amount}"`);
  const st = p.status;
  const stNorm = OPS_STATUS.find((s) => s.toLowerCase() === st.trim().toLowerCase());
  if (!stNorm) add('ops_projects', id, 'status', 'status_invalid', `"${st}"`);
  else if (stNorm !== st) add('ops_projects', id, 'status', 'status_variant', `"${st}" normalizes to ${stNorm}`);
  if (!SLA.includes(p.sla_status) && p.sla_status) add('ops_projects', id, 'sla_status', 'status_invalid', `"${p.sla_status}"`);
  if (stNorm === 'Completed' && p.completed_date === '') add('ops_projects', id, 'completed_date', 'missing_required', 'Completed without completed_date');
  if (stNorm && stNorm !== 'Completed' && p.completed_date !== '') add('ops_projects', id, 'completed_date', 'completed_date_on_open', `status ${stNorm} has completed_date`);
  if (stNorm === 'Completed' && due && done) {
    const exp = done <= due ? 'Met' : 'Breached';
    if (p.sla_status !== exp) add('ops_projects', id, 'sla_status', 'sla_inconsistent', `completed ${done} vs due ${due} implies ${exp}, found ${p.sla_status}`);
  }
  if (p.client_id && !mappedOps.has(p.client_id)) add('ops_projects', id, 'client_id', 'unmapped_ops_client', `${p.client_id} not in client_mapping`);
}

// ----- reference sheets -----
for (const t of targets) {
  if (!/^\d{4}-\d{2}$/.test(t.period_month)) add('sales_targets_forecasts', t.period_month, 'period_month', 'invalid_date', 'expected YYYY-MM');
  if (!(num(t.target_amount) > 0) || !(num(t.forecast_amount) > 0)) add('sales_targets_forecasts', t.period_month, 'target_amount', 'invalid_amount', 'target/forecast must be > 0');
}
if (new Set(targets.map((t) => t.period_month)).size !== targets.length) add('sales_targets_forecasts', '-', 'period_month', 'duplicate_id', 'duplicate month');
const segOk = new Set(mapping.map((m) => m.canonical_client_id));
for (const s of segments) if (!segOk.has(s.canonical_client_id)) add('account_segments', s.canonical_client_id, 'canonical_client_id', 'orphan_company_id', 'not in client_mapping');

// ---------- coverage ----------
const allDates = [
  ...leads.map((l) => normDate(l.created_date).value),
  ...projects.map((p) => normDate(p.created_date).value),
].filter(Boolean).sort();
const monthsCovered = new Set(allDates.map((d) => d.slice(0, 7)));
const targetMonths = new Set(targets.map((t) => t.period_month));
const coverage = {
  first_date: allDates[0], last_date: allDates[allDates.length - 1],
  distinct_months_with_leads_or_projects: monthsCovered.size,
  months_in_targets_sheet: targetMonths.size,
};
if (monthsCovered.size < 23) add('coverage', '-', '-', 'coverage_short', `only ${monthsCovered.size} months covered`);

// ---------- classify against manifest ----------
const mkey = (d, r, t) => `${d}|${r}|${t}`;
const manifestKeys = new Map(manifestFile.defects.map((d) => [mkey(d.dataset, d.record_id, d.type), d]));
const seenKeys = new Set();
for (const f of findings) {
  const k = mkey(f.dataset, f.record_id, f.type);
  f.classification = manifestKeys.has(k) ? 'intentional' : 'UNEXPECTED';
  if (manifestKeys.has(k)) seenKeys.add(k);
}
const undetected = [...manifestKeys.keys()].filter((k) => !seenKeys.has(k));
const unexpected = findings.filter((f) => f.classification === 'UNEXPECTED');

// referential integrity summary
const leadCompanyOk = leads.filter((l) => companyById.has(l.company_id)).length;
const projMapped = projects.filter((p) => mappedOps.has(p.client_id)).length;
const summary = {
  counts: actual, expected_counts: expected, total_records: Object.values(actual).reduce((a, b) => a + b, 0),
  coverage,
  referential_integrity: {
    leads_with_valid_company_id: `${leadCompanyOk}/${leads.length}`,
    projects_with_mapped_client: `${projMapped}/${projects.length}`,
    crm_companies_matched_to_ops: mapping.filter((m) => m.match_status === 'matched').length,
    crm_companies_unmatched: mapping.filter((m) => m.match_status === 'crm_only').length,
    ops_clients_without_mapping: [...new Set(projects.map((p) => p.client_id))].filter((c) => !mappedOps.has(c)).length,
  },
  findings_total: findings.length,
  findings_intentional: findings.length - unexpected.length,
  findings_unexpected: unexpected.length,
  intentional_defects_in_manifest: manifestFile.defects.length,
  intentional_defects_not_detected: undetected.length,
};
const byType = {};
for (const f of findings) { byType[f.type] = byType[f.type] || { intentional: 0, unexpected: 0 }; byType[f.type][f.classification === 'intentional' ? 'intentional' : 'unexpected']++; }
summary.findings_by_type = byType;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, findings, undetected }, null, 2));
} else {
  console.log('SOIP data validation (read-only)\n');
  console.log('Record counts (actual / expected):');
  for (const k of Object.keys(expected)) console.log(`  ${k.padEnd(26)} ${String(actual[k]).padStart(3)} / ${expected[k]}`);
  console.log(`  ${'TOTAL'.padEnd(26)} ${String(summary.total_records).padStart(3)} / 174\n`);
  console.log('Coverage:', JSON.stringify(coverage));
  console.log('Referential integrity:', JSON.stringify(summary.referential_integrity), '\n');
  console.log('Findings by type (intentional / unexpected):');
  for (const [t, c] of Object.entries(byType).sort()) console.log(`  ${t.padEnd(26)} ${c.intentional} / ${c.unexpected}`);
  console.log(`\nTotal findings: ${findings.length} (intentional ${summary.findings_intentional}, unexpected ${unexpected.length})`);
  if (unexpected.length) { console.log('\nUNEXPECTED findings:'); for (const f of unexpected) console.log(`  ${f.dataset} ${f.record_id} ${f.field} ${f.type}: ${f.detail}`); }
  if (undetected.length) { console.log('\nIntentional defects NOT detected:'); for (const k of undetected) console.log('  ' + k); }
  console.log(unexpected.length || undetected.length ? '\nRESULT: FAIL' : '\nRESULT: PASS (all findings are documented intentional defects)');
}
process.exit(unexpected.length || undetected.length ? 1 : 0);
