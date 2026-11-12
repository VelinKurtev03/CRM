import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client.js'
import type {
  ActivityType,
  LeadPriority,
  LeadStatus,
  TaskPriority,
  TaskStatus,
} from '../src/generated/prisma/client.js'
import { ensureFirstDealStage } from '../src/lib/default-pipeline.js'
import { syncPermissions } from '../src/lib/permissions.js'

/**
 * Demo data for local development: a team, companies, contacts, leads, deals across the pipeline,
 * activities, notes and tags. Safe to run repeatedly: it does nothing if the demo team exists.
 * Never run it against a real database.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo1234!'
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const daysAhead = (n: number) => {
  // Expected close is stored as end of day UTC.
  const d = new Date(Date.now() + n * DAY)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

const TEAM = [
  { email: 'manager@crm.local', firstName: 'Maya', lastName: 'Patel', role: 'MANAGER' },
  { email: 'sales1@crm.local', firstName: 'Liam', lastName: 'Carter', role: 'SALES' },
  { email: 'sales2@crm.local', firstName: 'Sofia', lastName: 'Novak', role: 'SALES' },
  { email: 'support@crm.local', firstName: 'Noah', lastName: 'Kim', role: 'SUPPORT' },
] as const

const COMPANIES = [
  ['Acme Industries', 'acme.example', 'Manufacturing', '201-500', 320, 48_000_000, 'Chicago', 'US'],
  [
    'Northwind Logistics',
    'northwind.example',
    'Logistics',
    '51-200',
    140,
    22_500_000,
    'Rotterdam',
    'NL',
  ],
  ['Globex Software', 'globex.example', 'Software', '51-200', 95, 15_000_000, 'Austin', 'US'],
  ['Initech Systems', 'initech.example', 'IT services', '11-50', 38, 6_200_000, 'Dublin', 'IE'],
  [
    'Umbrella Health',
    'umbrella.example',
    'Healthcare',
    '501-1000',
    740,
    120_000_000,
    'London',
    'GB',
  ],
  ['Stark Renewables', 'stark.example', 'Energy', '201-500', 410, 88_000_000, 'Munich', 'DE'],
  ['Wayne Retail Group', 'wayne.example', 'Retail', '1000+', 2300, 410_000_000, 'Toronto', 'CA'],
  ['Hooli Media', 'hooli.example', 'Media', '51-200', 180, 31_000_000, 'San Francisco', 'US'],
  ['Pied Piper Analytics', 'piedpiper.example', 'Software', '11-50', 27, 3_400_000, 'Sofia', 'BG'],
  [
    'Cyberdyne Robotics',
    'cyberdyne.example',
    'Robotics',
    '201-500',
    360,
    64_000_000,
    'Tokyo',
    'JP',
  ],
] as const

const FIRST = ['Emma', 'Oliver', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Isla', 'Mateo', 'Zoe', 'Arjun']
const LAST = [
  'Hughes',
  'Rossi',
  'Nguyen',
  'Andersson',
  'Silva',
  'Kowalski',
  'Haddad',
  'Moreau',
  'Ito',
  'Brandt',
]
const TITLES = [
  'CEO',
  'CTO',
  'VP Sales',
  'Head of Operations',
  'Procurement Lead',
  'Marketing Director',
  'IT Manager',
]

const TAGS = [
  ['VIP', '#f59e0b'],
  ['Enterprise', '#6366f1'],
  ['Partner', '#10b981'],
  ['Renewal', '#0ea5e9'],
  ['At risk', '#ef4444'],
] as const

// [title, status, priority, value, source, score, contact index]
const LEADS: [string, LeadStatus, LeadPriority, number, string, number, number][] = [
  ['Website redesign inquiry', 'NEW', 'MEDIUM', 12000, 'Website', 20, 0],
  ['Webinar attendee follow-up', 'NEW', 'LOW', 4000, 'Webinar', 15, 3],
  ['Inbound demo request', 'CONTACTED', 'HIGH', 38000, 'Website', 45, 5],
  ['Conference booth visitor', 'CONTACTED', 'MEDIUM', 15000, 'Event', 35, 7],
  ['Partner referral: logistics suite', 'QUALIFIED', 'HIGH', 54000, 'Referral', 65, 9],
  ['Annual support contract', 'QUALIFIED', 'MEDIUM', 21000, 'Existing customer', 60, 11],
  ['Pilot programme proposal', 'PROPOSAL_SENT', 'HIGH', 76000, 'Outbound', 75, 13],
  ['Platform migration', 'NEGOTIATION', 'HIGH', 120000, 'Referral', 85, 15],
  ['Training package', 'LOST', 'LOW', 6500, 'Cold call', 10, 17],
]

// [title, company index, stage position, amount, owner (team index), expected close in days, tag]
const DEALS: [string, number, number, number, number, number, string | null][] = [
  ['Acme – ERP integration', 0, 1, 65000, 1, 60, 'Enterprise'],
  ['Northwind – Fleet tracking', 1, 1, 28000, 2, 45, null],
  ['Globex – Platform licences', 2, 2, 90000, 1, 30, 'VIP'],
  ['Initech – Managed services', 3, 2, 18000, 2, 21, null],
  ['Umbrella – Patient portal', 4, 2, 210000, 0, 40, 'Enterprise'],
  ['Stark – Grid analytics', 5, 3, 145000, 1, 14, 'VIP'],
  ['Wayne – POS rollout', 6, 3, 380000, 0, 10, 'Enterprise'],
  ['Hooli – Ad platform renewal', 7, 3, 52000, 2, 7, 'Renewal'],
  ['Pied Piper – Data pipeline', 8, 4, 24000, 2, -12, null],
  ['Cyberdyne – Robotics support', 9, 4, 98000, 1, -30, 'Partner'],
  ['Acme – Warehouse sensors', 0, 4, 41000, 1, -50, null],
  ['Globex – Add-on seats', 2, 5, 12000, 2, -20, 'At risk'],
  ['Initech – Security audit', 3, 5, 9000, 1, -40, null],
]

const ACTIVITY_SUBJECTS: [ActivityType, string, string][] = [
  ['CALL', 'Discovery call', 'Covered requirements, timeline and budget.'],
  ['EMAIL', 'Sent proposal', 'Shared the proposal PDF and pricing options.'],
  ['MEETING', 'Product demo', 'Walked the team through the main workflows.'],
  ['CALL', 'Follow-up call', 'Answered questions about onboarding.'],
  ['EMAIL', 'Contract draft', 'Sent the draft contract for legal review.'],
  ['NOTE', 'Internal sync', 'Decision maker is on holiday until next week.'],
]

const NOTE_BODIES = [
  'Prefers email over calls. Best reached in the morning.',
  'Budget approved for this quarter; waiting on procurement.',
  'Evaluating two competitors. Price is the main concern.',
  'Champion on the customer side is the IT manager.',
]

const TASKS: [string, TaskStatus, TaskPriority, number | null, number | null][] = [
  // [title, status, priority, due in days (negative = overdue), reminder minutes]
  ['Send revised quote', 'TODO', 'HIGH', 1, 60],
  ['Prepare demo environment', 'IN_PROGRESS', 'MEDIUM', 2, 1440],
  ['Call back about onboarding', 'TODO', 'MEDIUM', 0, 30],
  ['Chase signed contract', 'TODO', 'HIGH', -2, null],
  ['Update CRM notes after workshop', 'DONE', 'LOW', -3, null],
  ['Book follow-up meeting', 'TODO', 'LOW', 5, null],
  ['Review security questionnaire', 'IN_PROGRESS', 'HIGH', 3, 120],
  ['Share case study', 'DONE', 'LOW', -6, null],
  ['Renewal pricing check', 'TODO', 'MEDIUM', 9, 1440],
  ['Intro email to new champion', 'TODO', 'MEDIUM', 7, null],
  ['Internal deal review', 'TODO', 'HIGH', 12, 60],
  ['Plan QBR agenda', 'IN_PROGRESS', 'LOW', 15, null],
]

const EVENTS: [string, string | null, number, number, number, boolean][] = [
  // [title, location, day offset, start hour (UTC), duration in hours, all day]
  ['Weekly pipeline review', 'Meeting room 2', 0, 9, 1, false],
  ['Discovery call – Acme', 'Zoom', 1, 14, 1, false],
  ['Product demo – Globex', 'Zoom', 2, 11, 1, false],
  ['Lunch with Northwind', 'Café Roma', 3, 12, 2, false],
  ['Team offsite', 'Head office', 6, 0, 24, true],
  ['Contract negotiation – Umbrella', 'Teams', 4, 15, 1, false],
  ['QBR – Stark Renewables', 'Munich office', 8, 10, 3, false],
  ['Sales training', 'Online', 10, 13, 2, false],
  ['Customer success sync', 'Meeting room 1', -2, 10, 1, false],
  ['Kick-off – Initech', 'Zoom', -5, 15, 1, false],
  ['Public holiday', null, 14, 0, 24, true],
  ['Board forecast prep', 'Head office', 11, 9, 2, false],
]

/**
 * Fills tables the main seed leaves empty (tasks, calendar events, notifications, emails, documents,
 * lead attachments). Each block only runs when its table has little or no data, so it is safe to repeat.
 */
async function topUp() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  if (users.length === 0) return
  const [contacts, deals, leads] = await Promise.all([
    prisma.contact.findMany({ take: 30, orderBy: { createdAt: 'asc' } }),
    prisma.deal.findMany({ take: 20, orderBy: { createdAt: 'asc' } }),
    prisma.lead.findMany({ take: 10, orderBy: { createdAt: 'asc' } }),
  ])
  const added: string[] = []

  if ((await prisma.task.count()) < 5) {
    for (const [i, [title, status, priority, due, reminder]] of TASKS.entries()) {
      const assignee = users[i % users.length]
      const dueDate = due === null ? null : new Date(Date.now() + due * DAY)
      await prisma.task.create({
        data: {
          title,
          description: i % 2 === 0 ? 'Created from the demo data.' : null,
          status,
          priority,
          dueDate,
          reminderMinutes: dueDate ? reminder : null,
          assigneeId: assignee.id,
          creatorId: users[(i + 1) % users.length].id,
          contactId: i % 3 === 0 && contacts.length ? contacts[i % contacts.length].id : null,
          dealId: i % 3 === 1 && deals.length ? deals[i % deals.length].id : null,
        },
      })
    }
    added.push(`${TASKS.length} tasks`)
  }

  if ((await prisma.calendarEvent.count()) === 0) {
    for (const [i, [title, location, offset, hour, hours, allDay]] of EVENTS.entries()) {
      const day = new Date()
      day.setUTCHours(hour, 0, 0, 0)
      const startsAt = new Date(day.getTime() + offset * DAY)
      await prisma.calendarEvent.create({
        data: {
          title,
          location,
          description: i % 2 === 0 ? 'Agenda to be shared beforehand.' : null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + hours * 60 * 60 * 1000 - (allDay ? 1000 : 0)),
          allDay,
          userId: users[i % users.length].id,
        },
      })
    }
    added.push(`${EVENTS.length} calendar events`)
  }

  if ((await prisma.notification.count()) === 0) {
    const messages = [
      ['TASK_REMINDER', 'Task "Send revised quote" is due tomorrow'],
      ['TASK_REMINDER', 'Task "Chase signed contract" was overdue'],
      ['TASK_ASSIGNED', 'You were assigned "Prepare demo environment"'],
      ['DEAL_WON', 'Deal "Globex – Add-on seats" was marked as won'],
    ]
    for (const user of users) {
      for (const [i, [type, message]] of messages.entries()) {
        await prisma.notification.create({
          data: {
            type,
            message,
            userId: user.id,
            readAt: i >= 3 ? daysAgo(1) : null,
            createdAt: daysAgo(i * 0.5),
          },
        })
      }
    }
    added.push(`${users.length * messages.length} notifications`)
  }

  if ((await prisma.email.count()) === 0 && contacts.length) {
    const subjects = [
      'Following up on our call',
      'Proposal and pricing',
      'Meeting recap',
      'Quick question about onboarding',
    ]
    let n = 0
    for (const [i, contact] of contacts.slice(0, 12).entries()) {
      const user = users[i % users.length]
      for (const k of [0, 1]) {
        const outbound = k === 0
        const sentAt = daysAgo(3 + i + k)
        await prisma.email.create({
          data: {
            subject: (outbound ? '' : 'Re: ') + subjects[i % subjects.length],
            body: outbound
              ? `Hi ${contact.firstName},\n\nThanks for your time. Sharing the details we discussed.\n\nBest,\n${user.firstName}`
              : `Hi ${user.firstName},\n\nThanks, this is helpful. Let's talk next week.\n\n${contact.firstName}`,
            fromAddr: outbound ? user.email : (contact.email ?? 'contact@example.com'),
            toAddr: outbound ? (contact.email ?? 'contact@example.com') : user.email,
            sentAt,
            userId: user.id,
            contactId: contact.id,
            createdAt: sentAt,
          },
        })
        n++
      }
    }
    added.push(`${n} emails`)
  }

  if ((await prisma.document.count()) === 0 && deals.length) {
    const docs = [
      ['Proposal.pdf', 'application/pdf', 184_320],
      [
        'Contract-draft.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        96_256,
      ],
      ['Pricing.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 42_100],
    ] as const
    let n = 0
    for (const [i, deal] of deals.slice(0, 8).entries()) {
      const [name, mimeType, sizeBytes] = docs[i % docs.length]
      await prisma.document.create({
        data: {
          name,
          mimeType,
          sizeBytes,
          url: `https://files.example/${deal.id}/${name}`,
          uploadedById: users[i % users.length].id,
          dealId: deal.id,
        },
      })
      n++
    }
    added.push(`${n} documents`)
  }

  if ((await prisma.leadAttachment.count()) === 0 && leads.length) {
    let n = 0
    for (const [i, lead] of leads.slice(0, 5).entries()) {
      const data = Buffer.from(`Demo attachment for lead "${lead.title}".\n`)
      await prisma.leadAttachment.create({
        data: {
          leadId: lead.id,
          name: i % 2 === 0 ? 'requirements.txt' : 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: data.length,
          data,
          uploadedById: users[i % users.length].id,
        },
      })
      n++
    }
    added.push(`${n} lead attachments`)
  }

  console.log(added.length ? `Topped up: ${added.join(', ')}` : 'Nothing to top up.')
}

async function main() {
  if (await prisma.user.findUnique({ where: { email: TEAM[0].email } })) {
    console.log('Demo team already present, skipping the main seed.')
    await topUp()
    return
  }

  await syncPermissions(prisma)
  const firstStage = await ensureFirstDealStage(prisma)
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { id: firstStage.pipelineId },
    include: { stages: { orderBy: { position: 'asc' } } },
  })
  const stageAt = (pos: number) => pipeline.stages.find((s) => s.position === pos)!

  const roles = new Map((await prisma.role.findMany()).map((r) => [r.name, r.id]))
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const team = []
  for (const u of TEAM) {
    team.push(
      await prisma.user.create({
        data: {
          email: u.email,
          passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          roleId: roles.get(u.role)!,
        },
      }),
    )
  }
  const sellers = [team[0], team[1], team[2]]
  const seller = (i: number) => sellers[i % sellers.length]

  const tags = new Map<string, string>()
  for (const [name, color] of TAGS) {
    const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name, color } })
    tags.set(name, tag.id)
  }

  const companies = []
  for (const [i, c] of COMPANIES.entries()) {
    companies.push(
      await prisma.company.create({
        data: {
          name: c[0],
          domain: c[1],
          website: `https://www.${c[1]}`,
          industry: c[2],
          size: c[3],
          employees: c[4],
          revenue: c[5],
          city: c[6],
          country: c[7],
          phone: `+1 555 01${String(i).padStart(2, '0')}`,
          ownerId: seller(i).id,
          createdAt: daysAgo(120 - i * 7),
        },
      }),
    )
  }

  // Two contacts per company.
  const contacts = []
  for (let i = 0; i < 20; i++) {
    const company = companies[i % companies.length]
    const first = FIRST[i % FIRST.length]
    const last = LAST[(i * 3 + 1) % LAST.length]
    contacts.push(
      await prisma.contact.create({
        data: {
          firstName: first,
          lastName: last,
          email: `${first}.${last}${i}@${company.domain}`.toLowerCase(),
          phone: `+1 555 02${String(i).padStart(2, '0')}`,
          jobTitle: TITLES[i % TITLES.length],
          city: company.city,
          country: company.country,
          linkedinUrl: `https://www.linkedin.com/in/${first}-${last}-${i}`.toLowerCase(),
          companyId: company.id,
          ownerId: seller(i).id,
          createdAt: daysAgo(100 - i * 4),
        },
      }),
    )
  }

  for (const [i, [title, status, priority, value, source, score, ci]] of LEADS.entries()) {
    const lead = await prisma.lead.create({
      data: {
        title,
        status,
        priority,
        value,
        source,
        score,
        notes:
          i % 2 === 0 ? 'Came in via ' + source.toLowerCase() + '; needs a first reply.' : null,
        contactId: contacts[ci % contacts.length].id,
        ownerId: seller(i).id,
        createdAt: daysAgo(40 - i * 4),
      },
    })
    if (priority === 'HIGH') {
      await prisma.tagOnLead.create({ data: { tagId: tags.get('VIP')!, leadId: lead.id } })
    }
  }

  const deals = []
  for (const [i, [title, ci, pos, amount, owner, closeIn, tag]] of DEALS.entries()) {
    const stage = stageAt(pos)
    const closed = stage.isWon || stage.isLost
    const deal = await prisma.deal.create({
      data: {
        title,
        amount,
        currency: 'USD',
        status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
        probability: stage.probability,
        expectedClose: daysAhead(closeIn),
        closedAt: closed ? daysAgo(-closeIn) : null,
        pipelineId: pipeline.id,
        stageId: stage.id,
        companyId: companies[ci].id,
        contactId: contacts[ci].id,
        ownerId: team[owner].id,
        createdAt: daysAgo(90 - i * 5),
      },
    })
    deals.push(deal)
    if (tag) await prisma.tagOnDeal.create({ data: { tagId: tags.get(tag)!, dealId: deal.id } })
  }

  // Activities on deals and contacts, spread over the last weeks.
  let a = 0
  for (const [i, deal] of deals.entries()) {
    for (let k = 0; k < 2 + (i % 2); k++) {
      const [type, subject, description] = ACTIVITY_SUBJECTS[(i + k) % ACTIVITY_SUBJECTS.length]
      await prisma.activity.create({
        data: {
          type,
          subject,
          description,
          occurredAt: daysAgo(2 + a++ * 2),
          userId: deal.ownerId ?? team[0].id,
          dealId: deal.id,
          contactId: deal.contactId,
        },
      })
    }
  }
  for (const [i, contact] of contacts.slice(0, 8).entries()) {
    const [type, subject, description] = ACTIVITY_SUBJECTS[i % ACTIVITY_SUBJECTS.length]
    await prisma.activity.create({
      data: {
        type,
        subject,
        description,
        occurredAt: daysAgo(1 + i * 3),
        userId: contact.ownerId ?? team[0].id,
        contactId: contact.id,
      },
    })
  }

  // Notes and a few tags on companies and contacts.
  for (const [i, company] of companies.entries()) {
    await prisma.note.create({
      data: {
        body: NOTE_BODIES[i % NOTE_BODIES.length],
        authorId: company.ownerId ?? team[0].id,
        companyId: company.id,
        createdAt: daysAgo(30 - i),
      },
    })
    if (i % 3 === 0) {
      await prisma.tagOnCompany.create({
        data: { tagId: tags.get(i % 2 === 0 ? 'Enterprise' : 'Partner')!, companyId: company.id },
      })
    }
  }
  for (const [i, contact] of contacts.entries()) {
    if (i % 4 === 0) {
      await prisma.note.create({
        data: {
          body: NOTE_BODIES[(i + 1) % NOTE_BODIES.length],
          authorId: contact.ownerId ?? team[0].id,
          contactId: contact.id,
        },
      })
      await prisma.tagOnContact.create({ data: { tagId: tags.get('VIP')!, contactId: contact.id } })
    }
  }

  await topUp()
  console.log(
    `Seeded demo data: ${team.length} users (password ${DEMO_PASSWORD}), ${companies.length} companies, ` +
      `${contacts.length} contacts, ${LEADS.length} leads, ${deals.length} deals`,
  )
}

main().finally(() => prisma.$disconnect())
