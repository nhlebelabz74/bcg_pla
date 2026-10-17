# Bag tracker app

This Next.js app serves the two demo pages. The control page at `/` runs on the user's phone. The dashboard at `/dashboard` runs on the screen the audience sees. Both pages read from `tracker.py`, which must run first. The full design, the demo script and the network setup are in `../plan.md`.

## Run for the demo

The app and `tracker.py` run together in one Docker container, defined in the project folder (`../Dockerfile`, `../docker-compose.yml`). From the project folder:

1. Start or update the server: `docker compose up -d --build`.
2. Read the control link: `docker compose logs app | grep -i key`.
3. Open the control link on the user's phone only, because the key in the link allows changes.

The wits-tats Cloudflare tunnel publishes the container at `https://bcg-pla.banzilenhlebela.co.za`. Inside the container the app forwards `/api/*` to `http://127.0.0.1:8000`. Set `TRACKER_URL` at build time to use another address.

Pages: Overview (`/`), Warehouses (`/warehouses?site=WH1`), Shops (`/shops?site=SHOP1`), Tags (`/tags`) and Control (`/control?key=...`). A floating dock switches between them.

## Develop

Run `npm run dev` for hot reload. Run `npx tsc --noEmit` before handing over a change.

`components/charts/bar.tsx` and `ring.tsx` carry local patches for reduced motion. Re-adding those charts overwrites them.

If you add a Bklit chart with `npx shadcn@latest add @bklit/<chart>`, answer no when it asks to overwrite `lib/utils.ts`. The CLI also writes broken `var(----...)` lines and default oklch colours into `app/globals.css`. Delete them and keep the Platinion tokens.

## Files

| Path | Content |
|---|---|
| `components/overview.tsx` | Overview page |
| `components/site-dashboard.tsx` | Warehouses and Shops pages |
| `components/tags-page.tsx` | Tags page |
| `components/control-page.tsx` | Phone control page |
| `components/panels.tsx` | Panels shared by the dashboards |
| `components/dock.tsx`, `components/theme-toggle.tsx` | Floating dock and theme switch |
| `components/bag-id.tsx` | Bag ID with its hover card |
| `components/shared.tsx` | Panel frame, flag badges, link status line |
| `app/files/[name]/route.ts` | Serves `bridge.py` and the sketch for download |
| `components/charts/` | Bklit chart source from the shadcn registry |
| `lib/api.ts` | API types, polling hook, formatters |
| `app/globals.css` | Platinion colour tokens for light and dark mode |
