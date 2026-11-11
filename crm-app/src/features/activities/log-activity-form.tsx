import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { logActivity, type NewActivity } from '@/services/activities'
import {
  ACTIVITY_TYPE_LABELS,
  LOGGABLE_TYPES,
  type LoggableType,
} from '@/services/activity-options'

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'

/** Now, as the local `yyyy-MM-ddTHH:mm` a datetime-local input wants. */
const localNow = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

type Props = {
  target: { contactId: string } | { dealId: string }
  /** The page's query, refreshed after a log. */
  queryKey: QueryKey
}

/** Log a call, meeting, email, SMS or note against a contact or deal. */
export function LogActivityForm({ target, queryKey }: Props) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<LoggableType>('CALL')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [when, setWhen] = useState(localNow)
  const [problem, setProblem] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (body: NewActivity) => logActivity(body),
    onSuccess: () => {
      toast.success('Activity logged')
      setSubject('')
      setDescription('')
      setWhen(localNow())
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mutation.isPending) return
    const occurred = new Date(when)
    if (subject.trim() === '') return setProblem('Subject is required')
    if (Number.isNaN(occurred.getTime())) return setProblem('Enter when it happened')
    if (occurred.getTime() > Date.now() + 60_000) return setProblem('It cannot be in the future')
    setProblem(null)
    mutation.mutate({
      type,
      subject: subject.trim(),
      description: description.trim() || undefined,
      occurredAt: occurred.toISOString(),
      ...target,
    })
  }

  const error =
    problem ?? (mutation.isError ? getErrorMessage(mutation.error, 'Could not log it') : null)

  return (
    <form className="space-y-2 rounded-md border bg-muted/30 p-3" onSubmit={submit}>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_14rem]">
        <select
          aria-label="Activity type"
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value as LoggableType)}
        >
          {LOGGABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <Input
          aria-label="Subject"
          placeholder="What happened?"
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Input
          aria-label="When"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      </div>
      <Textarea
        aria-label="Details"
        rows={2}
        maxLength={5000}
        placeholder="Details (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending ? 'Logging…' : 'Log activity'}
      </Button>
    </form>
  )
}
