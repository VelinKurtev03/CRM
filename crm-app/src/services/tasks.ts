import { api } from '@/api/client'
import type { ReminderMinutes, TaskPriority, TaskStatus } from './task-options'

export type Assignee = { id: string; firstName: string; lastName: string }

export type NewTask = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  /** A calendar date, `YYYY-MM-DD`; the task is due at the end of that day. */
  dueDate?: string
  /** Notify the assignee this long before the due date; needs `dueDate`. */
  reminderMinutes?: ReminderMinutes
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
  reminderMinutes: ReminderMinutes | null
  assignee: Assignee | null
}

export const createTask = (body: NewTask) =>
  api.post<{ task: Task }>('/tasks', body).then((r) => r.data.task)

export const listAssignees = () =>
  api.get<{ assignees: Assignee[] }>('/tasks/assignees').then((r) => r.data.assignees)

export type TasksPage = { tasks: Task[]; total: number; page: number; pageSize: number }

export const listTasks = (params: {
  /** A user id, `me`, or `none` for unassigned tasks. */
  assignee?: string
  status?: string
  priority?: string
  page?: number
  pageSize?: number
}) => api.get<TasksPage>('/tasks', { params }).then((r) => r.data)

/** Move a task to another due date (`YYYY-MM-DD`). */
export const rescheduleTask = (id: string, dueDate: string) =>
  api.patch<{ task: Task }>(`/tasks/${id}`, { dueDate }).then((r) => r.data.task)
