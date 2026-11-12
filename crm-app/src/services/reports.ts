import { api } from '@/api/client'

/** What every report can be narrowed by. Dates are YYYY-MM-DD and sit inside `year`. */
export type ReportFilters = {
  year: number
  from?: string
  to?: string
  ownerId?: string
  pipelineId?: string
}

/** Drops empty filters so they are not sent as blank query values. */
const cleanFilters = (f: ReportFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''))

export type FilterOptions = {
  owners: { id: string; name: string }[]
  pipelines: { id: string; name: string }[]
}
export const getFilterOptions = () =>
  api.get<FilterOptions>('/reports/filter-options').then((r) => r.data)

export type MonthlySalesRow = {
  month: string
  dealsWon: number
  revenue: number
  averageDeal: number
}
export type MonthlySales = {
  year: number
  months: MonthlySalesRow[]
  totals: { dealsWon: number; revenue: number; averageDeal: number }
}

export type RevenueRow = {
  month: string
  revenue: number
  cumulative: number
  previousYear: number
}
export type RevenueReport = {
  year: number
  months: RevenueRow[]
  /** `changePercent` is null when the previous year had no revenue to compare with. */
  totals: { revenue: number; previousYear: number; changePercent: number | null }
  byPipeline: { pipelineId: string; name: string; revenue: number; deals: number }[]
}

/** Both need `reports:read`. */
export const getMonthlySales = (filters: ReportFilters) =>
  api
    .get<MonthlySales>('/reports/monthly-sales', { params: cleanFilters(filters) })
    .then((r) => r.data)

export const getRevenueReport = (filters: ReportFilters) =>
  api.get<RevenueReport>('/reports/revenue', { params: cleanFilters(filters) }).then((r) => r.data)

export type FunnelStage = {
  stageId: string
  name: string
  isWon: boolean
  /** Open and won deals sitting in this stage now. */
  deals: number
  value: number
  /** Deals that are in this stage or a later one (lost deals excluded). */
  reached: number
  /** Share of the previous stage's `reached`; null for the first stage or when nothing reached it. */
  conversionPercent: number | null
}
export type FunnelReport = {
  pipelines: { id: string; name: string }[]
  pipeline: { id: string; name: string } | null
  stages: FunnelStage[]
  lost: { deals: number; value: number }
  bottleneckStageId: string | null
}

export type ConversionRow = { leads: number; converted: number; conversionPercent: number | null }
export type LeadConversionReport = {
  year: number
  months: (ConversionRow & { month: string })[]
  totals: ConversionRow & { lost: number; open: number }
  bySource: (ConversionRow & { source: string })[]
}

/** Both need `reports:read`. Without a pipeline the default one is used. */
export const getFunnelReport = (pipelineId?: string, ownerId?: string) =>
  api
    .get<FunnelReport>('/reports/funnel', {
      params: { ...(pipelineId && { pipelineId }), ...(ownerId && { ownerId }) },
    })
    .then((r) => r.data)

export const getLeadConversion = (filters: ReportFilters) =>
  api
    .get<LeadConversionReport>('/reports/lead-conversion', { params: cleanFilters(filters) })
    .then((r) => r.data)

export type WinRateRow = { won: number; lost: number; winRatePercent: number | null }
export type WinRateReport = {
  year: number
  months: (WinRateRow & { month: string })[]
  totals: WinRateRow
  byPipeline: (WinRateRow & { pipelineId: string; name: string })[]
}

export type LostDeal = {
  id: string
  title: string
  amount: number
  pipeline: string
  owner: string | null
  closedAt: string
  daysOpen: number
}
export type LostDealsReport = {
  year: number
  months: { month: string; deals: number; value: number }[]
  totals: { deals: number; value: number; averageDeal: number; averageDaysOpen: number }
  byPipeline: { pipelineId: string; name: string; deals: number; value: number }[]
  /** The ten biggest, largest first. */
  biggest: LostDeal[]
}

/** Both need `reports:read`. */
export const getWinRate = (filters: ReportFilters) =>
  api.get<WinRateReport>('/reports/win-rate', { params: cleanFilters(filters) }).then((r) => r.data)

export const getLostDeals = (filters: ReportFilters) =>
  api
    .get<LostDealsReport>('/reports/lost-deals', { params: cleanFilters(filters) })
    .then((r) => r.data)

export type TeamMember = {
  userId: string
  name: string
  role: string
  dealsWon: number
  dealsLost: number
  /** Null when the person closed no deals in the year. */
  winRatePercent: number | null
  revenue: number
  /** Today's open deals, not limited to the year. */
  openDeals: number
  openValue: number
  leads: number
  leadsConverted: number
  activities: number
  tasksCompleted: number
  tasksOpen: number
  tasksOverdue: number
}
export type TeamPerformanceReport = {
  year: number
  /** Highest revenue first. */
  members: TeamMember[]
  totals: {
    dealsWon: number
    dealsLost: number
    winRatePercent: number | null
    revenue: number
    activities: number
    tasksCompleted: number
    tasksOverdue: number
  }
}

/** Needs `reports:read`. */
export const getTeamPerformance = (filters: ReportFilters) =>
  api
    .get<TeamPerformanceReport>('/reports/team-performance', { params: cleanFilters(filters) })
    .then((r) => r.data)
