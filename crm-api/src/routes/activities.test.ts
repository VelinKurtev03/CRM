import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = { sales: `ac-sales-${stamp}@crm.local`, support: `ac-support-${stamp}@crm.local` }
const tokens = { sales: '', support: '' }
let userId = ''
let contactId = ''
let dealId = ''
let pipelineId = ''
let noRoleToken = ''
const noRoleEmail = `ac-norole-${stamp}@crm.local`
let roleId = ''

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const log = (who: Who, body: object) => request(app).post('/api/activities').set(as(who)).send(body)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['support', 'SUPPORT'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Ac',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'sales') userId = u.id
    tokens[key] = (
      await request(app).post('/api/auth/login').send({ email: emails[key], password })
    ).body.token
  }
  // A role with no permissions, to prove the guard.
  roleId = (await prisma.role.create({ data: { name: `ac-empty-${stamp}` } })).id
  await prisma.user.create({
    data: { email: noRoleEmail, passwordHash, firstName: 'n', lastName: 'r', roleId },
  })
  noRoleToken = (await request(app).post('/api/auth/login').send({ email: noRoleEmail, password }))
    .body.token

  contactId = (await prisma.contact.create({ data: { firstName: 'A', lastName: `Ac${stamp}` } })).id
  const pipeline = await prisma.pipeline.create({
    data: { name: `ac-${stamp}`, stages: { create: { name: 'S', position: 1 } } },
    include: { stages: true },
  })
  pipelineId = pipeline.id
  dealId = (
    await prisma.deal.create({
      data: { title: `Deal ${stamp}`, pipelineId, stageId: pipeline.stages[0].id },
    })
  ).id
})

afterAll(async () => {
  await prisma.activity.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } })
  await prisma.deal.deleteMany({ where: { id: dealId } })
  await prisma.pipeline.deleteMany({ where: { id: pipelineId } })
  await prisma.contact.deleteMany({ where: { id: contactId } })
  await prisma.user.deleteMany({
    where: { email: { in: [...Object.values(emails), noRoleEmail] } },
  })
  await prisma.role.deleteMany({ where: { id: roleId } })
  await prisma.$disconnect()
})

describe('POST /api/activities', () => {
  it('logs each kind against a contact, recording the caller', async () => {
    for (const type of ['CALL', 'MEETING', 'EMAIL', 'SMS', 'NOTE']) {
      const res = await log('sales', { type, subject: `  ${type} with Ann  `, contactId })
      expect(res.status).toBe(201)
      expect(res.body.activity).toMatchObject({
        type,
        subject: `${type} with Ann`,
        contactId,
        dealId: null,
        user: { id: userId },
      })
    }
    expect(await prisma.activity.count({ where: { contactId } })).toBe(5)
  })

  it('logs against a deal, with a description and a past time', async () => {
    const res = await log('sales', {
      type: 'CALL',
      subject: 'Pricing',
      description: 'Asked for a discount',
      occurredAt: '2026-01-02T10:00:00.000Z',
      dealId,
    })
    expect(res.status).toBe(201)
    expect(res.body.activity).toMatchObject({
      description: 'Asked for a discount',
      occurredAt: '2026-01-02T10:00:00.000Z',
      dealId,
    })
    const list = await request(app).get(`/api/deals/${dealId}/activities`).set(as('support'))
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].subject).toBe('Pricing')
  })

  it('shows on the contact overview', async () => {
    const res = await request(app).get(`/api/contacts/${contactId}/overview`).set(as('sales'))
    expect(res.body.activities.total).toBe(5)
  })

  it('validates the body', async () => {
    expect((await log('sales', { subject: 'x', contactId })).status).toBe(400) // no type
    expect((await log('sales', { type: 'FAX', subject: 'x', contactId })).status).toBe(400)
    expect((await log('sales', { type: 'CALL', subject: '   ', contactId })).status).toBe(400)
    expect((await log('sales', { type: 'CALL', subject: 'x' })).status).toBe(400) // no target
    expect((await log('sales', { type: 'CALL', subject: 'x'.repeat(201), contactId })).status).toBe(
      400,
    )
    expect(
      (await log('sales', { type: 'CALL', subject: 'x', contactId, occurredAt: 'soon' })).status,
    ).toBe(400)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(
      (await log('sales', { type: 'CALL', subject: 'x', contactId, occurredAt: future })).status,
    ).toBe(400)
  })

  it('404s for a record that does not exist', async () => {
    expect((await log('sales', { type: 'CALL', subject: 'x', contactId: 'nope' })).status).toBe(404)
    expect((await log('sales', { type: 'CALL', subject: 'x', dealId: 'nope' })).status).toBe(404)
  })

  it('needs login and activities:write', async () => {
    const body = { type: 'CALL', subject: 'x', contactId }
    expect((await request(app).post('/api/activities').send(body)).status).toBe(401)
    const res = await request(app)
      .post('/api/activities')
      .set({ Authorization: `Bearer ${noRoleToken}` })
      .send(body)
    expect(res.status).toBe(403)
  })

  it('lets Support, which can read contacts, log too', async () => {
    expect((await log('support', { type: 'CALL', subject: 'ok', contactId })).status).toBe(201)
  })
})

describe('GET /api/deals/:id/activities', () => {
  it('needs login, permission and an existing deal', async () => {
    expect((await request(app).get(`/api/deals/${dealId}/activities`)).status).toBe(401)
    const forbidden = await request(app)
      .get(`/api/deals/${dealId}/activities`)
      .set({ Authorization: `Bearer ${noRoleToken}` })
    expect(forbidden.status).toBe(403)
    expect((await request(app).get('/api/deals/nope/activities').set(as('sales'))).status).toBe(404)
  })
})
