import type { Metadata } from "next"

import { TagHistory } from "@/components/tag-history"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uid: string }>
}): Promise<Metadata> {
  const { uid } = await params
  return { title: `Tag ${uid.toUpperCase()}` }
}

export default async function Page({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  return <TagHistory uid={uid.toUpperCase()} />
}
