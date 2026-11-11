/** The kinds of interaction a user can log. Kept apart from the service so tests can mock that. */
export const LOGGABLE_TYPES = ['CALL', 'MEETING', 'EMAIL', 'SMS', 'NOTE'] as const
export type LoggableType = (typeof LOGGABLE_TYPES)[number]

export const ACTIVITY_TYPE_LABELS: Record<LoggableType | 'OTHER', string> = {
  CALL: 'Call',
  MEETING: 'Meeting',
  EMAIL: 'Email',
  SMS: 'SMS',
  NOTE: 'Note',
  OTHER: 'Other',
}
