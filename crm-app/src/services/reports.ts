import { api } from '@/api/client'

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
export const getMonthlySales = (year: number) =>
  api.get<MonthlySales>('/reports/monthly-sales', { params: { year } }).then((r) => r.data)

export const getRevenueReport = (year: number) =>
  api.get<RevenueReport>('/reports/revenue', { params: { year } }).then((r) => r.data)

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
export const getFunnelReport = (pipelineId?: string) =>
  api
    .get<FunnelReport>('/reports/funnel', { params: pipelineId ? { pipelineId } : {} })
    .then((r) => r.data)

export const getLeadConversion = (year: number) =>
  api
    .get<LeadConversionReport>('/reports/lead-conversion', { params: { year } })
    .then((r) => r.data)
