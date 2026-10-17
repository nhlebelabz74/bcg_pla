"use client"

import { LockSimpleOpenIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveControlKey } from "@/lib/key"

/**
 * Lets the presenter unlock changes on this device by pasting the control key once.
 * The key is checked with the tracker before it is stored.
 */
export function Unlock({ what }: { what: string }) {
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch("/api/state", {
        cache: "no-store",
        headers: { "X-Control-Key": key.trim() },
      })
      const state = await res.json()
      if (!state.authorised) throw new Error("That key is not right.")
      saveControlKey(key.trim())
      toast("Unlocked on this device")
    } catch (err) {
      toast.error((err as Error).message || "The tracker cannot be reached")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="unlock-key" className="text-sm">
        Paste the control key to {what} on this device. It is remembered here.
      </label>
      <div className="flex gap-2">
        <Input
          id="unlock-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Control key"
          className="h-11 font-mono"
        />
        <Button type="submit" size="touch" disabled={busy || !key.trim()}>
          <LockSimpleOpenIcon aria-hidden />
          Unlock
        </Button>
      </div>
    </form>
  )
}
