# Data quality

Validation is run with `npm run data:validate` (`scripts/validate-data.js`). It is read-only: it does not edit or delete source records. Findings are compared with `data/synthetic/defect_manifest.json` and classified as intentional or unexpected.

## Validation rules

The validator checks required fields, unique identifiers, types, positive/valid amount rules, ISO/calendar dates, date ordering, the 24-month window, status vocabulary and stage/status consistency, completion-date rules, SLA consistency, lead company references, company-name/region consistency, duplicate leads, campaign-source mapping, client mapping coverage and reference-sheet integrity/counts.

## Latest recorded result

| Check | Result |
|---|---:|
| Leads | 60 |
| CRM companies | 15 |
| Operations projects | 40 |
| Client mappings | 15 |
| Target months | 24 |
| Campaign mappings | 5 |
| Account segments | 15 |
| Total source records | 174 |
| Intentional findings | 32 |
| Unexpected findings | 0 |
| Documented defects not detected | 0 |
| Overall validation | PASS |

Coverage: first record 2024-11-03; last record 2026-10-26. The dataset spans all 24 months in the configured window.

## Findings and handling

| Finding type | Count | Handling |
|---|---:|---|
| Duplicate records | 2 | Flagged; excluded from clean CRM counts/sums |
| Missing required values | 8 | Preserved; blank numeric values skipped and reported, missing activity shown separately |
| Non-ISO date variants | 2 | Normalized to ISO; raw source retained |
| Status variants | 4 | Trimmed/case-normalized |
| Date-order defects | 2 | Excluded from affected date-based KPIs and listed |
| Orphan company ID | 1 | Kept unmatched; not assigned to a company |
| Company-name mismatch | 2 | Resolved through stable company ID; source text retained |
| Invalid amount | 1 | Excluded from amount sums |
| Completed-date-on-open defect | 1 | Treated as open and flagged |
| SLA inconsistency | 1 | Recomputed from documented date rules |
| CRM companies unmatched to Operations | 3 | Reported as CRM-only |
| Unmapped Operations clients | 5 project references | Reported as Operations-only/unmatched |

## Matching and double-counting

Every dataset has a unique key. Cross-system views join through `client_mapping`, not by comparing CRM and Operations IDs or by fuzzy-joining display names at query time. Raw source IDs remain available for traceability. Combined client views aggregate each side before joining to reduce double-counting risk.

## Interpretation

A PASS means all known injected defects were detected and there were no unexpected findings in that validation run. It does **not** mean the synthetic source data is defect-free. The defects are deliberate test cases and are retained to demonstrate quality handling.

See `DATA_DICTIONARY.md`, `DATABASE.md` and `ASSUMPTIONS.md` for field and join details.
