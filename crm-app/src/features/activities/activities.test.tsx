import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import * as activities from '@/services/activities'
import { useAuthStore } from '@/store/auth-store'
import { DealActivities } from './deal-activities'
import { LogActivityForm } from './log-activity-form'

vi.mock('@/services/activities')

const me = { id: 'u1', firstName: 'Ann', lastName: 'Lee' }
const setPermissions = (permissions: string[]) =>
  useAuthStore.setState({
    token: 'jwt',
    user: { ...me, email: 'a@b.com', avatarUrl: null, role: 'SALES', permissions },
    initialized: true,
  })
const wrap = (ui: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  return invalidate
}

beforeEach(() => {
  vi.resetAllMocks()
  setPermissions(['activities:read', 'activities:write'])
})

describe('LogActivityForm', () => {
  it('logs a call against a contact and clears the form', async () => {
    vi.mocked(activities.logActivity).mockResolvedValue({} as activities.Activity)
    const invalidate = wrap(
      <LogActivityForm target={{ contactId: 'c1' }} queryKey={['contact', 'c1', 'overview']} />,
    )
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Activity type'), 'SMS')
    await user.type(screen.getByLabelText('Subject'), '  Sent the quote link ')
    await user.type(screen.getByLabelText('Details'), 'Via text')
    await user.click(screen.getByRole('button', { name: 'Log activity' }))

    await waitFor(() => expect(activities.logActivity).toHaveBeenCalledTimes(1))
    expect(vi.mocked(activities.logActivity).mock.calls[0][0]).toMatchObject({
      type: 'SMS',
      subject: 'Sent the quote link',
      description: 'Via text',
      contactId: 'c1',
    })
    expect(vi.mocked(activities.logActivity).mock.calls[0][0].occurredAt).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveValue(''))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['contact', 'c1', 'overview'] })
  })

  it('needs a subject and does not call the server without one', async () => {
    wrap(<LogActivityForm target={{ contactId: 'c1' }} queryKey={['x']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Subject is required')
    expect(activities.logActivity).not.toHaveBeenCalled()
  })

  it('refuses a time in the future', async () => {
    wrap(<LogActivityForm target={{ dealId: 'd1' }} queryKey={['x']} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Subject'), 'Call')
    const when = screen.getByLabelText('When')
    await user.clear(when)
    await user.type(when, '2999-01-01T09:00')
    await user.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be in the future')
    expect(activities.logActivity).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps what was typed', async () => {
    vi.mocked(activities.logActivity).mockRejectedValue(new Error('boom'))
    wrap(<LogActivityForm target={{ dealId: 'd1' }} queryKey={['x']} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Subject'), 'Call')
    await user.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Subject')).toHaveValue('Call')
  })
})

describe('DealActivities', () => {
  const item: activities.Activity = {
    id: 'a1',
    type: 'MEETING',
    subject: 'Kick-off',
    description: 'Agreed scope',
    occurredAt: '2026-02-01T10:00:00Z',
    user: me,
  }

  it('lists the deal’s activities and offers the form to writers', async () => {
    vi.mocked(activities.listDealActivities).mockResolvedValue({ total: 1, items: [item] })
    wrap(<DealActivities dealId="d1" />)
    expect(await screen.findByText('Kick-off')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem')).getByText('Meeting')).toBeInTheDocument()
    expect(screen.getByText('Agreed scope')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log activity' })).toBeInTheDocument()
  })

  it('hides the form from read-only users', async () => {
    setPermissions(['activities:read'])
    vi.mocked(activities.listDealActivities).mockResolvedValue({ total: 0, items: [] })
    wrap(<DealActivities dealId="d1" />)
    expect(await screen.findByText(/No calls, meetings/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log activity' })).not.toBeInTheDocument()
  })

  it('shows nothing without any activity permission', () => {
    setPermissions([])
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <DealActivities dealId="d1" />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(activities.listDealActivities).not.toHaveBeenCalled()
  })
})
