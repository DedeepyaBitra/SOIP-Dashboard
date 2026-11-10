// SOIP synthetic data generator (Milestone 2).
// Deterministic (fixed seed). SYNTHETIC DATA ONLY - no real company data.
// Safe by default: if the dataset files already exist, nothing is overwritten.
// Use `node scripts/generate-data.js --force` to rebuild everything.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES } from './data-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'synthetic');


const WINDOW_START = '2024-11-01';
const WINDOW_END = '2026-10-31'; // 24 months; also the data "as of" date
const SEED = 20261109;

// ---------- helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const dayMs = 86400000;
const toD = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toD(s).getTime() + n * dayMs));
const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / dayMs);
const clampDate = (s, lo, hi) => (s < lo ? lo : s > hi ? hi : s);
const pad = (n, w) => String(n).padStart(w, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nonIso = (s) => `${s.slice(8, 10)}-${MON[+s.slice(5, 7) - 1]}-${s.slice(0, 4)}`;

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows, cols) {
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}
function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---------- guard: do not regenerate existing data ----------
const force = process.argv.includes('--force');
const existing = Object.values(FILES).filter((f) => fs.existsSync(path.join(OUT, f)));
if (existing.length && !force) {
  console.log(`Datasets already exist (${existing.length}/${Object.keys(FILES).length} files). Nothing regenerated.`);
  console.log('Use --force to rebuild all files.');
  process.exit(0);
}

// ---------- reference lists ----------
const COMPANIES = [
  ['Northwind Logistics', 'Logistics', 'North America'],
  ['Bluepeak Analytics', 'Technology', 'North America'],
  ['Cedar & Pine Retail', 'Retail', 'North America'],
  ['Orbit Health Systems', 'Healthcare', 'Europe'],
  ['Marlow Financial', 'Financial Services', 'Europe'],
  ['Quanta Manufacturing', 'Manufacturing', 'Europe'],
  ['Lumen Education', 'Education', 'APAC'],
  ['Harbor Foods', 'Food & Beverage', 'APAC'],
  ['Vertex Telecom', 'Telecom', 'APAC'],
  ['Sunrise Hospitality', 'Hospitality', 'Middle East'],
  ['Ironbridge Energy', 'Energy', 'Middle East'],
  ['Meridian Media', 'Media', 'North America'],
  ['Alpine Biotech', 'Healthcare', 'Europe'],
  ['Tidewater Shipping', 'Logistics', 'APAC'],
  ['Pioneer Realty', 'Real Estate', 'Middle East'],
];
const SOURCES = ['Website', 'Referral', 'LinkedIn', 'Trade Show', 'Email Campaign'];
const OWNERS = ['Asha Verma', 'Daniel Brooks', 'Mei Lin', 'Omar Haddad', 'Sofia Rossi'];
const OPEN_STAGES = ['New', 'Qualified', 'Proposal', 'Negotiation'];
const SERVICES = ['Implementation', 'Consulting', 'Support Retainer', 'Data Migration', 'Training'];
const TEAMS = ['Team Alpha', 'Team Bravo', 'Team Charlie', 'Team Delta'];

const manifest = [];
const used = new Set();
function defect(dataset, record_id, field, type, description) {
  manifest.push({ defect_id: `D${pad(manifest.length + 1, 2)}`, dataset, record_id, field, type, description, intentional: true });
}
function take(rows, idField, pred, skip = 0) {
  let n = 0;
  for (const r of rows) {
    if (used.has(r[idField]) || !pred(r)) continue;
    if (n === skip) { used.add(r[idField]); return r; }
    n++;
  }
  throw new Error('No row available for defect injection');
}

// ---------- CRM companies ----------
const companies = COMPANIES.map(([company_name, industry, region], i) => ({
  company_id: `CRM-C${pad(i + 1, 3)}`, company_name, industry, region,
}));

// ---------- CRM leads (58 distinct + 2 intentional duplicates = 60) ----------
const span = diffDays(WINDOW_START, WINDOW_END);
const leads = [];
for (let i = 0; i < 58; i++) {
  const co = companies[Math.min(companies.length - 1, Math.floor(Math.pow(rnd(), 1.3) * companies.length))];
  const created = clampDate(addDays(WINDOW_START, Math.floor((i * span) / 58) + int(0, 10)), WINDOW_START, WINDOW_END);
  const age = diffDays(created, WINDOW_END);
  let stage;
  if (age > 120 && rnd() < 0.72) stage = rnd() < 0.45 ? 'Closed Won' : 'Closed Lost';
  else if (age > 60 && rnd() < 0.25) stage = rnd() < 0.5 ? 'Closed Won' : 'Closed Lost';
  else stage = pick(OPEN_STAGES);
  const status = stage === 'Closed Won' ? 'Won' : stage === 'Closed Lost' ? 'Lost' : 'Open';
  const last = status === 'Open'
    ? addDays(created, int(0, Math.min(age, 75)))
    : clampDate(addDays(created, int(20, 120)), created, WINDOW_END);
  leads.push({
    lead_id: `L-${pad(i + 1, 4)}`,
    created_date: created,
    source: pick(SOURCES),
    owner: pick(OWNERS),
    company_id: co.company_id,
    company: co.company_name,
    region: co.region,
    pipeline_stage: stage,
    deal_value: Math.round(int(5000, 120000) / 100) * 100,
    status,
    last_activity_date: last,
  });
}
// intentional duplicates: new ID, otherwise identical business content
for (const [srcId, newId] of [['L-0021', 'L-0059'], ['L-0034', 'L-0060']]) {
  const src = leads.find((l) => l.lead_id === srcId);
  used.add(srcId); used.add(newId);
  leads.push({ ...src, lead_id: newId });
  defect('crm_leads', newId, 'lead_id', 'duplicate_record', `Same company, created_date, source, stage and deal_value as ${srcId}`);
}

// ---------- CRM defect injection ----------
for (const k of [0, 6, 12]) {
  const r = take(leads, 'lead_id', (x) => x.status !== 'Lost', k);
  r.deal_value = '';
  defect('crm_leads', r.lead_id, 'deal_value', 'missing_required', 'deal_value left blank');
}
for (const k of [2, 9]) {
  const r = take(leads, 'lead_id', (x) => x.status === 'Open', k);
  r.last_activity_date = '';
  defect('crm_leads', r.lead_id, 'last_activity_date', 'missing_required', 'last_activity_date left blank');
}
{
  const r = take(leads, 'lead_id', () => true, 24);
  r.owner = '';
  defect('crm_leads', r.lead_id, 'owner', 'missing_required', 'owner left blank');
}
{
  const r = take(leads, 'lead_id', (x) => x.status !== 'Open', 8);
  r.last_activity_date = addDays(r.created_date, -9);
  defect('crm_leads', r.lead_id, 'last_activity_date', 'date_order', 'last_activity_date earlier than created_date');
}
for (const k of [4, 15]) {
  const r = take(leads, 'lead_id', () => true, k);
  const iso = r.created_date;
  r.created_date = nonIso(iso);
  defect('crm_leads', r.lead_id, 'created_date', 'non_iso_date', `created_date stored as DD-Mon-YYYY (true value ${iso}); normalizable`);
}
{
  const r = take(leads, 'lead_id', (x) => x.status === 'Won', 1);
  r.status = 'won';
  defect('crm_leads', r.lead_id, 'status', 'status_variant', 'status written in lower case');
  const r2 = take(leads, 'lead_id', (x) => x.status === 'Open', 5);
  r2.status = 'OPEN ';
  defect('crm_leads', r2.lead_id, 'status', 'status_variant', 'status upper case with trailing space');
}
{
  const r = take(leads, 'lead_id', () => true, 20);
  r.company_id = 'CRM-C099';
  r.company = 'Zenith Partners (unlisted)';
  defect('crm_leads', r.lead_id, 'company_id', 'orphan_company_id', 'company_id not present in crm_companies');
}
for (const k of [3, 17]) {
  const r = take(leads, 'lead_id', () => true, k);
  r.company = r.company + ' Ltd';
  defect('crm_leads', r.lead_id, 'company', 'company_name_mismatch', 'Free-text company differs from crm_companies.company_name');
}

// ---------- Client mapping ----------
// 12 CRM companies matched to Operations clients, 3 CRM-only. Ops clients 113/114 have no mapping row.
const OPS_CLIENT_NAMES = [
  'Northwind Logistics Inc', 'Bluepeak Analytics LLC', 'Cedar and Pine Retail', 'Orbit Health Systems GmbH',
  'Marlow Financial Group', 'Quanta Manufacturing', 'Lumen Education Pte', 'Harbor Foods Co',
  'Vertex Telecom', 'Sunrise Hospitality LLC', 'Ironbridge Energy', 'Meridian Media Group',
];
const mapping = companies.map((c, i) => {
  const base = { canonical_client_id: `CL-${pad(i + 1, 3)}`, crm_company_id: c.company_id, crm_company_name: c.company_name };
  if (i < 12) {
    const method = [2, 6, 7, 11].includes(i) ? 'manual_review' : 'normalized_name';
    return { ...base, ops_client_id: `OPS-CL-${101 + i}`, ops_client_name: OPS_CLIENT_NAMES[i], match_method: method, match_status: 'matched',
      notes: method === 'manual_review' ? 'Name differs after normalization; confirmed by account manager (synthetic)' : '' };
  }
  return { ...base, ops_client_id: '', ops_client_name: '', match_method: 'none', match_status: 'crm_only', notes: 'No Operations client found' };
});
for (const m of mapping.filter((m) => m.match_status === 'crm_only')) {
  defect('client_mapping', m.crm_company_id, 'ops_client_id', 'crm_company_unmatched', 'CRM company has no Operations client (by design)');
}

// ---------- Operations projects ----------
const OPS_CLIENTS = Array.from({ length: 14 }, (_, i) => `OPS-CL-${101 + i}`);
const projects = [];
for (let i = 0; i < 40; i++) {
  const created = clampDate(addDays(WINDOW_START, Math.floor((i * (span - 10)) / 40) + int(0, 12)), WINDOW_START, WINDOW_END);
  const due = addDays(created, int(30, 120));
  let status, completed = '';
  if (due < addDays(WINDOW_END, -10)) {
    const x = rnd();
    status = x < 0.7 ? 'Completed' : x < 0.78 ? 'Cancelled' : 'In Progress';
  } else {
    const x = rnd();
    status = x < 0.6 ? 'In Progress' : x < 0.85 ? 'Not Started' : 'On Hold';
  }
  if (status === 'Completed') completed = clampDate(addDays(due, int(-15, 20)), addDays(created, 7), WINDOW_END);
  let sla;
  if (status === 'Completed') sla = completed <= due ? 'Met' : 'Breached';
  else if (status === 'Cancelled') sla = 'N/A';
  else if (due < WINDOW_END) sla = 'Breached';
  else if (diffDays(WINDOW_END, due) <= 7) sla = 'At Risk';
  else sla = 'On Track';
  projects.push({
    project_id: `P-${2001 + i}`,
    client_id: pick(OPS_CLIENTS),
    status,
    service_type: pick(SERVICES),
    created_date: created,
    due_date: due,
    completed_date: completed,
    amount: Math.round(int(4000, 90000) / 100) * 100,
    assigned_team: pick(TEAMS),
    sla_status: sla,
  });
}
// guarantee both ops-only clients are used so the unmatched case is real
projects[5].client_id = 'OPS-CL-113';
projects[27].client_id = 'OPS-CL-114';
for (const p of projects.filter((p) => ['OPS-CL-113', 'OPS-CL-114'].includes(p.client_id))) {
  used.add(p.project_id);
  defect('ops_projects', p.project_id, 'client_id', 'unmapped_ops_client', 'Operations client has no row in client_mapping (by design)');
}

for (const k of [1, 6]) {
  const r = take(projects, 'project_id', (x) => x.status === 'Completed', k);
  r.completed_date = '';
  defect('ops_projects', r.project_id, 'completed_date', 'missing_required', 'Completed project without completed_date');
}
{
  const r = take(projects, 'project_id', () => true, 14);
  r.amount = -Math.abs(r.amount);
  defect('ops_projects', r.project_id, 'amount', 'invalid_amount', 'Negative amount');
}
{
  const r = take(projects, 'project_id', (x) => x.status !== 'Completed' && x.status !== 'Cancelled', 2);
  r.due_date = addDays(r.created_date, -12);
  defect('ops_projects', r.project_id, 'due_date', 'date_order', 'due_date earlier than created_date');
}
{
  const r = take(projects, 'project_id', (x) => x.status === 'In Progress', 1);
  r.completed_date = addDays(r.created_date, 20);
  defect('ops_projects', r.project_id, 'completed_date', 'completed_date_on_open', 'completed_date present on a project that is not Completed');
}
for (const [k, val] of [[3, 'completed'], [8, 'COMPLETED ']]) {
  const r = take(projects, 'project_id', (x) => x.status === 'Completed' && x.completed_date, k);
  r.status = val;
  defect('ops_projects', r.project_id, 'status', 'status_variant', `status written as "${val}"`);
}
{
  const r = take(projects, 'project_id', (x) => x.status === 'Completed' && x.sla_status === 'Breached', 0);
  r.sla_status = 'Met';
  defect('ops_projects', r.project_id, 'sla_status', 'sla_inconsistent', 'Marked Met although completed_date is after due_date');
}

// ---------- Google Sheets-style reference data ----------
const months = [];
for (let i = 0; i < 24; i++) {
  const y = 2024 + Math.floor((10 + i) / 12);
  const m = ((10 + i) % 12) + 1;
  months.push(`${y}-${pad(m, 2)}`);
}
const targets = months.map((period_month, i) => {
  const target_amount = Math.round((40000 + i * 1500) / 500) * 500;
  const forecast_amount = Math.round((target_amount * (0.85 + rnd() * 0.25)) / 500) * 500;
  return { period_month, target_amount, forecast_amount, currency: 'USD' };
});
const campaigns = [
  ['CMP-01', 'Website Organic & SEO', 'Website', 'Digital', 'Inbound'],
  ['CMP-02', 'Customer Referral Program', 'Referral', 'Partner', 'Referral'],
  ['CMP-03', 'LinkedIn Outreach', 'LinkedIn', 'Social', 'Outbound'],
  ['CMP-04', 'Industry Trade Shows', 'Trade Show', 'Events', 'Events'],
  ['CMP-05', 'Nurture Email Series', 'Email Campaign', 'Email', 'Outbound'],
].map(([campaign_id, campaign_name, lead_source, channel, manual_category]) => ({ campaign_id, campaign_name, lead_source, channel, manual_category }));
const SEGS = ['Enterprise', 'Mid-Market', 'SMB'];
const CATS = ['Strategic', 'Growth', 'Maintain'];
const segments = mapping.map((m, i) => ({
  canonical_client_id: m.canonical_client_id,
  account_segment: SEGS[(i * 7 + 1) % 3],
  manual_category: CATS[(i * 5 + 2) % 3],
}));

// ---------- write ----------
write(FILES.crm_companies, toCSV(companies, ['company_id', 'company_name', 'industry', 'region']));
write(FILES.crm_leads, toCSV(leads, ['lead_id', 'created_date', 'source', 'owner', 'company_id', 'company', 'region', 'pipeline_stage', 'deal_value', 'status', 'last_activity_date']));
write(FILES.ops_projects, toCSV(projects, ['project_id', 'client_id', 'status', 'service_type', 'created_date', 'due_date', 'completed_date', 'amount', 'assigned_team', 'sla_status']));
write(FILES.sales_targets_forecasts, toCSV(targets, ['period_month', 'target_amount', 'forecast_amount', 'currency']));
write(FILES.campaign_mapping, toCSV(campaigns, ['campaign_id', 'campaign_name', 'lead_source', 'channel', 'manual_category']));
write(FILES.account_segments, toCSV(segments, ['canonical_client_id', 'account_segment', 'manual_category']));
write(FILES.client_mapping, toCSV(mapping, ['canonical_client_id', 'crm_company_id', 'crm_company_name', 'ops_client_id', 'ops_client_name', 'match_method', 'match_status', 'notes']));
write(FILES.defect_manifest, JSON.stringify({
  note: 'Intentional, documented data defects injected into SYNTHETIC data so that validation and data-quality handling can be demonstrated.',
  seed: SEED, window: [WINDOW_START, WINDOW_END], defects: manifest,
}, null, 2) + '\n');

console.log(`Generated: ${companies.length} companies, ${leads.length} leads, ${projects.length} projects, ${mapping.length} mappings, ${targets.length} targets, ${campaigns.length} campaigns, ${segments.length} segments; ${manifest.length} intentional defects.`);
