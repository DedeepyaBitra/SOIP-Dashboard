# KPI definitions

Only metrics supported by the available synthetic fields are calculated. The dataset as-of date is **2026-10-31**.

## Common rules

1. Exclude duplicate leads (`L-0059`, `L-0060`) from clean CRM counts and sums.
2. Normalize status/date variants before aggregation.
3. Skip blank amounts and report missing values; do not silently treat blanks as zero.
4. Do not sum CRM `deal_value` and Operations `amount`; they represent different measures.
5. Join CRM to Operations only through `client_mapping`.
6. Use the documented as-of date for stale and overdue rules.

## Sales KPIs

| KPI | Definition | Limitation |
|---|---|---|
| Leads created | Distinct lead count by `created_date` period | Duplicates excluded |
| Lead distribution | Counts by source, stage, owner and region | Descriptive only |
| Open pipeline value | Sum of `deal_value` where status is Open | Blank deal values excluded and counted separately |
| Win rate | Won / (Won + Lost) among closed leads | Open leads excluded; small sample |
| Won value | Sum of `deal_value` where status is Won | Uses lead creation date as cohort because close date is unavailable |
| Stale leads | Open leads with activity older than 30 days before as-of date, or blank activity | Blank activity is identified separately |
| Year-over-year volume | Nov 2025–Oct 2026 lead count compared with Nov 2024–Oct 2025 | Full 24-month window required |

## Operations KPIs

| KPI | Definition | Limitation |
|---|---|---|
| Project volume | Project count by status and creation month | Descriptive |
| Open work | Not Started, In Progress or On Hold projects | Cancelled excluded |
| Overdue | Open project with `due_date` before as-of date | Date-order defects excluded and listed |
| Completed on time % | Completed projects with `completed_date <= due_date` divided by completed projects with valid completion dates | Missing completion dates excluded and reported |
| SLA breach rate | Breached / projects with an SLA result (excluding N/A) | Recompute inconsistent SLA using documented date rules |
| Workload | Project count and valid amount by service/team/client | Invalid negative amount excluded |

## Combined and target KPIs

| KPI | Definition | Limitation |
|---|---|---|
| Sales-to-operations client view | Per canonical client: lead count, won deal value, project count and project amount | Only matched clients are combined; unmatched groups remain visible |
| Target vs actual | Monthly target/forecast compared with Won deal value grouped by lead creation month | Targets are synthetic and not calibrated; won value is cohort-based, not close-date revenue |

## Unsupported metrics

The source fields do not support reliable stage-to-stage conversion, sales-cycle length/velocity, revenue recognition, margin/profitability or predictive forecasts. These should not be presented as measured KPIs without additional data and agreed definitions.
