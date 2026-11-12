import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { REMINDER_MINUTES } from '../lib/task-reminders.js'
import { prisma } from '../lib/prisma.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

export const tasksRouter = Router()

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

/** A calendar date from a date input; tasks are due at the end of that day (UTC). */
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999Z`)

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
  description: z
    .string()
    .trim()
    .max(5000, 'Keep it under 5000 characters')
    .optional()
    .transform((v) => v || undefined),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  dueDate: z.iso.date('Enter a valid date').optional(),
  /** Minutes before the due date to remind the assignee; needs a due date. */
  reminderMinutes: z
    .number()
    .refine((v) => (REMINDER_MINUTES as readonly number[]).includes(v), 'Choose a reminder time')
    .optional(),
  /** Defaults to the person creating the task. */
  assigneeId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
})

const createTaskChecked = createTaskSchema.refine(
  (v) => v.reminderMinutes === undefined || v.dueDate,
  {
    message: 'Set a due date to get a reminder',
    path: ['reminderMinutes'],
  },
)

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  reminderMinutes: true,
  assigneeId: true,
  creatorId: true,
  contactId: true,
  dealId: true,
  createdAt: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
} as const

const listQuery = z.object({
  /** A user id, `me` for the caller, or `none` for tasks nobody has. */
  assignee: z.string().trim().min(1).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** Tasks, soonest due first (no due date last), filtered by assignee, status and priority. */
tasksRouter.get('/tasks', requirePermission('tasks:read'), async (req, res) => {
  const { assignee, status, priority, page, pageSize } = parseQuery(listQuery, req.query)
  const where = {
    ...(assignee
      ? { assigneeId: assignee === 'me' ? req.auth!.userId : assignee === 'none' ? null : assignee }
      : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  }
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: taskSelect,
    }),
  ])
  res.json({ tasks, total, page, pageSize })
})

/** Active users, for the assignee choice on the form and the list's filter. */
tasksRouter.get('/tasks/assignees', requirePermission('tasks:read'), async (_req, res) => {
  const assignees = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  })
  res.json({ assignees })
})

tasksRouter.post(
  '/tasks',
  requirePermission('tasks:write'),
  validateBody(createTaskChecked),
  async (req, res) => {
    const userId = req.auth!.userId
    const {
      dueDate,
      assigneeId = userId,
      contactId,
      dealId,
      ...rest
    } = req.body as z.infer<typeof createTaskSchema>

    if (assigneeId !== userId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { isActive: true },
      })
      if (!assignee?.isActive) {
        throw new HttpError(400, 'Choose an active user', {
          assigneeId: 'Choose an active user',
        })
      }
    }

    // A task can be linked to a record you may look at, and it has to exist.
    const can = await getPermissions(userId)
    if (contactId) {
      if (!can.has('contacts:read')) throw new HttpError(403, 'You do not have permission')
      if (!(await prisma.contact.count({ where: { id: contactId } }))) {
        throw new HttpError(404, 'Contact not found')
      }
    }
    if (dealId) {
      if (!can.has('deals:read')) throw new HttpError(403, 'You do not have permission')
      if (!(await prisma.deal.count({ where: { id: dealId } }))) {
        throw new HttpError(404, 'Deal not found')
      }
    }

    const task = await prisma.task.create({
      data: {
        ...rest,
        dueDate: dueDate ? endOfDay(dueDate) : undefined,
        assigneeId,
        creatorId: userId,
        contactId,
        dealId,
      },
      select: taskSelect,
    })
    res.status(201).json({ task })
  },
)
