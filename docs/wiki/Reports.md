# Reports

**Reports** in the sidebar (`/reports`) shows how sales are going, one calendar year at a time. It needs the
`reports:read` permission, which Managers and Admins have; everyone else gets "Access denied" and no sidebar link.

The **year** picker at the top offers the last six years and starts on this year. The choice is kept in the address
(`/reports?year=2025`) so a page can be shared or bookmarked.

## Monthly sales

One row per month: **deals won**, **revenue** (their total value), and the **average deal** size, with a total row. A
small bar shows each month against the best month of the year.

## Revenue

- Revenue per month, a **running total** for the year, and the **same month a year earlier**.
- The headline compares the year with the previous one (for example "+50% vs 2025"). If the previous year had no
  revenue there is nothing to compare with, and the page says so instead of showing a percentage.
- **By pipeline**: revenue and deals won in each pipeline, biggest first. Pipelines with no sales that year are left out.

## How it is counted

- Only deals with status **Won** count, in the month of their **closed** date. Open and lost deals never appear.
- Amounts are added up and shown as US dollars (see [[Dashboard]]). Months follow the server's calendar.
- The reports cover the whole team. Filtering by owner, pipeline or date range and exporting come with US-045.

## API

| Endpoint | Needs | Purpose |
| --- | --- | --- |
| `GET /reports/monthly-sales?year=` | `reports:read` | Twelve monthly rows (`dealsWon`, `revenue`, `averageDeal`) and year totals |
| `GET /reports/revenue?year=` | `reports:read` | Twelve monthly rows (`revenue`, `cumulative`, `previousYear`), totals with `changePercent`, and `byPipeline` |

`year` is 2000 to 2100 and defaults to the current year; anything else is a 400.
