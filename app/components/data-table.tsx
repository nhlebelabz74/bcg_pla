"use client"

import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import { Fragment, type ReactNode, useMemo, useState } from "react"

import { Empty } from "@/components/shared"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** Value to sort by. Columns without one cannot be sorted. */
  sort?: (row: T) => string | number | null | undefined
  align?: "left" | "right"
  className?: string
}

export interface Facet<T> {
  key: string
  label: string
  value: (row: T) => string
}

const ALL = "__all__"

/**
 * A table with click-to-sort headers, a text filter and optional drop-down filters.
 * Sorting and filtering run in the browser on the rows the page already has.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  search,
  facets = [],
  initialSort,
  empty = "Nothing to show.",
  limit,
  maxHeight = "max-h-[28rem]",
  rowClassName,
  expanded,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  /** Text the filter box searches, per row. Omit to hide the filter box. */
  search?: (row: T) => string
  facets?: Facet<T>[]
  initialSort?: { key: string; desc?: boolean }
  empty?: string
  limit?: number
  maxHeight?: string
  rowClassName?: (row: T) => string | undefined
  /** Extra content shown under a row, such as an inline form. */
  expanded?: (row: T) => ReactNode | null
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(
    initialSort ? { key: initialSort.key, desc: !!initialSort.desc } : null
  )
  const [chosen, setChosen] = useState<Record<string, string>>({})

  const facetOptions = useMemo(
    () =>
      facets.map((f) => [...new Set(rows.map(f.value))].filter(Boolean).sort()),
    [facets, rows]
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows.filter(
      (r) =>
        (!q || !search || search(r).toLowerCase().includes(q)) &&
        facets.every(
          (f) =>
            !chosen[f.key] ||
            chosen[f.key] === ALL ||
            f.value(r) === chosen[f.key]
        )
    )
    const col = sort && columns.find((c) => c.key === sort.key)
    if (sort && col?.sort) {
      const get = col.sort
      out = [...out].sort((a, b) => {
        const x = get(a)
        const y = get(b)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        const c =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y))
        return sort.desc ? -c : c
      })
    }
    return out
  }, [rows, query, search, facets, chosen, sort, columns])

  const visible = limit ? shown.slice(0, limit) : shown

  function toggle(key: string) {
    setSort((s) =>
      s?.key === key
        ? s.desc
          ? null
          : { key, desc: true }
        : { key, desc: false }
    )
  }

  if (rows.length === 0) return <Empty>{empty}</Empty>

  return (
    <div className="flex flex-col gap-2">
      {search || facets.length ? (
        <div className="flex flex-wrap gap-2">
          {search ? (
            <label className="relative min-w-40 flex-1">
              <span className="sr-only">Filter</span>
              <MagnifyingGlassIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                className="h-9 pl-8"
                enterKeyHint="search"
              />
            </label>
          ) : null}
          {facets.map((f, i) => (
            <Select
              key={f.key}
              value={chosen[f.key] ?? ALL}
              onValueChange={(v) => setChosen((c) => ({ ...c, [f.key]: v }))}
            >
              <SelectTrigger
                aria-label={f.label}
                className="w-auto min-w-32 text-sm data-[size=default]:h-9"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All {f.label.toLowerCase()}</SelectItem>
                {facetOptions[i].map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      ) : null}
      <div className={cn("overflow-auto overscroll-contain", maxHeight)}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((c) => {
                const active = sort?.key === c.key
                const Icon = !active
                  ? CaretUpDownIcon
                  : sort.desc
                    ? CaretDownIcon
                    : CaretUpIcon
                return (
                  <TableHead
                    key={c.key}
                    className={cn(
                      c.align === "right" && "text-right",
                      c.className
                    )}
                    aria-sort={
                      active
                        ? sort.desc
                          ? "descending"
                          : "ascending"
                        : c.sort
                          ? "none"
                          : undefined
                    }
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 px-1 py-1 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                          c.align === "right" && "flex-row-reverse"
                        )}
                      >
                        {c.header}
                        <Icon
                          aria-hidden
                          className={cn(
                            "size-3.5",
                            !active && "text-muted-foreground/60"
                          )}
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const extra = expanded?.(r)
              return (
                <Fragment key={rowKey(r)}>
                  <TableRow className={cn("align-top", rowClassName?.(r))}>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "whitespace-normal",
                          c.align === "right" && "text-right tabular-nums",
                          c.className
                        )}
                      >
                        {c.cell(r)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {extra ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length}
                        className="bg-muted/40"
                      >
                        {extra}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
        {visible.length === 0 ? <Empty>No rows match the filter.</Empty> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {shown.length === rows.length
          ? `${rows.length} rows`
          : `${shown.length} of ${rows.length} rows`}
        {limit && shown.length > limit ? `, first ${limit} shown` : ""}
      </p>
    </div>
  )
}
