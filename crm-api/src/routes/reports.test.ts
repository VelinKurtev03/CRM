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
let funnelPipelineId = ''

// Years no other test file writes deals in, so totals can be asserted exactly.
const YEAR = 2003
const LEAD_YEAR = 2004
const TEAM_YEAR = 2005

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

  // A pipeline with a known shape: New (3 deals), Qualified (1), Won (1), Lost stage (1) plus a lost-status deal.
  const funnel = await prisma.pipeline.create({
    data: {
      name: `rep-f-${stamp}`,
      stages: {
        create: [
          { name: 'New', position: 1 },
          { name: 'Qualified', position: 2 },
          { name: 'Won', position: 3, isWon: true },
          { name: 'Lost', position: 4, isLost: true },
        ],
      },
    },
    include: { stages: true },
  })
  funnelPipelineId = funnel.id
  const at = (name: string, amount: number, status: 'OPEN' | 'WON' | 'LOST' = 'OPEN') => ({
    title: `rep-${stamp}`,
    amount,
    status,
    pipelineId: funnel.id,
    stageId: funnel.stages.find((s) => s.name === name)!.id,
  })
  await prisma.deal.createMany({
    data: [
      at('New', 100),
      at('New', 200),
      at('New', 300),
      at('Qualified', 400),
      at('Won', 500, 'WON'),
      at('Lost', 600, 'LOST'),
      at('New', 700, 'LOST'),
    ],
  })

  // Leads created in a year no one else uses: dealId is unique, so each converted lead needs a deal.
  const made = await Promise.all(
    [0, 1].map((i) =>
      prisma.deal.create({ data: { ...at('Won', 1, 'WON'), title: `rep-${stamp}-${i}` } }),
    ),
  )
  const lead = (
    source: string | null,
    month: number,
    status: 'NEW' | 'LOST' | 'WON',
    dealId?: string,
  ) => ({
    title: `rep-${stamp}`,
    source,
    status,
    createdAt: new Date(LEAD_YEAR, month, 10),
    dealId,
  })
  await prisma.lead.createMany({
    data: [
      lead('Web', 0, 'WON', made[0].id),
      lead('Web', 0, 'NEW'),
      lead('Web', 1, 'LOST'),
      lead('Referral', 1, 'WON', made[1].id),
      lead(null, 2, 'NEW'),
      { ...lead('Web', 0, 'NEW'), createdAt: new Date(LEAD_YEAR - 1, 11, 31) }, // other year
    ],
  })

  // Team performance: Sam (sales) has a full year, Mia (manager) only an overdue task.
  const [sam, mia] = await prisma.user.findMany({
    where: { email: { in: [emails.sales, emails.manager] } },
    orderBy: { email: 'desc' },
  })
  const own = (amount: number, status: 'OPEN' | 'WON' | 'LOST', closedAt: Date | null) => ({
    ...deal(a, amount, status, closedAt),
    ownerId: sam.id,
  })
  await prisma.deal.createMany({
    data: [
      own(1000, 'WON', new Date(TEAM_YEAR, 1, 1)),
      own(2000, 'WON', new Date(TEAM_YEAR, 5, 1)),
      own(500, 'LOST', new Date(TEAM_YEAR, 6, 1)),
      own(700, 'OPEN', null),
      own(4000, 'WON', new Date(TEAM_YEAR - 1, 5, 1)), // other year
    ],
  })
  await prisma.lead.createMany({
    data: [
      { title: `rep-${stamp}`, ownerId: sam.id, createdAt: new Date(TEAM_YEAR, 0, 5) },
      { title: `rep-${stamp}`, ownerId: sam.id, createdAt: new Date(TEAM_YEAR, 0, 6) },
    ],
  })
  const call = (occurredAt: Date) => ({
    type: 'CALL' as const,
    subject: `rep-${stamp}`,
    userId: sam.id,
    occurredAt,
  })
  await prisma.activity.createMany({
    data: [
      call(new Date(TEAM_YEAR, 2, 1)),
      call(new Date(TEAM_YEAR, 3, 1)),
      call(new Date(2001, 0, 1)),
    ],
  })
  const task = (assigneeId: string, status: 'TODO' | 'DONE', dueDate: Date | null) => ({
    title: `rep-${stamp}`,
    creatorId: sam.id,
    assigneeId,
    status,
    dueDate,
  })
  await prisma.task.createMany({
    data: [
      task(sam.id, 'DONE', null),
      task(sam.id, 'TODO', new Date(2999, 0, 1)),
      task(mia.id, 'TODO', new Date(2000, 0, 1)),
    ],
  })
  // `updatedAt` is set by Prisma on create, so move the completed task into the year.
  await prisma.task.updateMany({
    where: { title: `rep-${stamp}`, status: 'DONE' },
    data: { updatedAt: new Date(TEAM_YEAR, 4, 1) },
  })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { title: `rep-${stamp}` } })
  await prisma.activity.deleteMany({ where: { subject: `rep-${stamp}` } })
  await prisma.lead.deleteMany({ where: { title: `rep-${stamp}` } })
  await prisma.deal.deleteMany({
    where: { pipelineId: { in: [pipelineId, otherPipelineId, funnelPipelineId] } },
  })
  await prisma.pipeline.deleteMany({
    where: { id: { in: [pipelineId, otherPipelineId, funnelPipelineId] } },
  })
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

describe('GET /api/reports/funnel', () => {
  it('requires login and reports:read', async () => {
    expect((await request(app).get('/api/reports/funnel')).status).toBe(401)
    expect((await get('funnel', 'sales')).status).toBe(403)
  })

  it('counts deals per stage, how many got that far, and flags the bottleneck', async () => {
    const res = await get('funnel', 'manager', `?pipelineId=${funnelPipelineId}`)
    expect(res.status).toBe(200)
    expect(res.body.pipeline).toEqual({ id: funnelPipelineId, name: `rep-f-${stamp}` })
    expect(res.body.pipelines.map((p: { id: string }) => p.id)).toContain(funnelPipelineId)
    // The lost stage is not a funnel step; lost deals (by stage or status) are counted apart.
    expect(
      res.body.stages.map((s: { name: string; deals: number; value: number; reached: number }) => [
        s.name,
        s.deals,
        s.value,
        s.reached,
      ]),
    ).toEqual([
      ['New', 3, 600, 7],
      ['Qualified', 1, 400, 4],
      ['Won', 3, 502, 3],
    ])
    expect(
      res.body.stages.map((s: { conversionPercent: number | null }) => s.conversionPercent),
    ).toEqual([null, (4 / 7) * 100, 75])
    expect(res.body.bottleneckStageId).toBe(res.body.stages[1].stageId)
    expect(res.body.lost).toEqual({ deals: 2, value: 1300 })
  })

  it('uses a default pipeline when none is asked for', async () => {
    const res = await get('funnel', 'manager')
    expect(res.status).toBe(200)
    expect(res.body.pipeline).not.toBeNull()
  })

  it('is 404 for an unknown pipeline', async () => {
    expect((await get('funnel', 'manager', '?pipelineId=nope')).status).toBe(404)
  })
})

describe('GET /api/reports/lead-conversion', () => {
  it('requires login, reports:read and a valid year', async () => {
    expect((await request(app).get('/api/reports/lead-conversion')).status).toBe(401)
    expect((await get('lead-conversion', 'sales')).status).toBe(403)
    const bad = await get('lead-conversion', 'manager', '?year=abc')
    expect(bad.status).toBe(400)
    expect(bad.body.error.details.year).toBe('Enter a valid year')
  })

  it('counts leads created in the year, converted, lost and open, by month and source', async () => {
    const res = await get('lead-conversion', 'manager', `?year=${LEAD_YEAR}`)
    expect(res.status).toBe(200)
    expect(res.body.months).toHaveLength(12)
    expect(res.body.totals).toEqual({
      leads: 5,
      converted: 2,
      conversionPercent: 40,
      lost: 1,
      open: 2,
    })
    expect(res.body.months[0]).toEqual({
      month: `${LEAD_YEAR}-01`,
      leads: 2,
      converted: 1,
      conversionPercent: 50,
    })
    expect(res.body.months[3]).toMatchObject({ leads: 0, converted: 0, conversionPercent: null })
    expect(res.body.bySource).toEqual([
      { source: 'Web', leads: 3, converted: 1, conversionPercent: (1 / 3) * 100 },
      { source: 'Referral', leads: 1, converted: 1, conversionPercent: 100 },
      { source: 'Unknown', leads: 1, converted: 0, conversionPercent: 0 },
    ])
  })

  it('has no rate for a year without leads', async () => {
    const res = await get('lead-conversion', 'manager', '?year=2001')
    expect(res.body.totals).toEqual({
      leads: 0,
      converted: 0,
      conversionPercent: null,
      lost: 0,
      open: 0,
    })
  })
})

describe.each(['win-rate', 'lost-deals'])('GET /api/reports/%s access', (path) => {
  it('requires login, reports:read and a valid year', async () => {
    expect((await request(app).get(`/api/reports/${path}`)).status).toBe(401)
    expect((await get(path, 'sales')).status).toBe(403)
    const bad = await get(path, 'manager', '?year=abc')
    expect(bad.status).toBe(400)
    expect(bad.body.error.details.year).toBe('Enter a valid year')
  })
})

describe('GET /api/reports/win-rate', () => {
  it('compares won and lost deals closed in the year, by month and pipeline', async () => {
    const res = await get('win-rate', 'manager', `?year=${YEAR}`)
    expect(res.status).toBe(200)
    // Won: 1000 + 500 (Jan, a), 3000 (Mar, b). Lost: 9999 (Jan, a). The open deal is ignored.
    expect(res.body.months[0]).toEqual({
      month: `${YEAR}-01`,
      won: 2,
      lost: 1,
      winRatePercent: (2 / 3) * 100,
    })
    expect(res.body.months[1]).toEqual({
      month: `${YEAR}-02`,
      won: 0,
      lost: 0,
      winRatePercent: null,
    })
    expect(res.body.months[2]).toMatchObject({ won: 1, lost: 0, winRatePercent: 100 })
    expect(res.body.totals).toEqual({ won: 3, lost: 1, winRatePercent: 75 })
    const mine = res.body.byPipeline.filter((p: { name: string }) => p.name.includes(String(stamp)))
    expect(mine).toEqual([
      { pipelineId, name: `rep-a-${stamp}`, won: 2, lost: 1, winRatePercent: (2 / 3) * 100 },
      { pipelineId: otherPipelineId, name: `rep-b-${stamp}`, won: 1, lost: 0, winRatePercent: 100 },
    ])
  })

  it('has no rate for a year with no closed deals', async () => {
    const res = await get('win-rate', 'manager', '?year=2001')
    expect(res.body.totals).toEqual({ won: 0, lost: 0, winRatePercent: null })
  })
})

describe('GET /api/reports/lost-deals', () => {
  it('totals the deals lost in the year, by month and pipeline, with the biggest', async () => {
    const res = await get('lost-deals', 'manager', `?year=${YEAR}`)
    expect(res.status).toBe(200)
    expect(res.body.totals).toMatchObject({ deals: 1, value: 9999, averageDeal: 9999 })
    expect(res.body.months[0]).toEqual({ month: `${YEAR}-01`, deals: 1, value: 9999 })
    expect(res.body.months[1]).toMatchObject({ deals: 0, value: 0 })
    expect(res.body.byPipeline).toEqual([
      { pipelineId, name: `rep-a-${stamp}`, deals: 1, value: 9999 },
    ])
    expect(res.body.biggest).toHaveLength(1)
    expect(res.body.biggest[0]).toMatchObject({
      amount: 9999,
      pipeline: `rep-a-${stamp}`,
      owner: null,
    })
    expect(res.body.biggest[0].daysOpen).toBeGreaterThanOrEqual(0)
  })

  it('is empty for a year with no lost deals', async () => {
    const res = await get('lost-deals', 'manager', '?year=2001')
    expect(res.body.totals).toEqual({ deals: 0, value: 0, averageDeal: 0, averageDaysOpen: 0 })
    expect(res.body.biggest).toEqual([])
  })
})

describe('GET /api/reports/team-performance', () => {
  it('requires login, reports:read and a valid year', async () => {
    expect((await request(app).get('/api/reports/team-performance')).status).toBe(401)
    expect((await get('team-performance', 'sales')).status).toBe(403)
    const bad = await get('team-performance', 'manager', '?year=abc')
    expect(bad.status).toBe(400)
    expect(bad.body.error.details.year).toBe('Enter a valid year')
  })

  it('summarises each person for the year', async () => {
    const res = await get('team-performance', 'manager', `?year=${TEAM_YEAR}`)
    expect(res.status).toBe(200)
    const mine = res.body.members.filter((m: { name: string }) => m.name.endsWith('Rep'))
    expect(mine.map((m: { name: string }) => m.name)).toEqual(['sales Rep', 'manager Rep'])
    expect(mine[0]).toMatchObject({
      role: 'SALES',
      dealsWon: 2,
      dealsLost: 1,
      winRatePercent: (2 / 3) * 100,
      revenue: 3000,
      openDeals: 1,
      openValue: 700,
      leads: 2,
      leadsConverted: 0,
      activities: 2,
      tasksCompleted: 1,
      tasksOpen: 1,
      tasksOverdue: 0,
    })
    // The manager only has an overdue task, and no closed deals so no win rate.
    expect(mine[1]).toMatchObject({
      role: 'MANAGER',
      dealsWon: 0,
      winRatePercent: null,
      tasksOpen: 1,
      tasksOverdue: 1,
    })
    expect(res.body.totals.revenue).toBeGreaterThanOrEqual(3000)
  })

  it('leaves out people with nothing in a year', async () => {
    const res = await get('team-performance', 'manager', '?year=2001')
    const mine = res.body.members.filter((m: { name: string }) => m.name.endsWith('Rep'))
    // Sam's activity in 2001 is the only thing that year; Mia's open task is a snapshot, so she is listed.
    expect(mine.map((m: { name: string }) => m.name)).toEqual(['manager Rep', 'sales Rep'])
    expect(mine.find((m: { name: string }) => m.name === 'sales Rep')).toMatchObject({
      dealsWon: 0,
      activities: 1,
    })
  })
})

describe('report filters', () => {
  it('rejects bad dates and ranges', async () => {
    const outside = await get('monthly-sales', 'manager', `?year=${YEAR}&from=${YEAR - 1}-12-31`)
    expect(outside.status).toBe(400)
    expect(outside.body.error.details.from).toBe(`Choose a date in ${YEAR}`)
    const backwards = await get(
      'win-rate',
      'manager',
      `?year=${YEAR}&from=${YEAR}-05-01&to=${YEAR}-04-01`,
    )
    expect(backwards.body.error.details.to).toBe('End date must be after the start')
    const junk = await get('revenue', 'manager', `?year=${YEAR}&to=soon`)
    expect(junk.body.error.details.to).toBe('Enter a valid date (YYYY-MM-DD)')
  })

  it('narrows to a date range, treating the end date as inclusive', async () => {
    // Won deals: Jan 10, Jan 20, Mar 5. Ending on Jan 20 keeps the first two.
    const res = await get('monthly-sales', 'manager', `?year=${YEAR}&to=${YEAR}-01-20`)
    expect(res.body.totals).toMatchObject({ dealsWon: 2, revenue: 1500 })
    const from = await get('monthly-sales', 'manager', `?year=${YEAR}&from=${YEAR}-01-11`)
    expect(from.body.totals).toMatchObject({ dealsWon: 2, revenue: 3500 })
  })

  it('compares with the same dates a year earlier', async () => {
    // The previous-year deal closed Jan 3, so a range from Jan 5 leaves it out.
    const all = await get('revenue', 'manager', `?year=${YEAR}`)
    expect(all.body.totals.previousYear).toBe(2000)
    const later = await get('revenue', 'manager', `?year=${YEAR}&from=${YEAR}-01-05`)
    expect(later.body.totals.previousYear).toBe(0)
  })

  it('filters by pipeline', async () => {
    const res = await get('win-rate', 'manager', `?year=${YEAR}&pipelineId=${otherPipelineId}`)
    expect(res.body.totals).toEqual({ won: 1, lost: 0, winRatePercent: 100 })
    const sales = await get('monthly-sales', 'manager', `?year=${YEAR}&pipelineId=${pipelineId}`)
    expect(sales.body.totals).toMatchObject({ dealsWon: 2, revenue: 1500 })
  })

  it('filters by owner, and treats empty values as not set', async () => {
    const owners = await get('filter-options', 'manager')
    expect(owners.status).toBe(200)
    expect(owners.body.pipelines.map((p: { id: string }) => p.id)).toContain(pipelineId)
    const sam = owners.body.owners.find((o: { name: string }) => o.name === 'sales Rep')
    const res = await get('team-performance', 'manager', `?year=${TEAM_YEAR}&ownerId=${sam.id}`)
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual(['sales Rep'])
    expect(res.body.totals.revenue).toBe(3000)
    const mine = await get('win-rate', 'manager', `?year=${TEAM_YEAR}&ownerId=${sam.id}`)
    expect(mine.body.totals).toEqual({ won: 2, lost: 1, winRatePercent: (2 / 3) * 100 })
    const none = await get('win-rate', 'manager', `?year=${YEAR}&ownerId=${sam.id}`)
    expect(none.body.totals.won).toBe(0)
    const blank = await get('win-rate', 'manager', `?year=${YEAR}&from=&to=`)
    expect(blank.body.totals.won).toBe(3)
  })

  it('lists the filter options only with reports:read', async () => {
    expect((await request(app).get('/api/reports/filter-options')).status).toBe(401)
    expect((await get('filter-options', 'sales')).status).toBe(403)
  })
})
