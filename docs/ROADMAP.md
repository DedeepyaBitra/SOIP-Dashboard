# Production-readiness roadmap

SOIP is a short-timebox prototype built with synthetic data. The following roadmap describes work required before using it with real business information. It is not a claim that these controls are already implemented.

## Priority 1 — Secure access and data protection

- Add authentication and role-based access control.
- Define tenant/client-level authorization and enforce it in PostgreSQL RLS policies.
- Restrict browser-visible data to the signed-in user's authorized scope.
- Keep service-role and AI provider credentials in managed server-side secrets; rotate any exposed credentials.
- Define data classification, retention/deletion, encryption, backup and restore policies.
- Add audit events for sign-in, data access, imports, mapping changes and administrative actions.
- Review privacy, contractual and regulatory requirements before connecting real CRM or operations records.

## Priority 2 — Reliable source integrations

- Replace prototype CSV-only ingestion with approved CRM, operations and spreadsheet connectors.
- Use OAuth or provider-approved service identities; document scopes and credential ownership.
- Implement incremental sync using source updated-at fields or change tokens.
- Add pagination, rate-limit handling, retries with backoff, idempotency and dead-letter/error review.
- Track source freshness, last successful sync, row counts, rejected rows and reconciliation differences.
- Add operator-controlled re-sync and recovery procedures.

## Priority 3 — Canonical data model and quality governance

- Confirm canonical account/client identity rules with business owners.
- Add a review queue for ambiguous and unmatched records rather than silently auto-matching.
- Version mapping decisions and preserve who/when/why metadata.
- Add source lineage and field-level provenance.
- Agree data ownership, definitions and remediation SLAs for missing, duplicate and inconsistent values.
- Add schema evolution/versioning and migration review.

## Priority 4 — KPI correctness and business validation

- Review every KPI formula, denominator, currency and time basis with Sales and Operations owners.
- Use actual close dates and stage history before adding sales-cycle, conversion or velocity metrics.
- Define revenue recognition and cost/margin data before reporting recognized revenue or profitability.
- Calibrate targets and forecasts against approved planning data.
- Add automated tests for filters, date boundaries, duplicate prevention, mapping cardinality and aggregation totals.
- Reconcile dashboard totals against source-system reports before business use.

## Priority 5 — AI governance

- Keep AI calls server-side and send only the minimum authorized data.
- Apply authentication, authorization, request-size limits, rate limits, timeouts and usage budgets.
- Cache or persist generated analyses with data snapshot/version, model, timestamp and prompt version.
- Clearly distinguish measured facts, hypotheses and recommendations.
- Require evidence references to dashboard metrics; reject unsupported claims and invalid response schemas.
- Add human review for consequential decisions and provide a non-AI fallback.
- Monitor provider errors, quota use, latency and cost without logging sensitive payloads.

## Priority 6 — Operations and delivery

- Add CI checks for linting, unit/integration tests, dependency scanning and production builds.
- Use separate development, staging and production Supabase projects.
- Add health checks, error monitoring, structured logs and alerting.
- Establish backup/restore tests, incident response and ownership.
- Test performance with realistic volumes; add indexes, query tuning and pagination/server-side filtering where needed.
- Document deployment, rollback, support ownership and release approvals.

## Suggested rollout gates

1. **Prototype review:** synthetic data only; verify formulas, UI and documentation.
2. **Internal pilot:** approved non-sensitive or masked data, authenticated users, audit trail and monitored integrations.
3. **Limited production:** validated access controls, privacy review, recovery tests, operational ownership and KPI sign-off.
4. **Scale-up:** performance, cost, availability and governance reviewed against agreed service objectives.
