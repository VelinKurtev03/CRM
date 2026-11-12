import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

import type { CalendarItem, EventSchedule } from '@/services/calendar'

export const VIEWS = ['day', 'week', 'month'] as const
export type CalendarView = (typeof VIEWS)[number]

/** Weeks start on Monday. */
const WEEK = { weekStartsOn: 1 } as const

export const toKey = (d: Date) => format(d, 'yyyy-MM-dd')

/** A `YYYY-MM-DD` from the address as a local date, or `fallback` if it is not a real date. */
export function parseKey(key: string | null, fallback: Date): Date {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return fallback
  const d = parseISO(key)
  return isValid(d) && toKey(d) === key ? d : fallback
}

export const parseView = (v: string | null): CalendarView => VIEWS.find((x) => x === v) ?? 'week'

/** First and last day on screen: the day, its week, or the month's weeks (so the grid is full). */
export function rangeFor(view: CalendarView, anchor: Date) {
  if (view === 'day') return { from: anchor, to: anchor }
  if (view === 'week') return { from: startOfWeek(anchor, WEEK), to: endOfWeek(anchor, WEEK) }
  return {
    from: startOfWeek(startOfMonth(anchor), WEEK),
    to: endOfWeek(endOfMonth(anchor), WEEK),
  }
}

export function shift(view: CalendarView, anchor: Date, direction: 1 | -1) {
  if (view === 'day') return addDays(anchor, direction)
  if (view === 'week') return addWeeks(anchor, direction)
  return addMonths(anchor, direction)
}

export function heading(view: CalendarView, anchor: Date) {
  if (view === 'day') return format(anchor, 'EEEE, MMMM d, yyyy')
  if (view === 'month') return format(anchor, 'MMMM yyyy')
  const { from, to } = rangeFor('week', anchor)
  return from.getMonth() === to.getMonth()
    ? `${format(from, 'MMM d')} – ${format(to, 'd, yyyy')}`
    : `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`
}

export function daysBetween(from: Date, to: Date) {
  const days: Date[] = []
  for (let d = from; toKey(d) <= toKey(to); d = addDays(d, 1)) days.push(d)
  return days
}

/** The day an item is on: tasks and deals by their stored date, the rest by the viewer's clock. */
export const itemDayKey = (item: CalendarItem) =>
  item.allDay ? item.at.slice(0, 10) : toKey(new Date(item.at))

/** Items by day, all-day first and then by time. */
export function groupByDay(items: CalendarItem[]) {
  const byDay = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const key = itemDayKey(item)
    byDay.set(key, [...(byDay.get(key) ?? []), item])
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) || new Date(a.at).getTime() - new Date(b.at).getTime(),
    )
  }
  return byDay
}

/** Items you can move: your events, and tasks. */
export const isMovable = (item: CalendarItem) => item.kind === 'EVENT' || item.kind === 'TASK'

/** `date` (`YYYY-MM-DD`) and `time` (`HH:mm`) in the viewer's time zone, as an instant. */
const instant = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

/** What the form asks for, as the API expects it; `null` if the end is not after the start. */
export function toSchedule(v: {
  date: string
  allDay: boolean
  start: string
  end: string
}): EventSchedule | null {
  if (v.allDay) return { allDay: true, startsAt: v.date }
  const startsAt = instant(v.date, v.start)
  if (!v.end) return { allDay: false, startsAt }
  const endsAt = instant(v.date, v.end)
  return endsAt > startsAt ? { allDay: false, startsAt, endsAt } : null
}

/** An event moved to another day, keeping its time of day and length. */
export function moveEvent(item: CalendarItem, date: string): EventSchedule {
  if (item.allDay) return { allDay: true, startsAt: date }
  const start = new Date(item.at)
  const length = item.endsAt ? new Date(item.endsAt).getTime() - start.getTime() : 0
  const startsAt = new Date(`${date}T${format(start, 'HH:mm:ss.SSS')}`)
  return {
    allDay: false,
    startsAt: startsAt.toISOString(),
    ...(length > 0 && { endsAt: new Date(startsAt.getTime() + length).toISOString() }),
  }
}
