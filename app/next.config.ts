import type { NextConfig } from "next"

// tracker.py serves the JSON API. The phone and the dashboard only talk to this app,
// which forwards /api/* to the tracker on the same machine.
const tracker = process.env.TRACKER_URL ?? "http://127.0.0.1:8000"

const nextConfig: NextConfig = {
  // The Docker build sets STANDALONE=1 to ship a small self-contained server.
  output: process.env.STANDALONE ? "standalone" : undefined,
  // The phone and the laptop reach the dev server by LAN or Tailscale address.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "100.*.*.*", "**.ts.net"],
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${tracker}/api/:path*` }]
  },
}

export default nextConfig
