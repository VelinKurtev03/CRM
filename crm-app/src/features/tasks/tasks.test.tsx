import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as tasks from '@/services/tasks'
import { useAuthStore } from '@/store/auth-store'

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

const created: tasks.Task = {
  id: 't1',
  title: 'Send the quote',
  description: null,
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: null,
  reminderMinutes: null,
  assignee: { id: '1', firstName: 'Ann', lastName: 'Lee' },
}

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

const apiError = (status: number, message: string, details?: object) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message, details } },
  } as AxiosResponse)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(tasks.listAssignees).mockResolvedValue([
    { id: '1', firstName: 'Ann', lastName: 'Lee' },
    { id: '2', firstName: 'Bob', lastName: 'Ray' },
  ])
})

describe('New task', () => {
  it('is for roles with tasks:write', () => {
    renderAt('/tasks/new', ['tasks:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('starts as a medium priority, to do task for me', async () => {
    renderAt('/tasks/new')
    expect(screen.getByLabelText('Priority')).toHaveDisplayValue('Medium')
    expect(screen.getByLabelText('Status')).toHaveDisplayValue('To do')
    expect(screen.getByLabelText('Assignee')).toHaveDisplayValue('Me')
    expect(await screen.findByRole('option', { name: 'Bob Ray' })).toBeInTheDocument()
  })

  it('creates a task with every field and returns to the dashboard', async () => {
    vi.mocked(tasks.createTask).mockResolvedValue(created)
    const router = renderAt('/tasks/new')
    await userEvent.type(screen.getByLabelText('Title'), '  Send the quote ')
    await screen.findByRole('option', { name: 'Bob Ray' })
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '2')
    await userEvent.type(screen.getByLabelText(/Due date/), '2027-01-31')
    await userEvent.selectOptions(screen.getByLabelText('Reminder'), '60')
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'HIGH')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'IN_PROGRESS')
    await userEvent.type(screen.getByLabelText(/Description/), 'Include the discount')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() =>
      expect(tasks.createTask).toHaveBeenCalledWith({
        title: 'Send the quote',
        description: 'Include the discount',
        assigneeId: '2',
        dueDate: '2027-01-31',
        reminderMinutes: 60,
        priority: 'HIGH',
        status: 'IN_PROGRESS',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('sends only the title, priority and status when the rest is left blank', async () => {
    vi.mocked(tasks.createTask).mockResolvedValue(created)
    renderAt('/tasks/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Call back')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() =>
      expect(tasks.createTask).toHaveBeenCalledWith({
        title: 'Call back',
        priority: 'MEDIUM',
        status: 'TODO',
      }),
    )
  })

  it('reminds one day before the due date by default', async () => {
    vi.mocked(tasks.createTask).mockResolvedValue(created)
    renderAt('/tasks/new')
    expect(screen.getByLabelText('Reminder')).toHaveDisplayValue('1 day before')
    await userEvent.type(screen.getByLabelText('Title'), 'Call back')
    await userEvent.type(screen.getByLabelText(/Due date/), '2027-01-31')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() =>
      expect(tasks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate: '2027-01-31', reminderMinutes: 1440 }),
      ),
    )
  })

  it('sends no reminder when none is chosen', async () => {
    vi.mocked(tasks.createTask).mockResolvedValue(created)
    renderAt('/tasks/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Call back')
    await userEvent.type(screen.getByLabelText(/Due date/), '2027-01-31')
    await userEvent.selectOptions(screen.getByLabelText('Reminder'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(tasks.createTask).toHaveBeenCalled())
    expect(vi.mocked(tasks.createTask).mock.calls[0]![0]).not.toHaveProperty('reminderMinutes')
  })

  it('asks for a title before saving', async () => {
    renderAt('/tasks/new')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(tasks.createTask).not.toHaveBeenCalled()
  })

  it('shows the API’s field errors next to the field', async () => {
    vi.mocked(tasks.createTask).mockRejectedValue(
      apiError(400, 'Validation failed', { assigneeId: 'Choose an active user' }),
    )
    renderAt('/tasks/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Call back')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByText('Choose an active user')).toBeInTheDocument()
  })

  it('shows a general error when saving fails', async () => {
    vi.mocked(tasks.createTask).mockRejectedValue(apiError(500, 'Server exploded'))
    renderAt('/tasks/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Call back')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
  })
})
