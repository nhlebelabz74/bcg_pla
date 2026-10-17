"use client"

import { FlaskIcon } from "@phosphor-icons/react"
import Link from "next/link"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { type BagInfo, STATE_NAMES, productLabel, when } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * A bag's full ID, such as SEED-20-U1-93B73B38. Hovering (or focusing) it shows what
 * the bag is and where it is; clicking or tapping it opens the tag's travel history.
 */
export function BagId({
  id,
  info,
  className,
}: {
  id: string
  info?: BagInfo
  className?: string
}) {
  const [product, kg, use, uid] = id.split("-")
  const current = info && info.id === id
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Link
          href={`/tags/${uid}#use-${use.slice(1)}`}
          className={cn(
            "text-left font-mono whitespace-nowrap tabular-nums underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
        >
          {id}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 text-sm" align="start">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {productLabel(product === "NONE" ? null : product, Number(kg))}
            </span>
            <span className="text-xs text-muted-foreground">
              use {use.slice(1)} of this tag
            </span>
          </div>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Tag ID</dt>
            <dd className="font-mono">{uid}</dd>
            {current ? (
              <>
                <dt className="text-muted-foreground">Now</dt>
                <dd>
                  {STATE_NAMES[info.state]}
                  {info.site !== "NGO" ? ` at ${info.site}` : ""}
                </dd>
                <dt className="text-muted-foreground">Since</dt>
                <dd>{when(info.since)}</dd>
              </>
            ) : info ? (
              <>
                <dt className="text-muted-foreground">Tag now</dt>
                <dd>
                  {info.id} ({STATE_NAMES[info.state]})
                </dd>
              </>
            ) : null}
          </dl>
          <p className="text-xs text-muted-foreground">
            Click for this tag&apos;s travel history.
          </p>
          {product === "NONE" ? (
            <p className="text-xs">
              This bag entered without an assigned product. Name it on the Tags
              page.
            </p>
          ) : null}
          {info?.simulated ? (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <FlaskIcon aria-hidden className="size-3.5" />
              Simulated bag
            </p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
