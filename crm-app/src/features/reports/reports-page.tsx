import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  getFilterOptions,
  getFunnelReport,
  getLeadConversion,
  getLostDeals,
  getMonthlySales,
  getRevenueReport,
  getTeamPerformance,
  getWinRate,
  type ReportFilters,
} from '@/services/reports'
import { downloadCsv, type CsvCell } from '@/utils/csv'

import {
  funnelRows,
  leadConversionRows,
  lostDealsRows,
  monthlySalesRows,
  revenueRows,
  teamPerformanceRows,
  winRateRows,
} from './exports'

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

/** Saves what the card shows as a CSV file, with the filters used at the top. */
function ExportButton({
  filename,
  rows,
}: {
  filename: string
  /** Null while the report is loading or has failed. */
  rows: CsvCell[][] | null
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!rows}
      onClick={() => rows && downloadCsv(filename, rows)}
    >
      <Download aria-hidden /> Export CSV
    </Button>
  )
}

/** A short, readable description of the filters, used in exported files. */
function describeFilters(f: ReportFilters, owner?: string, pipeline?: string) {
  const range =
    f.from || f.to ? `${f.from ?? `${f.year}-01-01`} to ${f.to ?? `${f.year}-12-31`}` : ''
  return [f.year, range, owner && `Owner: ${owner}`, pipeline && `Pipeline: ${pipeline}`]
    .filter(Boolean)
    .join(' · ')
}

type CardProps = { filters: ReportFilters; label: string }

function MonthlySalesCard({ filters, label }: CardProps) {
  const { year } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-monthly-sales', filters],
    queryFn: () => getMonthlySales(filters),
  })
  const max = data ? Math.max(...data.months.map((m) => m.revenue)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly sales</CardTitle>
        <CardDescription>Deals won in {year}, by the month they closed</CardDescription>
        <CardAction>
          <ExportButton
            filename={`monthly-sales-${year}.csv`}
            rows={data ? monthlySalesRows(data, label) : null}
          />
        </CardAction>
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

function RevenueCard({ filters, label }: CardProps) {
  const { year } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-revenue', filters],
    queryFn: () => getRevenueReport(filters),
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
        <CardAction>
          <ExportButton
            filename={`revenue-${year}.csv`}
            rows={data ? revenueRows(data, label) : null}
          />
        </CardAction>
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

function FunnelCard({ filters, label }: CardProps) {
  const { pipelineId, ownerId } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-funnel', pipelineId ?? null, ownerId ?? null],
    queryFn: () => getFunnelReport(pipelineId, ownerId),
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
          <ExportButton
            filename={`sales-funnel-${filters.year}.csv`}
            rows={data ? funnelRows(data, label) : null}
          />
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

function LeadConversionCard({ filters, label }: CardProps) {
  const { year } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-lead-conversion', filters],
    queryFn: () => getLeadConversion(filters),
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
        <CardAction>
          <ExportButton
            filename={`lead-conversion-${year}.csv`}
            rows={data ? leadConversionRows(data, label) : null}
          />
        </CardAction>
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

function WinRateCard({ filters, label }: CardProps) {
  const { year } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-win-rate', filters],
    queryFn: () => getWinRate(filters),
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
        <CardAction>
          <ExportButton
            filename={`win-rate-${year}.csv`}
            rows={data ? winRateRows(data, label) : null}
          />
        </CardAction>
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

function LostDealsCard({ filters, label }: CardProps) {
  const { year } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-lost-deals', filters],
    queryFn: () => getLostDeals(filters),
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
        <CardAction>
          <ExportButton
            filename={`lost-deals-${year}.csv`}
            rows={data ? lostDealsRows(data, label) : null}
          />
        </CardAction>
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

function TeamPerformanceCard({ filters, label }: CardProps) {
  const { year } = filters
  const { data, isPending, isError } = useQuery({
    queryKey: ['report-team-performance', filters],
    queryFn: () => getTeamPerformance(filters),
  })
  const max = data ? Math.max(...data.members.map((m) => m.revenue)) : 0
  const rate = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team performance</CardTitle>
        <CardDescription>
          {data && data.members.length > 0
            ? `${data.totals.dealsWon} deals won worth ${formatMoney(data.totals.revenue)} in ${year} · ${data.totals.activities} activities logged · ${data.totals.tasksOverdue} overdue tasks now`
            : `How each person did in ${year}`}
        </CardDescription>
        <CardAction>
          <ExportButton
            filename={`team-performance-${year}.csv`}
            rows={data ? teamPerformanceRows(data, label) : null}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {isError && <Failed what="the team performance report" />}
        {isPending && <Loading label="Loading team performance" />}
        {data && data.members.length === 0 && (
          <EmptyState
            title={`No team activity in ${year}`}
            description="Deals, leads, calls and tasks owned by your team will appear here."
          />
        )}
        {data && data.members.length > 0 && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium">Deals closed in {year}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead className="text-right">Won</TableHead>
                    <TableHead className="text-right">Lost</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="w-1/5">
                      <span className="sr-only">Share of the top seller</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.dealsWon}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.dealsLost}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rate(m.winRatePercent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(m.revenue)}
                      </TableCell>
                      <TableCell>
                        <Bar value={m.revenue} max={max} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Team</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {data.totals.dealsWon}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {data.totals.dealsLost}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rate(data.totals.winRatePercent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(data.totals.revenue)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Pipeline and workload</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Open deals and tasks are as of today. Leads and activities are for {year}.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead className="text-right">Open deals</TableHead>
                    <TableHead className="text-right">Open value</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right">Activities</TableHead>
                    <TableHead className="text-right">Tasks done</TableHead>
                    <TableHead className="text-right">Open tasks</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.openDeals}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(m.openValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.leads}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.leadsConverted}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.activities}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.tasksCompleted}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.tasksOpen}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${m.tasksOverdue > 0 ? 'font-medium text-destructive' : ''}`}
                      >
                        {m.tasksOverdue}
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

const dateParam = /^\d{4}-\d{2}-\d{2}$/

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const thisYear = new Date().getFullYear()
  const asked = Number(searchParams.get('year'))
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear
  // Always offer the recent years, plus the one in the address if it is older.
  const years = Array.from({ length: YEARS_SHOWN }, (_, i) => thisYear - i)
  if (!years.includes(year)) years.push(year)

  const options = useQuery({ queryKey: ['report-filter-options'], queryFn: getFilterOptions })
  const dateIn = (name: string) => {
    const value = searchParams.get(name) ?? ''
    return dateParam.test(value) && value.startsWith(`${year}-`) ? value : ''
  }
  const from = dateIn('from')
  const to = dateIn('to')
  const ownerId = searchParams.get('owner') ?? ''
  const pipelineId = searchParams.get('pipeline') ?? ''
  const filters: ReportFilters = {
    year,
    ...(from && { from }),
    ...(to && { to }),
    ...(ownerId && { ownerId }),
    ...(pipelineId && { pipelineId }),
  }
  const rangeInvalid = Boolean(from && to && from > to)
  const filtered = Boolean(from || to || ownerId || pipelineId)
  const label = describeFilters(
    filters,
    options.data?.owners.find((o) => o.id === ownerId)?.name,
    options.data?.pipelines.find((p) => p.id === pipelineId)?.name,
  )

  const change = (updates: Record<string, string | null>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sales reports</h1>
        <p className="text-sm text-muted-foreground">
          How the team is performing: sales, funnel, lead conversion, win rate, lost deals and each
          person's results.
        </p>
      </div>
      <form
        aria-label="Report filters"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="grid gap-1 text-xs text-muted-foreground">
          Year
          <select
            aria-label="Year"
            value={year}
            onChange={(e) =>
              // Dates belong to one year, so they are cleared when the year changes.
              change({
                year: Number(e.target.value) === thisYear ? null : e.target.value,
                from: null,
                to: null,
              })
            }
            className={selectClass}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            aria-label="From"
            value={from}
            min={`${year}-01-01`}
            max={to || `${year}-12-31`}
            onChange={(e) => change({ from: e.target.value || null })}
            className={selectClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            aria-label="To"
            value={to}
            min={from || `${year}-01-01`}
            max={`${year}-12-31`}
            onChange={(e) => change({ to: e.target.value || null })}
            className={selectClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Owner
          <select
            aria-label="Owner"
            value={ownerId}
            onChange={(e) => change({ owner: e.target.value || null })}
            className={selectClass}
          >
            <option value="">Everyone</option>
            {options.data?.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Pipeline
          <select
            aria-label="Pipeline"
            value={pipelineId}
            onChange={(e) => change({ pipeline: e.target.value || null })}
            className={selectClass}
          >
            <option value="">All pipelines</option>
            {options.data?.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => change({ from: null, to: null, owner: null, pipeline: null })}
          >
            Clear filters
          </Button>
        )}
      </form>
      {rangeInvalid ? (
        <p role="alert" className="text-sm text-destructive">
          The end date must be after the start date.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Dates narrow deals by the day they closed and leads by the day they were created. Leads
            are not tied to a pipeline, so the pipeline filter does not apply to them. The funnel
            shows one pipeline, the default when none is chosen.
          </p>
          <MonthlySalesCard filters={filters} label={label} />
          <RevenueCard filters={filters} label={label} />
          <FunnelCard filters={filters} label={label} />
          <LeadConversionCard filters={filters} label={label} />
          <WinRateCard filters={filters} label={label} />
          <LostDealsCard filters={filters} label={label} />
          <TeamPerformanceCard filters={filters} label={label} />
        </>
      )}
    </div>
  )
}
