"use client"

import type { ReactNode } from "react"

/** Page frame: a title row, then content, with room at the bottom for the dock. */
export function PageShell({
  title,
  status,
  action,
  wide = true,
  children,
}: {
  title: string
  status?: ReactNode
  action?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32 text-sm md:px-6 ${wide ? "max-w-[1600px]" : "max-w-lg"}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-medium">{title}</h1>
          {status}
        </div>
        {action}
      </header>
      {children}
    </main>
  )
}
