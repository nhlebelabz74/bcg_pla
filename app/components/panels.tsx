"use client"

import { WarningIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { BagId } from "@/components/bag-id"
import { type Column, DataTable } from "@/components/data-table"
import { Bar } from "@/components/charts/bar"
import { BarChart } from "@/components/charts/bar-chart"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { Gauge } from "@/components/charts/gauge"
import { Grid } from "@/components/charts/grid"
import { Line, LineChart } from "@/components/charts/line-chart"
import { ReferenceArea } from "@/components/charts/reference-area"
import { ChartTooltip } from "@/components/charts/tooltip"
import { XAxis } from "@/components/charts/x-axis"
import { YAxis } from "@/components/charts/y-axis"
import { Empty, Flag, Match, Outcome } from "@/components/shared"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type BagInfo,
  type CountResult,
  type EventRow,
  type Insights,
  type Investigation,
  type TimeKey,
  type Trip,
  duration,
  useArrivals,
  when,
} from "@/lib/api"

export const RFID = "var(--chart-1)"
export const ERP = "var(--chart-2)"
export const COUNT = "var(--chart-3)"

type Bags = Record<string, BagInfo>

export function SeriesLegend({
  items,
}: {
  items: { label: string; color: string; value?: ReactNode }[]
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5"
            style={{ background: i.color }}
          />
          <span>{i.label}</span>
          {i.value !== undefined ? (
            <span className="text-muted-foreground tabular-nums">
              {i.value}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Stock at one site by product and size, as horizontal bars. */
export function ProductBreakdown({
  products,
}: {
  products: Record<string, number>
}) {
  const rows = Object.entries(products)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bags]) => ({
      name: key.replace("-", " ").replace("NONE 00", "No product"),
      bags,
    }))
  if (rows.length === 0) return <Empty>No stock here.</Empty>
  return (
    <BarChart
      data={rows}
      xDataKey="name"
      orientation="horizontal"
      aspectRatio={`3 / ${Math.max(1.4, rows.length * 0.28)}`}
      margin={{ left: 96, right: 16, top: 4, bottom: 4 }}
    >
      <Grid horizontal={false} vertical />
      <Bar dataKey="bags" fill={RFID} lineCap={2} />
      <BarYAxis />
      <ChartTooltip
        rows={(p) => [{ color: RFID, label: "Bags", value: p.bags as number }]}
      />
    </BarChart>
  )
}

const MOVE_NAMES: Record<string, string> = {
  WAREHOUSE_IN: "Warehouse in",
  WAREHOUSE_OUT: "Warehouse out",
  SHOP_IN: "Shop in",
  SHOP_OUT: "Sale",
  COUNT_FOUND: "Count: found",
  COUNT_MISSING: "Count: missing",
}

const productOf = (id: string) => {
  const [product, kg] = id.split("-")
  return product === "NONE" ? "No product" : `${product} ${kg}`
}

export function Movements({
  rows,
  bags,
  showSite,
}: {
  rows: EventRow[]
  bags: Bags
  showSite?: boolean
}) {
  const arrival = useArrivals(rows.map((e) => e.id))
  const columns: Column<EventRow>[] = [
    { key: "ts", header: "Time", cell: (e) => when(e.ts), sort: (e) => e.ts },
    {
      key: "bag",
      header: "Bag",
      cell: (e) => <BagId id={e.bag} info={bags[e.uid]} />,
      sort: (e) => e.bag,
    },
    {
      key: "event",
      header: "Movement",
      cell: (e) => (
        <span className="flex flex-col items-start gap-1">
          {MOVE_NAMES[e.event] ?? e.event}
          {e.note ? <Flag>{e.note}</Flag> : null}
        </span>
      ),
      sort: (e) => e.event,
    },
  ]
  if (showSite)
    columns.push({
      key: "site",
      header: "Site",
      cell: (e) => e.site,
      sort: (e) => e.site,
    })
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(e) => e.id}
      search={(e) => `${e.bag} ${e.event} ${e.site} ${e.note ?? ""}`}
      facets={[
        {
          key: "move",
          label: "Movements",
          value: (e) => MOVE_NAMES[e.event] ?? e.event,
        },
        { key: "product", label: "Products", value: (e) => productOf(e.bag) },
      ]}
      initialSort={{ key: "ts", desc: true }}
      rowClassName={(e) => arrival(e.id)}
      empty="No movements yet."
    />
  )
}

export function Anomalies({ rows, bags }: { rows: EventRow[]; bags: Bags }) {
  const arrival = useArrivals(rows.map((e) => e.id))
  return (
    <DataTable
      rows={rows}
      columns={[
        {
          key: "ts",
          header: "Time",
          cell: (e) => when(e.ts),
          sort: (e) => e.ts,
        },
        {
          key: "bag",
          header: "Bag",
          cell: (e) => <BagId id={e.bag} info={bags[e.uid]} />,
          sort: (e) => e.bag,
        },
        {
          key: "site",
          header: "Site",
          cell: (e) => e.site,
          sort: (e) => e.site,
        },
        {
          key: "note",
          header: "Anomaly",
          cell: (e) => <Flag>{e.note}</Flag>,
          sort: (e) => e.note,
        },
      ]}
      rowKey={(e) => e.id}
      search={(e) => `${e.bag} ${e.site} ${e.note ?? ""}`}
      facets={[{ key: "site", label: "Sites", value: (e) => e.site }]}
      initialSort={{ key: "ts", desc: true }}
      rowClassName={(e) => arrival(e.id)}
      empty="No anomalies."
    />
  )
}

export function Trips({ trips, bags }: { trips: Trip[]; bags: Bags }) {
  return (
    <DataTable
      rows={trips}
      columns={[
        {
          key: "route",
          header: "Route",
          cell: (t) => (
            <>
              {t.site} to{" "}
              {t.to ?? (
                <span className="text-muted-foreground">not arrived</span>
              )}
              {t.simulated ? null : (
                <span className="text-muted-foreground"> (live)</span>
              )}
            </>
          ),
          sort: (t) => `${t.site}-${t.to ?? ""}`,
        },
        {
          key: "departed",
          header: "Left",
          cell: (t) => when(t.departed),
          sort: (t) => t.departed,
        },
        {
          key: "sent",
          header: "Sent",
          cell: (t) => t.sent,
          sort: (t) => t.sent,
          align: "right",
        },
        {
          key: "arrived",
          header: "Arrived",
          cell: (t) => t.arrived,
          sort: (t) => t.arrived,
          align: "right",
        },
        {
          key: "avg",
          header: "Avg trip",
          cell: (t) => duration(t.avg_transit),
          sort: (t) => t.avg_transit,
          align: "right",
        },
        {
          key: "missing",
          header: "Not arrived",
          sort: (t) => t.not_arrived.length,
          cell: (t) =>
            t.not_arrived.length === 0 ? (
              <span className="text-muted-foreground">none</span>
            ) : (
              <span className="flex flex-col gap-1">
                {t.not_arrived.map((b) => (
                  <span
                    key={b.uid}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <BagId id={b.bag} info={bags[b.uid]} />
                    {b.status === "in transit" ? (
                      <span className="text-muted-foreground">in transit</span>
                    ) : (
                      <Flag>{b.status}</Flag>
                    )}
                  </span>
                ))}
              </span>
            ),
        },
      ]}
      rowKey={(t) => t.id}
      search={(t) =>
        `${t.site} ${t.to ?? ""} ${t.bags.map((b) => b.bag).join(" ")}`
      }
      facets={[
        { key: "from", label: "Origins", value: (t) => t.site },
        {
          key: "to",
          label: "Destinations",
          value: (t) => t.to ?? "not arrived",
        },
      ]}
      initialSort={{ key: "departed", desc: true }}
      empty="No trips."
    />
  )
}

export function Counts({ counts }: { counts: CountResult[] }) {
  const arrival = useArrivals(counts.map((c) => c.id))
  return (
    <DataTable
      rows={counts}
      columns={[
        {
          key: "ended",
          header: "Ended",
          cell: (c) => when(c.ended_at),
          sort: (c) => c.ended_at,
        },
        {
          key: "site",
          header: "Site",
          cell: (c) => c.site,
          sort: (c) => c.site,
        },
        {
          key: "counted",
          header: "Counted",
          cell: (c) => c.counted,
          sort: (c) => c.counted,
          align: "right",
        },
        {
          key: "rfid",
          header: "RFID",
          cell: (c) => c.rfid_book,
          sort: (c) => c.rfid_book,
          align: "right",
        },
        {
          key: "erp",
          header: "ERP",
          cell: (c) => c.erp_book ?? "n/a",
          sort: (c) => c.erp_book,
          align: "right",
        },
        {
          key: "outcome",
          header: "Outcome",
          sort: (c) => c.outcome,
          cell: (c) => (
            <div className="flex flex-col items-start gap-1">
              <Outcome outcome={c.outcome} flag={c.flag} />
              {c.missing.length ? (
                <span>Missing: {c.missing.length}</span>
              ) : null}
              {c.found.length ? <span>Found: {c.found.length}</span> : null}
            </div>
          ),
        },
      ]}
      rowKey={(c) => c.id}
      search={(c) => `${c.site} ${c.flag}`}
      facets={[{ key: "outcome", label: "Outcomes", value: (c) => c.flag }]}
      initialSort={{ key: "ended", desc: true }}
      rowClassName={(c) => arrival(c.id)}
      empty="No counts yet."
    />
  )
}

export function Investigations({
  rows,
  bags,
}: {
  rows: Investigation[]
  bags: Bags
}) {
  const arrival = useArrivals(rows.map((i) => i.id))
  return (
    <DataTable
      rows={rows}
      columns={[
        {
          key: "bag",
          header: "Bag",
          cell: (i) => <BagId id={i.bag} info={bags[i.uid]} />,
          sort: (i) => i.bag,
        },
        {
          key: "opened",
          header: "Opened",
          cell: (i) => `${i.site} ${when(i.opened_at)}`,
          sort: (i) => i.opened_at,
        },
        {
          key: "status",
          header: "Status",
          cell: (i) =>
            i.status === "open" ? (
              <Flag>Open</Flag>
            ) : (
              <Match>Closed {when(i.closed_at)}</Match>
            ),
          sort: (i) => i.status,
        },
        {
          key: "finding",
          header: "Finding",
          cell: (i) =>
            i.resolution ?? (
              <span className="text-muted-foreground">waiting</span>
            ),
          sort: (i) => i.resolution,
        },
      ]}
      rowKey={(i) => i.id}
      search={(i) => `${i.bag} ${i.site} ${i.resolution ?? ""}`}
      facets={[{ key: "status", label: "Statuses", value: (i) => i.status }]}
      initialSort={{ key: "opened", desc: true }}
      rowClassName={(i) => arrival(i.id)}
      empty="No investigations."
    />
  )
}

export function Ageing({ data }: { data: Insights }) {
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        rows={data.ageing}
        columns={[
          {
            key: "bag",
            header: "Bag",
            cell: (a) => <BagId id={a.bag} info={data.bags[a.uid]} />,
            sort: (a) => a.bag,
          },
          {
            key: "since",
            header: "Entered",
            cell: (a) => when(a.since),
            sort: (a) => a.since,
          },
          {
            key: "age",
            header: "Age",
            cell: (a) => duration(a.seconds),
            sort: (a) => a.seconds,
            align: "right",
          },
        ]}
        rowKey={(a) => a.uid}
        search={(a) => a.bag}
        facets={[
          { key: "product", label: "Products", value: (a) => productOf(a.bag) },
        ]}
        initialSort={{ key: "age", desc: true }}
        empty="No bags here."
      />
      {data.ageing_total > data.ageing.length ? (
        <p className="text-xs text-muted-foreground">
          The oldest {data.ageing.length} of {data.ageing_total} bags are
          listed.
        </p>
      ) : null}
    </div>
  )
}

export function Fifo({ data }: { data: Insights }) {
  if (data.fifo_breaks.length === 0) return <Empty>No breaks.</Empty>
  return (
    <ul className="flex flex-col gap-2">
      {data.fifo_breaks.map((f) => (
        <li key={f.trip} className="flex flex-col gap-1">
          <Flag className="w-fit">
            Trip from {f.site} at {when(f.dispatched)} left {f.older_left} older{" "}
            {f.older_left === 1 ? "bag" : "bags"} behind
          </Flag>
          <span className="text-xs text-muted-foreground">
            Oldest: {f.examples.join(", ")}
          </span>
        </li>
      ))}
    </ul>
  )
}

const TIME_ROWS: { name: string; key: TimeKey }[] = [
  { name: "Warehouse dwell", key: "warehouse_dwell" },
  { name: "Trip time", key: "transit" },
  { name: "Shop dwell", key: "shop_dwell" },
  { name: "Receipt to sale", key: "end_to_end" },
]

/** Live taps run in seconds, the simulated network in hours, so they never share an average. */
export function Times({ data }: { data: Insights }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Stay</TableHead>
          <TableHead className="text-right">Simulated network</TableHead>
          <TableHead className="text-right">Live demo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {TIME_ROWS.map((r) => (
          <TableRow key={r.key}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">
              {duration(data.times.simulated[r.key].avg)}
              <span className="text-muted-foreground">
                {" "}
                ({data.times.simulated[r.key].n})
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {duration(data.times.live[r.key].avg)}
              <span className="text-muted-foreground">
                {" "}
                ({data.times.live[r.key].n})
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ErpCheck({ data, shop }: { data: Insights; shop: string }) {
  const erp = data.erp_check[shop]
  if (!erp) return <Empty>No ERP data.</Empty>
  const today = erp.days[erp.days.length - 1]
  const gap = today.erp_check_ins - today.rfid_shop_in
  const chart = erp.days.map((d, i) => ({
    name:
      i === erp.days.length - 1
        ? "Today"
        : new Date(d.date).toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
          }),
    erp: d.erp_check_ins,
    rfid: d.rfid_shop_in,
  }))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeriesLegend
          items={[
            {
              label: "ERP check-ins (their system)",
              color: ERP,
              value: `today ${today.erp_check_ins}`,
            },
            {
              label: "RFID arrivals (our system)",
              color: RFID,
              value: `today ${today.rfid_shop_in}`,
            },
          ]}
        />
        {gap === 0 ? (
          <Match>Today agrees</Match>
        ) : (
          <Flag>Today differs by {Math.abs(gap)}</Flag>
        )}
      </div>
      <BarChart
        data={chart}
        xDataKey="name"
        aspectRatio="5 / 2"
        margin={{ left: 36, right: 8, top: 16, bottom: 32 }}
        barGap={0.3}
      >
        <Grid horizontal />
        <Bar dataKey="erp" fill={ERP} lineCap={2} />
        <Bar dataKey="rfid" fill={RFID} lineCap={2} />
        <BarXAxis showAllLabels />
        <ChartTooltip
          rows={(p) => [
            { color: ERP, label: "ERP check-ins", value: p.erp as number },
            { color: RFID, label: "RFID arrivals", value: p.rfid as number },
          ]}
        />
      </BarChart>
      <p className="text-xs text-muted-foreground">
        ERP book stock at {shop} now: {erp.erp_book}. The ERP is simulated.
      </p>
    </div>
  )
}

export function Throughput({ data }: { data: Insights }) {
  const rows = Object.entries(data.throughput).map(([d, m], i, all) => ({
    name:
      i === all.length - 1
        ? "Today"
        : new Date(d).toLocaleDateString("en-GB", { weekday: "short" }),
    moves: Object.values(m).reduce((a, b) => a + b, 0),
  }))
  if (rows.every((r) => r.moves === 0))
    return <Empty>No door movements in the last week.</Empty>
  return (
    <BarChart
      data={rows}
      xDataKey="name"
      aspectRatio="2 / 1"
      margin={{ left: 28, right: 8, top: 16, bottom: 32 }}
    >
      <Grid horizontal />
      <Bar dataKey="moves" fill={RFID} lineCap={2} />
      <BarXAxis showAllLabels />
      <ChartTooltip
        rows={(p) => [
          { color: RFID, label: "Door movements", value: p.moves as number },
        ]}
      />
    </BarChart>
  )
}

export function Completeness({ data }: { data: Insights }) {
  const { sold, complete } = data.completeness
  const pct = sold ? Math.round((100 * complete) / sold) : 0
  return (
    <div className="flex flex-col items-center gap-2">
      <Gauge
        value={pct}
        centerValue={pct}
        suffix="%"
        defaultLabel={sold ? `${complete} of ${sold}` : "No sales"}
        activeFill={RFID}
        inactiveFill="var(--muted)"
        className="w-full max-w-[15rem]"
      />
    </div>
  )
}

export function WeeklyAccuracy({ data }: { data: Insights }) {
  const w = data.weekly_counts
  if (!w) return <Empty>synthetic.json is missing.</Empty>
  const chart = w.weeks.map((x) => ({
    date: new Date(x.week_start),
    variance: x.variance_pct,
  }))
  const lastFour = w.weeks.slice(-4)
  const met =
    lastFour.length === 4 && lastFour.every((x) => x.variance_pct < w.limit_pct)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeriesLegend
          items={[
            {
              label: "Variance, % of book",
              color: COUNT,
              value: `latest ${w.weeks.at(-1)?.variance_pct}%`,
            },
          ]}
        />
        {met ? (
          <Match>Under the limit four weeks running</Match>
        ) : (
          <Flag>Limit not met yet</Flag>
        )}
      </div>
      <LineChart
        data={chart}
        className="h-56 w-full"
        margin={{ left: 44, right: 16, top: 16, bottom: 32 }}
      >
        <Grid horizontal />
        <ReferenceArea
          y1={0}
          y2={w.limit_pct}
          fill={RFID}
          fillOpacity={0.12}
          stroke={RFID}
          strokeStyle="dashed"
          fadeEdges={false}
        />
        <Line
          dataKey="variance"
          stroke={COUNT}
          strokeWidth={2}
          showMarkers
          fadeEdges={false}
        />
        <XAxis numTicks={4} />
        <YAxis formatValue={(v) => `${v}%`} numTicks={4} />
        <ChartTooltip
          rows={(p) => [
            { color: COUNT, label: "Variance", value: `${p.variance}%` },
          ]}
        />
      </LineChart>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <WarningIcon aria-hidden className="size-3.5" />
        Shaded band: the agreed limit of {w.limit_pct}%. Meeting it four weeks
        running is the case for stopping the manual count.
      </p>
    </div>
  )
}

export function Readers({ data }: { data: Insights }) {
  const b = data.bridge
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Link</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Bridges</TableCell>
            <TableCell className="whitespace-normal">
              {b
                ? `${b.online ? "Online" : "Silent"}: ${b.host ?? "?"} (${b.port ?? ""})`
                : "Not connected"}
            </TableCell>
            <TableCell className="text-right">{when(b?.last)}</TableCell>
          </TableRow>
          {Object.entries(data.readers).map(([id, r]) => (
            <TableRow key={id}>
              <TableCell>
                {id} ({r.direction.toLowerCase()})
              </TableCell>
              <TableCell>{r.info ?? "no version reported"}</TableCell>
              <TableCell className="text-right">{when(r.last_scan)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Chip version 0x91 or 0x92 is genuine, 0x12 or 0xB2 a working clone. 0x0
        or 0xFF means a wiring fault.
      </p>
    </div>
  )
}
