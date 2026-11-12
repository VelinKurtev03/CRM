import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as calendar from '@/services/calendar'
import * as tasks from '@/services/tasks'
import { useAuthStore } from '@/store/auth-store'
import { moveEvent, toSchedule } from './calendar-utils'

vi.mock('@/services/calendar')
vi.mock('@/services/tasks')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['tasks:write'],
  role: 'SALES' as const,
}

// Wednesday 12 March 2031; the week on screen is Mon 10 – Sun 16.
const local = (day: number, h: number, m = 0) => new Date(2031, 2, day, h, m)
const event: calendar.CalendarItem = {
  id: 'e1',
  kind: 'EVENT',
  title: 'Standup',
  at: local(11, 9, 30).toISOString(),
  endsAt: local(11, 10, 15).toISOString(),
  allDay: false,
}
const task: calendar.CalendarItem = {
  id: 't1',
  kind: 'TASK',
  title: 'Send quote',
  at: '2031-03-11T23:59:59.999Z',
  allDay: true,
  status: 'TODO',
}
const call: calendar.CalendarItem = {
  id: 'c1',
  kind: 'CALL',
  title: 'Call Acme',
  at: local(11, 11).toISOString(),
  allDay: false,
}

function renderAt(permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  const router = createMemoryRouter(routes, {
    initialEntries: ['/calendar?view=week&date=2031-03-12'],
  })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const day = (name: string) => screen.getByRole('region', { name })
const dialog = () => screen.getByRole('dialog')

async function drag(item: string, toDay: string) {
  const handle = await screen.findByRole('button', { name: new RegExp(item) })
  fireEvent.dragStart(handle)
  const target = day(toDay)
  fireEvent.dragOver(target)
  fireEvent.drop(target)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(calendar.getCalendar).mockResolvedValue([event, task, call])
  vi.mocked(calendar.createEvent).mockResolvedValue({ id: 'new' })
  vi.mocked(calendar.rescheduleEvent).mockResolvedValue({ id: 'e1' })
  vi.mocked(tasks.createTask).mockResolvedValue({ id: 'new' } as tasks.Task)
  vi.mocked(tasks.rescheduleTask).mockResolvedValue({ id: 't1' } as tasks.Task)
})

describe('adding from the calendar', () => {
  it('adds a timed event on the chosen day', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Add on March 13' }))
    expect(within(dialog()).getByLabelText('Date')).toHaveValue('2031-03-13')
    await userEvent.type(within(dialog()).getByLabelText('Title'), '  Lunch with Bob ')
    fireEvent.change(within(dialog()).getByLabelText('Starts'), { target: { value: '12:00' } })
    fireEvent.change(within(dialog()).getByLabelText('Ends'), { target: { value: '13:30' } })
    await userEvent.type(within(dialog()).getByLabelText(/Location/), 'Café')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add event' }))
    await waitFor(() =>
      expect(calendar.createEvent).toHaveBeenCalledWith({
        title: 'Lunch with Bob',
        location: 'Café',
        allDay: false,
        startsAt: local(13, 12).toISOString(),
        endsAt: local(13, 13, 30).toISOString(),
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(calendar.getCalendar).mock.calls.length).toBeGreaterThan(1)
  })

  it('adds an all-day event', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Add on March 14' }))
    await userEvent.type(within(dialog()).getByLabelText('Title'), 'Offsite')
    await userEvent.click(within(dialog()).getByLabelText('All day'))
    expect(within(dialog()).queryByLabelText('Starts')).not.toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add event' }))
    await waitFor(() =>
      expect(calendar.createEvent).toHaveBeenCalledWith({
        title: 'Offsite',
        allDay: true,
        startsAt: '2031-03-14',
      }),
    )
  })

  it('adds a task due on the chosen day', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Add on March 15' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Task' }))
    expect(within(dialog()).getByLabelText('Due date')).toHaveValue('2031-03-15')
    expect(within(dialog()).queryByLabelText('Starts')).not.toBeInTheDocument()
    await userEvent.type(within(dialog()).getByLabelText('Title'), 'Chase invoice')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add task' }))
    await waitFor(() =>
      expect(tasks.createTask).toHaveBeenCalledWith({
        title: 'Chase invoice',
        dueDate: '2031-03-15',
      }),
    )
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('offers only events to people who cannot write tasks', async () => {
    renderAt([])
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }))
    expect(within(dialog()).getByRole('button', { name: 'Event' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Task' })).not.toBeInTheDocument()
  })

  it('asks for a title, and an end after the start, before saving', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Add on March 13' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add event' }))
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Title is required')
    await userEvent.type(within(dialog()).getByLabelText('Title'), 'Review')
    fireEvent.change(within(dialog()).getByLabelText('Ends'), { target: { value: '08:00' } })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add event' }))
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('The end must be after the start')
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('shows the API’s error and keeps the dialog open', async () => {
    vi.mocked(calendar.createEvent).mockRejectedValue(new Error('Boom'))
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Add on March 13' }))
    await userEvent.type(within(dialog()).getByLabelText('Title'), 'Review')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add event' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Could not save')
  })
})

describe('moving from the calendar', () => {
  it('moves an event to another day and time from its dialog', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Standup/ }))
    expect(within(dialog()).getByLabelText('Date')).toHaveValue('2031-03-11')
    expect(within(dialog()).getByLabelText('Starts')).toHaveValue('09:30')
    expect(within(dialog()).getByLabelText('Ends')).toHaveValue('10:15')
    fireEvent.change(within(dialog()).getByLabelText('Date'), { target: { value: '2031-03-14' } })
    fireEvent.change(within(dialog()).getByLabelText('Starts'), { target: { value: '15:00' } })
    fireEvent.change(within(dialog()).getByLabelText('Ends'), { target: { value: '16:00' } })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Move' }))
    await waitFor(() =>
      expect(calendar.rescheduleEvent).toHaveBeenCalledWith('e1', {
        allDay: false,
        startsAt: local(14, 15).toISOString(),
        endsAt: local(14, 16).toISOString(),
      }),
    )
  })

  it('moves a task to another due date from its dialog', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Send quote/ }))
    expect(within(dialog()).getByLabelText('Due date')).toHaveValue('2031-03-11')
    fireEvent.change(within(dialog()).getByLabelText('Due date'), {
      target: { value: '2031-03-16' },
    })
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(tasks.rescheduleTask).toHaveBeenCalledWith('t1', '2031-03-16'))
  })

  it('moves an event by dragging it to another day, keeping its time and length', async () => {
    renderAt()
    await drag('Standup', 'Friday, March 14')
    await waitFor(() =>
      expect(calendar.rescheduleEvent).toHaveBeenCalledWith('e1', {
        allDay: false,
        startsAt: local(14, 9, 30).toISOString(),
        endsAt: local(14, 10, 15).toISOString(),
      }),
    )
  })

  it('moves a task by dragging it, but not onto its own day', async () => {
    renderAt()
    await drag('Send quote', 'Tuesday, March 11')
    expect(tasks.rescheduleTask).not.toHaveBeenCalled()
    await drag('Send quote', 'Saturday, March 15')
    await waitFor(() => expect(tasks.rescheduleTask).toHaveBeenCalledWith('t1', '2031-03-15'))
  })

  it('leaves tasks alone for people who cannot write them, and calls are never movable', async () => {
    renderAt([])
    await screen.findByText(/Send quote/)
    expect(screen.queryByRole('button', { name: /Send quote/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Call Acme/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Standup/ })).toBeInTheDocument()
  })

  it('says so when a drag cannot be saved', async () => {
    vi.mocked(calendar.rescheduleEvent).mockRejectedValue(new Error('Boom'))
    renderAt()
    await drag('Standup', 'Friday, March 14')
    const spy = vi.spyOn(toast, 'error')
    await drag('Standup', 'Saturday, March 15')
    await waitFor(() => expect(spy).toHaveBeenCalledWith('Could not move it'))
  })
})

describe('schedule helpers', () => {
  it('turns the form into a schedule, or null when the end is not after the start', () => {
    const base = { date: '2031-03-13', allDay: false, start: '09:00', end: '10:00' }
    expect(toSchedule(base)).toEqual({
      allDay: false,
      startsAt: local(13, 9).toISOString(),
      endsAt: local(13, 10).toISOString(),
    })
    expect(toSchedule({ ...base, end: '' })).toEqual({
      allDay: false,
      startsAt: local(13, 9).toISOString(),
    })
    expect(toSchedule({ ...base, end: '09:00' })).toBeNull()
    expect(toSchedule({ ...base, allDay: true })).toEqual({ allDay: true, startsAt: '2031-03-13' })
  })
  it('moves an all-day event to a date', () => {
    expect(
      moveEvent({ ...event, allDay: true, at: '2031-03-11T00:00:00.000Z' }, '2031-03-14'),
    ).toEqual({
      allDay: true,
      startsAt: '2031-03-14',
    })
  })
})
