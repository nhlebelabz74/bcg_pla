"use client"

import { useSyncExternalStore } from "react"

// The control key lives in this browser once the control link with ?key= has been opened,
// so every page on the phone can make changes. Other devices never see it.
const STORAGE_KEY = "bag-tracker-control-key"
const EVENT = "bag-tracker-key"

function read() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(EVENT, onChange)
  }
}

export function useControlKey() {
  return useSyncExternalStore(subscribe, read, () => "")
}

export function saveControlKey(key: string) {
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode or blocked storage: the key then only lasts for this page.
  }
  window.dispatchEvent(new Event(EVENT))
}
