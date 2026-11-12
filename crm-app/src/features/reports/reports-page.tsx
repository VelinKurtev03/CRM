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
import {
  getFunnelReport,
  getLeadConversion,
  getLostDeals,
  getMonthlySales,
  getRevenueReport,
  getWinRate,
} from '@/services/reports'

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

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`)

function FunnelCard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const pipelineId = searchParams.get('pipeline') ?? undefined
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-funnel', pipelineId ?? null],
    queryFn: () => getFunnelReport(pipelineId),
  })
  const first = data?.stages[0]?.reached ?? 0
  const bottleneck = data?.stages.find((s) => s.stageId === data.bottleneckStageId)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Sales funnel</CardTitle>
            <CardDescription>
              {bottleneck
                ? `Biggest drop: ${bottleneck.name} (${pct(bottleneck.conversionPercent)} move on from the stage before)`
                : 'Where deals are in the pipeline now'}
            </CardDescription>
          </div>
          {data && data.pipelines.length > 0 && (
            <select
              aria-label="Pipeline"
              value={data.pipeline?.id ?? ''}
              onChange={(e) =>
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.set('pipeline', e.target.value)
                    return next
                  },
                  { replace: true },
                )
              }
              className={selectClass}
            >
              {data.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError && <Failed what="the sales funnel" />}
        {isPending && <Loading label="Loading sales funnel" />}
        {data && first === 0 && data.lost.deals === 0 && (
          <EmptyState
            title="No deals in this pipeline"
            description="Deals will show up here as they move through the stages."
          />
        )}
        {data && (first > 0 || data.lost.deals > 0) && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Deals now</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Reached</TableHead>
                  <TableHead className="text-right">From previous</TableHead>
                  <TableHead className="w-1/4">
                    <span className="sr-only">Share of deals that reached the stage</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stages.map((s) => (
                  <TableRow key={s.stageId}>
                    <TableCell>
                      {s.name}
                      {s.stageId === data.bottleneckStageId && (
                        <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          Bottleneck
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.deals}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(s.value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.reached}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(s.conversionPercent)}
                    </TableCell>
                    <TableCell>
                      <Bar value={s.reached} max={first} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Lost</TableCell>
                  <TableCell className="text-right tabular-nums">{data.lost.deals}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(data.lost.value)}
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            </Table>
            <p className="text-xs text-muted-foreground">
              Reached counts deals in a stage or any later one. It is a snapshot of today, not a
              history.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function LeadConversionCard({ year }: { year: number }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-lead-conversion', year],
    queryFn: () => getLeadConversion(year),
  })
  const max = data ? Math.max(...data.months.map((m) => m.leads)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead conversion</CardTitle>
        <CardDescription>
          {data && data.totals.leads > 0
            ? `${data.totals.converted} of ${data.totals.leads} leads created in ${year} became deals (${pct(data.totals.conversionPercent)}) · ${data.totals.lost} lost · ${data.totals.open} still open`
            : `Leads created in ${year} that became deals`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isError && <Failed what="the lead conversion report" />}
        {isPending && <Loading label="Loading lead conversion" />}
        {data && data.totals.leads === 0 && (
          <EmptyState
            title={`No leads in ${year}`}
            description="Leads created in this year will appear here."
          />
        )}
        {data && data.totals.leads > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month created</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Converted</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="w-1/4">
                    <span className="sr-only">Share of the busiest month</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{monthName(m.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.converted}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(m.conversionPercent)}
                    </TableCell>
                    <TableCell>
                      <Bar value={m.leads} max={max} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.converted}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(data.totals.conversionPercent)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            <div>
              <h3 className="mb-2 text-sm font-medium">By source</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bySource.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell>{s.source}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.leads}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.converted}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(s.conversionPercent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function WinRateCard({ year }: { year: number }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-win-rate', year],
    queryFn: () => getWinRate(year),
  })
  const closed = data ? data.totals.won + data.totals.lost : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Win rate</CardTitle>
        <CardDescription>
          {data && closed > 0
            ? `${pct(data.totals.winRatePercent)} of deals closed in ${year} were won (${data.totals.won} won, ${data.totals.lost} lost)`
            : `Won deals as a share of deals closed in ${year}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isError && <Failed what="the win rate report" />}
        {isPending && <Loading label="Loading win rate" />}
        {data && closed === 0 && (
          <EmptyState
            title={`No closed deals in ${year}`}
            description="Deals marked as won or lost in this year will appear here."
          />
        )}
        {data && closed > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="w-1/4">
                    <span className="sr-only">Win rate</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{monthName(m.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.won}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.lost}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(m.winRatePercent)}
                    </TableCell>
                    <TableCell>
                      <Bar value={m.winRatePercent ?? 0} max={100} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.won}</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.lost}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(data.totals.winRatePercent)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            <div>
              <h3 className="mb-2 text-sm font-medium">By pipeline</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pipeline</TableHead>
                    <TableHead className="text-right">Won</TableHead>
                    <TableHead className="text-right">Lost</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byPipeline.map((p) => (
                    <TableRow key={p.pipelineId}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.won}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.lost}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(p.winRatePercent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function LostDealsCard({ year }: { year: number }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-lost-deals', year],
    queryFn: () => getLostDeals(year),
  })
  const max = data ? Math.max(...data.months.map((m) => m.value)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lost deals</CardTitle>
        <CardDescription>
          {data && data.totals.deals > 0
            ? `${data.totals.deals} deals worth ${formatMoney(data.totals.value)} lost in ${year} · open ${Math.round(data.totals.averageDaysOpen)} days on average`
            : `Deals lost in ${year}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isError && <Failed what="the lost deals report" />}
        {isPending && <Loading label="Loading lost deals" />}
        {data && data.totals.deals === 0 && (
          <EmptyState
            title={`No lost deals in ${year}`}
            description="Deals moved to a lost stage in this year will appear here."
          />
        )}
        {data && data.totals.deals > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Deals lost</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-1/4">
                    <span className="sr-only">Share of the worst month</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{monthName(m.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.deals}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(m.value)}
                    </TableCell>
                    <TableCell>
                      <Bar value={m.value} max={max} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{data.totals.deals}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(data.totals.value)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            <div>
              <h3 className="mb-2 text-sm font-medium">By pipeline</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pipeline</TableHead>
                    <TableHead className="text-right">Deals lost</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byPipeline.map((p) => (
                    <TableRow key={p.pipelineId}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.deals}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(p.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Biggest lost deals</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Days open</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.biggest.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.title}</TableCell>
                      <TableCell>{d.pipeline}</TableCell>
                      <TableCell>{d.owner ?? 'Unassigned'}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.daysOpen}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(d.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
          <p className="text-sm text-muted-foreground">
            How the team is performing: sales, funnel, lead conversion, win rate and lost deals.
          </p>
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
      <FunnelCard />
      <LeadConversionCard year={year} />
      <WinRateCard year={year} />
      <LostDealsCard year={year} />
    </div>
  )
}
