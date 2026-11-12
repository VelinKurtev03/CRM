import { useMutation, useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Phone,
  Plus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/use-permission'
import { getCalendar, rescheduleEvent, type CalendarItem } from '@/services/calendar'
import { rescheduleTask } from '@/services/tasks'
import { cn } from '@/utils/cn'
import {
  daysBetween,
  groupByDay,
  itemDayKey,
  heading,
  isMovable,
  moveEvent,
  parseKey,
  parseView,
  rangeFor,
  shift,
  toKey,
  VIEWS,
  type CalendarView,
} from './calendar-utils'
import { ScheduleDialog, useRefreshCalendar, type DialogTarget } from './schedule-dialog'

const KINDS: Record<CalendarItem['kind'], { label: string; icon: LucideIcon; tone: string }> = {
  MEETING: {
    label: 'Meeting',
    icon: Users,
    tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  },
  CALL: { label: 'Call', icon: Phone, tone: 'bg-green-500/15 text-green-700 dark:text-green-300' },
  EVENT: {
    label: 'Event',
    icon: CalendarDays,
    tone: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  },
  TASK: {
    label: 'Task due',
    icon: CheckSquare,
    tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  DEAL: {
    label: 'Deal closes',
    icon: Handshake,
    tone: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  },
}

const VIEW_LABELS: Record<CalendarView, string> = { day: 'Day', week: 'Week', month: 'Month' }

export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parseView(searchParams.get('view'))
  const today = new Date()
  const anchor = parseKey(searchParams.get('date'), today)
  const { from, to } = rangeFor(view, anchor)
  const fromKey = toKey(from)
  const toKeyStr = toKey(to)

  const canWriteTasks = usePermission('tasks:write')
  const refresh = useRefreshCalendar()
  const [dialog, setDialog] = useState<DialogTarget | null>(null)
  const dragged = useRef<CalendarItem | null>(null)

  const move = useMutation({
    mutationFn: ({ item, date }: { item: CalendarItem; date: string }) =>
      item.kind === 'TASK'
        ? rescheduleTask(item.id, date)
        : rescheduleEvent(item.id, moveEvent(item, date)),
    onSuccess: (_r, { item }) => {
      toast.success(`${item.title} was moved`)
      refresh()
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not move it')),
  })
  const drop = (date: Date) => {
    const item = dragged.current
    dragged.current = null
    if (item && itemDayKey(item) !== toKey(date)) move.mutate({ item, date: toKey(date) })
  }
  const edit = (item: CalendarItem) => setDialog({ mode: 'move', item })

  const go = (next: { view?: CalendarView; date?: Date }) =>
    setSearchParams(
      {
        view: next.view ?? view,
        date: toKey(next.date ?? anchor),
      },
      { replace: true },
    )

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['calendar', fromKey, toKeyStr],
    queryFn: () => getCalendar(fromKey, toKeyStr),
  })
  const byDay = groupByDay(data ?? [])
  const days = daysBetween(from, to)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <div role="group" aria-label="View" className="flex gap-1">
          {VIEWS.map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'default' : 'outline'}
              aria-pressed={view === v}
              onClick={() => go({ view: v })}
            >
              {VIEW_LABELS[v]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label={`Previous ${view}`}
          onClick={() => go({ date: shift(view, anchor, -1) })}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label={`Next ${view}`}
          onClick={() => go({ date: shift(view, anchor, 1) })}
        >
          <ChevronRight />
        </Button>
        <Button variant="outline" size="sm" onClick={() => go({ date: today })}>
          Today
        </Button>
        <h2 className="text-lg font-medium" aria-live="polite">
          {heading(view, anchor)}
        </h2>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setDialog({ mode: 'new', date: toKey(view === 'day' ? anchor : today) })}
        >
          <Plus /> Add
        </Button>
      </div>

      <Legend />

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load the calendar')}
        </p>
      ) : isPending ? (
        <Skeleton aria-label="Loading calendar" className="h-96 w-full" />
      ) : view === 'day' ? (
        <DayList items={byDay.get(toKey(anchor)) ?? []} edit={edit} drag={dragged} />
      ) : (
        <div>
          {view === 'month' && (
            <div className="hidden grid-cols-7 gap-1 pb-1 text-center text-xs text-muted-foreground md:grid">
              {days.slice(0, 7).map((d) => (
                <span key={d.getDay()}>{format(d, 'EEE')}</span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-1 md:grid-cols-7">
            {days.map((d) => (
              <DayCell
                key={toKey(d)}
                date={d}
                view={view}
                today={toKey(today) === toKey(d)}
                outside={view === 'month' && d.getMonth() !== anchor.getMonth()}
                items={byDay.get(toKey(d)) ?? []}
                onOpen={() => go({ view: 'day', date: d })}
                onAdd={() => setDialog({ mode: 'new', date: toKey(d) })}
                onDrop={() => drop(d)}
                edit={edit}
                drag={dragged}
              />
            ))}
          </div>
        </div>
      )}
      {dialog && (
        <ScheduleDialog
          target={dialog}
          canAddTask={canWriteTasks}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
      {Object.values(KINDS).map((k) => (
        <li key={k.label} className="flex items-center gap-1">
          <span className={cn('inline-block size-2.5 rounded-full', k.tone)} aria-hidden />
          {k.label}
        </li>
      ))}
    </ul>
  )
}

const MONTH_LIMIT = 3

function DayCell({
  date,
  view,
  today,
  outside,
  items,
  onOpen,
  onAdd,
  onDrop,
  edit,
  drag,
}: {
  date: Date
  view: CalendarView
  today: boolean
  outside: boolean
  items: CalendarItem[]
  onOpen: () => void
  onAdd: () => void
  onDrop: () => void
  edit: (item: CalendarItem) => void
  drag: DragRef
}) {
  const shown = view === 'month' ? items.slice(0, MONTH_LIMIT) : items
  const more = items.length - shown.length
  return (
    <section
      aria-label={format(date, 'EEEE, MMMM d')}
      className={cn(
        'flex min-h-24 flex-col gap-1 rounded-md border p-1.5',
        view === 'week' && 'md:min-h-64',
        outside && 'bg-muted/40 text-muted-foreground',
        today && 'border-primary',
      )}
      onDragOver={(e) => drag.current && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${format(date, 'MMMM d')}`}
          className={cn(
            'self-start rounded px-1 text-sm hover:bg-accent',
            today && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
          )}
        >
          {view === 'week' ? format(date, 'EEE d') : format(date, 'd')}
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add on ${format(date, 'MMMM d')}`}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      {shown.map((item) => (
        <Entry key={`${item.kind}-${item.id}`} item={item} compact edit={edit} drag={drag} />
      ))}
      {more > 0 && (
        <button
          type="button"
          onClick={onOpen}
          className="self-start px-1 text-xs text-muted-foreground hover:underline"
        >
          +{more} more
        </button>
      )}
    </section>
  )
}

function DayList({
  items,
  edit,
  drag,
}: {
  items: CalendarItem[]
  edit: (item: CalendarItem) => void
  drag: DragRef
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-muted-foreground">
        Nothing planned for this day.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <Entry item={item} edit={edit} drag={drag} />
        </li>
      ))}
    </ul>
  )
}

type DragRef = { current: CalendarItem | null }

function Entry({
  item,
  compact = false,
  edit,
  drag,
}: {
  item: CalendarItem
  compact?: boolean
  edit: (item: CalendarItem) => void
  drag: DragRef
}) {
  const canWriteTasks = usePermission('tasks:write')
  const canContacts = usePermission('contacts:read')
  const canDeals = usePermission('deals:write')
  const kind = KINDS[item.kind]
  const Icon = kind.icon
  const time = item.allDay ? null : format(new Date(item.at), 'p')
  const done = item.status === 'DONE'

  // Your events and tasks open a dialog to move them; they can also be dragged to another day.
  const movable = isMovable(item) && (item.kind === 'EVENT' || canWriteTasks)
  const to = movable
    ? null
    : item.kind === 'TASK'
      ? '/tasks?assignee=me'
      : item.kind === 'DEAL'
        ? canDeals
          ? `/deals/${item.id}/edit`
          : null
        : item.contactId && canContacts
          ? `/contacts/${item.contactId}`
          : item.dealId && canDeals
            ? `/deals/${item.dealId}/edit`
            : null

  const body = (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={cn('min-w-0 truncate', done && 'line-through')}>
        {time && <span className="mr-1 tabular-nums">{time}</span>}
        {item.title}
      </span>
      <span className="sr-only">
        {' '}
        ({kind.label}
        {done ? ', done' : ''})
      </span>
    </>
  )
  const className = cn(
    'flex items-center gap-1.5 rounded px-1.5 py-1 text-xs',
    !compact && 'text-sm',
    kind.tone,
  )
  if (movable) {
    return (
      <button
        type="button"
        draggable
        onDragStart={() => {
          drag.current = item
        }}
        onDragEnd={() => {
          drag.current = null
        }}
        onClick={() => edit(item)}
        className={cn(className, 'w-full cursor-grab text-left hover:underline')}
      >
        {body}
      </button>
    )
  }
  return to ? (
    <Link to={to} className={cn(className, 'hover:underline')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
