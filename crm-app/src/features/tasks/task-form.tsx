import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, type FieldPath } from 'react-hook-form'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/services/task-options'
import { listAssignees } from '@/services/tasks'
import {
  emptyTask,
  PRIORITY_LABELS,
  STATUS_LABELS,
  taskSchema,
  type TaskFormValues,
} from './schemas'

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30'

export function TaskForm<T>({
  defaultValues,
  submitLabel,
  save,
  onSaved,
  onCancel,
}: {
  defaultValues: TaskFormValues
  submitLabel: string
  save: (values: TaskFormValues) => Promise<T>
  onSaved: (result: T) => void
  onCancel: () => void
}) {
  const form = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues })
  const assignees = useQuery({ queryKey: ['task-assignees'], queryFn: listAssignees })

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: onSaved,
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of Object.keys(emptyTask()) as (keyof TaskFormValues)[]) {
        if (fields[name]) form.setError(name, { message: fields[name] })
      }
    },
  })

  const choice = (
    name: FieldPath<TaskFormValues>,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <select className={selectClass} {...field}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4"
        noValidate
      >
        {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {getErrorMessage(mutation.error, 'Could not save the task')}
          </p>
        )}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {choice('assigneeId', 'Assignee', [
              { value: '', label: 'Me' },
              ...(assignees.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.firstName} ${a.lastName}`,
              })),
            ])}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {choice(
              'priority',
              'Priority',
              TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
            )}
            {choice(
              'status',
              'Status',
              TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            )}
            <div className="sm:col-span-2">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
