import { z } from 'zod'

import {
  REMINDER_MINUTES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@/services/task-options'
import type { NewTask } from '@/services/tasks'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

export const REMINDER_LABELS: Record<(typeof REMINDER_MINUTES)[number], string> = {
  15: '15 minutes before',
  60: '1 hour before',
  1440: '1 day before',
  10080: '1 week before',
}

const isRealDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
  description: z.string().trim().max(5000, 'Keep it under 5000 characters'),
  /** An empty string means the signed-in user. */
  assigneeId: z.string(),
  dueDate: z
    .string()
    .trim()
    .refine((v) => v === '' || isRealDate(v), 'Enter a valid date'),
  /** Minutes before the due date as text, or empty for no reminder; ignored without a due date. */
  reminder: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
})
export type TaskFormValues = z.infer<typeof taskSchema>

export const emptyTask = (): TaskFormValues => ({
  title: '',
  description: '',
  assigneeId: '',
  dueDate: '',
  reminder: '1440',
  priority: 'MEDIUM',
  status: 'TODO',
})

/** The API body: blank optional fields are left out. */
export function toNewTask(v: TaskFormValues): NewTask {
  const body: NewTask = { title: v.title.trim(), priority: v.priority, status: v.status }
  if (v.description.trim()) body.description = v.description.trim()
  if (v.assigneeId) body.assigneeId = v.assigneeId
  if (v.dueDate.trim()) {
    body.dueDate = v.dueDate.trim()
    const minutes = REMINDER_MINUTES.find((m) => String(m) === v.reminder)
    if (minutes) body.reminderMinutes = minutes
  }
  return body
}
