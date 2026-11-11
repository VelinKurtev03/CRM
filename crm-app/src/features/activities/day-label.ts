const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** A key for the viewer's local calendar day, e.g. `2026-11-11`. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "Today", "Yesterday", or the date (with the year only when it is not this year). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const day = startOfDay(new Date(iso))
  const days = Math.round((startOfDay(now).getTime() - day.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  })
}

/** Groups items (already newest first) by local day, keeping their order. */
export function groupByDay<T extends { occurredAt: string }>(items: T[], now: Date = new Date()) {
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const item of items) {
    const key = dayKey(new Date(item.occurredAt))
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(item)
    else groups.push({ key, label: dayLabel(item.occurredAt, now), items: [item] })
  }
  return groups
}
