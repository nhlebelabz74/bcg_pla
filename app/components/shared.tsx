"use client"

import { CheckCircleIcon, FlaskIcon, WarningIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { BridgeInfo, ReaderInfo } from "@/lib/api"
import { clock } from "@/lib/api"
import { cn } from "@/lib/utils"

export function Panel({
  title,
  description,
  action,
  synthetic,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  synthetic?: "full" | "partial"
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn("text-sm/relaxed", className)}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action || synthetic ? (
          <CardAction className="flex items-center gap-2">
            {synthetic ? (
              <SyntheticLabel partial={synthetic === "partial"} />
            ) : null}
            {action}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0 flex-1">{children}</CardContent>
    </Card>
  )
}

export function SyntheticLabel({ partial }: { partial?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 border border-dashed border-input px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <FlaskIcon aria-hidden className="size-3.5" />
      {partial
        ? "Synthetic data for illustration (history)"
        : "Synthetic data for illustration"}
    </span>
  )
}

/** An inverted badge with an icon: the palette has no warning colour, so flags never rely on colour. */
export function Flag({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="flag"
      className={cn("h-auto min-h-5 text-left whitespace-normal", className)}
    >
      <WarningIcon aria-hidden weight="bold" />
      {children}
    </Badge>
  )
}

export function Match({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="match"
      className="h-auto min-h-5 text-left whitespace-normal"
    >
      <CheckCircleIcon aria-hidden weight="bold" />
      {children}
    </Badge>
  )
}

/** Count outcome: a green badge when every source agrees, an inverted flag otherwise. */
export function Outcome({ outcome, flag }: { outcome: string; flag: string }) {
  const agrees = outcome === "ALL_AGREE" || outcome === "RFID_MATCH"
  return agrees ? <Match>{flag}</Match> : <Flag>{flag}</Flag>
}

function versionOk(info: string | null) {
  const v = info?.split("=")[1]?.toLowerCase()
  return !!v && v !== "0x0" && v !== "0xff"
}

/** One line of link status: bridge laptop, then each reader with chip version and last scan. */
export function LinkStatus({
  bridge,
  readers,
  offline,
  className,
}: {
  bridge: BridgeInfo | null
  readers: Record<string, ReaderInfo>
  offline: boolean
  className?: string
}) {
  const items: { ok: boolean; text: string; title: string }[] = []
  items.push(
    offline
      ? {
          ok: false,
          text: "Tracker offline",
          title: "tracker.py cannot be reached",
        }
      : { ok: true, text: "Tracker", title: "tracker.py answers" }
  )
  items.push(
    bridge?.online
      ? {
          ok: true,
          text: `Bridge ${bridge.port ?? ""}`.trim(),
          title: `bridge.py on ${bridge.host} last seen ${clock(bridge.last)}`,
        }
      : {
          ok: false,
          text: bridge ? "Bridge silent" : "No bridge",
          title: bridge
            ? `bridge.py last seen ${clock(bridge.last)}`
            : "bridge.py has not connected",
        }
  )
  for (const [id, r] of Object.entries(readers)) {
    items.push({
      ok: versionOk(r.info),
      text: `${id} ${r.direction.toLowerCase()}`,
      title: `${r.info ?? "no version reported"}, last scan ${clock(r.last_scan)}`,
    })
  }
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground",
        className
      )}
    >
      {items.map((i) => (
        <li
          key={i.text}
          title={i.title}
          className="inline-flex items-center gap-1.5"
        >
          <span
            aria-hidden
            className={cn(
              "size-2",
              i.ok ? "bg-brand-ink" : "border border-foreground bg-transparent"
            )}
          />
          <span className={i.ok ? undefined : "text-foreground"}>{i.text}</span>
          <span className="sr-only">{i.ok ? "ok" : "not ok"}</span>
        </li>
      ))}
    </ul>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-muted-foreground">{children}</p>
}
