import type { Metadata } from "next"

import { SiteDashboard } from "@/components/site-dashboard"

export const metadata: Metadata = { title: "Shops" }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ site?: string | string[] }>
}) {
  const { site } = await searchParams
  return (
    <SiteDashboard
      facility="SHOP"
      initialSite={typeof site === "string" ? site : undefined}
    />
  )
}
