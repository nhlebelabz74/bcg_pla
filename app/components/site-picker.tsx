"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { SiteInfo } from "@/lib/api"
import { cn } from "@/lib/utils"

/** A segmented row of sites. Shows each site's book stock when it is known. */
export function SitePicker({
  sites,
  value,
  onChange,
  disabled,
  columns,
  className,
}: {
  sites: SiteInfo[]
  value: string
  onChange: (site: string) => void
  disabled?: boolean
  columns?: number
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      spacing={0}
      variant="outline"
      value={value}
      disabled={disabled}
      onValueChange={(v) => v && v !== value && onChange(v)}
      className={cn("grid w-full", className)}
      style={{
        gridTemplateColumns: `repeat(${columns ?? sites.length}, minmax(0, 1fr))`,
      }}
    >
      {sites.map((s) => (
        <ToggleGroupItem
          key={s.id}
          value={s.id}
          aria-label={s.name}
          className="flex h-14 w-full flex-col gap-0.5 text-sm disabled:opacity-100 disabled:data-[state=off]:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <span className="font-medium">{s.id}</span>
          {s.book !== undefined ? (
            <span className="text-[11px] tabular-nums opacity-80">
              {s.book} bags
            </span>
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
