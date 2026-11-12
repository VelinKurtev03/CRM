import { prisma } from './prisma.js'
import { logger } from './logger.js'

/** How long before the due date a reminder can be set, in minutes. */
export const REMINDER_MINUTES = [15, 60, 1440, 10080] as const

const label = (minutes: number) =>
  minutes >= 1440
    ? `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
    : minutes >= 60
      ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
      : `${minutes} minutes`

const dayFormat = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Notifies assignees of open tasks whose reminder time has come, once per task.
 * Returns how many reminders were sent.
 */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const longest = Math.max(...REMINDER_MINUTES) * 60_000
  const candidates = await prisma.task.findMany({
    where: {
      remindedAt: null,
      reminderMinutes: { not: null },
      assigneeId: { not: null },
      status: { not: 'DONE' },
      dueDate: { not: null, lte: new Date(now.getTime() + longest) },
    },
    select: { id: true, title: true, dueDate: true, reminderMinutes: true, assigneeId: true },
  })

  let sent = 0
  for (const task of candidates) {
    const remindAt = task.dueDate!.getTime() - task.reminderMinutes! * 60_000
    if (remindAt > now.getTime()) continue

    // Claim the task first, so two API instances never send the same reminder.
    const claimed = await prisma.task.updateMany({
      where: { id: task.id, remindedAt: null },
      data: { remindedAt: now },
    })
    if (claimed.count === 0) continue

    const overdue = task.dueDate!.getTime() < now.getTime()
    await prisma.notification.create({
      data: {
        type: 'TASK_REMINDER',
        userId: task.assigneeId!,
        message: overdue
          ? `Task "${task.title}" was due on ${dayFormat.format(task.dueDate!)}`
          : `Task "${task.title}" is due on ${dayFormat.format(task.dueDate!)} (in less than ${label(task.reminderMinutes!)})`,
      },
    })
    sent++
  }
  return sent
}

/** Checks for due reminders now and then every minute. */
export function startTaskReminders(intervalMs = 60_000) {
  const run = () =>
    sendDueReminders().catch((error: unknown) => logger.error({ error }, 'Task reminders failed'))
  void run()
  return setInterval(run, intervalMs).unref()
}
