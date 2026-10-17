"use client"

import { useEffect } from "react"

import { saveControlKey } from "@/lib/key"

/**
 * Any page opened with ?key=... stores the control key on this device and removes it
 * from the address bar, so a projected screen never shows it.
 */
export function KeyCapture() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const key = url.searchParams.get("key")
    if (!key) return
    saveControlKey(key)
    url.searchParams.delete("key")
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash
    )
  }, [])
  return null
}
