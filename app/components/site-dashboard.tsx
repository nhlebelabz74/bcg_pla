"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { CountFlow } from "@/components/count-flow"
import { PageShell } from "@/components/page-shell"
import {
  Ageing,
  Counts,
  ErpCheck,
  Fifo,
  Investigations,
  Movements,
  ProductBreakdown,
  Throughput,
  Trips,
} from "@/components/panels"
import { LinkStatus, Panel } from "@/components/shared"
import { SitePicker } from "@/components/site-picker"
import { type Facility, type Insights, type SiteInfo, usePoll } from "@/lib/api"

const SITES: Record<Facility, SiteInfo[]> = {
  WAREHOUSE: ["WH1", "WH2", "WH3", "WH4"].map((id, i) => ({
    id,
    name: `Warehouse ${i + 1}`,
    facility: "WAREHOUSE",
  })),
  SHOP: ["SHOP1", "SHOP2"].map((id, i) => ({
    id,
    name: `Shop ${i + 1}`,
    facility: "SHOP",
  })),
}

/** One dashboard per site. The picker switches site and keeps it in the address. */
export function SiteDashboard({
  facility,
  initialSite,
}: {
  facility: Facility
  initialSite?: string
}) {
  const sites = SITES[facility]
  const router = useRouter()
  const [site, setSite] = useState(
    sites.some((s) => s.id === initialSite) ? initialSite! : sites[0].id
  )
  const { data, offline } = usePoll<Insights>(
    `/api/insights?site=${site}`,
    2000
  )
  const current = data && data.site === site ? data : null
  const isShop = facility === "SHOP"
  const book =
    current?.stock_by_site[site]?.[isShop ? "AT_SHOP" : "AT_WAREHOUSE"] ?? 0

  function choose(next: string) {
    setSite(next)
    router.replace(`/${isShop ? "shops" : "warehouses"}?site=${next}`, {
      scroll: false,
    })
  }

  const withBooks = sites.map((s) => ({
    ...s,
    book: data?.stock_by_site[s.id]?.[isShop ? "AT_SHOP" : "AT_WAREHOUSE"],
  }))

  return (
    <PageShell
      title={isShop ? "Shops" : "Warehouses"}
      status={
        data ? (
          <LinkStatus
            bridge={data.bridge}
            readers={data.readers}
            offline={offline}
          />
        ) : null
      }
    >
      <SitePicker
        sites={withBooks}
        value={site}
        onChange={choose}
        className="max-w-2xl"
      />
      {current ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          <Panel
            title={`Book stock at ${site}`}
            description="Bags the RFID records place here, by product and size"
            className="md:col-span-2 xl:col-span-5"
          >
            <div className="mb-3 flex items-baseline gap-2">
              <CountFlow
                value={book}
                className="text-5xl font-medium tabular-nums"
              />
              <span className="text-muted-foreground">bags</span>
              {current.stock_by_site[site]?.MISSING ? (
                <span className="text-muted-foreground">
                  , {current.stock_by_site[site].MISSING} missing
                </span>
              ) : null}
            </div>
            <ProductBreakdown products={current.products_by_site[site] ?? {}} />
          </Panel>

          {isShop ? (
            <Panel
              title="ERP check"
              description="Shop check-ins: the simulated ERP against RFID arrivals"
              className="md:col-span-2 xl:col-span-7"
            >
              <ErpCheck data={current} shop={site} />
            </Panel>
          ) : (
            <Panel
              title="Stock ageing"
              description="Bags still here, oldest first"
              className="md:col-span-2 xl:col-span-7"
            >
              <Ageing data={current} />
            </Panel>
          )}

          <Panel
            title="Movements"
            description={`Latest door reads and count corrections at ${site}`}
            className="xl:col-span-6"
          >
            <Movements rows={current.movements} bags={current.bags} />
          </Panel>

          <Panel
            title="Walk-in counts"
            description={`Every count at ${site}`}
            className="xl:col-span-6"
          >
            <Counts counts={current.counts} />
          </Panel>

          <Panel
            title={isShop ? "Trips in" : "Trips out"}
            description={
              isShop
                ? `Deliveries to ${site}, newest first`
                : `Dispatches from ${site}, newest first`
            }
            className="md:col-span-2 xl:col-span-7"
          >
            <Trips trips={current.trips.slice(0, 8)} bags={current.bags} />
          </Panel>

          <Panel
            title="Investigations"
            description={`Bags missing at counts at ${site}`}
            className="xl:col-span-5"
          >
            <Investigations rows={current.investigations} bags={current.bags} />
          </Panel>

          {isShop ? null : (
            <Panel
              title="First in, first out"
              description="Trips that left older bags behind"
              className="xl:col-span-6"
            >
              <Fifo data={current} />
            </Panel>
          )}

          <Panel
            title="Throughput"
            description={`Door movements per day at ${site}`}
            className={isShop ? "xl:col-span-12" : "xl:col-span-6"}
          >
            <Throughput data={current} />
          </Panel>
        </div>
      ) : (
        <p className="text-muted-foreground">
          {offline ? "Tracker offline" : "Loading"}
        </p>
      )}
    </PageShell>
  )
}
