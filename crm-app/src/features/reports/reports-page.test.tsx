import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as reports from '@/services/reports'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/reports')
// The dashboard loads on other routes' redirects; keep it quiet.
vi.mock('@/services/dashboard')

const YEAR = new Date().getFullYear()

const manager = {
  id: '1',
  email: 'mia@b.com',
  firstName: 'Mia',
  lastName: 'Manager',
  avatarUrl: null,
  permissions: ['reports:read'],
  role: 'MANAGER' as const,
}

const months = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

const sales = (year: number, won = 2): reports.MonthlySales => ({
  year,
  months: months(year).map((month, i) => ({
    month,
    dealsWon: i === 0 ? won : 0,
    revenue: i === 0 ? won * 750 : 0,
    averageDeal: i === 0 ? 750 : 0,
  })),
  totals: { dealsWon: won, revenue: won * 750, averageDeal: won ? 750 : 0 },
})

const revenue = (year: number, total = 1500, previous = 1000): reports.RevenueReport => ({
  year,
  months: months(year).map((month, i) => ({
    month,
    revenue: i === 0 ? total : 0,
    cumulative: total,
    previousYear: i === 0 ? previous : 0,
  })),
  totals: {
    revenue: total,
    previousYear: previous,
    changePercent: previous ? ((total - previous) / previous) * 100 : null,
  },
  byPipeline: total ? [{ pipelineId: 'p1', name: 'Enterprise', revenue: total, deals: 2 }] : [],
})

const funnel = (empty = false): reports.FunnelReport => ({
  pipelines: [
    { id: 'p1', name: 'Enterprise' },
    { id: 'p2', name: 'Retail' },
  ],
  pipeline: { id: 'p1', name: 'Enterprise' },
  stages: empty
    ? []
    : [
        {
          stageId: 's1',
          name: 'Prospecting',
          isWon: false,
          deals: 4,
          value: 4000,
          reached: 10,
          conversionPercent: null,
        },
        {
          stageId: 's2',
          name: 'Proposal',
          isWon: false,
          deals: 3,
          value: 9000,
          reached: 6,
          conversionPercent: 60,
        },
        {
          stageId: 's3',
          name: 'Closed won',
          isWon: true,
          deals: 3,
          value: 7000,
          reached: 3,
          conversionPercent: 50,
        },
      ],
  lost: { deals: empty ? 0 : 2, value: empty ? 0 : 1200 },
  bottleneckStageId: empty ? null : 's3',
})

const conversion = (year: number, leads = 10): reports.LeadConversionReport => ({
  year,
  months: months(year).map((month, i) => ({
    month,
    leads: i === 0 ? leads : 0,
    converted: i === 0 ? leads / 2 : 0,
    conversionPercent: i === 0 && leads ? 50 : null,
  })),
  totals: {
    leads,
    converted: leads / 2,
    conversionPercent: leads ? 50 : null,
    lost: leads ? 2 : 0,
    open: leads ? 3 : 0,
  },
  bySource: leads ? [{ source: 'Web', leads, converted: leads / 2, conversionPercent: 50 }] : [],
})

const winRate = (year: number, closed = true): reports.WinRateReport => ({
  year,
  months: months(year).map((month, i) => ({
    month,
    won: i === 0 && closed ? 3 : 0,
    lost: i === 0 && closed ? 1 : 0,
    winRatePercent: i === 0 && closed ? 75 : null,
  })),
  totals: closed
    ? { won: 3, lost: 1, winRatePercent: 75 }
    : { won: 0, lost: 0, winRatePercent: null },
  byPipeline: closed
    ? [{ pipelineId: 'p1', name: 'Enterprise', won: 3, lost: 1, winRatePercent: 75 }]
    : [],
})

const lostDeals = (year: number, any = true): reports.LostDealsReport => ({
  year,
  months: months(year).map((month, i) => ({
    month,
    deals: i === 0 && any ? 2 : 0,
    value: i === 0 && any ? 5000 : 0,
  })),
  totals: any
    ? { deals: 2, value: 5000, averageDeal: 2500, averageDaysOpen: 30 }
    : { deals: 0, value: 0, averageDeal: 0, averageDaysOpen: 0 },
  byPipeline: any ? [{ pipelineId: 'p1', name: 'Enterprise', deals: 2, value: 5000 }] : [],
  biggest: any
    ? [
        {
          id: 'd1',
          title: 'Acme renewal',
          amount: 4000,
          pipeline: 'Enterprise',
          owner: 'Sam Seller',
          closedAt: new Date(year, 0, 15).toISOString(),
          daysOpen: 40,
        },
        {
          id: 'd2',
          title: 'Orphan deal',
          amount: 1000,
          pipeline: 'Enterprise',
          owner: null,
          closedAt: new Date(year, 0, 20).toISOString(),
          daysOpen: 20,
        },
      ]
    : [],
})

const member = (over: Partial<reports.TeamMember> = {}): reports.TeamMember => ({
  userId: 'u1',
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
  tasksOverdue: 2,
  ...over,
})

const team = (year: number, any = true): reports.TeamPerformanceReport => ({
  year,
  members: any
    ? [
        member(),
        member({
          userId: 'u2',
          name: 'Nora Newbie',
          dealsWon: 0,
          dealsLost: 0,
          winRatePercent: null,
          revenue: 0,
          tasksOverdue: 0,
        }),
      ]
    : [],
  totals: {
    dealsWon: any ? 3 : 0,
    dealsLost: any ? 1 : 0,
    winRatePercent: any ? 75 : null,
    revenue: any ? 12000 : 0,
    activities: any ? 42 : 0,
    tasksCompleted: any ? 15 : 0,
    tasksOverdue: any ? 2 : 0,
  },
})

function renderReports(entry = '/reports', permissions = manager.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...manager, permissions }, initialized: true })
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(reports.getMonthlySales).mockImplementation(async (y) => sales(y))
  vi.mocked(reports.getRevenueReport).mockImplementation(async (y) => revenue(y))
  vi.mocked(reports.getFunnelReport).mockImplementation(async () => funnel())
  vi.mocked(reports.getLeadConversion).mockImplementation(async (y) => conversion(y))
  vi.mocked(reports.getWinRate).mockImplementation(async (y) => winRate(y))
  vi.mocked(reports.getLostDeals).mockImplementation(async (y) => lostDeals(y))
  vi.mocked(reports.getTeamPerformance).mockImplementation(async (y) => team(y))
})

describe('ReportsPage', () => {
  it('shows monthly sales and revenue for the current year', async () => {
    renderReports()

    expect(await screen.findByRole('heading', { name: 'Sales reports' })).toBeInTheDocument()
    expect(reports.getMonthlySales).toHaveBeenCalledWith(YEAR)
    expect(reports.getRevenueReport).toHaveBeenCalledWith(YEAR)

    expect(await screen.findByText(`Deals won in ${YEAR}, by the month they closed`)).toBeVisible()
    const sold = within(screen.getByText('Monthly sales').closest('[data-slot="card"]')!)
    expect(sold.getByRole('row', { name: /January 2 \$1,500 \$750/ })).toBeInTheDocument()
    expect(sold.getByRole('row', { name: /^Total 2 \$1,500 \$750/ })).toBeInTheDocument()

    expect(await screen.findByText(/\$1,500 won in .* \+50% vs /)).toBeInTheDocument()
    expect(
      within(
        screen
          .getByText('Revenue', { selector: '[data-slot="card-title"]' })
          .closest('[data-slot="card"]')!,
      ).getByText('Enterprise'),
    ).toBeInTheDocument()
  })

  it('opens on the year in the address and switches year', async () => {
    renderReports('/reports?year=2024')
    expect(await screen.findByText('Deals won in 2024, by the month they closed')).toBeVisible()
    expect(screen.getByLabelText('Year')).toHaveValue('2024')

    await userEvent.selectOptions(screen.getByLabelText('Year'), String(YEAR - 1))
    expect(
      await screen.findByText(`Deals won in ${YEAR - 1}, by the month they closed`),
    ).toBeVisible()
    expect(reports.getMonthlySales).toHaveBeenCalledWith(YEAR - 1)
    expect(reports.getRevenueReport).toHaveBeenCalledWith(YEAR - 1)
  })

  it('says so when there are no sales or revenue', async () => {
    vi.mocked(reports.getMonthlySales).mockImplementation(async (y) => sales(y, 0))
    vi.mocked(reports.getRevenueReport).mockImplementation(async (y) => revenue(y, 0, 0))
    renderReports()

    expect(await screen.findByText(`No sales in ${YEAR}`)).toBeInTheDocument()
    expect(await screen.findByText(`No revenue in ${YEAR}`)).toBeInTheDocument()
  })

  it('explains when last year has nothing to compare with', async () => {
    vi.mocked(reports.getRevenueReport).mockImplementation(async (y) => revenue(y, 1500, 0))
    renderReports()
    expect(
      await screen.findByText(new RegExp(`No revenue in ${YEAR - 1} to compare with`)),
    ).toBeInTheDocument()
  })

  it('shows an error when a report cannot be loaded', async () => {
    vi.mocked(reports.getMonthlySales).mockRejectedValue(new Error('boom'))
    renderReports()
    expect(await screen.findByText('Could not load the monthly sales report')).toBeInTheDocument()
    expect(await screen.findByText(/\$1,500 won in/)).toBeInTheDocument() // revenue still shown
  })

  it('shows the Reports link only to people who can read reports', async () => {
    renderReports('/reports')
    expect(await screen.findByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports')
  })

  it('blocks people without reports:read', async () => {
    renderReports('/reports', [])
    expect(await screen.findByText('Access denied')).toBeInTheDocument()
    expect(reports.getMonthlySales).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
  })

  it('shows the sales funnel with its bottleneck and lost deals, and switches pipeline', async () => {
    renderReports()
    const card = within((await screen.findByText('Sales funnel')).closest('[data-slot="card"]')!)
    expect(await card.findByRole('row', { name: /Prospecting 4 \$4,000 10/ })).toBeInTheDocument()
    expect(card.getByRole('row', { name: /Proposal 3 \$9,000 6 60%/ })).toBeInTheDocument()
    expect(
      card.getByRole('row', { name: /Closed won\s?Bottleneck 3 \$7,000 3 50%/ }),
    ).toBeInTheDocument()
    expect(card.getByRole('row', { name: /^Lost 2 \$1,200/ })).toBeInTheDocument()
    expect(card.getByText(/Biggest drop: Closed won \(50%/)).toBeInTheDocument()
    expect(reports.getFunnelReport).toHaveBeenCalledWith(undefined)

    await userEvent.selectOptions(card.getByLabelText('Pipeline'), 'p2')
    expect(reports.getFunnelReport).toHaveBeenCalledWith('p2')
  })

  it('opens the funnel on the pipeline in the address', async () => {
    renderReports('/reports?pipeline=p2')
    await screen.findByText('Sales funnel')
    expect(reports.getFunnelReport).toHaveBeenCalledWith('p2')
  })

  it('says so when a pipeline has no deals', async () => {
    vi.mocked(reports.getFunnelReport).mockImplementation(async () => funnel(true))
    renderReports()
    expect(await screen.findByText('No deals in this pipeline')).toBeInTheDocument()
  })

  it('shows lead conversion for the chosen year, by month and source', async () => {
    renderReports('/reports?year=2024')
    expect(
      await screen.findByText(
        /5 of 10 leads created in 2024 became deals \(50%\) · 2 lost · 3 still open/,
      ),
    ).toBeInTheDocument()
    expect(reports.getLeadConversion).toHaveBeenCalledWith(2024)
    const card = within(screen.getByText('Lead conversion').closest('[data-slot="card"]')!)
    expect(card.getByRole('row', { name: /January 10 5 50%/ })).toBeInTheDocument()
    expect(card.getByRole('row', { name: /Web 10 5 50%/ })).toBeInTheDocument()
  })

  it('says so when there are no leads, and when a report fails', async () => {
    vi.mocked(reports.getLeadConversion).mockImplementation(async (y) => conversion(y, 0))
    vi.mocked(reports.getFunnelReport).mockRejectedValue(new Error('boom'))
    renderReports()
    expect(await screen.findByText(`No leads in ${YEAR}`)).toBeInTheDocument()
    expect(await screen.findByText('Could not load the sales funnel')).toBeInTheDocument()
  })

  it('shows the win rate by month and pipeline for the chosen year', async () => {
    renderReports('/reports?year=2024')
    expect(
      await screen.findByText('75% of deals closed in 2024 were won (3 won, 1 lost)'),
    ).toBeInTheDocument()
    expect(reports.getWinRate).toHaveBeenCalledWith(2024)
    const card = within(
      screen
        .getByText('Win rate', { selector: '[data-slot="card-title"]' })
        .closest('[data-slot="card"]')!,
    )
    expect(card.getByRole('row', { name: /January 3 1 75%/ })).toBeInTheDocument()
    expect(card.getByRole('row', { name: /February 0 0 —/ })).toBeInTheDocument()
    expect(card.getByRole('row', { name: /Enterprise 3 1 75%/ })).toBeInTheDocument()
  })

  it('shows lost deals with totals, pipelines and the biggest deals', async () => {
    renderReports()
    expect(
      await screen.findByText(`2 deals worth $5,000 lost in ${YEAR} · open 30 days on average`),
    ).toBeInTheDocument()
    expect(reports.getLostDeals).toHaveBeenCalledWith(YEAR)
    const card = within(
      screen
        .getByText('Lost deals', { selector: '[data-slot="card-title"]' })
        .closest('[data-slot="card"]')!,
    )
    expect(
      card.getByRole('row', { name: /Acme renewal Enterprise Sam Seller 40 \$4,000/ }),
    ).toBeInTheDocument()
    expect(
      card.getByRole('row', { name: /Orphan deal Enterprise Unassigned 20 \$1,000/ }),
    ).toBeInTheDocument()
  })

  it('says so when no deals closed, and when these reports fail', async () => {
    vi.mocked(reports.getWinRate).mockImplementation(async (y) => winRate(y, false))
    vi.mocked(reports.getLostDeals).mockRejectedValue(new Error('boom'))
    renderReports()
    expect(await screen.findByText(`No closed deals in ${YEAR}`)).toBeInTheDocument()
    expect(await screen.findByText('Could not load the lost deals report')).toBeInTheDocument()
  })

  it('shows how each person is doing, with workload and overdue tasks', async () => {
    renderReports('/reports?year=2024')
    expect(
      await screen.findByText(
        '3 deals won worth $12,000 in 2024 · 42 activities logged · 2 overdue tasks now',
      ),
    ).toBeInTheDocument()
    expect(reports.getTeamPerformance).toHaveBeenCalledWith(2024)
    const card = within(
      screen
        .getByText('Team performance', { selector: '[data-slot="card-title"]' })
        .closest('[data-slot="card"]')!,
    )
    expect(card.getByRole('row', { name: /Sam Seller 3 1 75% \$12,000/ })).toBeInTheDocument()
    expect(card.getByRole('row', { name: /Nora Newbie 0 0 — \$0/ })).toBeInTheDocument()
    expect(
      card.getByRole('row', { name: /Sam Seller 4 \$30,000 10 3 42 15 5 2/ }),
    ).toBeInTheDocument()
  })

  it('says so when the team has no activity, and when the report fails', async () => {
    vi.mocked(reports.getTeamPerformance).mockImplementation(async (y) => team(y, false))
    renderReports()
    expect(await screen.findByText(`No team activity in ${YEAR}`)).toBeInTheDocument()

    vi.mocked(reports.getTeamPerformance).mockRejectedValue(new Error('boom'))
    renderReports('/reports?year=2023')
    expect(
      await screen.findByText('Could not load the team performance report'),
    ).toBeInTheDocument()
  })
})
