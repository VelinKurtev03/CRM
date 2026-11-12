import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney, monthDate } from '@/features/dashboard/format'
import { getMonthlySales, getRevenueReport } from '@/services/reports'

const YEARS_SHOWN = 6
const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30'

const monthName = (key: string) => monthDate(key).toLocaleDateString('en-US', { month: 'long' })

/** A thin bar sized against the biggest month, so the table reads at a glance. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 w-full min-w-16 rounded-full bg-muted" aria-hidden>
      <div
        className="h-2 rounded-full"
        style={{
          width: `${max > 0 ? (value / max) * 100 : 0}%`,
          background: 'var(--viz-series-1)',
        }}
      />
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return <Skeleton className="h-64 w-full" aria-label={label} />
}

function Failed({ what }: { what: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      Could not load {what}
    </p>
  )
}

function MonthlySalesCard({ year }: { year: number }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-monthly-sales', year],
    queryFn: () => getMonthlySales(year),
  })
  const max = data ? Math.max(...data.months.map((m) => m.revenue)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly sales</CardTitle>
        <CardDescription>Deals won in {year}, by the month they closed</CardDescription>
      </CardHeader>
      <CardContent>
        {isError && <Failed what="the monthly sales report" />}
        {isPending && <Loading label="Loading monthly sales" />}
        {data && data.totals.dealsWon === 0 && (
          <EmptyState
            title={`No sales in ${year}`}
            description="Deals marked as won in this year will appear here."
          />
        )}
        {data && data.totals.dealsWon > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Deals won</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Average deal</TableHead>
                <TableHead className="w-1/4">
                  <span className="sr-only">Share of the best month</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{monthName(m.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.dealsWon}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(m.revenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.dealsWon ? formatMoney(m.averageDeal) : '—'}
                  </TableCell>
                  <TableCell>
                    <Bar value={m.revenue} max={max} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{data.totals.dealsWon}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(data.totals.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(data.totals.averageDeal)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function change(percent: number | null, previousYear: number) {
  if (percent === null) return `No revenue in ${previousYear} to compare with`
  const rounded = Math.round(percent)
  return `${rounded > 0 ? '+' : ''}${rounded}% vs ${previousYear}`
}

function RevenueCard({ year }: { year: number }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-revenue', year],
    queryFn: () => getRevenueReport(year),
  })
  const max = data ? Math.max(...data.months.map((m) => m.revenue)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <CardDescription>
          {data
            ? `${formatMoney(data.totals.revenue)} won in ${year} · ${change(data.totals.changePercent, year - 1)}`
            : `Revenue won in ${year}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isError && <Failed what="the revenue report" />}
        {isPending && <Loading label="Loading revenue" />}
        {data && data.totals.revenue === 0 && data.totals.previousYear === 0 && (
          <EmptyState
            title={`No revenue in ${year}`}
            description="Revenue from won deals will appear here as you close them."
          />
        )}
        {data && (data.totals.revenue > 0 || data.totals.previousYear > 0) && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Running total</TableHead>
                  <TableHead className="text-right">{year - 1}</TableHead>
                  <TableHead className="w-1/4">
                    <span className="sr-only">Share of the best month</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{monthName(m.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(m.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(m.cumulative)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoney(m.previousYear)}
                    </TableCell>
                    <TableCell>
                      <Bar value={m.revenue} max={max} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(data.totals.revenue)}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(data.totals.previousYear)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            {data.byPipeline.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">By pipeline</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pipeline</TableHead>
                      <TableHead className="text-right">Deals won</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byPipeline.map((p) => (
                      <TableRow key={p.pipelineId}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.deals}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(p.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const thisYear = new Date().getFullYear()
  const asked = Number(searchParams.get('year'))
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear
  // Always offer the recent years, plus the one in the address if it is older.
  const years = Array.from({ length: YEARS_SHOWN }, (_, i) => thisYear - i)
  if (!years.includes(year)) years.push(year)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Sales reports</h1>
          <p className="text-sm text-muted-foreground">How the team is performing, by month.</p>
        </div>
        <select
          aria-label="Year"
          value={year}
          onChange={(e) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                if (Number(e.target.value) === thisYear) next.delete('year')
                else next.set('year', e.target.value)
                return next
              },
              { replace: true },
            )
          }
          className={selectClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <MonthlySalesCard year={year} />
      <RevenueCard year={year} />
    </div>
  )
}
