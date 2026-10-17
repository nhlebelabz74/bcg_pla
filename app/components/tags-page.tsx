"use client"

import { PlusIcon, XIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { BagId } from "@/components/bag-id"
import { CountFlow } from "@/components/count-flow"
import { DataTable } from "@/components/data-table"
import { PageShell } from "@/components/page-shell"
import { Unlock } from "@/components/unlock"
import { Empty, Panel } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type BagState,
  STATE_NAMES,
  type TagEntry,
  type TagsData,
  post,
  productLabel,
  useArrivals,
  usePoll,
  when,
} from "@/lib/api"
import { useControlKey } from "@/lib/key"

interface Assignment {
  ts: string
  uid: string
  cycle: number
  bag: string
  now_cycle: number
  now_state: BagState
  now_site: string
  simulated: number
}

/**
 * The tag loop as the NGO runs it: a tag comes back from a shop unassigned, someone
 * gives it a product and size, and it goes onto a new bag.
 */
export function TagsPage() {
  const key = useControlKey()
  const { data, offline, reload } = usePoll<
    TagsData & { recent_assignments: Assignment[] }
  >("/api/tags", 3000)
  const [open, setOpen] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const assignedToday =
    data?.recent_assignments.filter((a) => a.ts.startsWith(today)).length ?? 0
  const real = data?.pool.filter((t) => !t.simulated).length ?? 0

  return (
    <PageShell
      title="Tags"
      status={
        <p className="text-xs text-muted-foreground">
          A tag comes back from a shop unassigned. Assign it a product and size,
          and it goes onto a new bag.
        </p>
      }
    >
      {data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Panel
            title="Assign by need"
            description="Say what the NGO needs packed. Tags come from the unassigned pool; real tags back from the shops go first."
            className="xl:col-span-8 xl:col-start-1"
          >
            {key ? (
              <NeedForm
                sizes={data.sizes}
                pool={data.pool.length}
                realInPool={real}
                controlKey={key}
                onDone={reload}
              />
            ) : (
              <Unlock what="assign tags" />
            )}
          </Panel>

          <Panel
            title="Unassigned tags"
            description={
              key
                ? "Back from the shops, or never used. Real tags are listed first."
                : "Back from the shops, or never used. Unlock above to assign them."
            }
            className="xl:col-span-8 xl:col-start-1"
          >
            <DataTable
              rows={data.pool}
              columns={[
                {
                  key: "tag",
                  header: "Tag",
                  cell: (t) => (
                    <span className="flex flex-wrap items-center gap-2 font-mono">
                      <Link
                        href={`/tags/${t.uid}`}
                        className="underline decoration-dotted underline-offset-4"
                      >
                        {t.uid}
                      </Link>
                      {t.simulated ? null : <Badge variant="match">Real</Badge>}
                    </span>
                  ),
                  sort: (t) => t.uid,
                },
                {
                  key: "last",
                  header: "Last bag",
                  cell: (t) =>
                    t.cycle === 0 ? (
                      <span className="text-muted-foreground">never used</span>
                    ) : (
                      <BagId id={t.id} info={t} />
                    ),
                  sort: (t) => (t.cycle === 0 ? "" : t.id),
                },
                {
                  key: "from",
                  header: "Back from",
                  cell: (t) => (t.cycle === 0 ? "New" : t.site),
                  sort: (t) => (t.cycle === 0 ? "" : t.site),
                },
                {
                  key: "since",
                  header: "Since",
                  cell: (t) => when(t.since),
                  sort: (t) => t.since,
                },
                {
                  key: "uses",
                  header: "Uses",
                  cell: (t) => t.cycle,
                  sort: (t) => t.cycle,
                  align: "right",
                },
                {
                  key: "action",
                  header: "",
                  cell: (t) =>
                    key ? (
                      <Button
                        size="sm"
                        variant={open === t.uid ? "secondary" : "outline"}
                        aria-expanded={open === t.uid}
                        onClick={() =>
                          setOpen((o) => (o === t.uid ? null : t.uid))
                        }
                      >
                        Assign
                      </Button>
                    ) : null,
                },
              ]}
              rowKey={(t) => t.uid}
              search={(t) => `${t.uid} ${t.id} ${t.site}`}
              facets={[
                {
                  key: "kind",
                  label: "Kinds",
                  value: (t) => (t.simulated ? "Simulated" : "Real"),
                },
                {
                  key: "from",
                  label: "Origins",
                  value: (t) => (t.cycle === 0 ? "New" : t.site),
                },
              ]}
              expanded={(t) =>
                open === t.uid && key ? (
                  <AssignRow
                    tag={t}
                    sizes={data.sizes}
                    controlKey={key}
                    onDone={() => {
                      setOpen(null)
                      reload()
                    }}
                    onCancel={() => setOpen(null)}
                  />
                ) : null
              }
              empty="No unassigned tags."
              maxHeight="max-h-[36rem]"
            />
          </Panel>

          <div className="flex flex-col gap-4 xl:col-span-4 xl:col-start-9 xl:row-span-3 xl:row-start-1">
            <Panel
              title="Tag history"
              description="Every use of one tag and where each bag travelled"
            >
              <FindTag />
            </Panel>
            <Panel title="Tag pool" description="Where the tags stand">
              <dl className="grid grid-cols-3 gap-px border bg-border">
                <Tile term="Unassigned" value={data.pool.length} />
                <Tile term="Real, unassigned" value={real} />
                <Tile term="Assigned today" value={assignedToday} />
              </dl>
              <UsesLine uses={data.uses} />
            </Panel>

            <Panel
              title="Sold in the last 7 days"
              description="Recent demand, to guide what to assign"
            >
              {data.demand.length ? (
                <ul className="flex flex-col divide-y">
                  {data.demand.map((d) => (
                    <li
                      key={`${d.product}-${d.kg}`}
                      className="flex justify-between py-1"
                    >
                      <span>{productLabel(d.product, d.kg)}</span>
                      <span className="tabular-nums">{d.sold}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No sales this week.</Empty>
              )}
            </Panel>
          </div>

          <Panel
            title="Assigned recently"
            description="Each assignment and where that bag is now"
            className="xl:col-span-8 xl:col-start-1"
          >
            <Assignments rows={data.recent_assignments} />
          </Panel>

          {data.unnamed.length ? (
            <Panel
              title="Read before being assigned"
              description="These tags were tapped into a warehouse before anyone assigned them. Give each its product."
              className="xl:col-span-4"
            >
              <ul className="flex flex-col divide-y">
                {data.unnamed.map((t) => (
                  <li key={t.uid} className="flex flex-col gap-2 py-2">
                    <span>
                      <span className="font-mono">{t.uid}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        at {t.site}
                      </span>
                    </span>
                    {key ? (
                      <AssignRow
                        tag={t}
                        sizes={data.sizes}
                        controlKey={key}
                        onDone={reload}
                        name
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {offline ? "Tracker offline" : "Loading"}
        </p>
      )}
    </PageShell>
  )
}

function FindTag() {
  const router = useRouter()
  const [uid, setUid] = useState("")
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (uid.trim()) router.push(`/tags/${uid.trim().toUpperCase()}`)
      }}
    >
      <Input
        aria-label="Tag ID"
        placeholder="Tag ID, such as 93B73B38"
        value={uid}
        onChange={(e) => setUid(e.target.value)}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        className="h-11 font-mono"
      />
      <Button type="submit" size="touch" disabled={!uid.trim()}>
        Open
      </Button>
    </form>
  )
}

interface NeedLine {
  product: string
  kg: string
  qty: string
}

const NEW_LINE: NeedLine = { product: "SEED", kg: "10", qty: "10" }

/** "We need ten 10 kg seed bags, and ...": one line per product and size. */
function NeedForm({
  sizes,
  pool,
  realInPool,
  controlKey,
  onDone,
}: {
  sizes: number[]
  pool: number
  realInPool: number
  controlKey: string
  onDone: () => void
}) {
  const [lines, setLines] = useState<NeedLine[]>([NEW_LINE])
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<{ id: string; uid: string }[]>([])
  const wanted = lines.reduce((n, l) => n + (Number(l.qty) || 0), 0)

  function update(i: number, patch: Partial<NeedLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const orders = lines.map((l) => ({
        product: l.product,
        kg: Number(l.kg),
        qty: Number(l.qty),
      }))
      const res = await post<{
        assigned: { id: string; uid: string }[]
        short: number
      }>("/api/tags/assign", controlKey, { orders })
      setLast(res.assigned)
      toast(
        `${res.assigned.length} ${res.assigned.length === 1 ? "tag" : "tags"} assigned` +
          (res.short ? `. ${res.short} short: the pool ran out.` : "")
      )
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="hidden grid-cols-[5rem_1fr_7rem_2.75rem] gap-2 text-xs text-muted-foreground sm:grid">
        <span>Bags</span>
        <span>Product</span>
        <span>Size</span>
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          className="grid grid-cols-[4.5rem_1fr_6.5rem_2.75rem] gap-2 sm:grid-cols-[5rem_1fr_7rem_2.75rem]"
        >
          <Input
            aria-label={`Number of bags, line ${i + 1}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={l.qty}
            onChange={(e) => update(i, { qty: e.target.value })}
            className="h-11 tabular-nums"
          />
          <Select
            value={l.product}
            onValueChange={(v) => update(i, { product: v })}
          >
            <SelectTrigger
              aria-label={`Product, line ${i + 1}`}
              className="w-full text-sm data-[size=default]:h-11"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SEED">Seed</SelectItem>
              <SelectItem value="FERT">Fertiliser</SelectItem>
            </SelectContent>
          </Select>
          <Select value={l.kg} onValueChange={(v) => update(i, { kg: v })}>
            <SelectTrigger
              aria-label={`Size, line ${i + 1}`}
              className="w-full text-sm data-[size=default]:h-11"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} kg
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Remove line ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => setLines((ls) => [...ls, { ...NEW_LINE, qty: "1" }])}
        >
          <PlusIcon aria-hidden />
          Add a line
        </Button>
        <Button type="submit" size="touch" disabled={busy || wanted < 1}>
          Assign {wanted} {wanted === 1 ? "tag" : "tags"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {pool} unassigned {pool === 1 ? "tag" : "tags"}, {realInPool} of them
        real.
        {wanted > pool
          ? " The order is larger than the pool; the rest stays short."
          : ""}
      </p>
      {last.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Just assigned</span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {last.map((a) => (
              <li key={a.uid} className="row-in">
                <Link
                  href={`/tags/${a.uid}`}
                  className="font-mono underline decoration-dotted underline-offset-4"
                >
                  {a.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  )
}

function Tile({ term, value }: { term: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-3">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-2xl tabular-nums">
        <CountFlow value={value} />
      </dd>
    </div>
  )
}

function UsesLine({ uses }: { uses: Record<string, number> }) {
  const entries = Object.entries(uses).sort(([a], [b]) => Number(a) - Number(b))
  const total = entries.reduce((n, [, v]) => n + v, 0)
  if (!total) return null
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      Tags by number of uses:{" "}
      {entries.map(([use, n], i) => (
        <span key={use} className="tabular-nums">
          {i ? ", " : ""}
          {use} use{use === "1" ? "" : "s"}:{" "}
          <span className="text-foreground">{n}</span>
        </span>
      ))}
    </p>
  )
}

function Assignments({ rows }: { rows: Assignment[] }) {
  const arrival = useArrivals(rows.map((r) => `${r.uid}-${r.cycle}`))
  return (
    <DataTable
      rows={rows}
      columns={[
        {
          key: "ts",
          header: "Assigned",
          cell: (a) => when(a.ts),
          sort: (a) => a.ts,
        },
        {
          key: "bag",
          header: "Bag",
          cell: (a) => (
            <Link
              href={`/tags/${a.uid}#use-${a.cycle}`}
              className="font-mono underline decoration-dotted underline-offset-4"
            >
              {a.bag}
            </Link>
          ),
          sort: (a) => a.bag,
        },
        {
          key: "now",
          header: "Now",
          cell: (a) =>
            a.now_cycle !== a.cycle ? (
              <span className="text-muted-foreground">tag reused since</span>
            ) : (
              `${STATE_NAMES[a.now_state]}${a.now_site !== "NGO" ? ` at ${a.now_site}` : ""}`
            ),
          sort: (a) => (a.now_cycle !== a.cycle ? "zz" : a.now_state),
        },
      ]}
      rowKey={(a) => `${a.uid}-${a.cycle}`}
      search={(a) => `${a.bag} ${a.now_site}`}
      facets={[
        {
          key: "kind",
          label: "Kinds",
          value: (a) => (a.simulated ? "Simulated" : "Real"),
        },
      ]}
      initialSort={{ key: "ts", desc: true }}
      rowClassName={(a) => arrival(`${a.uid}-${a.cycle}`)}
      empty="No assignments yet."
    />
  )
}

function AssignRow({
  tag,
  sizes,
  controlKey,
  onDone,
  onCancel,
  name,
}: {
  tag: TagEntry
  sizes: number[]
  controlKey: string
  onDone: () => void
  onCancel?: () => void
  /** Name the product of a bag already in use, instead of starting a new bag. */
  name?: boolean
}) {
  const [product, setProduct] = useState("SEED")
  const [kg, setKg] = useState("20")
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (name) {
        await post("/api/tags/identify", controlKey, {
          uid: tag.uid,
          product,
          kg: Number(kg),
        })
        toast(`${tag.uid} named ${productLabel(product, Number(kg))}`)
      } else {
        const res = await post<{ assigned: { id: string }[] }>(
          "/api/tags/assign",
          controlKey,
          {
            tags: [{ uid: tag.uid, product, kg: Number(kg) }],
          }
        )
        toast(`Assigned: ${res.assigned[0]?.id}`)
      }
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      {name ? null : (
        <span className="w-full text-xs text-muted-foreground sm:w-auto">
          Tag {tag.uid}, use {tag.cycle + 1}:
        </span>
      )}
      <Select value={product} onValueChange={setProduct}>
        <SelectTrigger
          aria-label={`Product for ${tag.uid}`}
          className="w-36 text-sm data-[size=default]:h-11"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="SEED">Seed</SelectItem>
          <SelectItem value="FERT">Fertiliser</SelectItem>
        </SelectContent>
      </Select>
      <Select value={kg} onValueChange={setKg}>
        <SelectTrigger
          aria-label={`Size for ${tag.uid}`}
          className="w-28 text-sm data-[size=default]:h-11"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sizes.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s} kg
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="touch" disabled={busy}>
        {name ? "Save" : "Assign"}
      </Button>
      {onCancel ? (
        <Button type="button" size="touch" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </form>
  )
}
