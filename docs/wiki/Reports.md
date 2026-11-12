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

## Sales funnel

For one pipeline (the default pipeline until you pick another with the **Pipeline** menu, kept in the address as
`?pipeline=`), one row per stage:

- **Deals now** and their **value**: open and won deals sitting in the stage today.
- **Reached**: deals in this stage or any later one. Lost deals are never counted.
- **From previous**: reached divided by the previous stage's reached. The first stage has none.
- The step with the lowest share is marked **Bottleneck** (only when some step loses deals). **Lost** deals, by status or
  in a lost stage, are totalled in the last row.

The funnel is a snapshot of where deals are today. The CRM does not keep stage history, so a deal that skipped a stage
still counts as having reached it.

## Lead conversion

For the leads **created** in the chosen year: the number that became deals (a lead is converted once it has a deal), how
many were lost, how many are still open, and the conversion rate. A table by month created and one by source (leads with
no source are "Unknown") show where leads convert best. With no leads the rate is blank, not 0%.

## Win rate

Of the deals that **closed** in the year, the share that were **won**: won ÷ (won + lost). Shown for the year, each
month and each pipeline (pipelines with no closed deals are left out). Months with nothing closed show "—", not 0%.
Open deals have no outcome yet and are not counted.

## Lost deals

Deals with status **Lost**, in the month they closed: the number and value lost per month and per pipeline, the average
days a lost deal had been open (created to closed), and the **ten biggest** with pipeline, owner (or Unassigned) and days
open. The CRM does not record a reason for losing a deal, so there is no breakdown by reason.

## How it is counted

- Monthly sales and Revenue count only deals with status **Won**, in the month of their **closed** date. Open and lost deals never appear.
- Amounts are added up and shown as US dollars (see [[Dashboard]]). Months follow the server's calendar.
- The reports cover the whole team. Filtering by owner, pipeline or date range and exporting come with US-045.

## API

| Endpoint | Needs | Purpose |
| --- | --- | --- |
| `GET /reports/monthly-sales?year=` | `reports:read` | Twelve monthly rows (`dealsWon`, `revenue`, `averageDeal`) and year totals |
| `GET /reports/revenue?year=` | `reports:read` | Twelve monthly rows (`revenue`, `cumulative`, `previousYear`), totals with `changePercent`, and `byPipeline` |

| `GET /reports/funnel?pipelineId=` | `reports:read` | Stages with `deals`, `value`, `reached`, `conversionPercent`, the `lost` totals and `bottleneckStageId`; 404 for an unknown pipeline |
| `GET /reports/lead-conversion?year=` | `reports:read` | Twelve monthly rows, `totals` (leads, converted, lost, open, rate) and `bySource` |

| `GET /reports/win-rate?year=` | `reports:read` | Monthly `won`, `lost`, `winRatePercent`, totals and `byPipeline` |
| `GET /reports/lost-deals?year=` | `reports:read` | Totals (count, value, average, average days open), `months`, `byPipeline` and the ten `biggest` |

`year` is 2000 to 2100 and defaults to the current year; anything else is a 400.
