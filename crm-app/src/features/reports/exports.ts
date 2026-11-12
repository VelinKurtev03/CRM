import type {
  FunnelReport,
  LeadConversionReport,
  LostDealsReport,
  MonthlySales,
  RevenueReport,
  TeamPerformanceReport,
  WinRateReport,
} from '@/services/reports'
import type { CsvCell } from '@/utils/csv'

/** Rows for each report's CSV: a title and the filters used, a blank line, then the tables. */
type Rows = CsvCell[][]

const month = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
}
const round = (n: number | null) => (n === null ? '' : Math.round(n * 10) / 10)
const head = (title: string, filters: string): Rows => [[title], ['Filters', filters], []]

export const monthlySalesRows = (d: MonthlySales, filters: string): Rows => [
  ...head('Monthly sales', filters),
  ['Month', 'Deals won', 'Revenue', 'Average deal'],
  ...d.months.map((m) => [month(m.month), m.dealsWon, m.revenue, m.averageDeal]),
  ['Total', d.totals.dealsWon, d.totals.revenue, d.totals.averageDeal],
]

export const revenueRows = (d: RevenueReport, filters: string): Rows => [
  ...head('Revenue', filters),
  ['Month', 'Revenue', 'Running total', 'Previous year'],
  ...d.months.map((m) => [month(m.month), m.revenue, m.cumulative, m.previousYear]),
  ['Total', d.totals.revenue, '', d.totals.previousYear],
  ['Change on previous year (%)', round(d.totals.changePercent)],
  [],
  ['Pipeline', 'Deals won', 'Revenue'],
  ...d.byPipeline.map((p) => [p.name, p.deals, p.revenue]),
]

export const funnelRows = (d: FunnelReport, filters: string): Rows => [
  ...head(`Sales funnel${d.pipeline ? ` – ${d.pipeline.name}` : ''}`, filters),
  ['Stage', 'Deals now', 'Value', 'Reached this stage', 'Moved on from previous (%)'],
  ...d.stages.map((s) => [s.name, s.deals, s.value, s.reached, round(s.conversionPercent)]),
  ['Lost', d.lost.deals, d.lost.value],
]

export const leadConversionRows = (d: LeadConversionReport, filters: string): Rows => [
  ...head('Lead conversion', filters),
  [
    'Leads',
    d.totals.leads,
    'Converted',
    d.totals.converted,
    'Lost',
    d.totals.lost,
    'Open',
    d.totals.open,
  ],
  [],
  ['Month created', 'Leads', 'Converted', 'Conversion (%)'],
  ...d.months.map((m) => [month(m.month), m.leads, m.converted, round(m.conversionPercent)]),
  [],
  ['Source', 'Leads', 'Converted', 'Conversion (%)'],
  ...d.bySource.map((s) => [s.source, s.leads, s.converted, round(s.conversionPercent)]),
]

export const winRateRows = (d: WinRateReport, filters: string): Rows => [
  ...head('Win rate', filters),
  ['Month', 'Won', 'Lost', 'Win rate (%)'],
  ...d.months.map((m) => [month(m.month), m.won, m.lost, round(m.winRatePercent)]),
  ['Total', d.totals.won, d.totals.lost, round(d.totals.winRatePercent)],
  [],
  ['Pipeline', 'Won', 'Lost', 'Win rate (%)'],
  ...d.byPipeline.map((p) => [p.name, p.won, p.lost, round(p.winRatePercent)]),
]

export const lostDealsRows = (d: LostDealsReport, filters: string): Rows => [
  ...head('Lost deals', filters),
  ['Month', 'Deals lost', 'Value'],
  ...d.months.map((m) => [month(m.month), m.deals, m.value]),
  ['Total', d.totals.deals, d.totals.value],
  ['Average days open', round(d.totals.averageDaysOpen)],
  [],
  ['Pipeline', 'Deals lost', 'Value'],
  ...d.byPipeline.map((p) => [p.name, p.deals, p.value]),
  [],
  ['Biggest lost deals', 'Pipeline', 'Owner', 'Closed', 'Days open', 'Value'],
  ...d.biggest.map((b) => [
    b.title,
    b.pipeline,
    b.owner ?? 'Unassigned',
    b.closedAt.slice(0, 10),
    b.daysOpen,
    b.amount,
  ]),
]

export const teamPerformanceRows = (d: TeamPerformanceReport, filters: string): Rows => [
  ...head('Team performance', filters),
  [
    'Person',
    'Role',
    'Deals won',
    'Deals lost',
    'Win rate (%)',
    'Revenue',
    'Open deals (now)',
    'Open value (now)',
    'Leads',
    'Leads converted',
    'Activities',
    'Tasks done',
    'Open tasks (now)',
    'Overdue tasks (now)',
  ],
  ...d.members.map((m) => [
    m.name,
    m.role,
    m.dealsWon,
    m.dealsLost,
    round(m.winRatePercent),
    m.revenue,
    m.openDeals,
    m.openValue,
    m.leads,
    m.leadsConverted,
    m.activities,
    m.tasksCompleted,
    m.tasksOpen,
    m.tasksOverdue,
  ]),
  [
    'Team',
    '',
    d.totals.dealsWon,
    d.totals.dealsLost,
    round(d.totals.winRatePercent),
    d.totals.revenue,
    '',
    '',
    '',
    '',
    d.totals.activities,
    d.totals.tasksCompleted,
    '',
    d.totals.tasksOverdue,
  ],
]
