// Pure transformation of the approved Milestone 2 files into the Supabase import payload.
// No database access. Does NOT modify the source files. Deterministic: same files -> same payload.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FILES } from '../data-files.js';
import { parseCSV } from './csv.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(ROOT, 'data', 'synthetic');

export class ImportDataError extends Error {}

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const LEAD_STATUS = { open: 'Open', won: 'Won', lost: 'Lost' };
const LEAD_STAGES = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
const OPS_STATUS = { 'not started': 'Not Started', 'in progress': 'In Progress', 'on hold': 'On Hold', completed: 'Completed', cancelled: 'Cancelled' };
const SLA = ['Met', 'Breached', 'At Risk', 'On Track', 'N/A'];

// ---------- normalizers ----------
export const text = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v));

/** ISO `YYYY-MM-DD` or `DD-Mon-YYYY` -> ISO string; anything else (or an impossible date) -> null. */
export function normalizeDate(s) {
  if (!text(s)) return null;
  let y, mo, d, m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) [, y, mo, d] = m;
  else if ((m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s))) {
    const i = MON.indexOf(m[2].toLowerCase());
    if (i < 0) return null;
    d = m[1]; y = m[3]; mo = String(i + 1).padStart(2, '0');
  } else return null;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return !isNaN(dt) && dt.toISOString().slice(0, 10) === `${y}-${mo}-${d}` ? `${y}-${mo}-${d}` : null;
}
/** Blank -> null; non-numeric -> null (the validator already reports it). Negative values are kept as exported. */
export function normalizeAmount(s) {
  if (!text(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function enumValue(map, raw, where) {
  const v = map[String(raw).trim().toLowerCase()];
  if (!v) throw new ImportDataError(`${where}: unknown value "${raw}"`);
  return v;
}

// ---------- source files ----------
export function readSources(dataDir = DATA_DIR) {
  const rows = {};
  const files = {};
  const hash = crypto.createHash('sha256');
  for (const [key, rel] of Object.entries(FILES)) {
    const p = path.join(dataDir, rel);
    if (!fs.existsSync(p)) throw new ImportDataError(`Missing source file ${rel}. Run npm run data:generate first.`);
    const content = fs.readFileSync(p, 'utf8');
    hash.update(rel + '\n' + content);
    files[rel] = { bytes: Buffer.byteLength(content), records: key === 'defect_manifest' ? JSON.parse(content).defects.length : parseCSV(content).length };
    if (key !== 'defect_manifest') rows[key] = parseCSV(content);
  }
  return { rows, files, checksum: hash.digest('hex') };
}

/** Runs the approved Milestone 2 validator (read-only) and returns its JSON report. */
export function getValidatorFindings() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-data.js'), '--json'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  try { return JSON.parse(r.stdout); }
  catch { throw new ImportDataError(`Validator produced no JSON report: ${r.stderr || r.stdout}`); }
}

// ---------- build ----------
export function buildPayload({ findings, dataDir = DATA_DIR, triggeredBy = 'cli' }) {
  const { rows, files, checksum } = readSources(dataDir);

  const flagsFor = new Map();
  for (const f of findings) {
    const k = `${f.dataset}|${f.record_id}`;
    if (!flagsFor.has(k)) flagsFor.set(k, new Set());
    flagsFor.get(k).add(f.type);
  }
  const flags = (dataset, id) => [...(flagsFor.get(`${dataset}|${id}`) ?? [])].sort();

  const crm_companies = rows.crm_companies.map((r) => ({
    company_id: r.company_id, company_name: r.company_name, industry: text(r.industry), region: text(r.region),
  }));
  const companyIds = new Set(crm_companies.map((c) => c.company_id));

  // Leads: normalize, keep raw values, flag duplicates (same key as the Milestone 2 validator), never drop.
  const seen = new Map();
  const crm_leads = rows.crm_leads.map((r) => {
    const created = normalizeDate(r.created_date);
    const stage = LEAD_STAGES.includes(r.pipeline_stage) ? r.pipeline_stage : (() => { throw new ImportDataError(`crm_leads ${r.lead_id}: unknown pipeline_stage "${r.pipeline_stage}"`); })();
    const key = [r.company_id, created ?? r.created_date, r.source, r.deal_value, r.pipeline_stage].join('|');
    const duplicateOf = seen.get(key) ?? null;
    if (!duplicateOf) seen.set(key, r.lead_id);
    return {
      lead_id: r.lead_id,
      created_date: created,
      source: text(r.source),
      owner: text(r.owner),
      company_id: companyIds.has(r.company_id) ? r.company_id : null,
      source_company_id: text(r.company_id),
      company: text(r.company),
      region: text(r.region),
      pipeline_stage: stage,
      deal_value: normalizeAmount(r.deal_value),
      status: enumValue(LEAD_STATUS, r.status, `crm_leads ${r.lead_id} status`),
      status_raw: r.status,
      last_activity_date: normalizeDate(r.last_activity_date),
      is_duplicate: duplicateOf !== null,
      duplicate_of: duplicateOf,
      dq_flags: flags('crm_leads', r.lead_id),
      source_row: r,
    };
  });

  const client_mapping = rows.client_mapping.map((r) => ({
    canonical_client_id: r.canonical_client_id, crm_company_id: r.crm_company_id, crm_company_name: text(r.crm_company_name),
    ops_client_id: text(r.ops_client_id), ops_client_name: text(r.ops_client_name),
    match_method: r.match_method, match_status: r.match_status, notes: text(r.notes),
  }));

  // Operations clients are derived from projects + mapping so IDs stay in their own namespace.
  const opsNames = new Map(client_mapping.filter((m) => m.ops_client_id).map((m) => [m.ops_client_id, m.ops_client_name]));
  const opsIds = [...new Set([...rows.ops_projects.map((p) => p.client_id), ...opsNames.keys()])].sort();
  const ops_clients = opsIds.map((id) => ({ ops_client_id: id, ops_client_name: opsNames.get(id) ?? null }));

  const ops_projects = rows.ops_projects.map((r) => {
    const sla = text(r.sla_status);
    if (sla && !SLA.includes(sla)) throw new ImportDataError(`ops_projects ${r.project_id}: unknown sla_status "${sla}"`);
    return {
      project_id: r.project_id, client_id: r.client_id,
      status: enumValue(OPS_STATUS, r.status, `ops_projects ${r.project_id} status`), status_raw: r.status,
      service_type: text(r.service_type),
      created_date: normalizeDate(r.created_date), due_date: normalizeDate(r.due_date), completed_date: normalizeDate(r.completed_date),
      amount: normalizeAmount(r.amount), assigned_team: text(r.assigned_team), sla_status: sla,
      dq_flags: flags('ops_projects', r.project_id), source_row: r,
    };
  });

  const sales_targets_forecasts = rows.sales_targets_forecasts.map((r) => {
    if (!/^\d{4}-\d{2}$/.test(r.period_month)) throw new ImportDataError(`sales_targets_forecasts: bad period_month "${r.period_month}"`);
    return { period_month: `${r.period_month}-01`, target_amount: normalizeAmount(r.target_amount), forecast_amount: normalizeAmount(r.forecast_amount), currency: text(r.currency) ?? 'USD' };
  });
  const campaign_mapping = rows.campaign_mapping.map((r) => ({
    campaign_id: r.campaign_id, campaign_name: r.campaign_name, lead_source: r.lead_source, channel: text(r.channel), manual_category: text(r.manual_category),
  }));
  const account_segments = rows.account_segments.map((r) => ({
    canonical_client_id: r.canonical_client_id, account_segment: r.account_segment, manual_category: text(r.manual_category),
  }));
  const data_quality_results = findings.map((f) => ({
    dataset: f.dataset, record_id: String(f.record_id), field: f.field ?? '-', type: f.type, detail: f.detail ?? null,
    classification: String(f.classification).toLowerCase(),
  }));

  const payload = { crm_companies, ops_clients, client_mapping, account_segments, crm_leads, ops_projects, sales_targets_forecasts, campaign_mapping, data_quality_results };
  const expected = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'data_quality_results').map(([k, v]) => [k, v.length]));
  const meta = { triggered_by: triggeredBy, source_checksum: checksum, source_files: files };
  const normalization = {
    leads_status_normalized: crm_leads.filter((l) => l.status !== l.status_raw).length,
    leads_dates_normalized: crm_leads.filter((l) => l.created_date !== l.source_row.created_date).length,
    leads_flagged_duplicate: crm_leads.filter((l) => l.is_duplicate).length,
    leads_without_crm_company: crm_leads.filter((l) => l.company_id === null).length,
    leads_missing_deal_value: crm_leads.filter((l) => l.deal_value === null).length,
    projects_status_normalized: ops_projects.filter((p) => p.status !== p.status_raw).length,
    projects_invalid_amount: ops_projects.filter((p) => p.amount !== null && p.amount <= 0).length,
    projects_completed_without_date: ops_projects.filter((p) => p.status === 'Completed' && !p.completed_date).length,
    ops_clients_without_mapping: ops_clients.filter((c) => !opsNames.has(c.ops_client_id)).length,
    crm_only_companies: client_mapping.filter((m) => m.match_status === 'crm_only').length,
  };
  return { payload, meta, expected, normalization };
}
