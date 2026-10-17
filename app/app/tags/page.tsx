import type { Metadata } from "next"

import { TagsPage } from "@/components/tags-page"

export const metadata: Metadata = { title: "Tags" }

export default function Page() {
  return <TagsPage />
}
