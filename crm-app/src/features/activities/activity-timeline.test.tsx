import { render, screen, within } from '@testing-library/react'

import type { Activity } from '@/services/activities'
import { ActivityTimeline } from './activity-timeline'
import { dayLabel, groupByDay } from './day-label'

const user = { id: 'u1', firstName: 'Ann', lastName: 'Lee' }
const at = (daysAgo: number, hour = 12) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const activity = (id: string, subject: string, occurredAt: string): Activity => ({
  id,
  type: 'CALL',
  subject,
  description: null,
  occurredAt,
  user,
})

describe('dayLabel', () => {
  const now = new Date(2026, 10, 11, 15, 0)
  it('says Today and Yesterday, then the date', () => {
    expect(dayLabel(new Date(2026, 10, 11, 0, 5).toISOString(), now)).toBe('Today')
    expect(dayLabel(new Date(2026, 10, 10, 23, 55).toISOString(), now)).toBe('Yesterday')
    expect(dayLabel(new Date(2026, 10, 8, 9).toISOString(), now)).toBe('Sunday, November 8')
  })
  it('adds the year for earlier years', () => {
    expect(dayLabel(new Date(2025, 11, 31, 9).toISOString(), now)).toBe(
      'Wednesday, December 31, 2025',
    )
  })
})

describe('groupByDay', () => {
  it('keeps order and puts the same day together', () => {
    const items = [at(0, 15), at(0, 9), at(1)].map((t, i) => activity(`a${i}`, `s${i}`, t))
    const groups = groupByDay(items)
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ])
  })
})

describe('ActivityTimeline', () => {
  it('shows a heading per day with its activities beneath', () => {
    render(
      <ActivityTimeline
        items={[
          activity('a1', 'Called back', at(0)),
          activity('a2', 'Sent proposal', at(1)),
          activity('a3', 'Intro call', at(1, 9)),
        ]}
      />,
    )
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Today', 'Yesterday'])
    const yesterday = within(screen.getByRole('region', { name: 'Yesterday' }))
    expect(yesterday.getAllByRole('listitem')).toHaveLength(2)
    expect(yesterday.getByText('Sent proposal')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Today' })).getByText('Called back'),
    ).toBeInTheDocument()
  })
})
