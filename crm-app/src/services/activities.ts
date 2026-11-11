import { api } from '@/api/client'
import type { LoggableType } from './activity-options'

export type Activity = {
  id: string
  type: LoggableType | 'OTHER'
  subject: string
  description: string | null
  occurredAt: string
  user: { id: string; firstName: string; lastName: string }
}

/** An activity is logged against a contact, a deal, or both. */
export type NewActivity = {
  type: LoggableType
  subject: string
  description?: string
  /** ISO time; the server uses "now" when left out. */
  occurredAt?: string
  contactId?: string
  dealId?: string
}

export const logActivity = (body: NewActivity) =>
  api.post<{ activity: Activity }>('/activities', body).then((r) => r.data.activity)

export const listDealActivities = (dealId: string) =>
  api.get<{ total: number; items: Activity[] }>(`/deals/${dealId}/activities`).then((r) => r.data)
