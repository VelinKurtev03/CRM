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
