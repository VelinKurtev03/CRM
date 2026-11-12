import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

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
  /** Defaults to the person creating the task. */
  assigneeId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
})

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  assigneeId: true,
  creatorId: true,
  contactId: true,
  dealId: true,
  createdAt: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
} as const

/** Active users a task can be given to, for the assignee choice on the form. */
tasksRouter.get('/tasks/assignees', requirePermission('tasks:write'), async (_req, res) => {
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
  validateBody(createTaskSchema),
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
