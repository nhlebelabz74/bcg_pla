"use client"

import { ArrowLeftIcon, CaretRightIcon, FlaskIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { PageShell } from "@/components/page-shell"
import { Empty, Flag, Panel } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  type BagState,
  STATE_NAMES,
  duration,
  productLabel,
  usePoll,
  when,
} from "@/lib/api"

interface Step {
  id: number
  ts: string
  cycle: number
  site: string
  reader: string
  event: string
  state_before: string | null
  state_after: BagState
  note: string | null
}

interface Use {
  cycle: number
  id: string
  product: string | null
  kg: number | null
  assigned_at: string | null
  source: string | null
  steps: Step[]
  current: boolean
}

interface History {
  uid: string
  simulated: boolean
  state: BagState
  site: string
  since: string
  cycle: number
  id: string
  uses: Use[]
}

/** A step of a bag's travel in words, such as "Left WH3". */
function stepLabel(s: Step) {
  switch (s.event) {
    case "TAG_ASSIGNED":
      return "Assigned"
    case "WAREHOUSE_IN":
      return `Entered ${s.site}`
    case "WAREHOUSE_OUT":
      return `Left ${s.site}`
    case "SHOP_IN":
      return `Arrived at ${s.site}`
    case "SHOP_OUT":
      return `Sold at ${s.site}`
    case "COUNT_FOUND":
      return `Found at a count at ${s.site}`
    case "COUNT_MISSING":
      return `Missing at a count at ${s.site}`
    default:
      return `${s.event} at ${s.site}`
  }
}

function seconds(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 1000
}

/** Every use of one tag, newest first, each with the bag's journey step by step. */
export function TagHistory({ uid }: { uid: string }) {
  const { data, offline } = usePoll<History | { error: string }>(
    `/api/tag?uid=${encodeURIComponent(uid)}`,
    3000
  )
  const history = data && "uses" in data ? data : null

  return (
    <PageShell
      title={`Tag ${uid}`}
      status={
        history ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {history.simulated ? (
              <span className="inline-flex items-center gap-1">
                <FlaskIcon aria-hidden className="size-3.5" />
                Simulated tag
              </span>
            ) : (
              <Badge variant="match">Real tag</Badge>
            )}
            <span>
              Now: {STATE_NAMES[history.state]}
              {history.site !== "NGO" ? ` at ${history.site}` : ""}, since{" "}
              {when(history.since)}. {history.cycle}{" "}
              {history.cycle === 1 ? "use" : "uses"} so far.
            </span>
          </p>
        ) : null
      }
      action={
        <Button asChild variant="outline" size="touch">
          <Link href="/tags">
            <ArrowLeftIcon aria-hidden />
            Tags
          </Link>
        </Button>
      }
    >
      {history ? (
        history.uses.length === 0 ? (
          <Empty>
            This tag has never been used. Assign it on the Tags page.
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {history.uses.map((u) => (
              <UseCard key={u.cycle} use={u} />
            ))}
          </div>
        )
      ) : data && "error" in data ? (
        <Empty>{data.error}</Empty>
      ) : (
        <p className="text-muted-foreground">
          {offline ? "No tag with that ID has been seen." : "Loading"}
        </p>
      )}
    </PageShell>
  )
}

function UseCard({ use }: { use: Use }) {
  const travel = use.steps.filter((s) => s.event !== "TAG_ASSIGNED")
  const first = use.steps[0]
  const last = use.steps[use.steps.length - 1]
  const finished = last?.event === "SHOP_OUT"
  return (
    <Panel
      title={`Use ${use.cycle}: ${use.id}`}
      description={
        <>
          {productLabel(use.product, use.kg)}
          {use.assigned_at ? `, assigned ${when(use.assigned_at)}` : ""}
          {use.current
            ? finished
              ? ". Sold; the tag is back in the pool."
              : ". Current use."
            : ". Finished."}
          {first && last && first !== last
            ? ` ${duration(seconds(first.ts, last.ts))} from first to last step.`
            : ""}
        </>
      }
    >
      <div className="flex flex-col gap-4" id={`use-${use.cycle}`}>
        {travel.length ? (
          <ol
            aria-label="Route"
            className="flex flex-wrap items-center gap-1 text-sm"
          >
            {travel.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1">
                {i ? (
                  <CaretRightIcon
                    aria-hidden
                    className="size-3.5 text-muted-foreground"
                  />
                ) : null}
                <span className="border border-input px-1.5 py-0.5">
                  {stepLabel(s)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">No reads yet for this use.</p>
        )}
        <ol className="flex flex-col">
          {use.steps.map((s, i) => (
            <li
              key={s.id}
              className="grid grid-cols-[6.5rem_1fr] gap-x-3 border-l border-border py-1.5 pl-3"
            >
              <span className="text-muted-foreground tabular-nums">
                {when(s.ts)}
              </span>
              <span className="flex flex-col items-start gap-1">
                <span>
                  {stepLabel(s)}
                  {i > 0 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      (+{duration(seconds(use.steps[i - 1].ts, s.ts))})
                    </span>
                  ) : null}
                </span>
                {s.note ? <Flag>{s.note}</Flag> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  )
}
