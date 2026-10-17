import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"

import "./globals.css"
import { Dock } from "@/components/dock"
import { KeyCapture } from "@/components/key-capture"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: { default: "Bag tracker", template: "%s · Bag tracker" },
  description: "RFID bag tracking proof of concept",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7eff1" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      className={cn("font-mono antialiased", jetbrainsMono.variable)}
    >
      <body>
        <ThemeProvider defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            {children}
            <Dock />
            <KeyCapture />
          </TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
