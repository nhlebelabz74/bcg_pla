"use client"

import {
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StorefrontIcon,
  TagIcon,
  WarehouseIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ThemeToggle } from "@/components/theme-toggle"
import { useControlKey } from "@/lib/key"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/", label: "Overview", icon: SquaresFourIcon },
  { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon },
  { href: "/shops", label: "Shops", icon: StorefrontIcon },
  { href: "/tags", label: "Tags", icon: TagIcon },
  {
    href: "/control",
    label: "Control",
    icon: SlidersHorizontalIcon,
    keyOnly: true,
  },
]

/**
 * Floating dock at the bottom of every page. Navigation is used many times a minute
 * in the demo, so it switches instantly; only the press feedback moves.
 */
export function Dock() {
  const pathname = usePathname()
  const key = useControlKey()
  const items = ITEMS.filter(
    (i) => !i.keyOnly || key || pathname === "/control"
  )

  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-0.5 border bg-popover/90 p-1 shadow-lg shadow-black/20 backdrop-blur-md">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-14 w-[3.9rem] flex-col items-center justify-center gap-1 text-[10px] leading-none transition-[transform,background-color,color] duration-150 active:scale-[0.97] sm:w-20 sm:text-xs",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon
                aria-hidden
                className="size-5"
                weight={active ? "fill" : "regular"}
              />
              {label}
            </Link>
          )
        })}
        <span aria-hidden className="mx-0.5 h-8 w-px bg-border" />
        <ThemeToggle className="h-14 w-11" />
      </div>
    </nav>
  )
}
