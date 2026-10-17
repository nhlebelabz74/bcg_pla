"use client"

import {
  BarcodeIcon,
  BroadcastIcon,
  CheckIcon,
  PlusIcon,
  SkipForwardIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { CountFlow } from "@/components/count-flow"
import { PageShell } from "@/components/page-shell"
import { Unlock } from "@/components/unlock"
import { Empty, Flag, LinkStatus, Outcome, Panel } from "@/components/shared"
import { SitePicker } from "@/components/site-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type ControlState,
  type CountResult,
  EVENT_NAMES,
  post,
  productLabel,
  useArrivals,
  usePoll,
  when,
} from "@/lib/api"
import { saveControlKey, useControlKey } from "@/lib/key"
import { cn } from "@/lib/utils"

/**
 * The phone's page during the demo: choose the site both readers stand for, run
 * walk-in counts, and use the simulated ERP at the shops.
 */
export function ControlPage({ linkKey }: { linkKey: string }) {
  const stored = useControlKey()
  useEffect(() => {
    if (linkKey) saveControlKey(linkKey)
  }, [linkKey])
  const controlKey = linkKey || stored
  const { data, setData, offline } = usePoll<ControlState>(
    "/api/state",
    1000,
    controlKey || undefined
  )
  const [pending, setPending] = useState<string | null>(null)
  const [result, setResult] = useState<CountResult | null>(null)

  const can = !!data?.authorised
  const scanArrival = useArrivals(data?.recent.map((e) => e.id))
  const countArrival = useArrivals(
    data ? (data.last_count ? [data.last_count.id] : []) : null
  )
  const investigationArrival = useArrivals(
    data?.investigations.map((i) => i.id)
  )

  async function act(name: string, path: string, body: object = {}) {
    setPending(name)
    try {
      const next = await post(path, controlKey, body)
      setData(next)
      return next
    } catch (err) {
      toast.error((err as Error).message)
      return null
    } finally {
      setPending(null)
    }
  }

  if (!data) {
    return (
      <PageShell title="Control" wide={false}>
        <p className="py-10 text-center text-muted-foreground">
          {offline ? "The tracker cannot be reached." : "Loading"}
        </p>
      </PageShell>
    )
  }

  const site = data.sites.find((s) => s.id === data.site)!
  const counting = data.count !== null
  const atShop = site.facility === "SHOP"
  const lastCount = result && result.site === site.id ? result : data.last_count
  const realSeen = data.count
    ? data.count.seen.filter((u) => !data.bags[u]?.simulated)
    : []
  const simSeen = data.count ? data.count.seen.length - realSeen.length : 0

  return (
    <PageShell
      title="Control"
      wide={false}
      status={
        <LinkStatus
          bridge={data.bridge}
          readers={data.readers}
          offline={offline}
        />
      }
    >
      {!can ? <Unlock what="control the demo" /> : null}

      <section aria-label="Site" className="flex flex-col gap-2">
        <SitePicker
          sites={data.sites}
          value={data.site}
          columns={3}
          disabled={!can || counting || pending === "site"}
          onChange={(s) => act("site", "/api/site", { site: s })}
        />
        <p className="text-xs text-muted-foreground">
          {counting
            ? "Site switch locked while a count runs."
            : `Readers stand for ${site.name}. R1 records bags entering. R2 records bags ${atShop ? "sold" : "leaving"}.`}
        </p>
      </section>

      <Panel
        title={`Book stock at ${site.id}`}
        description="Bags the RFID records place here"
      >
        <div className="flex items-baseline gap-2">
          <CountFlow
            value={data.book}
            className="text-5xl font-medium tabular-nums"
          />
          <span className="text-muted-foreground">
            {data.book === 1 ? "bag" : "bags"}
          </span>
        </div>
        {data.site_stock.length ? (
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {data.site_stock.map((p) => (
              <li key={`${p.product}-${p.kg}`} className="flex justify-between">
                <span>{productLabel(p.product, p.kg)}</span>
                <span className="tabular-nums">{p.bags}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel
        title="Walk-in count"
        description={
          counting
            ? `Counting at ${data.count!.site}. Tap each real tag on either reader, and sweep for the simulated bags.`
            : "The count corrects the RFID records. Missing bags open an investigation."
        }
      >
        {counting ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <CountFlow
                value={data.count!.seen.length}
                className="text-3xl tabular-nums"
              />
              <span className="text-muted-foreground">
                counted since {when(data.count!.started)}
              </span>
            </div>
            {simSeen ? (
              <p className="text-muted-foreground">
                {simSeen} simulated bags read by the sweep
              </p>
            ) : null}
            {realSeen.length ? (
              <ul className="flex flex-col gap-1" aria-live="polite">
                {realSeen.map((uid) => (
                  <li key={uid} className="row-in font-mono">
                    {data.bags[uid]?.id ?? uid}
                  </li>
                ))}
              </ul>
            ) : null}
            {can ? (
              <div className="flex flex-col gap-2">
                <Button
                  size="touch"
                  variant="outline"
                  disabled={!!pending || data.simulated_here === 0}
                  onClick={async () => {
                    const next = await act("sweep", "/api/count/sweep")
                    if (next)
                      toast(`Sweep read ${next.swept ?? 0} simulated bags`)
                  }}
                >
                  <BroadcastIcon aria-hidden />
                  Simulated gun sweep ({data.simulated_here} here)
                </Button>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <EndCount
                    counted={data.count!.seen.length}
                    book={data.book}
                    site={data.count!.site}
                    simulatedHere={data.simulated_here}
                    swept={simSeen > 0}
                    disabled={!!pending}
                    onEnd={async () => {
                      const next = await act("end", "/api/count/end")
                      if (next?.result) setResult(next.result)
                    }}
                  />
                  <Button
                    size="touch"
                    variant="outline"
                    disabled={!!pending}
                    onClick={() => act("cancel", "/api/count/cancel")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {can ? (
              <Button
                size="touch"
                disabled={!!pending}
                onClick={() => {
                  setResult(null)
                  act("start", "/api/count/start")
                }}
              >
                <BarcodeIcon aria-hidden />
                Start count at {site.id}
              </Button>
            ) : null}
            {lastCount ? (
              <CountSummary
                count={lastCount}
                className={countArrival(lastCount.id)}
              />
            ) : (
              <Empty>No count at this site yet.</Empty>
            )}
          </div>
        )}
      </Panel>

      {atShop && data.erp ? (
        <Panel
          title={`Simulated ERP at ${site.id}`}
          description="Stands in for the shop's ERP. It records quantities only and books each door read."
        >
          <dl className="grid grid-cols-3 gap-px border bg-border">
            <Stat term="ERP book" value={data.erp.book} />
            <Stat term="ERP check-ins today" value={data.erp.erp_check_ins} />
            <Stat term="RFID arrivals today" value={data.erp.rfid_shop_in} />
          </dl>
          {data.erp.erp_check_ins !== data.erp.rfid_shop_in ? (
            <Flag className="mt-3">
              ERP check-ins differ from RFID arrivals by{" "}
              {Math.abs(data.erp.erp_check_ins - data.erp.rfid_shop_in)}
            </Flag>
          ) : null}
          {can ? (
            <div className="mt-4 flex flex-col gap-2 [&_button]:h-auto [&_button]:min-h-11 [&_button]:justify-start [&_button]:py-2 [&_button]:text-left [&_button]:whitespace-normal">
              <Button
                size="touch"
                variant="outline"
                disabled={!!pending}
                onClick={() =>
                  act("bookin", "/api/erp/book-in").then(
                    (s) => s && toast("ERP booked in one bag with no door read")
                  )
                }
              >
                <PlusIcon aria-hidden />
                ERP: book in a bag the door missed
              </Button>
              <Button
                size="touch"
                variant="outline"
                disabled={!!pending || data.erp.skip_next}
                aria-pressed={data.erp.skip_next}
                onClick={() => act("skip", "/api/erp/skip-next")}
              >
                <SkipForwardIcon aria-hidden />
                {data.erp.skip_next
                  ? "Next shop scan will not be booked"
                  : "ERP: skip booking for the next shop scan"}
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Open investigations"
        description="Bags missing at a count, at any site. Seeing one again closes it."
      >
        {data.investigations.length === 0 ? (
          <Empty>None open.</Empty>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.investigations.map((inv) => (
              <InvestigationRow
                key={inv.id}
                className={investigationArrival(inv.id)}
                bag={inv.bag}
                site={inv.site}
                opened={inv.opened_at}
                can={can}
                busy={!!pending}
                onClose={(resolution) =>
                  act("close", "/api/investigations/close", {
                    id: inv.id,
                    resolution,
                  })
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Latest scans" description="All sites">
        {data.recent.length === 0 ? (
          <Empty>No scans yet.</Empty>
        ) : (
          <ol className="flex flex-col divide-y">
            {data.recent.map((e) => (
              <li
                key={e.id}
                className={cn(scanArrival(e.id), "flex flex-col gap-1 py-2")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/tags/${e.uid}#use-${e.cycle}`}
                    className="font-mono underline decoration-dotted underline-offset-4"
                  >
                    {e.bag}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {when(e.ts)}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  {EVENT_NAMES[e.event] ?? e.event} at {e.site}
                </span>
                {e.note ? <Flag className="w-fit">{e.note}</Flag> : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {can ? (
        <footer className="flex justify-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="touch"
                disabled={!!pending || counting}
              >
                <TrashIcon aria-hidden />
                Clear demo data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes every live scan, count, investigation and
                  assignment, and restores the simulated network and the four
                  real tags as packed. The control key stays.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="touch">Keep data</AlertDialogCancel>
                <AlertDialogAction
                  size="touch"
                  onClick={() =>
                    act("reset", "/api/reset").then((s) => {
                      if (s) {
                        setResult(null)
                        toast("Demo data cleared")
                      }
                    })
                  }
                >
                  Clear data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </footer>
      ) : null}
    </PageShell>
  )
}

/**
 * Ending a count marks every uncounted bag missing, so a short count asks first.
 * A count that has every booked bag ends at once.
 */
function EndCount({
  counted,
  book,
  site,
  simulatedHere,
  swept,
  disabled,
  onEnd,
}: {
  counted: number
  book: number
  site: string
  simulatedHere: number
  swept: boolean
  disabled: boolean
  onEnd: () => void
}) {
  const short = Math.max(0, book - counted)
  const button = (
    <Button
      size="touch"
      disabled={disabled}
      onClick={short ? undefined : onEnd}
    >
      <CheckIcon aria-hidden />
      End count
    </Button>
  )
  if (!short) return button
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End the count at {site}?</AlertDialogTitle>
          <AlertDialogDescription>
            {counted} counted, {book} on the books. Up to {short}{" "}
            {short === 1 ? "bag" : "bags"} will be marked missing, each with an
            investigation.
            {simulatedHere && !swept
              ? " The simulated bags here are only counted by the simulated gun sweep, which has not run."
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch">Keep counting</AlertDialogCancel>
          <AlertDialogAction size="touch" onClick={onEnd}>
            End count
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Stat({ term, value }: { term: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card p-2">
      <dt className="text-[11px] leading-tight text-muted-foreground">
        {term}
      </dt>
      <dd className="text-lg tabular-nums">
        <CountFlow value={value} />
      </dd>
    </div>
  )
}

function CountSummary({
  count,
  className,
}: {
  count: CountResult
  className?: string
}) {
  return (
    <div className={cn(className, "flex flex-col gap-3")} key={count.id}>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          Last count at {count.site}, ended {when(count.ended_at)}
        </span>
        <Outcome outcome={count.outcome} flag={count.flag} />
      </div>
      <dl
        className={`grid gap-px border bg-border ${count.erp_book === null ? "grid-cols-2" : "grid-cols-3"}`}
      >
        <Stat term="Counted" value={count.counted} />
        <Stat term="RFID book" value={count.rfid_book} />
        {count.erp_book !== null ? (
          <Stat term="ERP book" value={count.erp_book} />
        ) : null}
      </dl>
      {count.missing.length > 0 ? (
        <p className="flex items-start gap-2">
          <WarningIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {count.missing.length} not found, now missing.{" "}
            {count.missing.length === 1
              ? "An investigation is open."
              : "Investigations are open."}
          </span>
        </p>
      ) : null}
      {count.found.length > 0 ? (
        <p className="flex items-start gap-2">
          <WarningIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{count.found.length} found and moved here.</span>
        </p>
      ) : null}
    </div>
  )
}

function InvestigationRow({
  bag,
  site,
  opened,
  can,
  busy,
  onClose,
  className,
}: {
  bag: string
  site: string
  opened: string
  can: boolean
  busy: boolean
  onClose: (resolution: string) => Promise<unknown>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  return (
    <li className={cn(className, "flex flex-col gap-2 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className="font-mono">{bag}</span>
          <span className="text-muted-foreground">
            missing at {site} since {when(opened)}
          </span>
        </span>
        {can && !open ? (
          <Button variant="outline" size="touch" onClick={() => setOpen(true)}>
            Close
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="grid grid-cols-[1fr_auto_auto] gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (note.trim()) await onClose(note.trim())
          }}
        >
          <Input
            aria-label={`Resolution for ${bag}`}
            placeholder="Resolution note"
            value={note}
            maxLength={200}
            enterKeyHint="done"
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
          <Button type="submit" size="touch" disabled={busy || !note.trim()}>
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            aria-label="Cancel"
            onClick={() => setOpen(false)}
          >
            <XIcon aria-hidden />
          </Button>
        </form>
      ) : null}
    </li>
  )
}
