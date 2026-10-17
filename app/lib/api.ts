"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type BagState =
  "ASSIGNED" | "AT_WAREHOUSE" | "IN_TRANSIT" | "AT_SHOP" | "SOLD" | "MISSING"
export type Facility = "WAREHOUSE" | "SHOP"

export interface SiteInfo {
  id: string
  name: string
  facility: Facility
  book?: number
}

export interface BagInfo {
  id: string
  product: string | null
  kg: number | null
  cycle: number
  state: BagState
  site: string
  since: string
  simulated: boolean
}

export interface EventRow {
  id: number
  ts: string
  uid: string
  cycle: number
  bag: string
  site: string
  reader: string
  event: string
  state_before?: string | null
  state_after: BagState
  note: string | null
}

export interface CountResult {
  id: number
  site: string
  started_at: string
  ended_at: string
  rfid_book: number
  erp_book: number | null
  counted: number
  seen: string[]
  missing: string[]
  found: string[]
  outcome: string
  flag: string
}

export interface Investigation {
  id: number
  uid: string
  cycle: number
  bag: string
  site: string
  count_id: number
  opened_at: string
  status: "open" | "closed"
  closed_at: string | null
  resolution: string | null
}

export interface ReaderInfo {
  direction: "IN" | "OUT"
  info: string | null
  last_scan: string | null
}

export interface BridgeInfo {
  host: string | null
  port: string | null
  last: string
  seconds: number
  online: boolean
}

export interface ControlState {
  authorised: boolean
  site: string
  sites: SiteInfo[]
  book: number
  site_stock: { product: string | null; kg: number | null; bags: number }[]
  recent: EventRow[]
  count: { site: string; started: string; seen: string[] } | null
  last_count: CountResult | null
  investigations: Investigation[]
  erp: {
    book: number
    skip_next: boolean
    date: string
    erp_check_ins: number
    erp_sales: number
    rfid_shop_in: number
  } | null
  simulated_here: number
  bags: Record<string, BagInfo>
  bridge: BridgeInfo | null
  readers: Record<string, ReaderInfo>
  result?: CountResult
  swept?: number
}

export interface Stats {
  n: number
  avg?: number
  min?: number
  max?: number
}

export interface TripBag {
  uid: string
  bag: string
  status: string
  seconds: number | null
  to: string | null
}

export interface Trip {
  id: number
  site: string
  to: string | null
  departed: string
  simulated: boolean
  bags: TripBag[]
  sent: number
  arrived: number
  avg_transit: number | null
  not_arrived: TripBag[]
}

export type TimeKey =
  "warehouse_dwell" | "transit" | "shop_dwell" | "end_to_end"

export interface Insights {
  now: string
  site: string | null
  sites: SiteInfo[]
  stock: Record<BagState, number>
  stock_by_site: Record<string, Record<BagState, number>>
  products_by_site: Record<string, Record<string, number>>
  times: { live: Record<TimeKey, Stats>; simulated: Record<TimeKey, Stats> }
  trips: Trip[]
  overdue: {
    uid: string
    bag: string
    site: string
    since: string
    seconds: number
    simulated: boolean
  }[]
  ageing: {
    uid: string
    bag: string
    site: string
    since: string
    seconds: number
  }[]
  ageing_total: number
  fifo_breaks: {
    trip: number
    site: string
    dispatched: string
    older_left: number
    examples: string[]
  }[]
  fifo_total: number
  movements: EventRow[]
  anomalies: EventRow[]
  counts: CountResult[]
  investigations: Investigation[]
  completeness: { sold: number; complete: number }
  throughput: Record<string, Record<string, number>>
  erp_check: Record<
    string,
    {
      days: { date: string; erp_check_ins: number; rfid_shop_in: number }[]
      erp_book: number
    }
  >
  supply_share: {
    from: string
    to: string
    deliveries: number
    avg_trip_hours: number | null
  }[]
  weekly_counts: {
    site: string
    limit_pct: number
    weeks: {
      week_start: string
      book: number
      counted: number
      missing: number
      found: number
      variance_pct: number
    }[]
  } | null
  bags: Record<string, BagInfo>
  bridge: BridgeInfo | null
  readers: Record<string, ReaderInfo>
}

export interface TagEntry {
  uid: string
  id: string
  product: string | null
  kg: number | null
  cycle: number
  state: BagState
  site: string
  since: string
  simulated: boolean
}

export interface TagsData {
  pool: TagEntry[]
  assigned: TagEntry[]
  unnamed: TagEntry[]
  uses: Record<string, number>
  demand: { product: string; kg: number; sold: number }[]
  recent_assignments: { ts: string; uid: string; cycle: number; bag: string }[]
  products: Record<string, string>
  sizes: number[]
}

/** Poll a GET endpoint. Keeps the last good data while the tracker is unreachable. */
export function usePoll<T>(path: string, intervalMs: number, key?: string) {
  const [data, setData] = useState<T | null>(null)
  const [offline, setOffline] = useState(false)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const res = await fetch(path, {
        cache: "no-store",
        headers: key ? { "X-Control-Key": key } : undefined,
      })
      if (!res.ok) throw new Error(String(res.status))
      setData((await res.json()) as T)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      busy.current = false
    }
  }, [path, key])

  useEffect(() => {
    const first = window.setTimeout(load, 0)
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load()
    }, intervalMs)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [load, intervalMs])

  return { data, setData, offline, reload: load }
}

export class ApiError extends Error {}

export async function post<T = ControlState>(
  path: string,
  key: string,
  body: object = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Control-Key": key },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError("The tracker cannot be reached")
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new ApiError(json.error ?? `Request failed (${res.status})`)
  return json as T
}

/**
 * Marks rows that arrived after the first data load, so only those fade in.
 * Rows present at load are not news and stay still.
 */
export function useArrivals(keys: (string | number)[] | null | undefined) {
  const [initial, setInitial] = useState<Set<string> | null>(null)
  if (initial === null && keys) setInitial(new Set(keys.map(String)))
  return (key: string | number) =>
    initial !== null && !initial.has(String(key)) ? "row-in" : undefined
}

export const PRODUCT_NAMES: Record<string, string> = {
  SEED: "Seed",
  FERT: "Fertiliser",
}

export const STATE_NAMES: Record<BagState, string> = {
  ASSIGNED: "Assigned",
  AT_WAREHOUSE: "At warehouse",
  IN_TRANSIT: "In transit",
  AT_SHOP: "At shop",
  SOLD: "Unassigned tags",
  MISSING: "Missing",
}

export const EVENT_NAMES: Record<string, string> = {
  WAREHOUSE_IN: "In",
  WAREHOUSE_OUT: "Out",
  SHOP_IN: "In",
  SHOP_OUT: "Sale",
  COUNT_FOUND: "Count: found",
  COUNT_MISSING: "Count: missing",
}

/** A product and size as "Seed 20 kg". */
export function productLabel(product: string | null, kg: number | null) {
  if (!product) return "No product"
  return `${PRODUCT_NAMES[product] ?? product} ${kg ?? "?"} kg`
}

/** A key such as "SEED-20" as "Seed 20 kg". */
export function productKeyLabel(key: string) {
  const [product, kg] = key.split("-")
  return product === "NONE" ? "No product" : productLabel(product, Number(kg))
}

export function clock(ts: string | null | undefined) {
  return ts ? ts.slice(11, 19) : "never"
}

/** Date and time, short: "17 Oct 08:41". Today shows the time only. */
export function when(ts: string | null | undefined) {
  if (!ts) return "never"
  const d = new Date(ts)
  const time = ts.slice(11, 16)
  if (new Date().toDateString() === d.toDateString()) return time
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`
}

/** Seconds as a short duration: 45 s, 3 min 10 s, 5 h 10 min, 2 d 4 h. */
export function duration(seconds: number | null | undefined) {
  if (seconds == null) return "n/a"
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`
  if (s < 86400)
    return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`
}
