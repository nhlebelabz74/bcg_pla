"use client"

import Link from "next/link"

import { Bar } from "@/components/charts/bar"
import { BarChart } from "@/components/charts/bar-chart"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { Grid } from "@/components/charts/grid"
import { ChartTooltip } from "@/components/charts/tooltip"
import { CountFlow } from "@/components/count-flow"
import { DataTable } from "@/components/data-table"
import { PageShell } from "@/components/page-shell"
import {
  Anomalies,
  Completeness,
  Investigations,
  RFID,
  Readers,
  Throughput,
  Times,
  Trips,
  WeeklyAccuracy,
} from "@/components/panels"
import { Empty, Flag, LinkStatus, Panel } from "@/components/shared"
import {
  type BagState,
  type Insights,
  STATE_NAMES,
  duration,
  usePoll,
} from "@/lib/api"

const STATE_ORDER: BagState[] = [
  "ASSIGNED",
  "AT_WAREHOUSE",
  "IN_TRANSIT",
  "AT_SHOP",
  "SOLD",
  "MISSING",
]

export function Overview() {
  const { data, offline } = usePoll<Insights>("/api/insights", 2000)
  return (
    <PageShell
      title="Network overview"
      status={
        data ? (
          <LinkStatus
            bridge={data.bridge}
            readers={data.readers}
            offline={offline}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {offline ? "Tracker offline" : "Loading"}
          </p>
        )
      }
    >
      {data ? <OverviewPanels data={data} /> : null}
    </PageShell>
  )
}

function OverviewPanels({ data }: { data: Insights }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
      <Panel
        title="Stock by state"
        description="Every tag's latest position across the network"
        className="md:col-span-2 xl:col-span-7"
      >
        <dl className="grid grid-cols-3 gap-px border bg-border sm:grid-cols-6">
          {STATE_ORDER.map((s) => (
            <div key={s} className="flex flex-col gap-1 bg-card p-3">
              <dt className="text-xs text-muted-foreground">
                {STATE_NAMES[s]}
              </dt>
              <dd className="text-2xl tabular-nums">
                <CountFlow value={data.stock[s]} />
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        title="Read completeness"
        description="Sold bag cycles with all four door reads and no anomaly"
        className="xl:col-span-2"
      >
        <Completeness data={data} />
      </Panel>

      <Panel
        title="Readers"
        description="Reader laptops and the two readers"
        className="xl:col-span-3"
      >
        <Readers data={data} />
      </Panel>

      <Panel
        title="Sites"
        description="Book stock now. Open a site for its own dashboard."
        className="md:col-span-2 xl:col-span-5"
      >
        <SiteGrid data={data} />
      </Panel>

      <Panel
        title="Stock by site"
        description="Bags each site holds by the RFID records"
        className="md:col-span-2 xl:col-span-7"
      >
        <StockBySite data={data} />
      </Panel>

      <Panel
        title="Recent trips"
        description="Warehouse to shop, newest first"
        className="md:col-span-2 xl:col-span-7"
      >
        <Trips trips={data.trips.slice(0, 8)} bags={data.bags} />
      </Panel>

      <Panel
        title="Overdue"
        description="In transit longer than 1 minute (live) or 36 hours (simulated)"
        className="xl:col-span-5"
      >
        {data.overdue.length === 0 ? (
          <Empty>No bag is overdue.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.overdue.map((o) => (
              <li
                key={o.uid}
                className="flex items-center justify-between gap-2"
              >
                <Flag>
                  {o.bag} left {o.site}
                </Flag>
                <span className="text-muted-foreground tabular-nums">
                  {duration(o.seconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Supply share"
        description="Deliveries per route over 30 days"
        className="md:col-span-2 xl:col-span-6"
      >
        <SupplyShare data={data} />
      </Panel>

      <Panel
        title="Times"
        description="Average per bag cycle; bag cycles counted in brackets"
        className="md:col-span-2 xl:col-span-6"
      >
        <Times data={data} />
      </Panel>

      <Panel
        title="Anomalies"
        description="Scans that do not fit the expected flow"
        className="xl:col-span-6"
      >
        <Anomalies rows={data.anomalies} bags={data.bags} />
      </Panel>

      <Panel
        title="Investigations"
        description="Opened for each bag missing at a count"
        className="xl:col-span-6"
      >
        <Investigations rows={data.investigations} bags={data.bags} />
      </Panel>

      <Panel
        title="Throughput"
        description="Door movements per day, all sites"
        className="xl:col-span-5"
      >
        <Throughput data={data} />
      </Panel>

      <Panel
        title="Weekly count accuracy"
        description="WH1 count variance against book stock"
        synthetic="full"
        className="md:col-span-2 xl:col-span-7"
      >
        <WeeklyAccuracy data={data} />
      </Panel>
    </div>
  )
}

function SiteGrid({ data }: { data: Insights }) {
  return (
    <ul className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">
      {data.sites.map((s) => {
        const book =
          data.stock_by_site[s.id]?.[
            s.facility === "SHOP" ? "AT_SHOP" : "AT_WAREHOUSE"
          ] ?? 0
        const missing = data.stock_by_site[s.id]?.MISSING ?? 0
        return (
          <li key={s.id} className="bg-card">
            <Link
              href={`/${s.facility === "SHOP" ? "shops" : "warehouses"}?site=${s.id}`}
              className="flex flex-col gap-1 p-3 transition-colors duration-150 hover:bg-muted"
            >
              <span className="text-xs text-muted-foreground">{s.name}</span>
              <span className="text-2xl tabular-nums">
                <CountFlow value={book} />
              </span>
              <span className="text-xs text-muted-foreground">
                {s.id}
                {missing ? `, ${missing} missing` : ""}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function StockBySite({ data }: { data: Insights }) {
  const rows = data.sites.map((s) => ({
    name: s.id,
    bags:
      data.stock_by_site[s.id]?.[
        s.facility === "SHOP" ? "AT_SHOP" : "AT_WAREHOUSE"
      ] ?? 0,
  }))
  return (
    <BarChart
      data={rows}
      xDataKey="name"
      aspectRatio="5 / 2"
      margin={{ left: 32, right: 8, top: 16, bottom: 32 }}
    >
      <Grid horizontal />
      <Bar dataKey="bags" fill={RFID} lineCap={2} />
      <BarXAxis showAllLabels />
      <ChartTooltip
        rows={(p) => [{ color: RFID, label: "Bags", value: p.bags as number }]}
      />
    </BarChart>
  )
}

function SupplyShare({ data }: { data: Insights }) {
  const routes = data.supply_share
  if (routes.length === 0) return <Empty>No deliveries yet.</Empty>
  const total = routes.reduce((n, r) => n + r.deliveries, 0)
  const rows = routes.map((r) => ({
    name: `${r.from}-${r.to}`,
    deliveries: r.deliveries,
  }))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BarChart
        data={rows}
        xDataKey="name"
        orientation="horizontal"
        aspectRatio="4 / 3"
        margin={{ left: 80, right: 16, top: 4, bottom: 4 }}
      >
        <Grid horizontal={false} vertical />
        <Bar dataKey="deliveries" fill={RFID} lineCap={2} />
        <BarYAxis />
        <ChartTooltip
          rows={(p) => [
            { color: RFID, label: "Deliveries", value: p.deliveries as number },
          ]}
        />
      </BarChart>
      <DataTable
        rows={routes}
        columns={[
          {
            key: "route",
            header: "Route",
            cell: (r) => `${r.from} to ${r.to}`,
            sort: (r) => `${r.from}-${r.to}`,
          },
          {
            key: "share",
            header: "Share",
            cell: (r) => `${Math.round((100 * r.deliveries) / total)}%`,
            sort: (r) => r.deliveries,
            align: "right",
          },
          {
            key: "trip",
            header: "Avg trip",
            cell: (r) =>
              r.avg_trip_hours != null ? `${r.avg_trip_hours} h` : "n/a",
            sort: (r) => r.avg_trip_hours,
            align: "right",
          },
        ]}
        rowKey={(r) => `${r.from}-${r.to}`}
        facets={[{ key: "to", label: "Shops", value: (r) => r.to }]}
        initialSort={{ key: "share", desc: true }}
      />
    </div>
  )
}
