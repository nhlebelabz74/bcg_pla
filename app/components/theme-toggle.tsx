"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { useRef, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const EASE_STRONG_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"

/**
 * Light and dark, as in wits-tats: the new theme sweeps out from the button as a circle.
 *
 * The sweep is a View Transition. The browser snapshots the page, the theme changes
 * inside flushSync so the new snapshot is complete, and a clip-path circle reveals the
 * new snapshot outwards from the button. Browsers without startViewTransition, and
 * anybody who asked for less motion, get the plain switch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const { resolvedTheme, setTheme } = useTheme()
  // The server cannot know the stored theme, so the label waits for the browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const next = resolvedTheme === "light" ? "dark" : "light"
  const label = mounted && resolvedTheme ? `Switch to the ${next} theme` : "Switch theme"

  function apply(theme: string) {
    // next-themes sets the class in an effect; setting it here keeps the snapshot honest.
    document.documentElement.classList.toggle("dark", theme === "dark")
    setTheme(theme)
  }

  async function toggle() {
    const button = ref.current
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    if (!button || reduced || !document.startViewTransition) {
      apply(next)
      return
    }
    const box = button.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    const transition = document.startViewTransition(() => {
      flushSync(() => apply(next))
    })
    try {
      await transition.ready
    } catch {
      return
    }
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 400,
        easing: EASE_STRONG_OUT,
        pseudoElement: "::view-transition-new(root)",
      }
    )
  }

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("size-11", className)}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <SunIcon className="size-5 dark:hidden" aria-hidden />
      <MoonIcon className="hidden size-5 dark:block" aria-hidden />
    </Button>
  )
}
