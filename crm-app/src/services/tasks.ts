import { api } from '@/api/client'
import type { TaskPriority, TaskStatus } from './task-options'

export type Assignee = { id: string; firstName: string; lastName: string }

export type NewTask = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  /** A calendar date, `YYYY-MM-DD`; the task is due at the end of that day. */
  dueDate?: string
  assigneeId?: string
  contactId?: string
  dealId?: string
}

export type Task = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  assignee: Assignee | null
}

export const createTask = (body: NewTask) =>
  api.post<{ task: Task }>('/tasks', body).then((r) => r.data.task)

export const listAssignees = () =>
  api.get<{ assignees: Assignee[] }>('/tasks/assignees').then((r) => r.data.assignees)
