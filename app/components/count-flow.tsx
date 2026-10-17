"use client"

import NumberFlow from "@number-flow/react"
import type { ComponentProps } from "react"

// Counters change on every tap, so the roll stays under 300 ms (the library default is 900 ms).
// NumberFlow already skips the roll when the user asks for reduced motion.
const TRANSFORM = { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
const OPACITY = { duration: 200, easing: "ease-out" }

export function CountFlow(props: ComponentProps<typeof NumberFlow>) {
  return (
    <NumberFlow
      transformTiming={TRANSFORM}
      spinTiming={TRANSFORM}
      opacityTiming={OPACITY}
      {...props}
    />
  )
}
