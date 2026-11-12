import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `cal-sales-${stamp}@crm.local`,
  other: `cal-other-${stamp}@crm.local`,
  tasksOnly: `cal-tasks-${stamp}@crm.local`,
}
const ids = { sales: '', other: '', tasksOnly: '' }
const tokens = { sales: '', tasksOnly: '' }
let pipelineId = ''
let dealId = ''
let contactId = ''

type Who = keyof typeof tokens
type Item = { title: string; at: string }
const get = (who: Who | null, query: string) => {
  const r = request(app).get(`/api/calendar?${query}`)
  return who ? r.set('Authorization', `Bearer ${tokens[who]}`) : r
}
const t = (name: string) => `cal-${stamp}-${name}`
const mine = (items: Item[]) =>
  items.filter((i) => i.title.startsWith(`cal-${stamp}`)).map((i) => i.title)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  const tasksRole = await prisma.role.create({
    data: {
      name: `cal-${stamp}-tasks`,
      permissions: { create: [{ permission: { connect: { key: 'tasks:read' } } }] },
    },
  })
  const salesRole = roles.find((r) => r.name === 'SALES')!.id
  for (const [key, roleId] of [
    ['sales', salesRole],
    ['other', salesRole],
    ['tasksOnly', tasksRole.id],
  ] as const) {
    ids[key] = (
      await prisma.user.create({
        data: { email: emails[key], passwordHash, firstName: key, lastName: 'Cal', roleId },
      })
    ).id
    if (key in tokens) {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: emails[key], password })
      tokens[key as Who] = login.body.token
    }
  }
  contactId = (await prisma.contact.create({ data: { firstName: 'C', lastName: `cal${stamp}` } }))
    .id
  const pipeline = await prisma.pipeline.create({
    data: { name: t('p'), stages: { create: { name: 'S', position: 1 } } },
    include: { stages: true },
  })
  pipelineId = pipeline.id
  const deal = (name: string, extra: object) =>
    prisma.deal.create({
      data: {
        title: t(name),
        pipelineId,
        stageId: pipeline.stages[0]!.id,
        ownerId: ids.sales,
        ...extra,
      },
    })
  const close = new Date('2031-03-10T23:59:59.999Z')
  dealId = (await deal('deal', { expectedClose: close })).id
  await deal('won', { expectedClose: close, status: 'WON' })
  await deal('outside', { expectedClose: new Date('2031-05-01T23:59:59.999Z') })
  await deal('theirs', { expectedClose: close, ownerId: ids.other })

  const due = new Date('2031-03-12T23:59:59.999Z')
  const task = (name: string, assigneeId: string, dueDate = due) => ({
    title: t(name),
    creatorId: ids.sales,
    assigneeId,
    dueDate,
  })
  await prisma.task.createMany({
    data: [
      task('task', ids.sales),
      task('task-theirs', ids.other),
      task('task-outside', ids.sales, new Date('2031-04-20T23:59:59.999Z')),
      task('task-t', ids.tasksOnly),
    ],
  })
  const act = (
    name: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    at: string,
    userId = ids.sales,
  ) => ({
    subject: t(name),
    type,
    occurredAt: new Date(at),
    userId,
    contactId,
  })
  await prisma.activity.createMany({
    data: [
      act('call', 'CALL', '2031-03-11T09:30:00Z'),
      act('meeting', 'MEETING', '2031-03-11T14:00:00Z'),
      act('email', 'EMAIL', '2031-03-11T10:00:00Z'),
      act('theirs', 'CALL', '2031-03-11T10:00:00Z', ids.other),
      // 23:30 UTC on the 14th is already the 15th for someone at UTC+2.
      act('late', 'CALL', '2031-03-14T23:30:00Z'),
    ],
  })
})

afterAll(async () => {
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: `cal-${stamp}` } } })
  await prisma.activity.deleteMany({ where: { subject: { startsWith: `cal-${stamp}` } } })
  await prisma.task.deleteMany({ where: { title: { startsWith: `cal-${stamp}` } } })
  await prisma.deal.deleteMany({ where: { title: { startsWith: `cal-${stamp}` } } })
  await prisma.pipeline.deleteMany({ where: { id: pipelineId } })
  await prisma.contact.deleteMany({ where: { id: contactId } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.role.deleteMany({ where: { name: { startsWith: `cal-${stamp}` } } })
  await prisma.$disconnect()
})

describe('GET /api/calendar', () => {
  it('requires login', async () => {
    expect((await get(null, 'from=2031-03-01&to=2031-03-31')).status).toBe(401)
  })

  it('returns my calls, meetings, tasks and open deals in time order', async () => {
    const res = await get('sales', 'from=2031-03-01&to=2031-03-31')
    expect(res.status).toBe(200)
    expect(mine(res.body.items)).toEqual([t('deal'), t('call'), t('meeting'), t('task'), t('late')])
    const find = (name: string) => res.body.items.find((i: Item) => i.title === t(name))
    expect(find('call')).toMatchObject({ kind: 'CALL', allDay: false, contactId })
    expect(find('meeting')).toMatchObject({ kind: 'MEETING', allDay: false })
    expect(find('task')).toMatchObject({ kind: 'TASK', allDay: true, status: 'TODO' })
    expect(find('deal')).toMatchObject({ kind: 'DEAL', allDay: true, id: dealId })
  })

  it('leaves out other people’s items, other activity types, closed deals and other days', async () => {
    const titles = mine((await get('sales', 'from=2031-03-01&to=2031-03-31')).body.items)
    for (const left of ['email', 'theirs', 'won', 'outside', 'task-theirs', 'task-outside']) {
      expect(titles).not.toContain(t(left))
    }
  })

  it('narrows to the days asked for, both ends included', async () => {
    const on = (day: string) =>
      get('sales', `from=${day}&to=${day}`).then((r) => mine(r.body.items))
    expect(await on('2031-03-11')).toEqual([t('call'), t('meeting')])
    expect(await on('2031-03-12')).toEqual([t('task')])
    expect(await on('2031-03-10')).toEqual([t('deal')])
  })

  it('places timed items on the viewer’s day using their time zone offset', async () => {
    // UTC+2 is an offset of -120: 23:30 UTC on the 14th is 01:30 on the 15th.
    const on = (day: string, offset: number) =>
      get('sales', `from=${day}&to=${day}&offset=${offset}`).then((r) => mine(r.body.items))
    expect(await on('2031-03-14', 0)).toEqual([t('late')])
    expect(await on('2031-03-14', -120)).toEqual([])
    expect(await on('2031-03-15', -120)).toEqual([t('late')])
  })

  it('leaves out sources the caller may not read', async () => {
    const res = await get('tasksOnly', 'from=2031-03-01&to=2031-03-31')
    expect(res.status).toBe(200)
    expect(mine(res.body.items)).toEqual([t('task-t')])
  })

  it('validates the dates', async () => {
    for (const q of [
      '',
      'from=2031-03-01',
      'from=nope&to=2031-03-02',
      'from=2031-02-30&to=2031-03-02',
      'from=2031-03-05&to=2031-03-01',
      'from=2031-01-01&to=2031-06-01',
      'from=2031-03-01&to=2031-03-02&offset=abc',
    ]) {
      expect((await get('sales', q)).status, q).toBe(400)
    }
  })
})

describe('calendar events', () => {
  const auth = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
  const post = (who: Who | null, body: object) => {
    const r = request(app).post('/api/calendar/events')
    return (who ? r.set(auth(who)) : r).send(body)
  }
  const patch = (who: Who, id: string, body: object) =>
    request(app).patch(`/api/calendar/events/${id}`).set(auth(who)).send(body)

  it('requires login', async () => {
    expect((await post(null, { title: 'x', startsAt: '2031-04-01T09:00:00Z' })).status).toBe(401)
  })

  it('creates a timed event that lasts an hour by default and shows on the calendar', async () => {
    const res = await post('sales', {
      title: t('standup'),
      location: ' Room 4 ',
      startsAt: '2031-04-01T09:00:00Z',
    })
    expect(res.status).toBe(201)
    expect(res.body.event).toMatchObject({
      title: t('standup'),
      location: 'Room 4',
      allDay: false,
      startsAt: '2031-04-01T09:00:00.000Z',
      endsAt: '2031-04-01T10:00:00.000Z',
    })
    const cal = await get('sales', 'from=2031-04-01&to=2031-04-01')
    expect(cal.body.items.find((i: Item) => i.title === t('standup'))).toMatchObject({
      kind: 'EVENT',
      allDay: false,
      location: 'Room 4',
    })
  })

  it('creates an all-day event on its day, and an event with an end time', async () => {
    const allDay = await post('sales', {
      title: t('offsite'),
      allDay: true,
      startsAt: '2031-04-02',
    })
    expect(allDay.status).toBe(201)
    expect(allDay.body.event.startsAt).toBe('2031-04-02T00:00:00.000Z')
    const timed = await post('sales', {
      title: t('workshop'),
      startsAt: '2031-04-03T09:00:00Z',
      endsAt: '2031-04-03T12:30:00Z',
    })
    expect(timed.body.event.endsAt).toBe('2031-04-03T12:30:00.000Z')
    expect(mine((await get('sales', 'from=2031-04-02&to=2031-04-02')).body.items)).toContain(
      t('offsite'),
    )
  })

  it('keeps events private to their owner', async () => {
    await post('sales', { title: t('private'), allDay: true, startsAt: '2031-04-04' })
    expect(
      mine((await get('tasksOnly', 'from=2031-04-01&to=2031-04-30')).body.items),
    ).not.toContain(t('private'))
  })

  it('validates the title and times with field errors', async () => {
    const bad = async (body: object, field: string) => {
      const res = await post('sales', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(res.body.error.details[field]).toBeTruthy()
    }
    await bad({ title: ' ', startsAt: '2031-04-01T09:00:00Z' }, 'title')
    await bad({ title: 'x', startsAt: 'tomorrow' }, 'startsAt')
    await bad({ title: 'x', startsAt: '2031-04-01' }, 'startsAt')
    await bad({ title: 'x', allDay: true, startsAt: '2031-02-30' }, 'startsAt')
    await bad({ title: 'x', allDay: true, startsAt: '2031-04-01T09:00:00Z' }, 'startsAt')
    await bad(
      { title: 'x', startsAt: '2031-04-01T09:00:00Z', endsAt: '2031-04-01T08:00:00Z' },
      'endsAt',
    )
    await bad({ title: 'x', allDay: true, startsAt: '2031-04-01', endsAt: '2031-04-02' }, 'endsAt')
  })

  it('reschedules an event to another day or time, and to all-day', async () => {
    const id = (await post('sales', { title: t('move'), startsAt: '2031-05-01T09:00:00Z' })).body
      .event.id
    const moved = await patch('sales', id, { allDay: false, startsAt: '2031-05-02T15:00:00Z' })
    expect(moved.status).toBe(200)
    expect(moved.body.event).toMatchObject({
      title: t('move'),
      startsAt: '2031-05-02T15:00:00.000Z',
      endsAt: '2031-05-02T16:00:00.000Z',
    })
    const day = await patch('sales', id, { allDay: true, startsAt: '2031-05-03' })
    expect(day.body.event).toMatchObject({ allDay: true, startsAt: '2031-05-03T00:00:00.000Z' })
    expect(mine((await get('sales', 'from=2031-05-03&to=2031-05-03')).body.items)).toEqual([
      t('move'),
    ])
    expect(mine((await get('sales', 'from=2031-05-01&to=2031-05-02')).body.items)).not.toContain(
      t('move'),
    )
  })

  it('will not reschedule someone else’s event, or one that does not exist', async () => {
    const id = (await post('sales', { title: t('mine'), startsAt: '2031-05-10T09:00:00Z' })).body
      .event.id
    expect((await patch('tasksOnly', id, { startsAt: '2031-05-11T09:00:00Z' })).status).toBe(404)
    expect((await patch('sales', 'nope', { startsAt: '2031-05-11T09:00:00Z' })).status).toBe(404)
    expect((await patch('sales', id, { startsAt: 'bad' })).status).toBe(400)
  })
})
