import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { getPermissions } from '../middleware/authorize.js'
import { HttpError } from '../lib/http-error.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

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
 * them (due dates), their own events and open deals they own (expected close). Each source needs its read
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

  const [activities, tasks, deals, events] = await Promise.all([
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
    // Your own events need no permission. All-day ones are stored as that day, UTC.
    prisma.calendarEvent.findMany({
      where: {
        userId,
        OR: [
          { allDay: false, startsAt: { gte: start, lt: end } },
          { allDay: true, startsAt: { gte: dayStart, lte: dayEnd } },
        ],
      },
      select: { id: true, title: true, location: true, startsAt: true, endsAt: true, allDay: true },
    }),
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
    ...events.map((e) => ({
      id: e.id,
      kind: 'EVENT' as const,
      title: e.title,
      at: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      location: e.location,
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

// ───────── Events ─────────

const instant = z.iso.datetime({ offset: true })

/** Either a timed event (`startsAt`, optional `endsAt` instants) or an all-day one (`startsAt` is a date). */
const scheduleShape = {
  allDay: z.boolean().default(false),
  startsAt: z.string(),
  endsAt: z.string().optional(),
}

function checkSchedule(
  v: { allDay: boolean; startsAt: string; endsAt?: string },
  ctx: z.RefinementCtx,
) {
  const bad = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message })
  if (v.allDay) {
    if (!isRealDate(v.startsAt) || !z.iso.date().safeParse(v.startsAt).success) {
      bad('startsAt', 'Enter a valid date')
    }
    if (v.endsAt) bad('endsAt', 'An all-day event has no end time')
    return
  }
  if (!instant.safeParse(v.startsAt).success) bad('startsAt', 'Enter a valid date and time')
  if (v.endsAt) {
    if (!instant.safeParse(v.endsAt).success) bad('endsAt', 'Enter a valid date and time')
    else if (Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
      bad('endsAt', 'The end must be after the start')
    }
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .optional()
    .transform((v) => v || undefined)

const createEventSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
    description: optionalText(5000),
    location: optionalText(200),
    ...scheduleShape,
  })
  .superRefine(checkSchedule)
const rescheduleSchema = z.object(scheduleShape).superRefine(checkSchedule)

type Schedule = { allDay: boolean; startsAt: string; endsAt?: string }
/** Stored times: an all-day event is its day in UTC; a timed one lasts an hour unless it says otherwise. */
function times(v: Schedule) {
  if (v.allDay) {
    return {
      allDay: true,
      startsAt: new Date(`${v.startsAt}T00:00:00.000Z`),
      endsAt: new Date(`${v.startsAt}T23:59:59.999Z`),
    }
  }
  const startsAt = new Date(v.startsAt)
  return {
    allDay: false,
    startsAt,
    endsAt: v.endsAt ? new Date(v.endsAt) : new Date(startsAt.getTime() + 3_600_000),
  }
}

const eventSelect = {
  id: true,
  title: true,
  description: true,
  location: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
} as const

/** Add an event to your own calendar. */
calendarRouter.post(
  '/calendar/events',
  authenticate,
  validateBody(createEventSchema),
  async (req, res) => {
    const { title, description, location, ...schedule } = req.body as z.infer<
      typeof createEventSchema
    >
    const event = await prisma.calendarEvent.create({
      data: { title, description, location, ...times(schedule), userId: req.auth!.userId },
      select: eventSelect,
    })
    res.status(201).json({ event })
  },
)

/** Move one of your events to another day or time. */
calendarRouter.patch(
  '/calendar/events/:id',
  authenticate,
  validateBody(rescheduleSchema),
  async (req, res) => {
    const id = String(req.params.id)
    const own = await prisma.calendarEvent.count({ where: { id, userId: req.auth!.userId } })
    if (!own) throw new HttpError(404, 'Event not found')
    const event = await prisma.calendarEvent.update({
      where: { id },
      data: times(req.body as Schedule),
      select: eventSelect,
    })
    res.json({ event })
  },
)
