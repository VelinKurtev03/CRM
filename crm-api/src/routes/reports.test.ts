import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `rep-sales-${stamp}@crm.local`,
  manager: `rep-manager-${stamp}@crm.local`,
}
const tokens = { sales: '', manager: '' }
let pipelineId = ''
let otherPipelineId = ''

// Years no other test file writes deals in, so totals can be asserted exactly.
const YEAR = 2003

const get = (path: string, who: keyof typeof tokens, query = '') =>
  request(app).get(`/api/reports/${path}${query}`).set('Authorization', `Bearer ${tokens[who]}`)

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['sales', 'SALES'],
    ['manager', 'MANAGER'],
  ] as const) {
    await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Rep',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }

  const make = (name: string) =>
    prisma.pipeline.create({
      data: { name, stages: { create: { name: 'Stage', position: 1 } } },
      include: { stages: true },
    })
  const a = await make(`rep-a-${stamp}`)
  const b = await make(`rep-b-${stamp}`)
  pipelineId = a.id
  otherPipelineId = b.id

  const deal = (
    pipeline: typeof a,
    amount: number,
    status: 'OPEN' | 'WON' | 'LOST',
    closedAt: Date | null,
  ) => ({
    title: `rep-${stamp}`,
    amount,
    status,
    closedAt,
    pipelineId: pipeline.id,
    stageId: pipeline.stages[0].id,
  })
  await prisma.deal.createMany({
    data: [
      deal(a, 1000, 'WON', new Date(YEAR, 0, 10)),
      deal(a, 500, 'WON', new Date(YEAR, 0, 20)),
      deal(b, 3000, 'WON', new Date(YEAR, 2, 5)),
      deal(a, 9999, 'LOST', new Date(YEAR, 0, 15)), // lost: never counted
      deal(a, 8888, 'OPEN', null), // open: never counted
      deal(a, 2000, 'WON', new Date(YEAR - 1, 0, 3)), // the year before
    ],
  })
})

afterAll(async () => {
  await prisma.deal.deleteMany({ where: { pipelineId: { in: [pipelineId, otherPipelineId] } } })
  await prisma.pipeline.deleteMany({ where: { id: { in: [pipelineId, otherPipelineId] } } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe.each(['monthly-sales', 'revenue'])('GET /api/reports/%s access', (path) => {
  it('requires login', async () => {
    expect((await request(app).get(`/api/reports/${path}`)).status).toBe(401)
  })

  it('is forbidden without reports:read', async () => {
    expect((await get(path, 'sales')).status).toBe(403)
  })

  it('rejects an invalid year', async () => {
    for (const year of ['abc', '1999', '2101', '2020.5']) {
      const res = await get(path, 'manager', `?year=${year}`)
      expect(res.status).toBe(400)
      expect(res.body.error.details.year).toBe('Enter a valid year')
    }
  })

  it('defaults to the current year', async () => {
    const res = await get(path, 'manager')
    expect(res.status).toBe(200)
    expect(res.body.year).toBe(new Date().getFullYear())
    expect(res.body.months).toHaveLength(12)
  })
})

describe('GET /api/reports/monthly-sales', () => {
  it('counts only won deals, by month, with averages and totals', async () => {
    const res = await get('monthly-sales', 'manager', `?year=${YEAR}`)
    expect(res.status).toBe(200)
    expect(res.body.months.map((m: { month: string }) => m.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`),
    )
    expect(res.body.months[0]).toEqual({
      month: `${YEAR}-01`,
      dealsWon: 2,
      revenue: 1500,
      averageDeal: 750,
    })
    expect(res.body.months[1]).toEqual({
      month: `${YEAR}-02`,
      dealsWon: 0,
      revenue: 0,
      averageDeal: 0,
    })
    expect(res.body.months[2].revenue).toBe(3000)
    expect(res.body.totals).toEqual({ dealsWon: 3, revenue: 4500, averageDeal: 1500 })
  })

  it('is empty for a year with no sales', async () => {
    const res = await get('monthly-sales', 'manager', '?year=2001')
    expect(res.body.totals).toEqual({ dealsWon: 0, revenue: 0, averageDeal: 0 })
  })
})

describe('GET /api/reports/revenue', () => {
  it('returns monthly revenue, running total and the previous year', async () => {
    const res = await get('revenue', 'manager', `?year=${YEAR}`)
    expect(res.status).toBe(200)
    const [jan, feb, mar, dec] = [0, 1, 2, 11].map((i) => res.body.months[i])
    expect(jan).toMatchObject({ revenue: 1500, cumulative: 1500, previousYear: 2000 })
    expect(feb).toMatchObject({ revenue: 0, cumulative: 1500, previousYear: 0 })
    expect(mar).toMatchObject({ revenue: 3000, cumulative: 4500 })
    expect(dec.cumulative).toBe(4500)
    expect(res.body.totals).toEqual({ revenue: 4500, previousYear: 2000, changePercent: 125 })
  })

  it('splits revenue by pipeline, biggest first, leaving out pipelines with no sales', async () => {
    const res = await get('revenue', 'manager', `?year=${YEAR}`)
    const mine = res.body.byPipeline.filter((p: { name: string }) => p.name.includes(String(stamp)))
    expect(mine).toEqual([
      { pipelineId: otherPipelineId, name: `rep-b-${stamp}`, revenue: 3000, deals: 1 },
      { pipelineId, name: `rep-a-${stamp}`, revenue: 1500, deals: 2 },
    ])
  })

  it('has no percentage change when the previous year had no revenue', async () => {
    const res = await get('revenue', 'manager', `?year=${YEAR - 1}`)
    expect(res.body.totals).toEqual({ revenue: 2000, previousYear: 0, changePercent: null })
  })
})
