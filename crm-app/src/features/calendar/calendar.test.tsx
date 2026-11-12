import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as calendar from '@/services/calendar'
import { useAuthStore } from '@/store/auth-store'
import { groupByDay, heading, parseKey, rangeFor, shift, toKey } from './calendar-utils'

vi.mock('@/services/calendar')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['contacts:read', 'deals:write'],
  role: 'SALES' as const,
}

// Wednesday 12 March 2031, so the week is Mon 10 – Sun 16 and the month grid is 24 Feb – 6 Apr.
const items: calendar.CalendarItem[] = [
  {
    id: 'a1',
    kind: 'CALL',
    title: 'Call Acme',
    at: new Date(2031, 2, 11, 9, 30).toISOString(),
    allDay: false,
    contactId: 'c1',
  },
  {
    id: 'a2',
    kind: 'MEETING',
    title: 'Kick-off',
    at: new Date(2031, 2, 11, 14, 0).toISOString(),
    allDay: false,
    dealId: 'd1',
  },
  {
    id: 't1',
    kind: 'TASK',
    title: 'Send quote',
    at: '2031-03-11T23:59:59.999Z',
    allDay: true,
    status: 'TODO',
  },
  { id: 'd1', kind: 'DEAL', title: 'Big deal', at: '2031-03-12T23:59:59.999Z', allDay: true },
]

function renderAt(url: string, permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const lastRange = () => vi.mocked(calendar.getCalendar).mock.calls.at(-1)!

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(calendar.getCalendar).mockResolvedValue(items)
})

describe('Calendar views', () => {
  it('opens on the week, asking for Monday to Sunday', async () => {
    renderAt('/calendar?date=2031-03-12')
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByText('Send quote')
    expect(lastRange().slice(0, 2)).toEqual(['2031-03-10', '2031-03-16'])
    expect(screen.getByRole('heading', { name: 'Mar 10 – 16, 2031' })).toBeInTheDocument()
  })

  it('puts each item on its day, with times for calls and meetings', async () => {
    renderAt('/calendar?view=week&date=2031-03-12')
    const tuesday = await screen.findByRole('region', { name: 'Tuesday, March 11' })
    expect(within(tuesday).getByText(/Call Acme/)).toHaveTextContent('9:30 AM')
    expect(within(tuesday).getByText(/Kick-off/)).toHaveTextContent('2:00 PM')
    expect(within(tuesday).getByText(/Send quote/)).toBeInTheDocument()
    const wednesday = screen.getByRole('region', { name: 'Wednesday, March 12' })
    expect(within(wednesday).getByText(/Big deal/)).toBeInTheDocument()
    expect(within(wednesday).queryByText(/Call Acme/)).not.toBeInTheDocument()
  })

  it('says what each item is for screen readers, and links to the record', async () => {
    renderAt('/calendar?view=week&date=2031-03-12')
    expect(await screen.findByRole('link', { name: /Call Acme.*Call/ })).toHaveAttribute(
      'href',
      '/contacts/c1',
    )
    expect(screen.getByRole('link', { name: /Kick-off.*Meeting/ })).toHaveAttribute(
      'href',
      '/deals/d1/edit',
    )
    expect(screen.getByRole('link', { name: /Send quote.*Task due/ })).toHaveAttribute(
      'href',
      '/tasks?assignee=me',
    )
  })

  it('shows a whole month grid and opens a day from it', async () => {
    renderAt('/calendar?view=month&date=2031-03-12')
    await screen.findByText(/Send quote/)
    expect(lastRange().slice(0, 2)).toEqual(['2031-02-24', '2031-04-06'])
    expect(screen.getByRole('heading', { name: 'March 2031' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open March 11' }))
    expect(
      await screen.findByRole('heading', { name: 'Tuesday, March 11, 2031' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows only a few items per month day and counts the rest', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `x${i}`,
      kind: 'TASK' as const,
      title: `Task ${i}`,
      at: '2031-03-11T23:59:59.999Z',
      allDay: true,
    }))
    vi.mocked(calendar.getCalendar).mockResolvedValue(many)
    renderAt('/calendar?view=month&date=2031-03-12')
    expect(await screen.findByText('+2 more')).toBeInTheDocument()
    expect(screen.queryByText(/Task 4/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('+2 more'))
    expect(await screen.findByText(/Task 4/)).toBeInTheDocument()
  })

  it('lists a day with all-day items first, or says it is free', async () => {
    renderAt('/calendar?view=day&date=2031-03-11')
    await screen.findByText(/Send quote/)
    const list = screen.getAllByRole('listitem')
    const entries = list.filter((li) => li.textContent?.match(/Send quote|Call Acme|Kick-off/))
    expect(entries.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Send quote'),
      expect.stringContaining('Call Acme'),
      expect.stringContaining('Kick-off'),
    ])
    expect(lastRange().slice(0, 2)).toEqual(['2031-03-11', '2031-03-11'])

    vi.mocked(calendar.getCalendar).mockResolvedValue([])
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(await screen.findByText('Nothing planned for this day.')).toBeInTheDocument()
  })

  it('moves back, forward and to today', async () => {
    const router = renderAt('/calendar?view=week&date=2031-03-12')
    await screen.findByText('Send quote')
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(router.state.location.search).toContain('date=2031-03-19'))
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(() => expect(router.state.location.search).toContain('date=2031-03-05'))
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(router.state.location.search).toContain(`date=${toKey(new Date())}`))
  })

  it('switches between views', async () => {
    const router = renderAt('/calendar?date=2031-03-12')
    await userEvent.click(screen.getByRole('button', { name: 'Month' }))
    await waitFor(() => expect(router.state.location.search).toContain('view=month'))
    await userEvent.click(screen.getByRole('button', { name: 'Day' }))
    await waitFor(() => expect(router.state.location.search).toContain('view=day'))
  })

  it('does not link records the user may not open', async () => {
    renderAt('/calendar?view=week&date=2031-03-12', [])
    await screen.findByText(/Call Acme/)
    expect(screen.queryByRole('link', { name: /Call Acme/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Big deal/ })).not.toBeInTheDocument()
  })

  it('says so when the calendar cannot be loaded', async () => {
    vi.mocked(calendar.getCalendar).mockRejectedValue(new Error('Boom'))
    renderAt('/calendar')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the calendar')
  })
})

describe('calendar helpers', () => {
  const d = new Date(2031, 2, 12)
  it('computes the range, heading and steps for each view', () => {
    expect(toKey(rangeFor('day', d).to)).toBe('2031-03-12')
    expect(toKey(rangeFor('month', d).from)).toBe('2031-02-24')
    expect(toKey(shift('month', d, 1))).toBe('2031-04-12')
    expect(toKey(shift('week', d, -1))).toBe('2031-03-05')
    expect(heading('week', new Date(2031, 2, 31))).toBe('Mar 31 – Apr 6, 2031')
  })
  it('falls back for a bad date in the address', () => {
    expect(toKey(parseKey('2031-02-30', d))).toBe('2031-03-12')
    expect(toKey(parseKey('nope', d))).toBe('2031-03-12')
    expect(toKey(parseKey('2031-04-01', d))).toBe('2031-04-01')
  })
  it('groups by the stored day for all-day items', () => {
    expect([...groupByDay(items).keys()].sort()).toEqual(['2031-03-11', '2031-03-12'])
  })
})
