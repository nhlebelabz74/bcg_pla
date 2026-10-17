import { readFile } from "node:fs/promises"
import path from "node:path"

// Any reader laptop downloads the current bridge and sketch from the app's address.
// Only these files are served; they hold no secrets.
const FILES: Record<string, string> = {
  "bridge.py": "bridge.py",
  "maize_tracker.ino": "maize_tracker/maize_tracker.ino",
}

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const file = FILES[name]
  if (!file) return new Response("Not found", { status: 404 })
  const body = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "..", file))
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  })
}
