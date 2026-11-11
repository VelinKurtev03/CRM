import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

export const activitiesRouter = Router()

const ACTIVITY_TYPES = ['CALL', 'MEETING', 'EMAIL', 'SMS', 'NOTE'] as const

/** An activity is logged against a contact, a deal, or both. `occurredAt` defaults to now. */
const logActivitySchema = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    subject: z
      .string()
      .trim()
      .min(1, 'Subject is required')
      .max(200, 'Keep it under 200 characters'),
    description: z
      .string()
      .trim()
      .max(5000, 'Keep it under 5000 characters')
      .optional()
      .transform((v) => v || undefined),
    occurredAt: z.coerce.date().optional(),
    contactId: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
  })
  .refine((v) => v.contactId !== undefined || v.dealId !== undefined, {
    message: 'Give a contactId or a dealId',
    path: ['_'],
  })

const activitySelect = {
  id: true,
  type: true,
  subject: true,
  description: true,
  occurredAt: true,
  contactId: true,
  dealId: true,
  user: { select: { id: true, firstName: true, lastName: true } },
} as const

activitiesRouter.post(
  '/activities',
  requirePermission('activities:write'),
  validateBody(logActivitySchema),
  async (req, res) => {
    const userId = req.auth!.userId
    const { contactId, dealId, occurredAt, ...rest } = req.body as z.infer<typeof logActivitySchema>
    if (occurredAt && occurredAt.getTime() > Date.now() + 60_000) {
      throw new HttpError(400, 'An activity cannot be logged in the future')
    }

    // You can log against a record you may look at, and it has to exist.
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

    const activity = await prisma.activity.create({
      data: { ...rest, occurredAt, userId, contactId, dealId },
      select: activitySelect,
    })
    res.status(201).json({ activity })
  },
)

/** Activities on a deal, newest first (the first 50). */
activitiesRouter.get(
  '/deals/:id/activities',
  requirePermission('deals:read', 'activities:read'),
  async (req, res) => {
    const dealId = req.params.id as string
    if (!(await prisma.deal.count({ where: { id: dealId } }))) {
      throw new HttpError(404, 'Deal not found')
    }
    const where = { dealId }
    const [total, items] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: 50,
        select: activitySelect,
      }),
    ])
    res.json({ total, items })
  },
)
