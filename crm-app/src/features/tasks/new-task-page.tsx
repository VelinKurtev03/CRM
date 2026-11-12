import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { createTask } from '@/services/tasks'
import { emptyTask, toNewTask } from './schemas'
import { TaskForm } from './task-form'

export function NewTaskPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New task</h1>
        <p className="text-muted-foreground">Only the title is required.</p>
      </div>
      <TaskForm
        defaultValues={emptyTask()}
        submitLabel="Create task"
        save={(values) => createTask(toNewTask(values))}
        onSaved={(task) => {
          toast.success(`${task.title} was added`)
          void queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
          })
          navigate('/dashboard')
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
