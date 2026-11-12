import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/authorize.js'
import { parseQuery } from '../middleware/validate.js'

export const reportsRouter = Router()

const money = (v: { toString(): string } | null | undefined) => Number(v ?? 0)
const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`

const yearQuery = z.object({
  /** Calendar year to report on; defaults to the current one. */
  year: z.coerce
    .number('Enter a valid year')
    .int('Enter a valid year')
    .min(2000, 'Enter a valid year')
    .max(2100, 'Enter a valid year')
    .default(() => new Date().getFullYear()),
})

/** Won deals closed in `year` and the year before it, each with the month index it closed in. */
async function wonDeals(year: number) {
  const deals = await prisma.deal.findMany({
    where: {
      status: 'WON',
      closedAt: { gte: new Date(year - 1, 0, 1), lt: new Date(year + 1, 0, 1) },
    },
    select: { amount: true, closedAt: true, pipelineId: true },
  })
  return deals.map((d) => ({
    amount: money(d.amount),
    year: d.closedAt!.getFullYear(),
    month: d.closedAt!.getMonth(),
    pipelineId: d.pipelineId,
  }))
}

/**
 * Monthly Sales: for each month of the year, how many deals were won, their total value and the
 * average deal size. Months follow the same (server) calendar as the dashboard figures.
 */
reportsRouter.get(
  '/reports/monthly-sales',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { year } = parseQuery(yearQuery, req.query)
    const won = (await wonDeals(year)).filter((d) => d.year === year)

    const months = Array.from({ length: 12 }, (_, m) => {
      const inMonth = won.filter((d) => d.month === m)
      const revenue = inMonth.reduce((sum, d) => sum + d.amount, 0)
      return {
        month: monthKey(year, m),
        dealsWon: inMonth.length,
        revenue,
        averageDeal: inMonth.length ? revenue / inMonth.length : 0,
      }
    })
    const revenue = months.reduce((sum, m) => sum + m.revenue, 0)
    res.json({
      year,
      months,
      totals: {
        dealsWon: won.length,
        revenue,
        averageDeal: won.length ? revenue / won.length : 0,
      },
    })
  },
)

/**
 * Revenue: won revenue per month with a running total and the same month a year earlier, the
 * year's change against the previous year, and the revenue split by pipeline.
 */
reportsRouter.get(
  '/reports/revenue',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { year } = parseQuery(yearQuery, req.query)
    const all = await wonDeals(year)
    const sum = (list: typeof all) => list.reduce((s, d) => s + d.amount, 0)
    const current = all.filter((d) => d.year === year)
    const previous = all.filter((d) => d.year === year - 1)

    let cumulative = 0
    const months = Array.from({ length: 12 }, (_, m) => {
      const revenue = sum(current.filter((d) => d.month === m))
      cumulative += revenue
      return {
        month: monthKey(year, m),
        revenue,
        cumulative,
        previousYear: sum(previous.filter((d) => d.month === m)),
      }
    })

    const revenue = sum(current)
    const previousYear = sum(previous)

    const pipelines = await prisma.pipeline.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    const byPipeline = pipelines
      .map((p) => ({
        pipelineId: p.id,
        name: p.name,
        revenue: sum(current.filter((d) => d.pipelineId === p.id)),
        deals: current.filter((d) => d.pipelineId === p.id).length,
      }))
      .filter((p) => p.deals > 0)
      .sort((a, b) => b.revenue - a.revenue)

    res.json({
      year,
      months,
      totals: {
        revenue,
        previousYear,
        // Null when last year had nothing to compare with.
        changePercent: previousYear > 0 ? ((revenue - previousYear) / previousYear) * 100 : null,
      },
      byPipeline,
    })
  },
)
