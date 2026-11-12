import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { createEvent, rescheduleEvent, type CalendarItem } from '@/services/calendar'
import { createTask, rescheduleTask } from '@/services/tasks'
import { toSchedule } from './calendar-utils'

export type DialogTarget = { mode: 'new'; date: string } | { mode: 'move'; item: CalendarItem }

/** Refresh everything that shows these items. */
export function useRefreshCalendar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['calendar'] })
    void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    void queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
    })
  }
}

const fieldClass = 'h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30'

/**
 * Add an event or a task on a day, or move an existing one to another day or time. Everything
 * is native inputs, so it works with a keyboard as well as by dragging.
 */
export function ScheduleDialog({
  target,
  canAddTask,
  onClose,
}: {
  target: DialogTarget
  canAddTask: boolean
  onClose: () => void
}) {
  const refresh = useRefreshCalendar()
  const editing = target.mode === 'move' ? target.item : null
  const [kind, setKind] = useState<'EVENT' | 'TASK'>(editing?.kind === 'TASK' ? 'TASK' : 'EVENT')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [date, setDate] = useState(
    editing
      ? editing.allDay
        ? editing.at.slice(0, 10)
        : format(new Date(editing.at), 'yyyy-MM-dd')
      : (target as { date: string }).date,
  )
  const [allDay, setAllDay] = useState(editing ? editing.allDay : false)
  const [start, setStart] = useState(
    editing && !editing.allDay ? format(new Date(editing.at), 'HH:mm') : '09:00',
  )
  const [end, setEnd] = useState(
    editing && !editing.allDay && editing.endsAt
      ? format(new Date(editing.endsAt), 'HH:mm')
      : editing
        ? ''
        : '10:00',
  )
  const [location, setLocation] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (kind === 'TASK') {
        return editing
          ? rescheduleTask(editing.id, date)
          : createTask({ title: title.trim(), dueDate: date })
      }
      const schedule = toSchedule({ date, allDay, start, end })!
      return editing
        ? rescheduleEvent(editing.id, schedule)
        : createEvent({ title: title.trim(), location: location.trim() || undefined, ...schedule })
    },
    onSuccess: () => {
      toast.success(
        editing
          ? `${editing.title} was moved`
          : `${title.trim()} was added to your ${kind === 'TASK' ? 'tasks' : 'calendar'}`,
      )
      refresh()
      onClose()
    },
    onError: (error) => setProblem(getErrorMessage(error, 'Could not save')),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setProblem('Title is required')
    if (!date) return setProblem('Choose a date')
    if (kind === 'EVENT' && !toSchedule({ date, allDay, start, end })) {
      return setProblem('The end must be after the start')
    }
    setProblem(null)
    save.mutate()
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? `Move ${editing.title}` : 'Add to calendar'}
      description={editing ? 'Choose a new day or time.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {problem && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {problem}
          </p>
        )}
        {!editing && (
          <div role="group" aria-label="What to add" className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={kind === 'EVENT' ? 'default' : 'outline'}
              aria-pressed={kind === 'EVENT'}
              onClick={() => setKind('EVENT')}
            >
              Event
            </Button>
            {canAddTask && (
              <Button
                type="button"
                size="sm"
                variant={kind === 'TASK' ? 'default' : 'outline'}
                aria-pressed={kind === 'TASK'}
                onClick={() => setKind('TASK')}
              >
                Task
              </Button>
            )}
          </div>
        )}
        {!editing && (
          <div className="space-y-1.5">
            <Label htmlFor="cal-title">Title</Label>
            <Input
              id="cal-title"
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cal-date">{kind === 'TASK' ? 'Due date' : 'Date'}</Label>
          <Input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {kind === 'EVENT' && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              All day
            </label>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cal-start">Starts</Label>
                  <input
                    id="cal-start"
                    type="time"
                    className={`${fieldClass} w-full`}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cal-end">Ends</Label>
                  <input
                    id="cal-end"
                    type="time"
                    className={`${fieldClass} w-full`}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="cal-location">Location (optional)</Label>
                <Input
                  id="cal-location"
                  autoComplete="off"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {editing ? 'Move' : kind === 'TASK' ? 'Add task' : 'Add event'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
