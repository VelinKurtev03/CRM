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
    expect(screen.getByText('Enterprise')).toBeInTheDocument()
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
})
