import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { getPermissions } from '../middleware/authorize.js'
import { parseQuery } from '../middleware/validate.js'

export const calendarRouter = Router()

const MAX_DAYS = 62

const isRealDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

const calendarQuery = z
  .object({
    /** First and last day shown, as calendar dates in the viewer's time zone. */
    from: z.iso.date('Enter a valid date').refine(isRealDate, 'Enter a valid date'),
    to: z.iso.date('Enter a valid date').refine(isRealDate, 'Enter a valid date'),
    /** The viewer's `Date.getTimezoneOffset()` (minutes behind UTC), to place timed items on their days. */
    offset: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .refine((q) => q.to >= q.from, { message: 'to must not be before from', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < MAX_DAYS, {
    message: `Ask for at most ${MAX_DAYS} days`,
    path: ['to'],
  })

/**
 * The caller's own calendar between two days: calls and meetings they logged, tasks assigned to
 * them (due dates) and open deals they own (expected close). Each source needs its read
 * permission and is left out without it. Tasks and deals fall on a calendar day (`allDay`);
 * calls and meetings have a time.
 */
calendarRouter.get('/calendar', authenticate, async (req, res) => {
  const userId = req.auth!.userId
  const { from, to, offset } = parseQuery(calendarQuery, req.query)
  const can = await getPermissions(userId)

  // Timed items: from the start of `from` to the end of `to` where the viewer is.
  const start = new Date(Date.parse(from) + offset * 60_000)
  const end = new Date(Date.parse(to) + 86_400_000 + offset * 60_000)
  // Date-only items are stored as the end of that day, UTC, so compare them by calendar day.
  const dayStart = new Date(`${from}T00:00:00.000Z`)
  const dayEnd = new Date(`${to}T23:59:59.999Z`)

  const [activities, tasks, deals] = await Promise.all([
    can.has('activities:read')
      ? prisma.activity.findMany({
          where: {
            userId,
            type: { in: ['CALL', 'MEETING'] },
            occurredAt: { gte: start, lt: end },
          },
          select: {
            id: true,
            type: true,
            subject: true,
            occurredAt: true,
            contactId: true,
            dealId: true,
          },
        })
      : [],
    can.has('tasks:read')
      ? prisma.task.findMany({
          where: { assigneeId: userId, dueDate: { gte: dayStart, lte: dayEnd } },
          select: { id: true, title: true, dueDate: true, status: true, priority: true },
        })
      : [],
    can.has('deals:read')
      ? prisma.deal.findMany({
          where: { ownerId: userId, status: 'OPEN', expectedClose: { gte: dayStart, lte: dayEnd } },
          select: { id: true, title: true, expectedClose: true },
        })
      : [],
  ])

  const items = [
    ...activities.map((a) => ({
      id: a.id,
      kind: a.type as 'CALL' | 'MEETING',
      title: a.subject,
      at: a.occurredAt,
      allDay: false,
      contactId: a.contactId,
      dealId: a.dealId,
    })),
    ...tasks.map((t) => ({
      id: t.id,
      kind: 'TASK' as const,
      title: t.title,
      at: t.dueDate!,
      allDay: true,
      status: t.status,
      priority: t.priority,
    })),
    ...deals.map((d) => ({
      id: d.id,
      kind: 'DEAL' as const,
      title: d.title,
      at: d.expectedClose!,
      allDay: true,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))

  res.json({ items })
})
