import { redirect } from "next/navigation"

// The old dashboard address now opens the overview.
export default function Page() {
  redirect("/")
}
