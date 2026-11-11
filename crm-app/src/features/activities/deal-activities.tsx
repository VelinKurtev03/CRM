import { useQuery } from '@tanstack/react-query'

import { DetailSection, EmptyNote } from '@/components/detail-section'
import { usePermission } from '@/hooks/use-permission'
import { listDealActivities } from '@/services/activities'
import { ActivityTimeline } from './activity-timeline'
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
          <ActivityTimeline items={data?.items ?? []} />
        ))}
    </DetailSection>
  )
}
