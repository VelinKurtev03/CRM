import { api } from '@/api/client'

export type CalendarItem = {
  id: string
  kind: 'CALL' | 'MEETING' | 'TASK' | 'DEAL'
  title: string
  /** When it happens. Tasks and deals (`allDay`) fall on the calendar day in this value. */
  at: string
  allDay: boolean
  contactId?: string | null
  dealId?: string | null
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE'
}

/** The signed-in user's items from `from` to `to`, calendar dates (`YYYY-MM-DD`) inclusive. */
export const getCalendar = (from: string, to: string) =>
  api
    .get<{ items: CalendarItem[] }>('/calendar', {
      params: { from, to, offset: new Date().getTimezoneOffset() },
    })
    .then((r) => r.data.items)
