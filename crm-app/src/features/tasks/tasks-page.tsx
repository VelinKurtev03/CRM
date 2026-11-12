import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ListChecks, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataPagination } from '@/components/ui/data-pagination'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermission } from '@/hooks/use-permission'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/services/task-options'
import { listAssignees, listTasks } from '@/services/tasks'
import { formatCalendarDate } from '@/utils/format-date'
import { PRIORITY_LABELS, STATUS_LABELS } from './schemas'

const PAGE_SIZE = 20

const priorityVariant = { HIGH: 'destructive', MEDIUM: 'secondary', LOW: 'outline' } as const

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30'

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const canWrite = usePermission('tasks:write')
  const assignee = searchParams.get('assignee') ?? ''
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1
  const filtered = Boolean(assignee || status || priority)

  const update = (changes: Record<string, string | undefined>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries({ ...changes, page: undefined })) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )

  const people = useQuery({ queryKey: ['task-assignees'], queryFn: listAssignees })
  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['tasks', { assignee, status, priority, page }],
    queryFn: () =>
      listTasks({
        assignee: assignee || undefined,
        status: status || undefined,
        priority: priority || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const newButton = canWrite && (
    <Button asChild>
      <Link to="/tasks/new">
        <Plus /> New task
      </Link>
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'task' : 'tasks'}
              {filtered && ' match your filters'}
            </p>
          )}
        </div>
        {newButton}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Assignee"
          value={assignee}
          onChange={(e) => update({ assignee: e.target.value })}
          className={selectClass}
        >
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="none">Unassigned</option>
          {(people.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => update({ status: e.target.value })}
          className={selectClass}
        >
          <option value="">Any status</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          value={priority}
          onChange={(e) => update({ priority: e.target.value })}
          className={selectClass}
        >
          <option value="">Any priority</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ assignee: undefined, status: undefined, priority: undefined })}
          >
            Clear
          </Button>
        )}
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load tasks')}
        </p>
      ) : isPending ? (
        <div className="space-y-2" aria-label="Loading tasks">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.tasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-10" />}
          title={filtered ? 'No tasks match' : 'No tasks yet'}
          description={
            filtered
              ? 'Try different filters.'
              : canWrite
                ? 'Add a task to keep track of a follow-up.'
                : 'Tasks will appear here once someone adds them.'
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() =>
                  update({ assignee: undefined, status: undefined, priority: undefined })
                }
              >
                Show all tasks
              </Button>
            ) : (
              newButton || undefined
            )
          }
        />
      ) : (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell>
                    {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : <Dash />}
                  </TableCell>
                  <TableCell>{t.dueDate ? formatCalendarDate(t.dueDate) : <Dash />}</TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant[t.priority]}>
                      {PRIORITY_LABELS[t.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell>{STATUS_LABELS[t.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end">
            <DataPagination
              page={data.page}
              pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))}
              onPageChange={(p) =>
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    if (p > 1) next.set('page', String(p))
                    else next.delete('page')
                    return next
                  },
                  { replace: true },
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Dash() {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  )
}
