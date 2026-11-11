import { Badge } from '@/components/ui/badge'
import type { Activity } from '@/services/activities'
import { ACTIVITY_TYPE_LABELS } from '@/services/activity-options'
import { groupByDay } from './day-label'

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** Activities (newest first) grouped under Today, Yesterday and earlier days. */
export function ActivityTimeline({ items }: { items: Activity[] }) {
  return (
    <div className="space-y-5">
      {groupByDay(items).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{group.label}</h3>
          <ul className="space-y-3">
            {group.items.map((a) => (
              <li key={a.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ACTIVITY_TYPE_LABELS[a.type]}</Badge>
                  <span className="font-medium">{a.subject}</span>
                </div>
                {a.description && (
                  <p className="mt-1 text-sm whitespace-pre-wrap">{a.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.user.firstName} {a.user.lastName} · {time(a.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
