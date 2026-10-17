import type { Metadata } from "next"

import { ControlPage } from "@/components/control-page"

export const metadata: Metadata = { title: "Control" }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ key?: string | string[] }>
}) {
  const { key } = await searchParams
  return <ControlPage linkKey={typeof key === "string" ? key : ""} />
}
