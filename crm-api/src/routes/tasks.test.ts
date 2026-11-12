import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'
import { sendDueReminders } from '../lib/task-reminders.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `tk-sales-${stamp}@crm.local`,
  colleague: `tk-colleague-${stamp}@crm.local`,
  inactive: `tk-inactive-${stamp}@crm.local`,
  none: `tk-none-${stamp}@crm.local`, // a role with no permissions
  limited: `tk-limited-${stamp}@crm.local`, // may write tasks, but not read contacts or deals
  support: `tk-support-${stamp}@crm.local`,
}
const tokens = { sales: '', support: '', none: '', limited: '' }
const ids = { sales: '', colleague: '', inactive: '' }
let contactId = ''
let dealId = ''
let pipelineId = ''

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const create = (who: Who, body: object) => request(app).post('/api/tasks').set(as(who)).send(body)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role, isActive] of [
    ['sales', 'SALES', true],
    ['colleague', 'SALES', true],
    ['inactive', 'SALES', false],
    ['support', 'SUPPORT', true],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Tk',
        isActive,
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key in ids) ids[key as keyof typeof ids] = u.id
    if (key in tokens) {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: emails[key], password })
      tokens[key as Who] = login.body.token
    }
  }
  // Private roles, so no shared role or permission is touched.
  for (const [key, keys] of [
    ['none', []],
    ['limited', ['tasks:write']],
  ] as const) {
    const role = await prisma.role.create({
      data: {
        name: `tk-${stamp}-${key}`,
        permissions: {
          create: keys.map((k) => ({ permission: { connect: { key: k } } })),
        },
      },
    })
    await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Tk',
        roleId: role.id,
      },
    })
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
  contactId = (await prisma.contact.create({ data: { firstName: 'T', lastName: `Tk${stamp}` } })).id
  const pipeline = await prisma.pipeline.create({
    data: { name: `tk-${stamp}`, stages: { create: { name: 'S', position: 1 } } },
    include: { stages: true },
  })
  pipelineId = pipeline.id
  dealId = (
    await prisma.deal.create({
      data: {
        title: `tk-${stamp}-deal`,
        pipelineId,
        stageId: pipeline.stages[0]!.id,
        ownerId: ids.sales,
      },
    })
  ).id
})

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: Object.values(ids) } } })
  await prisma.task.deleteMany({ where: { title: { startsWith: `tk-${stamp}` } } })
  await prisma.deal.deleteMany({ where: { id: dealId } })
  await prisma.pipeline.deleteMany({ where: { id: pipelineId } })
  await prisma.contact.deleteMany({ where: { id: contactId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.role.deleteMany({ where: { name: { startsWith: `tk-${stamp}` } } })
  await prisma.$disconnect()
})

describe('POST /api/tasks', () => {
  it('requires login', async () => {
    expect((await request(app).post('/api/tasks').send({ title: 'x' })).status).toBe(401)
    expect((await request(app).get('/api/tasks/assignees')).status).toBe(401)
  })

  it('creates a task with the defaults: to do, medium, assigned to me, no due date', async () => {
    const res = await create('sales', { title: `tk-${stamp}-defaults` })
    expect(res.status).toBe(201)
    expect(res.body.task).toMatchObject({
      status: 'TODO',
      priority: 'MEDIUM',
      assigneeId: ids.sales,
      creatorId: ids.sales,
      dueDate: null,
      assignee: { id: ids.sales },
    })
  })

  it('creates a task with assignee, due date, priority, status and links', async () => {
    const res = await create('sales', {
      title: `tk-${stamp}-full`,
      description: '  Send the quote  ',
      assigneeId: ids.colleague,
      dueDate: '2027-01-31',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      contactId,
      dealId,
    })
    expect(res.status).toBe(201)
    expect(res.body.task).toMatchObject({
      description: 'Send the quote',
      assigneeId: ids.colleague,
      creatorId: ids.sales,
      dueDate: '2027-01-31T23:59:59.999Z',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      contactId,
      dealId,
    })
  })

  it('validates input with field errors', async () => {
    const res = await create('sales', {
      title: '  ',
      dueDate: '31/12/2026',
      priority: 'URGENT',
      status: 'STUCK',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toMatchObject({
      title: 'Title is required',
      dueDate: 'Enter a valid date',
    })
    expect(res.body.error.details).toHaveProperty('priority')
    expect(res.body.error.details).toHaveProperty('status')
  })

  it('does not assign to an inactive or unknown user', async () => {
    for (const assigneeId of [ids.inactive, 'nobody']) {
      const res = await create('sales', { title: `tk-${stamp}-bad`, assigneeId })
      expect(res.status).toBe(400)
      expect(res.body.error.details).toMatchObject({ assigneeId: 'Choose an active user' })
    }
  })

  it('needs linked records to exist, and to be readable by the creator', async () => {
    expect((await create('sales', { title: `tk-${stamp}-x`, contactId: 'nope' })).status).toBe(404)
    expect((await create('sales', { title: `tk-${stamp}-x`, dealId: 'nope' })).status).toBe(404)
  })

  it('forbids people without tasks:write', async () => {
    expect((await create('none', { title: `tk-${stamp}-x` })).status).toBe(403)
    expect((await request(app).get('/api/tasks/assignees').set(as('none'))).status).toBe(403)
  })

  it('forbids linking a record the creator may not read', async () => {
    expect((await create('limited', { title: `tk-${stamp}-x`, contactId })).status).toBe(403)
    expect((await create('limited', { title: `tk-${stamp}-x`, dealId })).status).toBe(403)
    expect((await create('limited', { title: `tk-${stamp}-ok` })).status).toBe(201)
  })

  it('lets support (tasks:write) create tasks', async () => {
    expect((await create('support', { title: `tk-${stamp}-support` })).status).toBe(201)
  })
})

describe('GET /api/tasks/assignees', () => {
  it('lists active users only', async () => {
    const res = await request(app).get('/api/tasks/assignees').set(as('sales'))
    expect(res.status).toBe(200)
    const found = res.body.assignees.map((a: { id: string }) => a.id)
    expect(found).toContain(ids.colleague)
    expect(found).not.toContain(ids.inactive)
  })
})

describe('task reminders', () => {
  const HOUR = 3_600_000
  const now = new Date()
  const task = (name: string, data: object) =>
    prisma.task.create({
      data: { title: `tk-${stamp}-${name}`, creatorId: ids.sales, assigneeId: ids.sales, ...data },
    })
  const reminders = () =>
    prisma.notification.findMany({ where: { userId: ids.sales, type: 'TASK_REMINDER' } })

  it('saves a reminder with a due date', async () => {
    const res = await create('sales', {
      title: `tk-${stamp}-remind`,
      dueDate: '2030-01-31',
      reminderMinutes: 1440,
    })
    expect(res.status).toBe(201)
    expect(res.body.task.reminderMinutes).toBe(1440)
  })

  it('has no reminder unless asked for', async () => {
    const res = await create('sales', { title: `tk-${stamp}-none`, dueDate: '2030-01-31' })
    expect(res.body.task.reminderMinutes).toBeNull()
  })

  it('rejects a reminder without a due date, or at an unsupported time', async () => {
    const noDate = await create('sales', { title: `tk-${stamp}-x`, reminderMinutes: 60 })
    expect(noDate.status).toBe(400)
    expect(noDate.body.error.details.reminderMinutes).toBe('Set a due date to get a reminder')
    const odd = await create('sales', {
      title: `tk-${stamp}-x`,
      dueDate: '2030-01-31',
      reminderMinutes: 7,
    })
    expect(odd.status).toBe(400)
    expect(odd.body.error.details.reminderMinutes).toBe('Choose a reminder time')
  })

  it('notifies the assignee once, when the reminder time has come', async () => {
    await task('due-soon', { dueDate: new Date(now.getTime() + 30 * 60_000), reminderMinutes: 60 })
    await sendDueReminders(now)
    await sendDueReminders(now)
    const found = (await reminders()).filter((n) => n.message.includes(`tk-${stamp}-due-soon`))
    expect(found).toHaveLength(1)
    expect(found[0]!.readAt).toBeNull()
  })

  it('waits until the reminder time, then sends it', async () => {
    const dueDate = new Date(now.getTime() + 5 * HOUR)
    await task('later', { dueDate, reminderMinutes: 60 })
    const has = async () => (await reminders()).some((n) => n.message.includes(`tk-${stamp}-later`))
    await sendDueReminders(now)
    expect(await has()).toBe(false)
    await sendDueReminders(new Date(dueDate.getTime() - 59 * 60_000))
    expect(await has()).toBe(true)
  })

  it('skips finished tasks, unassigned tasks and tasks without a reminder', async () => {
    const dueDate = new Date(now.getTime() + 10 * 60_000)
    await task('done', { dueDate, reminderMinutes: 60, status: 'DONE' })
    await task('unassigned', { dueDate, reminderMinutes: 60, assigneeId: null })
    await task('no-reminder', { dueDate })
    await sendDueReminders(now)
    const skipped = (await reminders()).filter((n) =>
      /tk-\d+-(done|unassigned|no-reminder)/.test(n.message),
    )
    expect(skipped).toHaveLength(0)
  })

  it('shows reminders in the assignee’s dashboard notifications', async () => {
    const res = await request(app).get('/api/dashboard/attention').set(as('sales'))
    expect(
      res.body.notifications.items.some((n: { type: string }) => n.type === 'TASK_REMINDER'),
    ).toBe(true)
  })
})
