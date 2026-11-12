const messageContent = {
  'application/json': {
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  },
} as const

const userContent = {
  'application/json': {
    schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
  },
} as const

/** OpenAPI 3 description of the API. Add new paths here as endpoints are built. */
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'CRM API',
    version: '1.0.0',
    description: 'REST API for the CRM application.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'System' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Dashboard' },
    {
      name: 'Reports',
      description:
        'Sales, revenue, funnel, lead conversion, win rate, lost deals and team performance reports for managers.',
    },
    { name: 'Records' },
    { name: 'Tasks', description: 'Follow-ups with an assignee, due date, priority and status.' },
    {
      name: 'Calendar',
      description: 'Your calls, meetings, task due dates and deal deadlines by day.',
    },
    { name: 'Pipelines', description: 'Deal pipelines and their stages (admins change them).' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Reports whether the API is running and the database is reachable.',
        responses: {
          '200': {
            description: 'API and database are up',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
                example: { status: 'ok', database: 'up', uptime: 12.3 },
              },
            },
          },
          '503': {
            description: 'Database is unreachable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
                example: { status: 'error', database: 'down' },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        description:
          'Creates a user with the default (least-privilege) SUPPORT role and returns a session, like login.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
              example: {
                firstName: 'Ann',
                lastName: 'Lee',
                email: 'ann@example.com',
                password: 'Secret123',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': {
            description: 'Email already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        description:
          'Always responds 200 with the same message, whether or not the email has an account.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Request accepted', content: messageContent },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using an emailed token',
        description: 'Tokens are single-use and expire.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: { token: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password updated', content: messageContent },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Get a new access token using the refresh cookie',
        description:
          'Reads the httpOnly `crm_refresh` cookie, rotates it (the old one stops working) and returns a fresh access token. Replaying an old refresh token revokes the whole session.',
        responses: {
          '200': {
            description: 'New access token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '401': {
            description: 'Missing, expired or revoked refresh token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'End the session',
        description: 'Revokes the refresh token and clears the cookie. Always succeeds.',
        responses: { '204': { description: 'Logged out' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'Returns a short-lived access token (use as Bearer) and sets the httpOnly refresh cookie.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: { email: 'admin@crm.local', password: 'Admin123!' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Credentials valid',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': {
            description: 'Invalid email or password',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get my profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'My profile', content: userContent },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update my profile',
        description:
          'Only the fields sent are changed. Email and role cannot be changed here. An empty avatarUrl removes the avatar.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true, description: 'http(s) URL' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated profile', content: userContent },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Dashboard summary',
        description:
          'Sales overview, new leads and open deals. A section is `null` when the caller lacks read access (`deals:read` for sales and open deals, `leads:read` for leads).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Summary figures',
            content: {
              'application/json': {
                example: {
                  sales: {
                    wonThisMonth: { revenue: 42000, deals: 3 },
                    wonLastMonthRevenue: 31000,
                  },
                  newLeads: { last7Days: 5, awaitingContact: 12 },
                  openDeals: { count: 8, value: 96500 },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/dashboard/revenue': {
      get: {
        tags: ['Dashboard'],
        summary: 'Monthly revenue',
        description:
          'Revenue from won deals for each of the last 12 months, oldest first (empty months are 0). Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Twelve monthly buckets',
            content: {
              'application/json': {
                example: {
                  months: [
                    { month: '2026-10', revenue: 31000, deals: 4 },
                    { month: '2026-11', revenue: 42000, deals: 3 },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/reports/monthly-sales': {
      get: {
        tags: ['Reports'],
        summary: 'Monthly sales report',
        description:
          'For each month of a year: deals won, their total value and the average deal size, plus year totals. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'year',
            in: 'query',
            schema: { type: 'integer', minimum: 2000, maximum: 2100 },
            description: 'Calendar year (defaults to the current year)',
          },
        ],
        responses: {
          '200': {
            description: 'Twelve monthly rows and totals',
            content: {
              'application/json': {
                example: {
                  year: 2026,
                  months: [{ month: '2026-01', dealsWon: 2, revenue: 1500, averageDeal: 750 }],
                  totals: { dealsWon: 2, revenue: 1500, averageDeal: 750 },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/reports/revenue': {
      get: {
        tags: ['Reports'],
        summary: 'Revenue report',
        description:
          'Won revenue per month of a year with a running total and the same month a year earlier, the change against the previous year (`changePercent` is null when last year had no revenue) and revenue by pipeline. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'year',
            in: 'query',
            schema: { type: 'integer', minimum: 2000, maximum: 2100 },
            description: 'Calendar year (defaults to the current year)',
          },
        ],
        responses: {
          '200': {
            description: 'Twelve monthly rows, totals and a pipeline split',
            content: {
              'application/json': {
                example: {
                  year: 2026,
                  months: [
                    { month: '2026-01', revenue: 1500, cumulative: 1500, previousYear: 2000 },
                  ],
                  totals: { revenue: 1500, previousYear: 2000, changePercent: -25 },
                  byPipeline: [{ pipelineId: 'clx…', name: 'Sales', revenue: 1500, deals: 2 }],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/reports/funnel': {
      get: {
        tags: ['Reports'],
        summary: 'Sales funnel report',
        description:
          'For one pipeline: the deals at each stage now, how many have reached at least that stage (lost deals excluded), the share that made it from the previous stage and the weakest step (`bottleneckStageId`). Lost deals are totalled apart. It is a snapshot of where deals are today. Defaults to the default pipeline. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'pipelineId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Pipeline to report on (defaults to the default pipeline)',
          },
        ],
        responses: {
          '200': {
            description: 'Funnel stages, lost deals and the bottleneck',
            content: {
              'application/json': {
                example: {
                  pipelines: [{ id: 'clx…', name: 'Sales' }],
                  pipeline: { id: 'clx…', name: 'Sales' },
                  stages: [
                    {
                      stageId: 'clx…',
                      name: 'New',
                      isWon: false,
                      deals: 3,
                      value: 600,
                      reached: 7,
                      conversionPercent: null,
                    },
                  ],
                  lost: { deals: 2, value: 1300 },
                  bottleneckStageId: 'clx…',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Pipeline not found' },
        },
      },
    },
    '/reports/lead-conversion': {
      get: {
        tags: ['Reports'],
        summary: 'Lead conversion report',
        description:
          'Of the leads created in a year: how many became deals, were lost or are still open, with the conversion rate (`conversionPercent` is null with no leads), by month created and by source. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'year',
            in: 'query',
            schema: { type: 'integer', minimum: 2000, maximum: 2100 },
            description: 'Calendar year (defaults to the current year)',
          },
        ],
        responses: {
          '200': {
            description: 'Totals, twelve monthly rows and a source split',
            content: {
              'application/json': {
                example: {
                  year: 2026,
                  months: [{ month: '2026-01', leads: 2, converted: 1, conversionPercent: 50 }],
                  totals: { leads: 5, converted: 2, conversionPercent: 40, lost: 1, open: 2 },
                  bySource: [{ source: 'Web', leads: 3, converted: 1, conversionPercent: 33.3 }],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/reports/win-rate': {
      get: {
        tags: ['Reports'],
        summary: 'Win rate report',
        description:
          'Of the deals that closed in a year, the share that were won (won ÷ won + lost), in total, by month and by pipeline. `winRatePercent` is null when nothing closed. Open deals are left out. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'year',
            in: 'query',
            schema: { type: 'integer', minimum: 2000, maximum: 2100 },
            description: 'Calendar year (defaults to the current year)',
          },
        ],
        responses: {
          '200': {
            description: 'Twelve monthly rows, totals and a pipeline split',
            content: {
              'application/json': {
                example: {
                  year: 2026,
                  months: [{ month: '2026-01', won: 2, lost: 1, winRatePercent: 66.7 }],
                  totals: { won: 3, lost: 1, winRatePercent: 75 },
                  byPipeline: [
                    { pipelineId: 'clx…', name: 'Sales', won: 3, lost: 1, winRatePercent: 75 },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/reports/lost-deals': {
      get: {
        tags: ['Reports'],
        summary: 'Lost deals report',
        description:
          'Deals lost in a year: count, value, average size and average days open, by month and pipeline, and the ten biggest with owner and days open. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'year',
            in: 'query',
            schema: { type: 'integer', minimum: 2000, maximum: 2100 },
            description: 'Calendar year (defaults to the current year)',
          },
        ],
        responses: {
          '200': {
            description: 'Totals, twelve monthly rows, a pipeline split and the biggest lost deals',
            content: {
              'application/json': {
                example: {
                  year: 2026,
                  months: [{ month: '2026-01', deals: 1, value: 9999 }],
                  totals: { deals: 1, value: 9999, averageDeal: 9999, averageDaysOpen: 21 },
                  byPipeline: [{ pipelineId: 'clx…', name: 'Sales', deals: 1, value: 9999 }],
                  biggest: [
                    {
                      id: 'clx…',
                      title: 'Acme renewal',
                      amount: 9999,
                      pipeline: 'Sales',
                      owner: 'Sam Seller',
                      closedAt: '2026-01-15T10:00:00.000Z',
                      daysOpen: 21,
                    },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/reports/team-performance': {
      get: {
        tags: ['Reports'],
        summary: 'Team performance report',
        description:
          'One row per active person for a year: deals won and lost, win rate, revenue, open deals and their value, leads owned and converted, activities logged, tasks completed, open and overdue. Open deals and tasks are a snapshot of today; completed tasks are those done and last updated in the year. People with nothing to show are left out. Sorted by revenue. Requires `reports:read` (Manager, Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'year',
            in: 'query',
            schema: { type: 'integer', minimum: 2000, maximum: 2100 },
            description: 'Calendar year (defaults to the current year)',
          },
        ],
        responses: {
          '200': {
            description: 'A row per team member and team totals',
            content: {
              'application/json': {
                example: {
                  year: 2026,
                  members: [
                    {
                      userId: 'clx…',
                      name: 'Sam Seller',
                      role: 'SALES',
                      dealsWon: 3,
                      dealsLost: 1,
                      winRatePercent: 75,
                      revenue: 12000,
                      openDeals: 4,
                      openValue: 30000,
                      leads: 10,
                      leadsConverted: 3,
                      activities: 42,
                      tasksCompleted: 15,
                      tasksOpen: 5,
                      tasksOverdue: 1,
                    },
                  ],
                  totals: {
                    dealsWon: 3,
                    dealsLost: 1,
                    winRatePercent: 75,
                    revenue: 12000,
                    activities: 42,
                    tasksCompleted: 15,
                    tasksOverdue: 1,
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/dashboard/attention': {
      get: {
        tags: ['Dashboard'],
        summary: 'Tasks, activity and notifications',
        description:
          "The caller's open tasks (soonest due first, with open and overdue counts), the latest team activities, and the caller's own notifications (with unread count). `tasks` needs `tasks:read` and `activities` needs `activities:read`; each is `null` otherwise.",
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Up to five of each',
            content: {
              'application/json': {
                example: {
                  tasks: {
                    items: [
                      {
                        id: 'c1',
                        title: 'Call Acme',
                        status: 'TODO',
                        dueDate: '2026-11-05T09:00:00.000Z',
                      },
                    ],
                    open: 4,
                    overdue: 1,
                  },
                  activities: [
                    {
                      id: 'a1',
                      type: 'CALL',
                      subject: 'Intro call',
                      occurredAt: '2026-11-04T10:00:00.000Z',
                      user: { firstName: 'Ann', lastName: 'Lee' },
                      contact: { firstName: 'Bob', lastName: 'Ray' },
                      deal: null,
                    },
                  ],
                  notifications: {
                    items: [
                      {
                        id: 'n1',
                        type: 'task',
                        message: 'A task was assigned to you',
                        readAt: null,
                        createdAt: '2026-11-04T10:00:00.000Z',
                      },
                    ],
                    unread: 1,
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/contacts': {
      get: {
        tags: ['Records'],
        summary: 'List contacts',
        description:
          'Requires `contacts:read`. `q` matches name, email, phone, job title or company name: every word must match somewhere, so "bob acme" finds Bob at Acme. Filters combine with AND. Sorted by `sort`/`dir` with a stable tie-break, so pages never overlap.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'company', in: 'query', schema: { type: 'string' }, description: 'Company id' },
          {
            name: 'tag',
            in: 'query',
            schema: { type: 'array', items: { type: 'string' }, maxItems: 20 },
            style: 'form',
            explode: true,
            description: 'Tag name; repeat (`tag=a&tag=b`) to filter by several',
          },
          {
            name: 'tagMode',
            in: 'query',
            schema: { type: 'string', enum: ['any', 'all'], default: 'any' },
            description: 'With several tags: contacts with `any` of them, or with `all` of them',
          },
          { name: 'owner', in: 'query', schema: { type: 'string', enum: ['me'] } },
          {
            name: 'sort',
            in: 'query',
            schema: { type: 'string', enum: ['name', 'company', 'createdAt'], default: 'name' },
          },
          {
            name: 'dir',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ contacts, total, page, pageSize }`' },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Records'],
        summary: 'Create contact',
        description:
          'Requires `contacts:write`. `company` is a name: an existing company (any letter case) is linked, otherwise a new one is created (needs `companies:write`). Tags are reused by name or created. `note` becomes the first note on the contact. The contact is owned by the caller.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['firstName', 'lastName'],
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  jobTitle: { type: 'string' },
                  company: { type: 'string' },
                  address: { type: 'string' },
                  city: { type: 'string' },
                  postalCode: { type: 'string' },
                  country: { type: 'string' },
                  linkedinUrl: { type: 'string', format: 'uri' },
                  twitterUrl: { type: 'string', format: 'uri' },
                  facebookUrl: { type: 'string', format: 'uri' },
                  tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created; the contact is returned with its company, tags and notes',
          },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/contacts/export': {
      get: {
        tags: ['Records'],
        summary: 'Export contacts as CSV',
        description:
          'Requires `contacts:export` (Manager, Admin). Downloads every contact matching the same `q`, `company`, `tag`, `tagMode` and `owner` filters as the list (not just one page) as a UTF-8 CSV with a BOM, using the column names the import understands plus `owner` and `created`. Notes are not included. At most 10,000 contacts per download. Spreadsheet formulas in cells are neutralised. Recorded in the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'company', in: 'query', schema: { type: 'string' }, description: 'Company id' },
          {
            name: 'tag',
            in: 'query',
            schema: { type: 'array', items: { type: 'string' }, maxItems: 20 },
            style: 'form',
            explode: true,
            description: 'Tag name; repeat (`tag=a&tag=b`) to filter by several',
          },
          {
            name: 'tagMode',
            in: 'query',
            schema: { type: 'string', enum: ['any', 'all'], default: 'any' },
            description: 'With several tags: contacts with `any` of them, or with `all` of them',
          },
          { name: 'owner', in: 'query', schema: { type: 'string', enum: ['me'] } },
          {
            name: 'delimiter',
            in: 'query',
            schema: { type: 'string', enum: ['comma', 'semicolon'], default: 'comma' },
            description: 'Use `semicolon` for Excel in locales that expect it',
          },
        ],
        responses: {
          '200': {
            description: 'The file',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          '400': { description: 'Invalid query, or more than 10,000 matching contacts' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/contacts/import': {
      post: {
        tags: ['Records'],
        summary: 'Import contacts from CSV',
        description:
          "Requires `contacts:write`. Send the file contents as `text/csv` (max 2 MB, 2000 rows; comma, semicolon or tab separated; UTF-8). The first row is the header; `first name` and `last name` columns are required, and `email`, `phone`, `job title`, `company`, `address`, `city`, `postal code`, `country`, `linkedin`, `twitter`, `facebook`, `tags` (separated by `;` `,` or `|`) and `note` are optional. Unknown columns are ignored and listed. Rows that fail validation, repeat an email earlier in the file, or match an existing contact's email are skipped and listed under `rejected` with their row number (header = row 1); all other rows are imported, owned by the caller. Contacts without an email cannot be matched, so importing the same file twice adds them again. `dryRun=true` checks everything and saves nothing.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'dryRun', in: 'query', schema: { type: 'boolean', default: false } }],
        requestBody: {
          required: true,
          content: { 'text/csv': { schema: { type: 'string' } } },
        },
        responses: {
          '200': {
            description: 'Preview (`dryRun`), or nothing valid to import',
            content: {
              'application/json': {
                example: {
                  dryRun: true,
                  total: 3,
                  valid: 2,
                  imported: 0,
                  ignoredColumns: ['Internal ID'],
                  rejected: [
                    { row: 3, name: 'Gus', errors: { lastName: 'Last name is required' } },
                  ],
                },
              },
            },
          },
          '201': { description: 'Imported; same shape, with `imported` set' },
          '400': {
            description:
              'The file cannot be used at all (not CSV, missing name columns, empty, too many rows)',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '413': { description: 'File larger than 2 MB' },
        },
      },
    },
    '/contacts/{id}/overview': {
      get: {
        tags: ['Records'],
        summary: 'Contact with its relationship history',
        description:
          'Requires `contacts:read`. Returns `contact` (with company, owner and tags) plus `activities` (newest first), `tasks` (unfinished first, soonest due first), `emails` and `notes` (newest first), each `{ total, items }` with the first 50. A section the caller cannot read (`activities:read`, `tasks:read`, `emails:read`, `notes:read`) is `null`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The contact and its history' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Contact not found' },
        },
      },
    },
    '/contacts/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get contact',
        description:
          'Requires `contacts:read`. Includes company, tags, notes, counts of related records (`related`) and `canDelete` for the caller.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The contact' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'No such contact' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Update contact',
        description:
          'Requires `contacts:write`. Send only what changes: a field left out is kept, `null` clears an optional field (`company: null` unlinks the company). `tags` replaces the whole tag list. Owner cannot be changed here.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Same fields as create (except `note`); all optional, most nullable.',
              },
            },
          },
        },
        responses: {
          '200': { description: 'The updated contact' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'No such contact' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Delete contact',
        description:
          "Needs `contacts:delete` (Manager, Admin: any contact) or `contacts:delete_own` (Sales: contacts they own). The contact's notes, tasks, activities and tag links are deleted with it; its deals and leads stay but lose the link. Recorded in the audit log.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'No such contact' },
        },
      },
    },
    '/companies': {
      post: {
        tags: ['Records'],
        summary: 'Create a company',
        description:
          'Requires `companies:write`. Only `name` is required. `employees` is a whole number, `revenue` is annual with at most two decimals, `website` an http(s) link. Names are unique whatever their letter case (409). The caller becomes the owner.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CompanyInput' },
              example: {
                name: 'Acme',
                industry: 'Manufacturing',
                employees: 250,
                revenue: 12500000,
                website: 'https://acme.example.com',
              },
            },
          },
        },
        responses: {
          '201': { description: '`{ company }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': { description: 'A company with this name exists' },
        },
      },
      get: {
        tags: ['Records'],
        summary: 'Search companies',
        description:
          'Companies whose name contains `q`, for suggestions and filters (default 20, up to `limit` 100). Requires `companies:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ companies: [{ id, name }] }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/companies/details': {
      get: {
        tags: ['Records'],
        summary: 'List companies',
        description:
          'Requires `companies:read`. Companies whose name or industry contains `q`, by name, with `industry`, `employees`, `revenue`, `website`, `owner` and `contactCount` / `dealCount`. Paged (default 20, up to 100).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ companies, total, page, pageSize }`' },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/companies/{id}/overview': {
      get: {
        tags: ['Records'],
        summary: 'Company with its contacts, deals and notes',
        description:
          'Requires `companies:read`. Returns `company` plus `contacts`, `deals` and `notes`, each `{ total, items }` with the first 50 (contacts by name, deals and notes newest first). `deals` also has `open`: count and total value of open deals per currency. A section the caller cannot read (`contacts:read`, `deals:read`, `notes:read`) is `null`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The company and its related records' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Company not found' },
        },
      },
    },
    '/companies/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get a company',
        description: 'Requires `companies:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ company }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Company not found' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Edit a company',
        description:
          'Requires `companies:write`. Send only what changes: a field left out is kept, `null` clears `industry`, `employees`, `revenue` or `website`. The name cannot be cleared and must not match another company, whatever its letter case (409).',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CompanyInput' } },
          },
        },
        responses: {
          '200': { description: '`{ company }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Company not found' },
          '409': { description: 'Another company has this name' },
        },
      },
    },
    '/tags': {
      get: {
        tags: ['Records'],
        summary: 'Search tags',
        description:
          'Tag names containing `q`, for suggestions and filters (default 20, up to `limit` 100). Requires `contacts:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ tags: [name] }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/activities': {
      post: {
        tags: ['Records'],
        summary: 'Log an activity',
        description:
          'Requires `activities:write` and read access to the record. Give a `contactId`, a `dealId` or both. `type` is CALL, MEETING, EMAIL, SMS or NOTE; `subject` is required (200 characters), `description` is optional (5000). `occurredAt` defaults to now and cannot be in the future. The caller is recorded as the user. Activities appear in the contact overview and on the deal.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'subject'],
                properties: {
                  type: { type: 'string', enum: ['CALL', 'MEETING', 'EMAIL', 'SMS', 'NOTE'] },
                  subject: { type: 'string', maxLength: 200 },
                  description: { type: 'string', maxLength: 5000 },
                  occurredAt: { type: 'string', format: 'date-time' },
                  contactId: { type: 'string' },
                  dealId: { type: 'string' },
                },
              },
              example: { type: 'CALL', subject: 'Intro call', contactId: 'abc123' },
            },
          },
        },
        responses: {
          '201': {
            description:
              '`{ activity: { id, type, subject, description, occurredAt, contactId, dealId, user } }`',
          },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'The contact or deal was not found' },
        },
      },
    },
    '/deals/{id}/activities': {
      get: {
        tags: ['Records'],
        summary: 'Activities on a deal',
        description:
          'Requires `deals:read` and `activities:read`. Returns `{ total, items }` with the 50 most recent, newest first.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ total, items }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Deal not found' },
        },
      },
    },
    '/notes': {
      post: {
        tags: ['Records'],
        summary: 'Add a note',
        description:
          'Requires `notes:write` and read access to the record. Give exactly one of `contactId`, `companyId` or `dealId`. `body` is up to 5000 characters. The caller is the author. Notes appear in the contact and company overviews.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['body'],
                properties: {
                  body: { type: 'string', maxLength: 5000 },
                  contactId: { type: 'string' },
                  companyId: { type: 'string' },
                  dealId: { type: 'string' },
                },
              },
              example: { body: 'Prefers email. Budget around 50k.', contactId: 'abc123' },
            },
          },
        },
        responses: {
          '201': { description: '`{ note: { id, body, createdAt, updatedAt, author } }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'The contact, company or deal was not found' },
        },
      },
    },
    '/notes/{id}': {
      patch: {
        tags: ['Records'],
        summary: 'Edit a note',
        description: 'Requires `notes:write`. Only the author can edit a note.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['body'],
                properties: { body: { type: 'string', maxLength: 5000 } },
              },
            },
          },
        },
        responses: {
          '200': { description: '`{ note }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Note not found' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Delete a note',
        description:
          'The author can delete their own note; anyone with `notes:delete` can delete any note.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Note not found' },
        },
      },
    },
    '/tags/details': {
      get: {
        tags: ['Records'],
        summary: 'List tags with colour and usage',
        description:
          'Requires `contacts:read`. Every tag matching `q` (up to `limit`, default 100, max 500) with its `color` (`#rrggbb` or null), `contactCount` and `usageCount` (contacts, companies, leads and deals together).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
        ],
        responses: {
          '200': { description: '`{ tags: [{ id, name, color, contactCount, usageCount }] }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/tags/{id}': {
      patch: {
        tags: ['Records'],
        summary: 'Rename or recolour a tag',
        description:
          'Requires `tags:manage` (Manager, Admin). Send `name` and/or `color` (`#rrggbb`, or `null` to clear). A rename applies to every record that uses the tag. Names are unique whatever their letter case.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 50 },
                  color: { type: 'string', nullable: true, example: '#3b82f6' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '`{ tag: { id, name, color } }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Tag not found' },
          '409': { description: 'Another tag already has this name' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Delete a tag',
        description:
          'Requires `tags:manage` (Manager, Admin). Removes the tag from every contact, company, lead and deal that has it; the records themselves are kept. Recorded in the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Tag not found' },
        },
      },
    },
    '/contacts/bulk-tags': {
      post: {
        tags: ['Records'],
        summary: 'Add or remove tags on many contacts',
        description:
          'Requires `contacts:write`. Adds the `add` tags (created if new, matched whatever their letter case) and removes the `remove` tags on up to 500 contacts at once. All or nothing: if a contact would end up with more than 20 tags, nothing changes. Ids that match no contact are skipped and counted. Recorded in the audit log.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contactIds'],
                properties: {
                  contactIds: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1,
                    maxItems: 500,
                  },
                  add: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                  remove: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                },
              },
              example: { contactIds: ['c1', 'c2'], add: ['vip'], remove: ['cold'] },
            },
          },
        },
        responses: {
          '200': { description: '`{ updated, skipped }`' },
          '400': { description: 'Validation failed, or a contact would exceed 20 tags' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/leads': {
      post: {
        tags: ['Records'],
        summary: 'Create a lead',
        description:
          'Requires `leads:write`. Only `title` is required. A new lead is `NEW` with `MEDIUM` priority and is owned by the caller. Naming another active user as `ownerId` needs `leads:assign` (403 otherwise). `value` is the estimated worth, up to two decimals.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LeadInput' },
              example: {
                title: 'Website redesign enquiry',
                source: 'Trade show',
                value: 15000,
                priority: 'HIGH',
                notes: 'Wants a demo next week',
              },
            },
          },
        },
        responses: {
          '201': { description: '`{ lead }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      get: {
        tags: ['Records'],
        summary: 'List leads',
        description:
          'Requires `leads:read`. Newest first, without leads that have been converted into deals (see `converted`). Stages run NEW → CONTACTED → QUALIFIED → PROPOSAL_SENT → NEGOTIATION → WON or LOST. `q` matches title or source. Paged (default 20, up to 100).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'NEW',
                'CONTACTED',
                'QUALIFIED',
                'PROPOSAL_SENT',
                'NEGOTIATION',
                'WON',
                'LOST',
              ],
            },
          },
          {
            name: 'priority',
            in: 'query',
            schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          },
          {
            name: 'converted',
            in: 'query',
            description: 'Leads already converted into deals are left out unless `true`.',
            schema: { type: 'boolean', default: false },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description:
              '`{ leads, total, page, pageSize, stageCounts }`: `stageCounts` is the number of leads in each stage under the current search and priority',
          },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/leads/owners': {
      get: {
        tags: ['Records'],
        summary: 'Users a lead can be assigned to',
        description:
          'Requires `leads:assign`. Active users, by name: `{ owners: [{ id, firstName, lastName }] }`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: '`{ owners }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/leads/{id}/convert': {
      post: {
        tags: ['Records'],
        summary: 'Convert a lead into a deal',
        description:
          'Requires `leads:write` and `deals:write`. For a lead in Qualified, Proposal Sent or Negotiation that has not been converted. The body is optional and takes the same fields as creating a deal; anything left out comes from the lead: its name, value, contact and owner (or the caller if it has none). The lead’s notes become a note on the deal and its tags are copied; its files stay on the lead. The lead moves to Won and is linked to the deal (`lead.deal`). All or nothing. Returns `{ deal, lead }`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DealInput' } } },
        },
        responses: {
          '201': { description: '`{ deal, lead }`' },
          '400': { description: 'The deal is not valid (nothing is changed)' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
          '409': { description: 'Not a qualified lead, or already converted' },
        },
      },
    },
    '/leads/{id}/attachments': {
      get: {
        tags: ['Records'],
        summary: 'List a lead’s files',
        description:
          'Requires `leads:read`. Oldest first, without the file contents: `{ attachments: [{ id, name, mimeType, sizeBytes, createdAt, uploadedBy }] }`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ attachments }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
        },
      },
      post: {
        tags: ['Records'],
        summary: 'Attach a file to a lead',
        description:
          'Requires `leads:write`. The request body is the file itself, sent as `Content-Type: application/octet-stream`; `name` is required and `type` is the file’s real media type (default `application/octet-stream`). Up to 10 MB per file (413 above that) and 25 files per lead (409).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'name', in: 'query', required: true, schema: { type: 'string', maxLength: 200 } },
          { name: 'type', in: 'query', schema: { type: 'string', example: 'application/pdf' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
        responses: {
          '201': { description: '`{ attachment }`' },
          '400': { description: 'No name, or an empty or missing file' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
          '409': { description: 'The lead already has 25 files' },
          '413': { description: 'The file is over 10 MB' },
        },
      },
    },
    '/leads/{id}/attachments/{attachmentId}': {
      get: {
        tags: ['Records'],
        summary: 'Download a lead’s file',
        description:
          'Requires `leads:read`. Always served as a download (`Content-Disposition: attachment`) with a sandboxing `Content-Security-Policy`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'The file' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Attachment not found' },
        },
      },
      delete: {
        tags: ['Records'],
        summary: 'Remove a lead’s file',
        description: 'Requires `leads:write`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Removed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Attachment not found' },
        },
      },
    },
    '/leads/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get a lead',
        description: 'Requires `leads:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ lead }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Edit a lead',
        description:
          'Requires `leads:write`. Send only what changes: a field left out is kept, `null` clears `source`, `value`, `notes` or `ownerId`. The title cannot be cleared. Changing `ownerId` (to another user, or `null` for nobody) needs `leads:assign` (403 otherwise) and the new owner must be an active user; sending the current owner changes nothing. Each reassignment is written to the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } },
        },
        responses: {
          '200': { description: '`{ lead }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Lead not found' },
        },
      },
    },
    '/deals': {
      post: {
        tags: ['Records'],
        summary: 'Create a deal',
        description:
          'Requires `deals:write`. Only `title` (the name) is required. Without `stageId` the deal starts in the first stage of the default pipeline (created on first use if none exists). `probability` defaults to the stage’s; a deal created in a won or lost stage is closed at once, with probability 100 or 0. `companyId` and `contactId` say who the deal is for. `expectedClose` is a calendar date. The caller becomes the owner.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DealInput' },
              example: {
                title: 'Website redesign',
                amount: 15000,
                probability: 60,
                expectedClose: '2027-03-31',
                companyId: 'clx…',
              },
            },
          },
        },
        responses: {
          '201': { description: '`{ deal }`' },
          '400': {
            description: 'Validation failed, or the stage, company or contact does not exist',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      get: {
        tags: ['Records'],
        summary: 'List deals',
        description:
          'Requires `deals:read`. Newest first. `q` matches the deal’s name or its company’s name. Paged (default 20, up to 100).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['OPEN', 'WON', 'LOST'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: '`{ deals, total, page, pageSize }`' },
          '400': { description: 'Invalid query' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/deals/{id}': {
      get: {
        tags: ['Records'],
        summary: 'Get a deal',
        description: 'Requires `deals:read`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '`{ deal }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Deal not found' },
        },
      },
      patch: {
        tags: ['Records'],
        summary: 'Edit a deal',
        description:
          'Requires `deals:write`. Send only what changes: a field left out is kept, `null` clears `expectedClose`, `companyId` or `contactId`. The stage must be one of the deal’s own pipeline. Moving to another stage sets the status (open, won or lost) and closing time, and gives the deal that stage’s probability unless one is sent; a closed deal’s probability is fixed at 100 (won) or 0 (lost).',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DealInput' } } },
        },
        responses: {
          '200': { description: '`{ deal }`' },
          '400': {
            description: 'Validation failed, or the stage, company or contact is not valid',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Deal not found' },
        },
      },
    },
    '/pipelines/{id}/board': {
      get: {
        tags: ['Records'],
        summary: 'A pipeline as a board',
        description:
          'Requires `deals:read`. Every stage in order with `count` and total `value` of all its deals, and its 50 most recently changed `deals` (won and lost deals sit in their stages’ columns). To move a card, `PATCH /deals/{id}` with a new `stageId`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description:
              '`{ pipeline: { id, name }, stages: [{ ...stage, count, value, deals }] }`',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Pipeline not found' },
        },
      },
    },
    '/pipelines': {
      get: {
        tags: ['Pipelines'],
        summary: 'List pipelines and their stages',
        description:
          'Requires `deals:read`. The default pipeline first, each with its stages in order (`id`, `name`, `position`, `probability`, `isWon`, `isLost`, `dealCount`) and its total `dealCount`. A database with no pipeline gets the standard one.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: '`{ pipelines }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Pipelines'],
        summary: 'Create a pipeline',
        description:
          'Requires `settings:manage` (admins). Starts with the standard stages (Qualification, Proposal, Negotiation, Closed won, Closed lost), which can then be changed. Not the default. Names are unique whatever their letter case (409). Returns `{ pipeline }`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', maxLength: 100 } },
              },
            },
          },
        },
        responses: {
          '201': { description: '`{ pipeline }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': { description: 'A pipeline with this name exists' },
        },
      },
    },
    '/pipelines/{id}': {
      patch: {
        tags: ['Pipelines'],
        summary: 'Rename a pipeline or make it the default',
        description:
          'Requires `settings:manage`. `name` renames it; `isDefault: true` makes it the default (new deals start in its first stage) and the previous default stops being one. `isDefault: false` is refused: another pipeline has to become the default.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  isDefault: { type: 'boolean', enum: [true] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '`{ pipeline }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Pipeline not found' },
          '409': { description: 'A pipeline with this name exists' },
        },
      },
      delete: {
        tags: ['Pipelines'],
        summary: 'Delete a pipeline',
        description:
          'Requires `settings:manage`. Refused (409) for the default pipeline and for one that has deals.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Pipeline not found' },
          '409': { description: 'It is the default, or has deals' },
        },
      },
    },
    '/pipelines/{id}/stages': {
      post: {
        tags: ['Pipelines'],
        summary: 'Add a stage',
        description:
          'Requires `settings:manage`. `kind` is `open` (default), `won` or `lost`; won is always 100% and lost 0%. Without `position` an open stage goes before the closed ones and a closed stage goes last. The first stage must be open (400). Names are unique within the pipeline (409). Returns `{ pipeline }`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StageInput' } } },
        },
        responses: {
          '201': { description: '`{ pipeline }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Pipeline not found' },
          '409': { description: 'The pipeline already has a stage with this name' },
        },
      },
    },
    '/pipelines/{id}/stages/order': {
      put: {
        tags: ['Pipelines'],
        summary: 'Put the stages in order',
        description:
          'Requires `settings:manage`. Send every stage’s id exactly once, in the order they should be in. The first must be an open stage. Returns `{ pipeline }`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stageIds'],
                properties: { stageIds: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
        },
        responses: {
          '200': { description: '`{ pipeline }`' },
          '400': { description: 'Not every stage exactly once, or a closed stage first' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Pipeline not found' },
        },
      },
    },
    '/pipelines/{id}/stages/{stageId}': {
      patch: {
        tags: ['Pipelines'],
        summary: 'Change a stage',
        description:
          'Requires `settings:manage`. Send only what changes. Changing `kind` also updates the deals already in the stage: into won or lost they close (keeping a closing date they already have), back to open they reopen. A stage reopened without a `probability` gets 50. The first stage cannot become won or lost (400).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'stageId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StageInput' } } },
        },
        responses: {
          '200': { description: '`{ pipeline }`' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Stage not found' },
          '409': { description: 'The pipeline already has a stage with this name' },
        },
      },
      delete: {
        tags: ['Pipelines'],
        summary: 'Delete a stage',
        description:
          'Requires `settings:manage`. A stage that holds deals needs `moveDealsTo`, another stage of the same pipeline: the deals go there and become open, won or lost as that stage is. Refused (409) if it would leave the pipeline with no stage or no open stage first, or if deals need moving and no target is given.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'stageId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'moveDealsTo', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Deleted' },
          '400': { description: '`moveDealsTo` is not another stage of this pipeline' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Stage not found' },
          '409': { description: 'Deals need moving, or the pipeline would be left unusable' },
        },
      },
    },
    '/calendar': {
      get: {
        tags: ['Calendar'],
        summary: 'Calendar items',
        description:
          "The caller's own calendar from `from` to `to` (inclusive calendar dates, at most 62 days): calls and meetings they logged (`activities:read`), tasks assigned to them by due date (`tasks:read`), their own events (`kind` EVENT, with `endsAt` and `location`) and open deals they own by expected close (`deals:read`). A source the caller cannot read is left out. Tasks and deals are `allDay`. `offset` is the viewer's `Date.getTimezoneOffset()`, used to place timed items on their days. Returns `{ items }` in time order, each `{ id, kind (CALL, MEETING, TASK, EVENT, DEAL), title, at, allDay }`.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Missing or invalid dates, or more than 62 days' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/calendar/events': {
      post: {
        tags: ['Calendar'],
        summary: 'Create event',
        description:
          'Adds an event to your own calendar; any signed-in user. A timed event lasts an hour unless `endsAt` is given. An all-day event takes a date as `startsAt`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'startsAt'],
                properties: {
                  title: { type: 'string', maxLength: 200 },
                  description: { type: 'string', maxLength: 5000 },
                  location: { type: 'string', maxLength: 200 },
                  allDay: { type: 'boolean', default: false },
                  startsAt: { type: 'string' },
                  endsAt: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created. Returns `event`.' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/calendar/events/{id}': {
      patch: {
        tags: ['Calendar'],
        summary: 'Reschedule event',
        description:
          'Moves one of your own events: send `allDay`, `startsAt` and optionally `endsAt`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  allDay: { type: 'boolean', default: false },
                  startsAt: {
                    type: 'string',
                    description:
                      'A date for an all-day event, otherwise a date and time (ISO 8601).',
                  },
                  endsAt: {
                    type: 'string',
                    description: 'Timed events only; after the start. Defaults to an hour later.',
                  },
                },
                required: ['startsAt'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK. Returns `event`.' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { description: 'Not found, or not yours' },
        },
      },
    },
    '/tasks/{id}': {
      patch: {
        tags: ['Tasks'],
        summary: 'Reschedule task',
        description:
          'Requires `tasks:write`. Moves the task to a new `dueDate` (`YYYY-MM-DD`, due at the end of that day). A reminder is sent again for the new date.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['dueDate'],
                properties: { dueDate: { type: 'string', format: 'date' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK. Returns `task`.' },
          '400': { description: 'Validation failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Task not found' },
        },
      },
    },
    '/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks',
        description:
          'Requires `tasks:read`. Soonest due first, tasks without a due date last. Filters combine: `assignee` (a user id, `me` or `none`), `status` and `priority`. Returns `{ tasks, total, page, pageSize }`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'assignee', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          },
          {
            name: 'priority',
            in: 'query',
            schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Invalid filter' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create task',
        description:
          'Requires `tasks:write`. Status defaults to `TODO`, priority to `MEDIUM`, and the assignee to you. The assignee must be an active user. A date-only `dueDate` runs to the end of that day (UTC). `reminderMinutes` (15, 60, 1440 or 10080) notifies the assignee that long before the due date, once, and needs a `dueDate`; none is sent for a finished task. `contactId` and `dealId` link the task to a record you can read (`contacts:read`, `deals:read`).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', maxLength: 200 },
                  description: { type: 'string', maxLength: 5000 },
                  status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
                  priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                  dueDate: { type: 'string', format: 'date' },
                  reminderMinutes: { type: 'integer', enum: [15, 60, 1440, 10080] },
                  assigneeId: { type: 'string' },
                  contactId: { type: 'string' },
                  dealId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created. Returns `task`, with its `assignee`.' },
          '400': { description: 'Validation failed, or the assignee is not an active user' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { description: 'Contact or deal not found' },
        },
      },
    },
    '/tasks/assignees': {
      get: {
        tags: ['Tasks'],
        summary: 'List people a task can be assigned to',
        description: 'Requires `tasks:read`. Active users, by name: `{ assignees }`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'OK' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users',
        description: 'Requires the `users:manage` permission (Admin).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string' },
            description: 'Search name or email',
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'A page of users',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users/{id}/role': {
      patch: {
        tags: ['Users'],
        summary: 'Assign a role to a user',
        description:
          'Requires `users:manage` (Admin). You cannot change your own role. Takes effect immediately and is written to the audit log.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'SALES', 'SUPPORT'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated user', content: userContent },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': {
            description: 'User not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/roles': {
      get: {
        tags: ['Users'],
        summary: 'List roles and their permissions',
        description: 'Requires `users:manage` (Admin).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Roles',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    roles: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          permissions: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users/me/password': {
      post: {
        tags: ['Users'],
        summary: 'Change my password',
        description:
          'Requires the current password. Signs out all other devices (their refresh tokens are revoked) and returns a fresh session for this one.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password changed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          '401': {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      Unauthorized: {
        description: 'Missing, invalid or expired token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Authenticated, but the role lacks the required permission',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    schemas: {
      StageInput: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 100 },
          probability: { type: 'integer', minimum: 0, maximum: 100 },
          kind: { type: 'string', enum: ['open', 'won', 'lost'], default: 'open' },
          position: {
            type: 'integer',
            minimum: 1,
            description: 'When adding: where it goes, counting from 1',
          },
        },
      },
      DealInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          amount: { type: 'number', minimum: 0, description: 'The deal’s value, 2 decimals' },
          stageId: { type: 'string' },
          probability: { type: 'integer', minimum: 0, maximum: 100 },
          expectedClose: { type: 'string', format: 'date', nullable: true },
          companyId: { type: 'string', nullable: true },
          contactId: { type: 'string', nullable: true },
        },
      },
      LeadInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          source: { type: 'string', maxLength: 100, nullable: true },
          value: {
            type: 'number',
            minimum: 0,
            nullable: true,
            description: 'Estimated, 2 decimals',
          },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
          status: {
            type: 'string',
            enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'],
            default: 'NEW',
          },
          notes: { type: 'string', maxLength: 5000, nullable: true },
          ownerId: { type: 'string', nullable: true },
        },
      },
      CompanyInput: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 200 },
          industry: { type: 'string', maxLength: 100, nullable: true },
          employees: { type: 'integer', minimum: 0, nullable: true },
          revenue: {
            type: 'number',
            minimum: 0,
            nullable: true,
            description: 'Annual, 2 decimals',
          },
          website: { type: 'string', format: 'uri', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              details: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'e.g. contacts:write. Use these to decide what the UI shows.',
          },
          role: { type: 'string', enum: ['ADMIN', 'SALES', 'MANAGER', 'SUPPORT'] },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'password'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 8,
            description: 'At least 8 characters with upper-case, lower-case and a number',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      LoginResponse: {
        type: 'object',
        properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } },
      },
      Health: {
        type: 'object',
        required: ['status', 'database'],
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          database: { type: 'string', enum: ['up', 'down'] },
          uptime: { type: 'number', description: 'Process uptime in seconds' },
        },
      },
    },
  },
} as const
