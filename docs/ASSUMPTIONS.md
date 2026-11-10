# Assumptions and limitations

## Scope and prototype status

SOIP is a short-timebox prototype prepared for the assignment. It uses synthetic CRM, operations and spreadsheet-style reference data. It is not connected to a live company CRM, operations system or Google Sheets account.

## Data window, currency and time

- Data window: 2024-11-01 to 2026-10-31 (24 months).
- As-of date for stale/overdue/SLA rules: 2026-10-31.
- Currency: USD for all values; no currency conversion.
- Dates are calendar dates without time-of-day or timezone semantics.
- A due date may be later than the as-of date for open work.

## Client mapping

CRM company IDs (`CRM-Cxxx`) and Operations client IDs (`OPS-CL-xxx`) are separate namespaces and are never compared directly. `client_mapping.csv` assigns canonical IDs (`CL-001`..`CL-015`). Some matches were based on normalized names; four required manual review because names differed more substantially.

The resulting source mapping contains 12 matched clients, 3 CRM-only companies and 2 Operations clients without a mapping row. These are surfaced as unmatched rather than hidden or force-matched. One Operations client maps to at most one canonical client.

## Status and SLA rules

- Lead statuses: Open, Won, Lost.
- Open stages: New, Qualified, Proposal, Negotiation.
- Closed Won maps to Won; Closed Lost maps to Lost.
- Project statuses: Not Started, In Progress, On Hold, Completed, Cancelled.
- Completed projects: SLA Met if completion date is on/before due date; otherwise Breached.
- Open projects: Breached if due date is before the as-of date; At Risk if due within seven days; otherwise On Track.
- Cancelled projects: SLA N/A.

## Synthetic defects

Generation is deterministic (seed `20261109`). Source counts: 60 leads, 15 companies, 40 projects, 15 mappings, 24 target months, 5 campaigns and 15 segments (174 records). Thirty-two defects are intentionally injected and listed in `defect_manifest.json`. They are preserved and classified, not silently deleted.

Lead region is consistent with the associated company region except where a documented defect applies. Targets and forecasts are monthly company totals and are not calibrated to the generated deal values.

## Known limitations

- Small sample (approximately 28 closed leads and 40 projects); rates are illustrative.
- No close date or stage history, so conversion velocity and sales-cycle duration cannot be calculated reliably.
- Duplicate detection uses a deterministic field combination; real systems need stronger identity and survivorship rules.
- Operations data is weighted toward completed projects; open/overdue counts are small.
- Target-versus-won comparisons use lead creation month as a cohort proxy, not actual close month.
- Synthetic names, amounts and targets are not representative of Braahmam's real business.
- Current prototype does not include production authentication, role-based access, tenant isolation, audit, retention or monitoring.
- AI analysis is advisory, depends on provider quota and must be checked against visible evidence.
