import { api } from '@/api/client'

export type CalendarItem = {
  id: string
  kind: 'CALL' | 'MEETING' | 'TASK' | 'EVENT' | 'DEAL'
  title: string
  /** When it happens. Tasks and deals (`allDay`) fall on the calendar day in this value. */
  at: string
  allDay: boolean
  /** Events only. */
  endsAt?: string
  location?: string | null
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

/** When an event happens: a date for an all-day event, otherwise instants. */
export type EventSchedule = { allDay: boolean; startsAt: string; endsAt?: string }

export type NewEvent = EventSchedule & { title: string; location?: string }

export const createEvent = (body: NewEvent) =>
  api.post<{ event: { id: string } }>('/calendar/events', body).then((r) => r.data.event)

export const rescheduleEvent = (id: string, body: EventSchedule) =>
  api.patch<{ event: { id: string } }>(`/calendar/events/${id}`, body).then((r) => r.data.event)
