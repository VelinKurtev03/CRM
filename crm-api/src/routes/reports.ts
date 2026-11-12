import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
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

const funnelQuery = z.object({
  /** Pipeline to report on; defaults to the default pipeline, else the first one. */
  pipelineId: z.string().min(1, 'Enter a valid pipeline').optional(),
})

const percent = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null)

/**
 * Sales Funnel: for one pipeline, how many deals are at each stage now and how many have got at
 * least that far (in this stage or a later one, lost deals excluded), with the share that made it
 * from the previous stage. The weakest step is flagged as the bottleneck. There is no stage
 * history, so this is a snapshot of where deals are today.
 */
reportsRouter.get(
  '/reports/funnel',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { pipelineId } = parseQuery(funnelQuery, req.query)
    const pipelines = await prisma.pipeline.findMany({
      select: { id: true, name: true, isDefault: true },
      orderBy: { name: 'asc' },
    })
    const chosen = pipelineId
      ? pipelines.find((p) => p.id === pipelineId)
      : (pipelines.find((p) => p.isDefault) ?? pipelines[0])
    if (pipelineId && !chosen) throw new HttpError(404, 'Pipeline not found')
    const options = pipelines.map(({ id, name }) => ({ id, name }))
    if (!chosen) {
      res.json({ pipelines: options, pipeline: null, stages: [], lost: { deals: 0, value: 0 } })
      return
    }

    const [stages, deals] = await Promise.all([
      prisma.stage.findMany({ where: { pipelineId: chosen.id }, orderBy: { position: 'asc' } }),
      prisma.deal.findMany({
        where: { pipelineId: chosen.id },
        select: { amount: true, status: true, stageId: true },
      }),
    ])
    const position = new Map(stages.map((s) => [s.id, s.position]))
    const lostIds = new Set(stages.filter((s) => s.isLost).map((s) => s.id))
    const isLost = (d: (typeof deals)[number]) => d.status === 'LOST' || lostIds.has(d.stageId)
    const live = deals.filter((d) => !isLost(d))
    const lostDeals = deals.filter(isLost)

    let previous: number | null = null
    const rows = stages
      .filter((s) => !s.isLost)
      .map((s) => {
        const here = live.filter((d) => d.stageId === s.id)
        const reached = live.filter((d) => position.get(d.stageId)! >= s.position).length
        const row = {
          stageId: s.id,
          name: s.name,
          isWon: s.isWon,
          deals: here.length,
          value: here.reduce((sum, d) => sum + money(d.amount), 0),
          reached,
          // Null for the first stage, or when nothing reached the stage before.
          conversionPercent: previous === null ? null : percent(reached, previous),
        }
        previous = reached
        return row
      })

    // The bottleneck is the step that loses the largest share, when anything is lost at all.
    const steps = rows.filter((r) => r.conversionPercent !== null && r.conversionPercent < 100)
    const worst = steps.reduce<(typeof rows)[number] | null>(
      (min, r) => (min === null || r.conversionPercent! < min.conversionPercent! ? r : min),
      null,
    )

    res.json({
      pipelines: options,
      pipeline: { id: chosen.id, name: chosen.name },
      stages: rows,
      lost: { deals: lostDeals.length, value: lostDeals.reduce((s, d) => s + money(d.amount), 0) },
      bottleneckStageId: worst?.stageId ?? null,
    })
  },
)

/**
 * Lead Conversion: of the leads created in a year, how many became deals, were lost or are still
 * open, in total, by month created and by source. A lead counts as converted once it has a deal.
 */
reportsRouter.get(
  '/reports/lead-conversion',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { year } = parseQuery(yearQuery, req.query)
    const leads = await prisma.lead.findMany({
      where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
      select: { createdAt: true, source: true, status: true, dealId: true },
    })
    const converted = (l: (typeof leads)[number]) => l.dealId !== null
    const summarise = (list: typeof leads) => {
      const won = list.filter(converted).length
      return { leads: list.length, converted: won, conversionPercent: percent(won, list.length) }
    }

    const months = Array.from({ length: 12 }, (_, m) => ({
      month: monthKey(year, m),
      ...summarise(leads.filter((l) => l.createdAt.getMonth() === m)),
    }))

    const sources = new Map<string, typeof leads>()
    for (const l of leads) {
      const key = l.source?.trim() || 'Unknown'
      sources.set(key, [...(sources.get(key) ?? []), l])
    }
    const bySource = [...sources]
      .map(([source, list]) => ({ source, ...summarise(list) }))
      .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source))

    const lost = leads.filter((l) => !converted(l) && l.status === 'LOST').length
    const total = summarise(leads)
    res.json({
      year,
      months,
      totals: { ...total, lost, open: total.leads - total.converted - lost },
      bySource,
    })
  },
)

/** Deals that closed (won or lost) in `year`, with the month they closed in. */
async function closedDeals(year: number, status: 'WON' | 'LOST') {
  return prisma.deal.findMany({
    where: { status, closedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    select: {
      id: true,
      title: true,
      amount: true,
      closedAt: true,
      createdAt: true,
      pipelineId: true,
      owner: { select: { firstName: true, lastName: true } },
    },
  })
}

/**
 * Win Rate: of the deals that closed in a year, the share that were won (won ÷ won + lost), in
 * total, by month and by pipeline. Open deals have no outcome yet, so they are left out.
 */
reportsRouter.get(
  '/reports/win-rate',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { year } = parseQuery(yearQuery, req.query)
    const [won, lost, pipelines] = await Promise.all([
      closedDeals(year, 'WON'),
      closedDeals(year, 'LOST'),
      prisma.pipeline.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    const row = (w: typeof won, l: typeof lost) => ({
      won: w.length,
      lost: l.length,
      // Null when nothing closed, so "no data" is not shown as 0%.
      winRatePercent: percent(w.length, w.length + l.length),
    })
    const months = Array.from({ length: 12 }, (_, m) => ({
      month: monthKey(year, m),
      ...row(
        won.filter((d) => d.closedAt!.getMonth() === m),
        lost.filter((d) => d.closedAt!.getMonth() === m),
      ),
    }))
    const byPipeline = pipelines
      .map((p) => ({
        pipelineId: p.id,
        name: p.name,
        ...row(
          won.filter((d) => d.pipelineId === p.id),
          lost.filter((d) => d.pipelineId === p.id),
        ),
      }))
      .filter((p) => p.won + p.lost > 0)
      .sort((a, b) => b.won + b.lost - (a.won + a.lost))
    res.json({ year, months, totals: row(won, lost), byPipeline })
  },
)

/**
 * Lost Deals: deals lost in a year with their total value, by month and pipeline, and the
 * biggest ones with how long they were open. (The CRM does not record a loss reason.)
 */
reportsRouter.get(
  '/reports/lost-deals',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { year } = parseQuery(yearQuery, req.query)
    const [lost, pipelines] = await Promise.all([
      closedDeals(year, 'LOST'),
      prisma.pipeline.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    const value = (list: typeof lost) => list.reduce((s, d) => s + money(d.amount), 0)
    const daysOpen = (d: (typeof lost)[number]) =>
      Math.max(0, Math.round((d.closedAt!.getTime() - d.createdAt.getTime()) / 86_400_000))
    const names = new Map(pipelines.map((p) => [p.id, p.name]))

    const months = Array.from({ length: 12 }, (_, m) => {
      const inMonth = lost.filter((d) => d.closedAt!.getMonth() === m)
      return { month: monthKey(year, m), deals: inMonth.length, value: value(inMonth) }
    })
    const byPipeline = pipelines
      .map((p) => {
        const mine = lost.filter((d) => d.pipelineId === p.id)
        return { pipelineId: p.id, name: p.name, deals: mine.length, value: value(mine) }
      })
      .filter((p) => p.deals > 0)
      .sort((a, b) => b.value - a.value)
    const biggest = [...lost]
      .sort((a, b) => money(b.amount) - money(a.amount))
      .slice(0, 10)
      .map((d) => ({
        id: d.id,
        title: d.title,
        amount: money(d.amount),
        pipeline: names.get(d.pipelineId) ?? '',
        owner: d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : null,
        closedAt: d.closedAt!.toISOString(),
        daysOpen: daysOpen(d),
      }))

    res.json({
      year,
      months,
      totals: {
        deals: lost.length,
        value: value(lost),
        averageDeal: lost.length ? value(lost) / lost.length : 0,
        averageDaysOpen: lost.length ? lost.reduce((s, d) => s + daysOpen(d), 0) / lost.length : 0,
      },
      byPipeline,
      biggest,
    })
  },
)

/**
 * Team Performance: one row per person for a year, so a manager can see who is closing, who is
 * working their pipeline and who is falling behind. Deals count in the month they closed, leads
 * and activities by the date they were created or logged. Open deals and tasks are today's
 * snapshot, not the year's. Tasks have no completion date, so "completed" counts done tasks last
 * updated in the year. People with nothing to show are left out.
 */
reportsRouter.get(
  '/reports/team-performance',
  authenticate,
  requirePermission('reports:read'),
  async (req, res) => {
    const { year } = parseQuery(yearQuery, req.query)
    const range = { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
    const now = new Date()
    const [users, closed, open, leads, activities, done, openTasks] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
      }),
      prisma.deal.findMany({
        where: { status: { in: ['WON', 'LOST'] }, closedAt: range, ownerId: { not: null } },
        select: { ownerId: true, status: true, amount: true },
      }),
      prisma.deal.findMany({
        where: { status: 'OPEN', ownerId: { not: null } },
        select: { ownerId: true, amount: true },
      }),
      prisma.lead.findMany({
        where: { createdAt: range, ownerId: { not: null } },
        select: { ownerId: true, dealId: true },
      }),
      prisma.activity.groupBy({ by: ['userId'], where: { occurredAt: range }, _count: true }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { status: 'DONE', updatedAt: range, assigneeId: { not: null } },
        _count: true,
      }),
      prisma.task.findMany({
        where: { status: { not: 'DONE' }, assigneeId: { not: null } },
        select: { assigneeId: true, dueDate: true },
      }),
    ])

    const members = users
      .map((u) => {
        const won = closed.filter((d) => d.ownerId === u.id && d.status === 'WON')
        const lost = closed.filter((d) => d.ownerId === u.id && d.status === 'LOST').length
        const mineOpen = open.filter((d) => d.ownerId === u.id)
        const myLeads = leads.filter((l) => l.ownerId === u.id)
        const mine = openTasks.filter((t) => t.assigneeId === u.id)
        return {
          userId: u.id,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role.name,
          dealsWon: won.length,
          dealsLost: lost,
          // Null when nothing closed, so "no data" is not shown as 0%.
          winRatePercent: percent(won.length, won.length + lost),
          revenue: won.reduce((s, d) => s + money(d.amount), 0),
          openDeals: mineOpen.length,
          openValue: mineOpen.reduce((s, d) => s + money(d.amount), 0),
          leads: myLeads.length,
          leadsConverted: myLeads.filter((l) => l.dealId !== null).length,
          activities: activities.find((a) => a.userId === u.id)?._count ?? 0,
          tasksCompleted: done.find((t) => t.assigneeId === u.id)?._count ?? 0,
          tasksOpen: mine.length,
          tasksOverdue: mine.filter((t) => t.dueDate !== null && t.dueDate < now).length,
        }
      })
      .filter(
        (m) =>
          m.dealsWon + m.dealsLost + m.openDeals + m.leads + m.activities + m.tasksCompleted > 0 ||
          m.tasksOpen > 0,
      )
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))

    const sum = (pick: (m: (typeof members)[number]) => number) =>
      members.reduce((s, m) => s + pick(m), 0)
    const dealsWon = sum((m) => m.dealsWon)
    const dealsLost = sum((m) => m.dealsLost)
    res.json({
      year,
      members,
      totals: {
        dealsWon,
        dealsLost,
        winRatePercent: percent(dealsWon, dealsWon + dealsLost),
        revenue: sum((m) => m.revenue),
        activities: sum((m) => m.activities),
        tasksCompleted: sum((m) => m.tasksCompleted),
        tasksOverdue: sum((m) => m.tasksOverdue),
      },
    })
  },
)
