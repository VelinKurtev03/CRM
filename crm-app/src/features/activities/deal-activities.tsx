import { useQuery } from '@tanstack/react-query'

import { DetailSection, EmptyNote } from '@/components/detail-section'
import { Badge } from '@/components/ui/badge'
import { usePermission } from '@/hooks/use-permission'
import { listDealActivities } from '@/services/activities'
import { ACTIVITY_TYPE_LABELS } from '@/services/activity-options'
import { formatDate } from '@/utils/format-date'
import { LogActivityForm } from './log-activity-form'

/** Calls, meetings and other interactions on a deal, with a form to log another. */
export function DealActivities({ dealId }: { dealId: string }) {
  const canRead = usePermission('activities:read')
  const canWrite = usePermission('activities:write')
  const queryKey = ['deal', dealId, 'activities']
  const { data } = useQuery({
    queryKey,
    queryFn: () => listDealActivities(dealId),
    enabled: canRead,
  })
  if (!canRead && !canWrite) return null

  return (
    <DetailSection title="Activities" total={data?.total ?? 0} shown={data?.items.length ?? 0}>
      {canWrite && <LogActivityForm target={{ dealId }} queryKey={queryKey} />}
      {canRead &&
        (data?.items.length === 0 ? (
          <EmptyNote>No calls, meetings or other activity logged on this deal yet.</EmptyNote>
        ) : (
          <ul className="space-y-3">
            {data?.items.map((a) => (
              <li key={a.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ACTIVITY_TYPE_LABELS[a.type]}</Badge>
                  <span className="font-medium">{a.subject}</span>
                </div>
                {a.description && (
                  <p className="mt-1 text-sm whitespace-pre-wrap">{a.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.user.firstName} {a.user.lastName} · {formatDate(a.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        ))}
    </DetailSection>
  )
}
