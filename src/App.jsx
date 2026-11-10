import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, Legend
} from 'recharts';
import DataStatusPanel from './components/DataStatusPanel.jsx';
import { getLeads } from './services/crmService.js';
import { getProjects } from './services/operationsService.js';
import { getTargetsForecasts } from './services/targetsService.js';
import { getSalesToOpsByClient } from './services/kpiService.js';
import { getUnmatchedRecords } from './services/mappingService.js';
import { getLatestQualitySummary } from './services/dataQualityService.js';
import { getDataStatus } from './services/refreshService.js';
import { getAiAnalysis } from './services/aiService.js';

const AS_OF = '2026-10-31';
const COLORS = ['#3984c6', '#0f9d8a', '#e8a23a', '#8b78c6', '#d96b75', '#718096'];
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n || 0));
const number = (n) => new Intl.NumberFormat('en-IN').format(Number(n || 0));
const dateLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const startOf = (value) => value ? new Date(`${value}T00:00:00`).getTime() : 0;
const within = (value, from, to) => (!from || startOf(value) >= startOf(from)) && (!to || startOf(value) <= startOf(to));
const uniq = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const groupCount = (rows, key) => Object.entries(rows.reduce((a, r) => { const k = r[key] || 'Unknown'; a[k] = (a[k] || 0) + 1; return a; }, {})).map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value);
const monthSeries = (rows, dateKey) => {
  const grouped = rows.reduce((a, r) => { if (!r[dateKey]) return a; const m = String(r[dateKey]).slice(0,7); a[m] = (a[m] || 0) + 1; return a; }, {});
  return Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([month, count]) => ({ month: dateLabel(`${month}-01`), count }));
};
function Icon({ name }) { const paths = { grid:'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z', trend:'M3 17l6-6 4 4 8-9 M15 6h6v6', brief:'M3 7h18v14H3z M8 7V4h8v3', users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', database:'M12 3c5 0 9 1.3 9 3s-4 3-9 3-9-1.3-9-3 4-3 9-3z M3 6v12c0 1.7 4 3 9 3s9-1.3 9-3V6 M3 12c0 1.7 4 3 9 3s9-1.3 9-3', spark:'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z M19 16l1 2.5 2.5 1-2.5 1L19 23l-1-2.5-2.5-1 2.5-1z' }; return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.grid}/></svg>; }
function Metric({ label, value, note, tone='blue' }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <i className={`metric-dot ${tone}`} aria-hidden="true" />
      </div>
      <strong className="metric-value">{value}</strong>
      <small className="metric-note">{note}</small>
    </article>
  );
}
function Panel({ title, subtitle, children, className='' }) { return <section className={`panel ${className}`}><div className="panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>; }
function ChartEmpty({ text='No records match the selected filters.' }) { return <div className="empty-chart">{text}</div>; }
function SelectFilter({ label, value, options, onChange }) { return <label className="filter"><span>{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)}><option value="">All {label.toLowerCase()}</option>{options.map((v)=><option key={v} value={v}>{v}</option>)}</select></label>; }

export default function App() {
  const [page, setPage] = useState('Overview');
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [data, setData] = useState({ leads:[], projects:[], targets:[], clients:[], unmatched:[], quality:[], status:null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('2024-11-01');
  const [to, setTo] = useState(AS_OF);
  const [region, setRegion] = useState('');
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [leadStatus, setLeadStatus] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [service, setService] = useState('');
  const [team, setTeam] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [leads, projects, targets, clients, unmatched, quality, status] = await Promise.all([
        getLeads(), getProjects(), getTargetsForecasts(), getSalesToOpsByClient(), getUnmatchedRecords(), getLatestQualitySummary(), getDataStatus()
      ]);
      setData({ leads, projects, targets, clients, unmatched, quality, status });
    } catch (e) { setError(e.message || 'Unable to load dashboard data.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const leads = useMemo(() => data.leads.filter(r => within(r.created_date, from, to) && (!region || r.region===region) && (!owner || r.owner===owner) && (!source || r.source===source) && (!leadStatus || r.status===leadStatus)), [data.leads,from,to,region,owner,source,leadStatus]);
  const projects = useMemo(() => data.projects.filter(r => within(r.created_date,from,to) && (!projectStatus || r.status===projectStatus) && (!service || r.service_type===service) && (!team || r.assigned_team===team)), [data.projects,from,to,projectStatus,service,team]);
  const openLeads = leads.filter(r=>r.status==='Open');
  const wonLeads = leads.filter(r=>r.status==='Won');
  const closedLeads = leads.filter(r=>['Won','Lost'].includes(r.status));
  const winRate = closedLeads.length ? wonLeads.length/closedLeads.length*100 : 0;
  const missingDeal = leads.filter(r=>r.deal_value===null || r.deal_value==='').length;
  const pipeline = sum(openLeads.filter(r=>r.deal_value!==null), 'deal_value');
  const wonValue = sum(wonLeads.filter(r=>r.deal_value!==null), 'deal_value');
  const stale = openLeads.filter(r=>!r.last_activity_date || startOf(r.last_activity_date)<startOf('2026-10-01'));
  const openProjects = projects.filter(r=>r.is_open);
  const overdue = projects.filter(r=>r.is_overdue);
  const completed = projects.filter(r=>r.status==='Completed');
  const completedEligible = completed.filter(r=>r.completed_date && r.due_date);
  const onTime = completedEligible.filter(r=>r.completed_date<=r.due_date);
  const slaEligible = projects.filter(r=>r.sla_status_recomputed && r.sla_status_recomputed!=='N/A');
  const slaBreached = slaEligible.filter(r=>r.sla_status_recomputed==='Breached');
  const validAmount = projects.filter(r=>r.amount_valid!==null && r.amount_valid!==undefined);
  const onTimeRate = completedEligible.length ? onTime.length/completedEligible.length*100 : 0;
  const slaRate = slaEligible.length ? slaBreached.length/slaEligible.length*100 : 0;
  const leadTrend = monthSeries(leads,'created_date');
  const projectTrend = monthSeries(projects,'created_date');
  const sourceData = groupCount(leads,'source');
  const stageData = groupCount(leads,'pipeline_stage');
  const ownerData = groupCount(leads,'owner').slice(0,8);
  const statusData = groupCount(projects,'status');
  const teamData = groupCount(projects,'assigned_team');
  const serviceData = groupCount(projects,'service_type');
  const targetRows = data.targets.filter(r=>within(String(r.period_month).length===7?`${r.period_month}-01`:r.period_month,from,to));
  const targetTotal = sum(targetRows,'target_amount');
  const forecastTotal = sum(targetRows,'forecast_amount');
  const matchedCount = data.clients.filter(r=>r.match_status==='matched').length;
  const displayedClients = data.clients.filter(r=>!search || `${r.canonical_client_id} ${r.crm_company_name} ${r.ops_client_name} ${r.account_segment}`.toLowerCase().includes(search.toLowerCase()));
  const insight = overdue.length ? { title:`${overdue.length} open project${overdue.length===1?' is':'s are'} overdue`, body:`${number(overdue.length)} of ${number(openProjects.length)} open projects are overdue as of ${AS_OF}.`, action:'Review the overdue project list and prioritize the earliest due dates.' } : stale.length ? { title:`${stale.length} open leads need attention`, body:`These leads have no recorded activity or activity older than 30 days as of ${AS_OF}.`, action:'Review lead ownership and schedule follow-ups.' } : { title:'No immediate exception identified', body:'Current filters do not show overdue projects or stale open leads.', action:'Continue monitoring delivery dates and lead activity.' };

  // ---- AI Business Analyst: aggregated figures only (reuses the values calculated above; no lead/project rows are sent)
  const pct = (v) => Math.round(v * 10) / 10;
  const top = (rows, n = 5) => rows.slice(0, n).map((r) => ({ label: r.name, count: r.value }));
  const daysOverdue = (r) => (r.due_date ? Math.round((startOf(AS_OF) - startOf(r.due_date)) / 86400000) : null);
  const pickActive = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
  const aiBase = { as_of: AS_OF, currency: 'USD' };
  const aiSummary = page === 'Sales Intelligence' ? {
    ...aiBase, scope: 'sales',
    filters_applied: pickActive({ date_from: from, date_to: to, region, owner, source, lead_status: leadStatus }),
    metrics: {
      leads_in_selection: leads.length, open_leads: openLeads.length, won_leads: wonLeads.length, lost_leads: closedLeads.length - wonLeads.length,
      open_pipeline_value_usd: pipeline, leads_missing_deal_value: missingDeal, won_value_usd: wonValue,
      win_rate_closed_leads_pct: closedLeads.length ? pct(winRate) : null,
      stale_open_leads: stale.length, stale_open_leads_without_activity_date: stale.filter((r) => !r.last_activity_date).length,
      leads_by_source: top(sourceData), leads_by_stage: top(stageData, 6), leads_by_owner: top(ownerData), leads_by_region: top(groupCount(leads, 'region')),
    },
  } : page === 'Operations Intelligence' ? {
    ...aiBase, scope: 'ops',
    filters_applied: pickActive({ date_from: from, date_to: to, project_status: projectStatus, service_type: service, assigned_team: team }),
    metrics: {
      projects_in_selection: projects.length, open_projects: openProjects.length, completed_projects: completed.length, overdue_projects: overdue.length,
      completed_on_time_pct: completedEligible.length ? pct(onTimeRate) : null, completed_without_dates_excluded: completed.length - completedEligible.length,
      sla_breach_rate_pct: slaEligible.length ? pct(slaRate) : null, projects_with_sla_result: slaEligible.length,
      projects_with_invalid_or_missing_amount_excluded: projects.length - validAmount.length,
      projects_by_status: top(statusData), projects_by_service_type: top(serviceData), projects_by_team: top(teamData),
      sla_status_counts: top(groupCount(projects, 'sla_status_recomputed')), top_clients_by_projects: top(groupCount(projects, 'client_id')),
      most_overdue_projects: overdue.slice(0, 8).map((r) => ({ project_id: r.project_id, client_id: r.client_id, team: r.assigned_team, due_date: r.due_date, days_overdue: daysOverdue(r) })),
    },
  } : {
    ...aiBase, scope: 'overview',
    filters_applied: pickActive({ date_from: from, date_to: to, region, owner, source, lead_status: leadStatus }),
    metrics: {
      leads_in_selection: leads.length, open_leads: openLeads.length, open_pipeline_value_usd: pipeline, leads_missing_deal_value: missingDeal, won_value_usd: wonValue,
      win_rate_closed_leads_pct: closedLeads.length ? pct(winRate) : null, stale_open_leads: stale.length, leads_by_source: top(sourceData),
      projects_in_selection: projects.length, open_projects: openProjects.length, overdue_projects: overdue.length,
      completed_on_time_pct: completedEligible.length ? pct(onTimeRate) : null, sla_breach_rate_pct: slaEligible.length ? pct(slaRate) : null,
      target_total_usd: targetTotal, forecast_total_usd: forecastTotal,
      target_vs_won_note: 'Approximate cohort comparison: won value is grouped by lead-created month; targets are synthetic.',
      matched_clients: matchedCount, unmatched_records: data.unmatched.length,
      rule_based_insight: { title: insight.title, body: insight.body, action: insight.action },
    },
  };

  const nav = [{name:'Overview',icon:'grid'},{name:'Sales Intelligence',icon:'trend'},{name:'Operations Intelligence',icon:'brief'},{name:'Client Intelligence',icon:'users'},{name:'Data Health',icon:'database'}];
  const title = page;
  const filters = page==='Sales Intelligence' || page==='Overview' ? <><SelectFilter label="Region" value={region} options={uniq(data.leads,'region')} onChange={setRegion}/><SelectFilter label="Owner" value={owner} options={uniq(data.leads,'owner')} onChange={setOwner}/><SelectFilter label="Source" value={source} options={uniq(data.leads,'source')} onChange={setSource}/><SelectFilter label="Lead status" value={leadStatus} options={uniq(data.leads,'status')} onChange={setLeadStatus}/></> : page==='Operations Intelligence' ? <><SelectFilter label="Project status" value={projectStatus} options={uniq(data.projects,'status')} onChange={setProjectStatus}/><SelectFilter label="Service type" value={service} options={uniq(data.projects,'service_type')} onChange={setService}/><SelectFilter label="Assigned team" value={team} options={uniq(data.projects,'assigned_team')} onChange={setTeam}/></> : null;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">S</div><div><b>SOIP</b><small>INTELLIGENCE PLATFORM</small></div></div><div className="nav-label">WORKSPACE</div><nav>{nav.map(item=><button key={item.name} className={`nav-item ${page===item.name?'active':''}`} onClick={()=>setPage(item.name)}><Icon name={item.icon}/><span>{item.name}</span>{page===item.name&&<i/>}</button>)}</nav><div className="sidebar-bottom"><div className="connection"><span className="pulse"/><div><b>Data connection</b><small>{data.status?.availability==='ready'?'Supabase connected':'Checking connection'}</small></div></div><small className="sidebar-version">Prototype · Synthetic data</small></div></aside>
    <main className="main-area"><header className="topbar"><div><div className="eyebrow">BUSINESS PERFORMANCE / {page.toUpperCase()}</div><h1>{title}</h1><p>Monitor performance, identify exceptions and make informed decisions.</p></div><div className="top-actions"><span className="asof">As of 31 Oct 2026</span><button className="ai-header-btn" onClick={() => setAiDrawerOpen(true)}><span aria-hidden="true">✦</span> AI Analyst</button><button className="refresh-btn" onClick={load} disabled={loading}>↻ <span>{loading?'Refreshing':'Refresh data'}</span></button></div></header>
      {aiDrawerOpen && <div className="ai-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAiDrawerOpen(false); }}>
        <aside className="ai-drawer" role="dialog" aria-modal="true" aria-label="AI Business Analyst">
          <div className="ai-drawer-header"><div><span className="ai-drawer-kicker">SOIP INTELLIGENCE</span><h2>AI Business Analyst</h2><p>Analysis for {page}</p></div><button className="ai-drawer-close" onClick={() => setAiDrawerOpen(false)} aria-label="Close AI analyst">×</button></div>
          <div className="ai-drawer-body"><AiAnalystCard scope={aiSummary.scope} summary={aiSummary}/></div>
        </aside>
      </div>}
      <div className="filter-row"><div className="date-filters"><label className="filter"><span>From</span><input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label className="filter"><span>To</span><input type="date" value={to} min={from} max={AS_OF} onChange={e=>setTo(e.target.value)}/></label></div>{filters}<button className="clear-btn" onClick={()=>{setFrom('2024-11-01');setTo(AS_OF);setRegion('');setOwner('');setSource('');setLeadStatus('');setProjectStatus('');setService('');setTeam('');}}>Reset filters</button></div>
      {error&&<div className="error-banner"><b>Data loading issue</b><span>{error}</span><button onClick={load}>Try again</button></div>}
      {loading&&<div className="loading-banner">Loading live dashboard data from Supabase…</div>}
      {!loading&&!error&&<>
        {page==='Overview'&&<>
          <div className="section-intro"><div><h2>Executive overview</h2><p>A consolidated view of sales activity and operational delivery.</p></div><span className="live-tag">● LIVE DATA</span></div>
          <div className="metric-grid"><Metric label="Total leads" value={number(leads.length)} note={`${number(openLeads.length)} currently open`} /><Metric label="Open pipeline value" value={money(pipeline)} note={`${missingDeal} leads have no deal value`} tone="teal"/><Metric label="Win rate" value={`${winRate.toFixed(1)}%`} note={`${wonLeads.length} won of ${closedLeads.length} closed`} tone="green"/><Metric label="Total projects" value={number(projects.length)} note={`${openProjects.length} open work items`} tone="teal"/><Metric label="Overdue projects" value={number(overdue.length)} note="Open projects past due date" tone="red"/><Metric label="On-time completion" value={`${onTimeRate.toFixed(1)}%`} note={`${onTime.length} of ${completedEligible.length} eligible completed`} tone="green"/><Metric label="SLA breach rate" value={`${slaRate.toFixed(1)}%`} note={`${slaBreached.length} of ${slaEligible.length} with SLA result`} tone="amber"/><Metric label="Matched clients" value={number(matchedCount)} note={`${data.unmatched.length} unmatched records`} tone="blue"/></div>
          <div className="content-grid"><Panel title="Lead generation trend" subtitle="Monthly lead creation · selected period"><TrendChart data={leadTrend}/></Panel><Panel title="Project status" subtitle="Distribution across selected projects"><DonutChart data={statusData}/></Panel><Panel title="Target vs won value" subtitle="Won value uses lead-created month; synthetic comparison"><TargetChart targets={targetRows} leads={leads}/></Panel><Panel title="Operations workload by team" subtitle="Project count by assigned team"><SimpleBar data={teamData}/></Panel></div>
          <InsightCard insight={insight}/>
        </>}
        {page==='Sales Intelligence'&&<>
          <div className="section-intro"><div><h2>Sales performance</h2><p>Lead generation, pipeline health and closed-lead outcomes.</p></div><span className="live-tag">● CRM DATA</span></div>
          <div className="metric-grid"><Metric label="Total leads" value={number(leads.length)} note="Duplicate records excluded"/><Metric label="Open leads" value={number(openLeads.length)} note="Current open pipeline" tone="teal"/><Metric label="Open pipeline value" value={money(pipeline)} note={`${missingDeal} missing deal values`} tone="blue"/><Metric label="Won value" value={money(wonValue)} note="Created-date cohort basis" tone="green"/><Metric label="Win rate" value={`${winRate.toFixed(1)}%`} note="Won / (Won + Lost)" tone="green"/><Metric label="Stale open leads" value={number(stale.length)} note="No activity or >30 days old" tone="amber"/></div>
          <div className="content-grid"><Panel title="Lead creation trend" subtitle="Monthly volume"><TrendChart data={leadTrend}/></Panel><Panel title="Lead source" subtitle="Where leads originate"><DonutChart data={sourceData}/></Panel><Panel title="Pipeline stage distribution" subtitle="Lead count by stage"><SimpleBar data={stageData}/></Panel><Panel title="Lead ownership" subtitle="Top owners by lead volume"><SimpleBar data={ownerData}/></Panel></div>
          <Panel title="Stale leads requiring follow-up" subtitle="Open leads with no recorded activity or activity older than 30 days as of 31 Oct 2026"><DataTable columns={['Lead ID','Company','Owner','Region','Last activity','Deal value']} rows={stale.map(r=>[r.lead_id,r.company,r.owner,r.region,r.last_activity_date||'Not recorded',r.deal_value==null?'Missing':money(r.deal_value)])}/></Panel>
          <div className="note-banner">Metric limitation: CRM does not contain close dates or pipeline-stage history. Won value is therefore grouped by lead creation month, not actual close month. Stage conversion and sales velocity are not calculated.</div>
        </>}
        {page==='Operations Intelligence'&&<>
          <div className="section-intro"><div><h2>Operational delivery</h2><p>Project volume, delivery commitments, SLA performance and team workload.</p></div><span className="live-tag teal-tag">● OPERATIONS DATA</span></div>
          <div className="metric-grid"><Metric label="Total projects" value={number(projects.length)} note="Project records in selected period" tone="teal"/><Metric label="Open work" value={number(openProjects.length)} note="Not started, in progress or on hold" tone="blue"/><Metric label="Completed" value={number(completed.length)} note="Completed project records" tone="green"/><Metric label="Overdue" value={number(overdue.length)} note="Open projects past due date" tone="red"/><Metric label="On-time completion" value={`${onTimeRate.toFixed(1)}%`} note={`${onTime.length}/${completedEligible.length} eligible completed`} tone="green"/><Metric label="SLA breach rate" value={`${slaRate.toFixed(1)}%`} note={`${slaBreached.length}/${slaEligible.length} SLA results`} tone="amber"/></div>
          <div className="content-grid"><Panel title="Project volume trend" subtitle="Monthly projects created"><TrendChart data={projectTrend} color="#0f9d8a"/></Panel><Panel title="Project status" subtitle="Distribution by status"><DonutChart data={statusData}/></Panel><Panel title="Workload by assigned team" subtitle="Number of projects"><SimpleBar data={teamData} color="#0f9d8a"/></Panel><Panel title="Workload by service type" subtitle="Number of projects"><SimpleBar data={serviceData} color="#0f9d8a"/></Panel></div>
          <Panel title="Overdue and at-risk projects" subtitle="Projects requiring operational attention"><DataTable columns={['Project ID','Client','Service','Team','Status','Due date','SLA']} rows={projects.filter(r=>r.is_overdue||r.sla_status_recomputed==='At Risk').map(r=>[r.project_id,r.client_id,r.service_type,r.assigned_team,r.status,r.due_date||'—',r.sla_status_recomputed||'—'])}/></Panel>
          <div className="note-banner">On-time completion excludes completed projects missing either completion or due date. Invalid amounts and date-order defects are excluded from applicable calculations and remain visible in data-quality reporting.</div>
        </>}
        {page==='Client Intelligence'&&<>
          <div className="section-intro"><div><h2>Client portfolio intelligence</h2><p>Connect CRM and Operations only through the canonical client mapping.</p></div><span className="live-tag">● MAPPED DATA</span></div>
          <div className="metric-grid"><Metric label="Mapped clients" value={number(matchedCount)} note="Present in both systems"/><Metric label="CRM-only companies" value={number(data.clients.filter(r=>r.match_status==='crm_only').length)} note="No operations match" tone="amber"/><Metric label="Operations-only" value={number(data.unmatched.filter(r=>r.source_system==='operations').length)} note="No canonical mapping" tone="red"/><Metric label="Unmatched records" value={number(data.unmatched.length)} note="Retained for investigation" tone="amber"/></div>
          <Panel title="Sales-to-operations client view" subtitle="Sales won value and operations project amount are kept as separate measures"><div className="table-tools"><input placeholder="Search client, ID or segment…" value={search} onChange={e=>setSearch(e.target.value)}/><span>{displayedClients.length} mapped records</span></div><DataTable columns={['Canonical ID','CRM company','Operations client','Segment','Leads','Won value','Projects','Project amount']} rows={displayedClients.map(r=>[r.canonical_client_id,r.crm_company_name||r.crm_company_id,r.ops_client_name||r.ops_client_id,r.account_segment||'—',number(r.lead_count),money(r.won_value),number(r.project_count),money(r.project_amount_valid)])}/></Panel>
          <Panel title="Unmatched records" subtitle="These records are deliberately retained rather than silently dropped"><DataTable columns={['Source system','Record ID','Unmatched type','Details','Related records']} rows={data.unmatched.map(r=>[r.source_system,r.record_id,r.unmatched_type,r.detail||'—',number(r.related_record_count)])}/></Panel>
        </>}
        {page==='Data Health'&&<>
          <div className="section-intro"><div><h2>Data health & refresh</h2><p>Connection status, imported table counts and data-quality findings.</p></div><span className="live-tag">● SYSTEM STATUS</span></div>
          <div className="metric-grid"><Metric label="Database tables" value={number(Object.keys(data.status?.counts||{}).length)} note="Expected 8 source tables"/><Metric label="Imported rows" value={number(Object.values(data.status?.counts||{}).reduce((a,b)=>a+b,0))} note="Current Supabase table counts" tone="teal"/><Metric label="Quality findings" value={number(data.quality.reduce((a,r)=>a+Number(r.finding_count||0),0))} note="Latest successful refresh" tone="amber"/><Metric label="Unmatched records" value={number(data.unmatched.length)} note="Cross-system matching exceptions" tone="red"/></div>
          <Panel title="Database connection and refresh status" subtitle="Existing data status component"><DataStatusPanel/></Panel>
          <Panel title="Source table reconciliation" subtitle="Counts returned by the database"><DataTable columns={['Table','Rows']} rows={Object.entries(data.status?.counts||{}).map(([k,v])=>[k,number(v)])}/></Panel>
          <Panel title="Latest data-quality findings" subtitle="Classification and finding counts from the latest successful refresh"><DataTable columns={['Dataset','Finding type','Classification','Count']} rows={data.quality.map(r=>[r.dataset,r.type,r.classification,number(r.finding_count)])}/></Panel>
          <Panel title="Cross-system unmatched records" subtitle="CRM companies, operations clients and leads without company mapping"><DataTable columns={['Source','Record ID','Type','Details']} rows={data.unmatched.map(r=>[r.source_system,r.record_id,r.unmatched_type,r.detail||'—'])}/></Panel>
        </>}
      </>}
      <footer className="footer"><span>SOIP · Sales & Operations Intelligence Platform</span><span>Synthetic prototype · As-of date 31 Oct 2026</span></footer>
    </main>
  </div>;
}
function TrendChart({data,color='#3984c6'}) { return data.length?<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:8,right:10,left:-18,bottom:0}}><defs><linearGradient id={`fill-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.22}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf1f5" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8190a3'}}/><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8190a3'}}/><Tooltip/><Area type="monotone" dataKey="count" stroke={color} strokeWidth={2.5} fill={`url(#fill-${color.replace('#','')})`} /></AreaChart></ResponsiveContainer></div>:<ChartEmpty/>; }
function DonutChart({data}) { return data.length?<div className="chart-wrap donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={83} paddingAngle={3}>{data.map((r,i)=><Cell key={r.name} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip/><Legend verticalAlign="bottom" height={34} iconType="circle" wrapperStyle={{fontSize:11}}/></PieChart></ResponsiveContainer></div>:<ChartEmpty/>; }
function SimpleBar({data,color='#3984c6'}) { return data.length?<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.slice(0,9)} layout="vertical" margin={{top:5,right:20,left:12,bottom:0}}><CartesianGrid stroke="#edf1f5" horizontal={false}/><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#8190a3'}}/><YAxis type="category" dataKey="name" width={105} tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#5c6b7e'}}/><Tooltip/><Bar dataKey="value" fill={color} radius={[0,5,5,0]} barSize={17}/></BarChart></ResponsiveContainer></div>:<ChartEmpty/>; }
function TargetChart({targets,leads}) { const rows=targets.map(t=>{const m=String(t.period_month).slice(0,7);const won=leads.filter(l=>l.status==='Won'&&String(l.created_date).slice(0,7)===m);return {month:dateLabel(t.period_month),target:Number(t.target_amount)||0,forecast:Number(t.forecast_amount)||0,won:sum(won,'deal_value')};});return rows.length?<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="#edf1f5" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fontSize:10,fill:'#8190a3'}}/><YAxis tickFormatter={v=>`${Math.round(v/1000)}k`} tickLine={false} axisLine={false} tick={{fontSize:10,fill:'#8190a3'}}/><Tooltip formatter={v=>money(v)}/><Legend/><Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[4,4,0,0]}/><Bar dataKey="forecast" name="Forecast" fill="#0f9d8a" radius={[4,4,0,0]}/><Bar dataKey="won" name="Won value" fill="#3984c6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<ChartEmpty/>; }
function DataTable({ columns, rows, pageSize = 10 }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleRows = rows.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="data-table-block">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map((row, rowIndex) => (
              <tr key={startIndex + rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="table-empty">No records available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="table-pagination">
          <span className="table-pagination-count">
            Showing {startIndex + 1}–{Math.min(startIndex + pageSize, rows.length)} of {rows.length} records
          </span>
          <div className="table-pagination-actions">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>
              Previous
            </button>
            <span>Page {safePage} of {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage === totalPages}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function InsightCard({insight}) { return <section className="insight-card"><div className="insight-icon"><Icon name="spark"/></div><div className="insight-content"><div className="insight-kicker">AI-ASSISTED BUSINESS INSIGHT · RULE-BASED</div><h3>{insight.title}</h3><p>{insight.body}</p><div className="insight-action"><b>Recommended action</b><span>{insight.action}</span></div></div></section>; }

const AI_SEVERITY = { high: { background: '#fbe4e4', color: '#b13636' }, medium: { background: '#fdf1db', color: '#96620d' }, low: { background: '#e3eefa', color: '#2a679f' }, info: { background: '#edf2f7', color: '#4a5568' } };
// AI-assisted analysis is requested through the `ai-analyst` Supabase Edge Function; no AI key exists in the browser.
// Runs only on click, and marks the result out of date when filters or data change.
function AiAnalystCard({ scope, summary }) {
  const key = JSON.stringify(summary);
  const [run, setRun] = useState({ status: 'idle', key: null, data: null, error: '' });
  const generate = async () => {
    const forKey = key;
    setRun({ status: 'loading', key: forKey, data: null, error: '' });
    try { setRun({ status: 'done', key: forKey, data: await getAiAnalysis({ scope, summary }), error: '' }); }
    catch (e) { setRun({ status: 'error', key: forKey, data: null, error: e.message || 'AI analysis failed.' }); }
  };
  const outdated = run.status === 'done' && run.key !== key;
  const r = run.data;
  return <div className="ai-drawer-content"><div className="ai-drawer-intro">AI-generated from the figures on this page. Check the supporting evidence before acting. Your rule-based insight remains available on Overview.</div>
    {run.status === 'loading' ? <p aria-busy="true" style={{ margin: 0 }}>Analysing the current figures…</p> : <button className="refresh-btn" onClick={generate}>✦ <span>{run.status === 'done' ? 'Regenerate analysis' : 'Generate AI analysis'}</span></button>}
    {run.status === 'error' && <div className="error-banner" style={{ marginTop: 12 }}><b>AI analysis unavailable</b><span>{run.error} The dashboard and rule-based insight still work normally.</span><button onClick={generate}>Try again</button></div>}
    {outdated && <div className="note-banner" style={{ marginTop: 12 }}>Filters or data changed since this analysis was generated. Regenerate to refresh it.</div>}
    {r && run.status === 'done' && <div style={{ marginTop: 14, opacity: outdated ? 0.6 : 1 }}>
      <h3 style={{ margin: '0 0 6px' }}>{r.headline}</h3>
      <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{r.summary}</p>
      {r.findings.map((f) => <div key={f.title} style={{ border: '1px solid #e4eaf1', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
        <div><span style={{ ...AI_SEVERITY[f.severity], padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', marginRight: 8 }}>{f.severity}</span><b>{f.title}</b></div>
        <p style={{ margin: '8px 0', lineHeight: 1.5 }}>{f.explanation}</p>
        {f.evidence.length > 0 && <><b style={{ fontSize: 12 }}>Supporting evidence</b><ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{f.evidence.map((x) => <li key={x}>{x}</li>)}</ul></>}
        {f.recommended_actions.length > 0 && <><b style={{ fontSize: 12 }}>Recommended actions</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{f.recommended_actions.map((x) => <li key={x}>{x}</li>)}</ul></>}
      </div>)}
      {r.caveats.length > 0 && <p style={{ fontSize: 12.5, opacity: 0.8 }}>Caveats: {r.caveats.join(' ')}</p>}
      <p className="ai-generated-at">Analysis generated {new Date(r.generated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <details><summary style={{ cursor: 'pointer', fontSize: 12 }}>Figures sent to the model</summary><pre style={{ maxHeight: 220, overflow: 'auto', fontSize: 11.5, background: '#f0f4f9', padding: '8px 10px', borderRadius: 6 }}>{JSON.stringify(summary.metrics, null, 2)}</pre></details>
    </div>}
  </div>;
}
