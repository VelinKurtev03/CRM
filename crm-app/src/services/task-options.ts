export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** Minutes before the due date a reminder can be set for. */
export const REMINDER_MINUTES = [15, 60, 1440, 10080] as const
export type ReminderMinutes = (typeof REMINDER_MINUTES)[number]
