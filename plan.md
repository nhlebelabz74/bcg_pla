# Bag tracking with RFID: proof of concept plan

This file is the single source of truth for the proof of concept (POC), built for a BCG Platinion hackathon. It prepares one complete build pass of the demo. Update it, and `.claude/CLAUDE.md`, after every decision. Add each decision to the decision log with its date.

`solution_design.md` holds the supporting detail: the full insight catalogue, the production hardware research with prices and sources, and the pilot plan.

## Problem

An NGO grows non-fresh produce (maize and similar dry goods), packs it into bags and trucks the bags to a warehouse. Trucks then carry bags from the warehouse to a shop. In production one shop is serviced by several warehouses. The demo network has four warehouses (WH1 to WH4) and two shops (SHOP1 and SHOP2). The four real tags move through it live; about 230 simulated bags fill the rest.

The NGO packs seed and fertiliser in 5, 10, 15 and 20 kg bags and fits an RFID tag to each bag at packing, so bags arrive at the warehouse tagged. Shop staff remove the tag before the bag is sold, and the tag returns to the NGO for reuse on a new bag.

Both sites close for half a day each week so staff can count bags by hand. That manual count is the bottleneck the system removes.

The shop has an existing ERP that records bags checked in and sold. It does not record which warehouse a bag came from. The warehouse has no system. The new system is separate from the shop ERP and does not write to it.

The system has two jobs that check each other:

1. Record every bag entering and leaving each warehouse and shop. These events give book stock (the stock the records say is at a site) and timing insights such as trip time and storage time.
2. Let a person walk in on any day and count the bags present with a handheld reader (the "gun"), without closing the site. This walk-in count gives the physical stock and corrects the records.

At the shop, the walk-in count settles disagreements between the RFID records and the ERP. At the warehouse, which has no ERP, the count checks the RFID records alone. The weekly shutdown can stop once counts and records agree reliably.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-16 | Use `arduino-cli` and a Python logger on the laptop | Claude Code compiles and uploads without the Arduino IDE |
| 2026-10-16 | The tag carries only its unique ID | MIFARE Classic UIDs are fixed by the manufacturer. Data stored on tags goes stale and can be forged |
| 2026-10-16 | Facility type and direction belong to the reader, not the tag | A bag has no knowledge of where it is. A reader is installed in one place |
| 2026-10-17 | Two readers only: R1 reads bags coming in, R2 reads bags going out | Only two RC522 modules are on hand. No more will be bought |
| 2026-10-17 | A site switch on a phone web page moves both readers between the warehouse and the shop | Shows both sites with two readers |
| 2026-10-17 | Direction comes from the reader. The bag's stored state only flags scans that do not fit | Two readers remove the guessing the single reader toggle needed |
| 2026-10-17 | The latest scan always decides where a bag is now. Gaps in its history are logged as anomalies | A bag that reaches the shop without an exit read still shows on the system, flagged |
| 2026-10-17 | Keep everything local until the demo works. Do not use the team repo yet | Solve the problem first, then show the team |
| 2026-10-17 | Superseded the same day: Python standard library server with plain HTML pages | Replaced by the Next.js decision below |
| 2026-10-17 | Origin is not tracked | The NGO grows all the produce and supplies the equipment |
| 2026-10-17 | Use synthetic data where the demo cannot produce real data: ERP history for previous days, the weekly count trend and multi-warehouse supply share | The demo has one warehouse, one shop and no ERP access |
| 2026-10-17 | Panels that combine synthetic and live data update live on each tap | The audience sees every tap reflected |
| 2026-10-17 | The weekly count trend is not part of the demo script. Mention it in a line or two when presenting | It needs weeks of data. It is the evidence for stopping the manual count |
| 2026-10-17 | The walk-in count reconciles three sources at the shop (count, RFID, ERP) and two at the warehouse (count, RFID). Every outcome is recorded and every disagreement is flagged | The gun exists to settle mismatches. This is the case for buying it |
| 2026-10-17 | A simulated ERP at live scale, for the shop only. It books each live shop arrival and sale automatically. Phone buttons create ERP-only bookings and skipped bookings | The gun counts only the four real tags, so the ERP must work at the same scale for the comparison to mean anything |
| 2026-10-17 | A walk-in count corrects the RFID records: bags found are moved to the site, bags not found become MISSING | The count is the physical truth. Production needs a supervisor to confirm corrections |
| 2026-10-17 | Frontend: Next.js with shadcn/ui (style Lyra) and Bklit UI charts with their animations | The user prefers Bklit charts. Streamlit cannot render Bklit, which is React only |
| 2026-10-17 | `tracker.py` stays as the backend: serial reading, rules, database and JSON API. Next.js proxies `/api` to it | The engine is already built and tested in Python |
| 2026-10-17 | Colours: BCG Platinion palette, with roles and contrast rules in the colour section below | Hackathon branding |
| 2026-10-17 | Both readers connect to the Uno through the breadboard, and the Uno connects to the laptop by USB | One Uno serves both readers. The user is new to breadboards and gets step by step help when wiring |
| 2026-10-17 | Only the user can operate the control page. Every write action needs a secret control key carried in the control page link. The dashboard stays open and read only | The site switch, counts and Clear demo data must be out of the audience's reach |
| 2026-10-17 | The gun count is the source of truth for RFID stock. No event is edited or deleted, the ERP is never written, and every difference is flagged | Handheld readers are expensive, so their counts must be authoritative. Changing history would hide what went wrong |
| 2026-10-17 | Every bag missing at a count opens an investigation. Seeing the bag again closes it automatically, with the scan as the finding | Missing bags must be followed up, not only recorded |
| 2026-10-17 | Shop staff run a walk-in count at closing every day. The warehouse runs larger counts at intervals | The gun replaces the weekly shutdown |
| 2026-10-17 | Variance limit for stopping the manual count: under 0.5% for four weeks in a row | Assumption accepted by the user |
| 2026-10-17 | "Out" at the shop means a sale. R2 at the shop records SHOP_OUT as the sale | User decision |
| 2026-10-17 | Production trip IDs are out of scope. The demo keeps grouping exits by time | User decision |
| 2026-10-17 | The NGO fits the tag at packing, so bags arrive tagged. Shop staff remove the tag before sale, and the tag returns to the NGO for reuse | User decision |
| 2026-10-17 | Compare reusable clip-on tags (2% lost or damaged per cycle) with single-use sew-in tags and adhesive inlays. The cheaper option wins | Tag cost recurs for every bag, so it decides the tag type |
| 2026-10-17 | Build and debug on the Linux machine. The readers stay connected to the Windows laptop | The Linux machine has the full toolchain. Debugging only needs the scans |
| 2026-10-17 | `bridge.py` on the Windows laptop forwards serial lines to `tracker.py` on the Linux machine over the network | The Uno is on Windows and the backend is on Linux |
| 2026-10-17 | One tag carries many bags over time. Each fill of a tag is a separate bag cycle, and a warehouse entry after a sale starts a new cycle without an anomaly | Tags are reused, so a sold tag reappearing at the warehouse is normal |
| 2026-10-17 | The reader laptop, the Linux machine and the phone connect through Tailscale. `bridge.py` posts to the Linux machine's Tailscale address | Both machines are already on one tailnet and sit on different networks (Linux 10.10.187.x, Windows 10.201.185.x). Tailscale works on any venue network, so no shared Wi-Fi or hotspot is needed |
| 2026-10-17 | `bridge.py` numbers every line, holds it until `tracker.py` acknowledges it, and sends its age. `tracker.py` ignores a line number it already applied | No scan is lost while the link is down, none is applied twice on a resend, and a late delivery keeps the time of the tap |
| 2026-10-17 | Light mode uses `#055A3F` for green text and lines, replacing the candidate `#08875F` | The `dataviz` validator showed `#08875F` next to the ERP grey at deutan ΔE 2.6, so colour blind viewers could not tell RFID from ERP. `#055A3F` gives ΔE 11.1 and 7.3:1 on blush |
| 2026-10-17 | `tracker.py` serves only the JSON API. The Next.js app serves both pages. `web/` is retired | The Next.js app replaces the interim pages. `web/` was never copied to the Linux machine |
| 2026-10-17 | The demo runs the production build (`npm run demo`), not the dev server | Faster pages on the phone, no dev overlay, no cross-origin dev checks |
| 2026-10-17 | A walk-in count can be cancelled. A cancelled count records nothing | A mistaken start must not open investigations |
| 2026-10-17 | Treat the Linux machine as an online server. Tailscale Funnel gives it the public address `https://reference2025.tail86aa3f.ts.net`, and every bridge, phone and dashboard uses that address. Supersedes Tailscale on every device | The user wants readers to work from any laptop, as they would against a hosted server. Only the Linux machine needs Tailscale |
| 2026-10-17 | The app listens on `127.0.0.1:3000`, behind Funnel | Another project holds port 3000 on the Docker address, so binding all interfaces fails. Localhost also keeps the app off the local network |
| 2026-10-17 | `bridge.py` finds the Uno by its USB vendor ID; `tracker.py --new-key` rotates the control key; `--public-url` prints the public links | Any laptop can run the bridge without knowing its port name. A public address makes key rotation necessary |
| 2026-10-17 | Two ways to connect the readers: both on one Uno through the breadboard, or one reader per Uno with two Unos. Both run the same sketch. With two Unos, each reader is wired to D10, and `bridge.py --port <port>:R1 --port <port>:R2` says which Uno is in and which is out. The two Unos can sit on one laptop or on two laptops | The user is new to breadboards, and a second Uno removes the shared lines. The reader laptop has one USB port; another laptop has more |
| 2026-10-17 | The app serves `bridge.py` and the sketch at `/files/bridge.py` and `/files/maize_tracker.ino` | Any laptop fetches the current files from the public address with one command |
| 2026-10-17 | Host the tracker and the app online on Fly.io, as one container in the Johannesburg region, with the database on a 1 GB volume. Supersedes Tailscale Funnel as the main path; Funnel and Tailscale stay as fallbacks | Funnel's public DNS record never appeared, so laptops outside the tailnet could not connect. A hosted server works from any laptop and phone with no setup, and Fly deploys from this folder without Git |
| 2026-10-17 | Animation fixes from `/review-animations`: Bklit bars and rings respect reduced motion, counters roll in 280 ms, only new rows fade in, colour changes use `ease` | The review blocked on reduced motion and on 900 ms counters |
| 2026-10-17 | Version 2 of the demo, decided with the user: the decisions below replace the single warehouse and shop demo | The demo must show a network, what each bag holds, and tag reuse |
| 2026-10-17 | Host on this machine behind the existing wits-tats Cloudflare tunnel, at `https://bcg-pla.banzilenhlebela.co.za`. A Docker container (`docker-compose.yml`) runs the tracker and the app on `172.17.0.1:3010`. Supersedes Fly.io and Tailscale Funnel | The Fly.io trial ends after two hours. Funnel's public DNS record never appeared. Cloudflare publishes its own DNS and costs nothing |
| 2026-10-17 | Six sites: WH1 to WH4 and SHOP1 and SHOP2. The phone switches the readers between them | Shows the count and the flows across a network |
| 2026-10-17 | Each bag cycle has a product (Seed or Fertiliser) and a size (5, 10, 15 or 20 kg). The bag ID is `PRODUCT-KG-U<use>-<tag ID>`, such as `SEED-20-U1-93B73B38`. It replaces the labels B1 to B4. The use marker is U, because R1 and R2 name the readers | A tag must say what it is attached to. Tag ID plus use number is unique forever |
| 2026-10-17 | A sold tag goes to the tag pool. The Tags page assigns pool tags to a typed order (product, size, quantity), picked at random, each with a new use number. A tag entering a warehouse without an assignment is flagged and can be named afterwards. Supersedes the automatic new cycle at a warehouse entry after a sale | The amount of each product packed changes, so tags get new identities on demand |
| 2026-10-17 | Mock stock lives in `inventory.db`, marked simulated, with its real location stored separately. Clear demo data restores it. Supersedes "synthetic data never enters `inventory.db`" for stock; `synthetic.json` now holds only the weekly count trend. ERP history and supply share come from the mock histories | Counts, trips and corrections must treat mock bags like real ones |
| 2026-10-17 | A simulated gun sweep counts the mock bags at a site during a count. Real tags are still tapped | Shows reconciliation at warehouse scale with four real tags |
| 2026-10-17 | A floating dock at the bottom of every page: Overview, Warehouses, Shops, Tags and Control (Control only on a device holding the key), plus the theme toggle copied from wits-tats | One page could not hold the network. The phone's job is the site switch |
| 2026-10-17 | The tag cost comparison leaves the dashboard. It stays in this plan and in `solution_design.md` as a talking point if asked | Not part of the live story |
| 2026-10-17 | Bag details show in a shadcn hover card on the dashboards. The phone shows the full bag ID, which already says product, size and use | Hover cards do not open on touch screens |
| 2026-10-17 | The control link is `/control?key=...`. The phone stores the key, so every page on it can make changes | Several pages need the key |
| 2026-10-17 | Times are reported separately for live taps (seconds) and simulated bags (hours). Live trips group exits within 60 s and are overdue after 2 minutes (1 minute from the later decision); simulated trips use 1 hour and 36 hours | Mixing the two scales would make every average meaningless |
| 2026-10-17 | WH3 and SHOP2 hold no stock. Their past trips and sales stay in the history, and every bag that reached SHOP2 was sold. The planted SHOP2 ERP error is removed; the "skip booking" button creates that case live | The user asked for one empty warehouse and one empty shop. The demo route WH3 to SHOP2 then shows only real tags |
| 2026-10-17 | The four real tags start in the tag pool as new tags (use 0), not pre-assigned. The user assigns each one live with the "One tag" form on the Tags page; the random order form stays for the simulated pool. A new tag entering a warehouse unassigned is flagged as an unknown tag | The user assigns the tags during the demo. A random pick from about 80 pool tags would rarely choose a real one |
| 2026-10-17 | The Tags page follows the NGO's loop only: a tag comes back from a shop unassigned, and someone assigns it a product and size from its row in the "Unassigned tags" table. The "One tag" form, the random order form and the "waiting to be packed" and "in use without a product" tiles are removed. State ASSIGNED shows as "Assigned"; the pool shows as "Unassigned tags" | The user's model of the loop. The earlier page hid the action and named states the user does not use |
| 2026-10-17 | Every table on the dashboards and the Tags page sorts by clicking a column header and filters by text and drop-downs (`components/data-table.tsx`, no new dependency) | The user asked for sorting and filtering |
| 2026-10-17 | Live bags count as overdue after 60 seconds in transit, down from 120 | The demo lasts about 5 minutes; an overdue bag must appear while the audience watches |
| 2026-10-17 | `bridge.py` sends its own user agent (`bag-tracker-bridge/2.1`) and tells a Cloudflare 403 apart from a wrong key | Cloudflare answers Python's default user agent (`Python-urllib`) with 403 before the request reaches the server; the bridge reported it as a rejected key |
| 2026-10-17 | Tag assignment is demonstrated on the presenter's laptop. Opening any page with `?key=...` stores the key on that device and removes it from the address bar | The user demos assignment on the projected laptop, and the key must not show on screen |
| 2026-10-17 | Each tag has a history page (`/tags/<tag ID>`): every use, newest first, with product and size, the route (for example Entered WH3, Left WH3, Arrived at SHOP2, Sold at SHOP2) and the time between steps. Every bag ID links to it; the Tags page has a lookup box | The user wants the travel history per use of each tag |
| 2026-10-17 | Simulated tags get a backdated journey for each earlier use (40 to 90 days ago). First in, first out only checks trips from the last 14 days | Earlier uses must have a history; old single-bag trips would flood the first in, first out panel |
| 2026-10-17 | All activity from 09:00 on 2026-10-17 was deleted at the user's request: 29 events, 1 count, 2 investigations, 7 ERP entries, and 10 unknown tags read at WH1 and WH3. The network was then restored with full histories | Test taps before the demo; the unknown tag IDs were other cards or misreads |
| 2026-10-17 | The four real tags start as bags in stock at SHOP1 (Seed 20, Fertiliser 10, Seed 5, Fertiliser 15 kg) with a short seeded history at demo scale. Selling one frees it into the pool. Supersedes "real tags start unassigned" | The user wants to sell them out of the store, then assign them |
| 2026-10-17 | "Assign by need" on the Tags page: lines of quantity, product and size. Real tags in the pool are used first (longest in the pool first), then simulated pool tags at random. The per-row Assign stays | The NGO assigns by need ("ten 10 kg seed bags, and ..."); the audience must see the real tags change |
| 2026-10-17 | Ending a count that has fewer bags than the books asks for confirmation and says whether the simulated sweep has run | A WH2 count ended one second after starting, with nothing counted, and marked 30 bags missing. That count was undone by hand |
| 2026-10-17 | No planted count errors: every simulated bag's real location matches the records, so every simulated sweep is exact. Counts differ only when the presenter makes them differ with the real tags (a tag kept back, an ERP skip). Supersedes the planted WH2 loss and SHOP1 missed door reads | The user wants counts to come out exact |
| 2026-10-17 | The Tags and Control pages have an Unlock box: paste the control key once and the device remembers it. Removing the key from tag assignment was refused by Claude Code's auto mode, because the site is public | The user demos assignment on a computer that never opened the key link |
| 2026-10-17 | Two more real tags join the demo: `84704E4D` (Fertiliser 20 kg) and `2B49D307` (Seed 10 kg). Like the others they start in stock at SHOP1. Their identifying scans at WH2 were removed by a reset | The team found more tags |

## Current state

Built and verified:

- Toolchain on the Windows laptop: `arduino-cli` 1.5.1 at `C:\Program Files\Arduino CLI\arduino-cli.exe`, core `arduino:avr` 1.8.8, library MFRC522 1.4.12, `pyserial` 3.5.
- Two Unos, one reader each (option B), both with the current sketch and both reporting chip version 0x92. The IN Uno is COM7 on the Windows laptop. The OUT Uno is COM8 on that laptop and COM3 on the second laptop (`ibramchilu`).
- On 2026-10-17 both bridges, one per laptop, sent taps to the hosted server. The OUT laptop's Uno did not restart when the port opened; pressing its reset button fixed it.
- Real tags: white cards `93B73B38` and `937C2A38`, blue fobs `F710AD64` and `97F8A564`, and two extra tags `84704E4D` and `2B49D307`. All six start as bags in stock at SHOP1.
- Version 2 backend: six sites, products and bag IDs, the tag pool and assignment, mock stock with planted discrepancies, the simulated sweep, an ERP per shop. 18 end to end checks passed on 2026-10-17 against a scratch database, including the three planted count outcomes.
- Version 2 frontend: Overview, Warehouses, Shops, Tags and Control behind the dock, with hover cards and the wits-tats theme toggle. Checked in Playwright at 390px and 1440px, dark and light, with no console errors.
- The container runs on this machine at `172.17.0.1:3010`. On 2026-10-17 the wits-tats tunnel route (`http://host.docker.internal:3010`) went live: `https://bcg-pla.banzilenhlebela.co.za/api/health` answered through Cloudflare. Some resolvers cached the earlier missing record for a few minutes.

Not done yet:

- The Fly.io app `bcg-bag-tracker` still exists. Destroy it with `fly apps destroy bcg-bag-tracker`.
- The version 2 demo script has not run on the hardware.

`inventory_old.db` holds the single reader test data from 2026-10-16 under the old schema. It is not used.

## Hardware on hand

| Item | Notes |
|---|---|
| Arduino Uno R3 compatible board (Kuongshun, ATmega328P) | USB A to B cable to an HP Spectre laptop running Windows. The laptop may need a USB-C to USB-A adapter |
| 2 x RFID-RC522 reader modules | 13.56 MHz HF, range 2 to 3 cm, one tag at a time. Right angled 8-pin header already soldered |
| 4 x MIFARE Classic 1K tags | 2 white cards and 2 blue key fobs. The UID is the bag ID |
| Breadboard and jumper wires | Female to male and male to male, from the starter kit |
| Second Uno (option B only) | Used only if the two Uno option is chosen. A clone with a CH340 USB chip needs the CH340 driver on Windows |

## Wiring

RC522 header pin order, as printed on the board: SDA, SCK, MOSI, MISO, IRQ, GND, RST, 3.3V.

| RC522 pin | Reader A (R1, in) | Reader B (R2, out) | Notes |
|---|---|---|---|
| SDA (SS) | Uno D10 | Uno D8 | Direct, not shared |
| SCK | Uno D13 | Uno D13 | Shared through a breadboard row |
| MOSI | Uno D11 | Uno D11 | Shared through a breadboard row |
| MISO | Uno D12 | Uno D12 | Shared through a breadboard row |
| IRQ | not connected | not connected | |
| GND | Uno GND | Uno GND | Shared through a breadboard row |
| RST | Uno D9 | Uno D9 | Shared through a breadboard row |
| 3.3V | Uno 3.3V | Uno 3.3V | Shared through a breadboard row. Never use 5V. It damages the RC522 |

### Option B: two Unos, one reader each

Wire each reader to its own Uno with seven female to male jumpers, exactly like reader A in the table above: SDA to D10, SCK to D13, MOSI to D11, MISO to D12, RST to D9, GND to GND, 3.3V to 3.3V. IRQ stays unconnected. No breadboard is needed. Label one Uno IN and the other OUT with tape. Both Unos run the same sketch, and each reports its reader as R1. The bridge renames the OUT Uno's reader to R2.

### Option A: one Uno through the breadboard

To share a signal, put three wires into one breadboard half row (the same side of the centre groove): one from reader A, one from reader B and one male to male wire to the Uno. The five holes in a half row are connected underneath.

Unplug USB before changing any wiring.

If adding reader B breaks reader A, test each reader alone first. Some RC522 clones do not release MISO when not selected. A 1k resistor in series on each MISO line fixes this.

## Software setup

Toolchain commands, already run once on this laptop:

```
winget install ArduinoSA.CLI
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib install MFRC522
python -m pip install pyserial
```

Build and upload:

```
arduino-cli board list
arduino-cli compile --fqbn arduino:avr:uno maize_tracker
arduino-cli upload -p COM7 --fqbn arduino:avr:uno maize_tracker
```

## Machines

The Linux machine is the server. It runs the tracker and the app in one Docker container, published by the wits-tats Cloudflare tunnel at `https://bcg-pla.banzilenhlebela.co.za`. Each Uno plugs into any laptop with internet access, and that laptop runs `bridge.py`. The sketch stays on an Uno after it is unplugged, so only the laptop that uploads it needs `arduino-cli`.

| Machine | Runs |
|---|---|
| Linux machine (`reference2025`) | The container (`docker compose`), the wits-tats tunnel |
| Reader laptops | Python 3 with `pyserial`, and `bridge.py`. One Uno each, or both on one laptop |
| Windows laptop (`tmk74`) | `arduino-cli` for uploading the sketch |
| Phone | A browser. Nothing to install |

### How the readers reach the app

```
RC522 reader -> Uno (SPI) -> USB serial -> bridge.py on a reader laptop
  -> HTTPS -> https://bcg-pla.banzilenhlebela.co.za (Cloudflare)
  -> wits-tats tunnel container -> host.docker.internal:3010 (172.17.0.1)
  -> container: Next.js on 3000, /api/* proxied to tracker.py on 8000
  -> phone (control page) and dashboards
```

The bridge numbers every line and keeps it until the tracker acknowledges that number. If the link drops, the bridge queues lines and resends them in order. The tracker skips any line number it already applied, so a resend never doubles a scan. Each line carries its age, so a late line keeps the time of the tap. Each bridge contacts the server every 5 seconds; the status line lists every bridge heard from in the last 15 seconds.

### Hosting on this machine

`Dockerfile`, `start.sh` and `docker-compose.yml` define the server. The container listens on the Docker bridge (`172.17.0.1:3010`), because the wits-tats tunnel runs in Docker and reaches the host there. Nothing on the local network or on Tailscale reaches it. The database lives on the Docker volume `bagdata` and survives restarts and rebuilds. The control key comes from `.env` (`CONTROL_KEY=...`, readable only by the user). Times use South African time.

Cloudflare, one time:

1. Open Zero Trust, then Networks, then Tunnels, then the wits-tats tunnel.
2. Add a published application route: subdomain `bcg-pla`, domain `banzilenhlebela.co.za`, path empty, service URL `http://host.docker.internal:3010`.
3. Save. Cloudflare creates the DNS record itself.

Linux machine:

```
cd ~/Desktop/bcg_pla
docker compose up -d --build                    # start, or update after a code change
docker compose logs app | grep -i key           # the control link and the bridge command
docker compose logs -f app                      # watch scans arrive
curl https://bcg-pla.banzilenhlebela.co.za/api/health
```

The wits-tats tunnel must be running (`docker compose --profile tunnel up -d` in `~/Desktop/projects/wits-tats`). If it stops, this site stops too.

Reader laptop, one time: install Python 3, run `python -m pip install pyserial`, then download the bridge: `curl.exe -o bridge.py https://bcg-pla.banzilenhlebela.co.za/files/bridge.py`.

Reader laptop, each run:

```
python bridge.py --list                                    # which USB port is which Uno
python bridge.py --port auto:R1 --server https://bcg-pla.banzilenhlebela.co.za --key <key>   # IN laptop
python bridge.py --port auto:R2 --server https://bcg-pla.banzilenhlebela.co.za --key <key>   # OUT laptop
python bridge.py --port COM7:R1 --port COM8:R2 --server ... --key ...                        # both Unos on one laptop
python bridge.py --server ... --key ...                                                      # option A: one Uno, both readers
```

If a bridge prints no `read INFO,...` line after "Connected", press the reset button on its Uno. Some laptops do not restart the Uno when the port opens.

Windows laptop, to upload the sketch (once per Uno, and after the sketch changes):

```
& "C:\Program Files\Arduino CLI\arduino-cli.exe" compile --fqbn arduino:avr:uno maize_tracker
& "C:\Program Files\Arduino CLI\arduino-cli.exe" upload -p COM7 --fqbn arduino:avr:uno maize_tracker
```

Use the port that `bridge.py --list` marks as the Uno. In Command Prompt, leave out the `&`. Only one program can hold a port: stop the bridge before uploading. The sketch must live in a folder with the same name (`maize_tracker/maize_tracker.ino`).

Debugging without hardware: run `python3 tracker.py --bridge --db <scratch>.db --http 8110` and `TRACKER_URL=http://127.0.0.1:8110 npx next dev -H 127.0.0.1 -p 3110` in `app/`. `POST /api/scan` simulates a tap. `bridge.py --stdin` sends typed lines.

Fallbacks, both tested on 2026-10-17: Tailscale between machines on the tailnet (`http://100.107.160.2:8000`, needs the tracker running outside Docker) and the Fly.io container (`fly deploy`, trial account).

## Files

```
maize_tracker/maize_tracker.ino   Sketch: polls up to two readers, prints SCAN,<reader>,<UID> at 9600 baud
tracker.py                        Backend: state rules, sites, products, tag pool, counts, insights, JSON API
mock_data.py                      The simulated network: about 230 bags with histories and planted discrepancies
bridge.py                         Runs on each reader laptop, forwards lines from one or two Unos to the server
synthetic.json                    The weekly count accuracy trend (synthetic)
Dockerfile, start.sh              One container with the tracker and the app
docker-compose.yml, .env          The server on this machine; .env holds CONTROL_KEY
fly.toml                          Fly.io fallback, retired
app/                              Next.js frontend
app/components/overview.tsx       Overview page
app/components/site-dashboard.tsx Warehouses and Shops pages
app/components/tags-page.tsx      Tags page: pool and assignment
app/components/control-page.tsx   Control page for the phone
app/components/panels.tsx         Panels shared by the dashboards
app/components/dock.tsx           Floating dock
app/components/bag-id.tsx         Bag ID with its hover card
app/lib/api.ts                    API types, polling hook, formatters
app/lib/key.ts                    Control key stored on the device
solution_design.md                Insight catalogue, production research, pilot plan
plan.md                           This file
.claude/CLAUDE.md                 Project context for Claude Code
```

## System design

### Data flow

The Uno sends one line per tap with two facts: the reader and the tag UID.

```
INFO,R1,version=0x92
INFO,R2,version=0x0
INFO,READY
SCAN,R1,93B73B38
```

A chip version of 0x91 or 0x92 is genuine, and 0x12 or 0xB2 is a working clone. 0x0 or 0xFF means the reader is not connected or is miswired; the sketch then skips that slot. The sketch halts each tag after reading, so a tag held on the reader is read once.

`tracker.py` adds the other facts:

| Fact | Source |
|---|---|
| Time | Server clock when the line arrives, less the line's age |
| Direction | Reader table: R1 is in, R2 is out |
| Site | Site switch on the phone: WH1 to WH4, SHOP1 or SHOP2 |
| Movement | Site plus direction: WAREHOUSE_IN, WAREHOUSE_OUT, SHOP_IN or SHOP_OUT |
| Identity | The tag's current bag cycle: product, size and use number |
| Anomaly | The bag's current state checked against the expected flow |

### Bags, tags and reuse

A tag carries only its chip ID. A bag cycle is one fill of one tag, from assignment to sale. Each cycle has a product (SEED or FERT), a size (5, 10, 15 or 20 kg) and a use number, the count of fills of that tag. The bag ID joins them: `SEED-20-U1-93B73B38`. Every insight works per bag cycle.

The reuse loop:

1. On the Tags page, someone assigns an unassigned tag a product and size from its row. The tag's use number goes up by one (state ASSIGNED, shown as "Assigned"). A new tag has use 0 until its first assignment.
2. The tag's first warehouse entry starts the bag's flow.
3. A sale puts the tag back in the pool (state SOLD).

A tag that enters a warehouse with no assignment, new or straight from the pool, is flagged and gets a cycle with no product (`NONE-00-...`). The Tags page names it afterwards without starting a new cycle.

### State rules

States: ASSIGNED, AT_WAREHOUSE, IN_TRANSIT, AT_SHOP, SOLD and MISSING. MISSING is set only by a walk-in count.

| Site and reader | Bag's current state | Result |
|---|---|---|
| Warehouse, in | assigned, or in transit | WAREHOUSE_IN, bag now at warehouse |
| Warehouse, in | none (unknown tag) | ANOMALY "unknown tag entered warehouse: no product assigned", new cycle without a product |
| Warehouse, in | sold (tag in pool) | ANOMALY "reused tag entered warehouse without a new product assigned", next cycle without a product |
| Warehouse, in | at warehouse | ANOMALY "entered warehouse twice without an exit read" |
| Warehouse, in | at shop | ANOMALY "entered warehouse while recorded at shop" |
| Warehouse, out | at warehouse | WAREHOUSE_OUT, bag now in transit |
| Warehouse, out | any other | ANOMALY, bag now in transit |
| Shop, in | in transit | SHOP_IN, bag now at shop |
| Shop, in | at warehouse | ANOMALY "arrived at shop without a dispatch read" |
| Shop, in | none or assigned | ANOMALY "arrived at shop but never received at a warehouse" |
| Shop, out | at shop | SHOP_OUT, bag now sold, tag to the pool |
| Shop, out | any other | ANOMALY, bag now sold |
| Any site and reader | missing | ANOMALY "missing bag seen again", investigation closes |

The latest scan always decides where a bag is now. A repeat tap of the same tag at the same reader within 2 seconds is ignored.

### Simulated network (`mock_data.py`)

Clear demo data, and the first start on an empty database, seed the network: the four real tags in the tag pool as new tags (use 0, no product), and about 220 simulated bags with backdated histories over ten days. WH3 and SHOP2 hold no stock. Times are realistic: hours for trips, days for dwell. Simulated bags are marked in the database and in the hover card.

Each simulated bag also has a real location (`actual_site`) that the records may not know. The simulated sweep reads that location, so counts find planted errors:

| Site | Planted error | Count result |
|---|---|---|
| WH1, WH2, WH4, SHOP1 | None | Count matches RFID (and the ERP at SHOP1) |
| WH3, SHOP2 | Empty | Only the real tags tapped there count |
| WH4 | Two old bags stayed behind while newer stock left | Stock ageing and first in, first out flag them |

The seed is fixed, so every reset restores the same network. Real tags at a site must be tapped during its count, or the count reports them missing.

### Simulated ERP (one per shop)

Each shop has its own simulated ERP in `erp_entries`, with quantities only. A live SHOP_IN books a check-in and a live SHOP_OUT books a sale at that shop. "ERP: book in a bag the door missed" and "ERP: skip booking for the next shop scan" act on the current shop. ERP book stock is check-ins minus sales at that shop.

### Walk-in count and reconciliation

A count starts from the phone at the current site and locks the site switch. Taps on either reader add the tag to the count and record no movement. The simulated sweep adds every simulated bag physically at the site. Cancel stops a count and records nothing.

When the count ends, the tracker compares it with RFID book stock bag by bag, and at a shop with the ERP by quantity. Outcomes and flags:

| Outcome | Meaning | Flag |
|---|---|---|
| ALL_AGREE | Count, RFID and ERP agree | "All sources agree" |
| ERP_WRONG | Count matches RFID only | "ERP differs from the count by N. Correct the ERP" |
| DOORS_MISSED | Count matches the ERP only | "Door reads missed. RFID corrected from the count" |
| NEITHER | Count matches neither | "Count matches neither source. RFID corrected from the count" |
| RFID_MATCH | Warehouse count matches RFID | "Count matches RFID" |
| RFID_DIFFERS | Warehouse count differs | "Count differs from RFID. RFID corrected from the count" |

The count is the source of truth for RFID stock. Each found bag moves to the site with an event "found at walk-in count". Each missing bag becomes MISSING with an event "not found at walk-in count", and an investigation opens. No event is edited or deleted, and the ERP is never written. An investigation closes when any reader or count sees the bag again, or by hand with a note.

### Database (`inventory.db`, `/data/inventory.db` in the container)

| Table | Columns | Role |
|---|---|---|
| `bags` | uid, cycle, product, kg, state, site, updated_at, simulated, actual_site | Current position and identity of each tag. `actual_site` is the simulated truth, empty for real tags |
| `cycles` | uid, cycle, product, kg, assigned_at, source | One row per fill of a tag. Source is `initial`, `mock`, `assignment`, `unassigned` or `named` |
| `events` | id, ts, uid, cycle, site, reader, event, state_before, state_after, note | Append-only history. A row with a note is an anomaly. Count corrections use reader `COUNT`; assignments use reader `TAGS` |
| `counts` | id, site, started_at, ended_at, rfid_book, erp_book, counted, seen, missing, found, outcome, flag | One row per finished count |
| `investigations` | id, uid, cycle, site, count_id, opened_at, status, closed_at, resolution, event_id | One row per bag missing at a count |
| `erp_entries` | id, ts, site, kind, source | Simulated ERP per shop. Kind is `CHECK_IN` or `SALE`; source is `auto`, `manual` or `mock` |
| `settings` | key, value | Current site, skip-next-booking flag, control key, reader chip versions |

### Backend API (`tracker.py`, port 8000)

| Method and path | Purpose |
|---|---|
| `GET /api/state` | Data for the control page. `authorised` is true when the request carries the key |
| `GET /api/insights` | Network insights; `?site=WH2` scopes them to one site |
| `GET /api/tags` | The pool, assigned tags, bags without a product, use numbers and last week's sales by product |
| `GET /api/health` | `{"ok": true, "site": ...}` |
| `POST /api/site` | Body `{"site": "WH3"}` |
| `POST /api/count/start`, `/sweep`, `/end`, `/cancel` | Walk-in count. End returns `result` |
| `POST /api/erp/book-in`, `/erp/skip-next` | Simulated ERP at the current shop |
| `POST /api/tags/assign` | Body `{"orders": [{"product": "SEED", "kg": 20, "qty": 3}]}`. Returns the assigned bag IDs and any shortfall |
| `POST /api/tags/identify` | Body `{"uid": "...", "product": "FERT", "kg": 10}`. Names a bag without a product |
| `POST /api/investigations/close` | Body `{"id": 1, "resolution": "..."}` |
| `POST /api/reset` | Clear demo data and restore the simulated network |
| `POST /api/scan` | Body `{"reader": "R1", "uid": "..."}`. Simulates a tap |
| `POST /api/serial` | Lines from `bridge.py`; returns `{"ack": <highest seq applied>}` |

The app also serves `GET /files/bridge.py` and `GET /files/maize_tracker.ino`. Every `POST` needs the control key (header `X-Control-Key` or `?key=`). `GET` routes stay open, so anyone can view the dashboards.

## Frontend

### Stack

| Part | Choice |
|---|---|
| Framework | Next.js 16.4 (App Router, TypeScript, Turbopack) in `app/` |
| Components | shadcn/ui with the Lyra style (`radix-lyra` in `components.json`): zero border radius, JetBrains Mono, Phosphor icons |
| Charts | Bklit UI through the shadcn CLI (`@bklit/<chart>`), with its default animations. Used: bar chart, line chart, gauge, y axis, reference area |
| Other components | shadcn hover card (bag details), select (Tags order form), toggle group (site pickers) |
| Numbers | `@number-flow/react` (installed with Bklit) animates changing counts |
| Data | Next.js rewrites `/api/*` to `TRACKER_URL`, default `http://127.0.0.1:8000` (inside the container) |
| Refresh | The control page polls every second, the dashboards every two seconds and the Tags page every three. Polling pauses while the tab is hidden |
| Network | The container serves the app on `172.17.0.1:3010` for the Cloudflare tunnel. For development, `npm run dev` listens on all interfaces |

The global frontend rules apply. `apple-design` decides layout and accessibility, `emil-design-eng` decides motion, and `review-animations` checks anything that moves. `dataviz` picks each chart form and checks contrast. `mobile-native` sets the phone baseline: `viewport-fit=cover` with safe area padding, 16px inputs, no tap highlight, no pull to refresh, 44px touch targets (button size `touch`). Every animation honours `prefers-reduced-motion`. Check both pages with the Playwright MCP at 390px and desktop width.

Motion in the app: buttons scale to 0.97 on press (160 ms, strong ease-out), and colour changes use `ease` (150 ms). Rows that arrive after the page loads fade in once (220 ms); rows present at load stay still. Counters roll with NumberFlow in 280 ms through `components/count-flow.tsx`. Bklit charts play their enter animation once. After it, lines move to new values on each poll, while bars and rings jump to them. Reduced motion keeps the fades and drops all movement: bars and rings fade in at full size (patched in `components/charts/bar.tsx` and `ring.tsx`), and counters stop rolling. `/review-animations` checked the motion on 2026-10-17; the fixes are verified in Playwright with reduced motion emulated.

Bklit pulled in `@visx/*`, `d3-array`, `d3-shape`, `motion` and `@number-flow/react`. Each `npx shadcn add @bklit/...` rewrites `app/globals.css` with broken `var(----...)` lines and default oklch colours. After any Bklit add, delete those lines and keep the Platinion tokens. The add also asks to overwrite `lib/utils.ts`; answer no.

### Colour

The BCG Platinion palette has five colours:

| Name | Hex | Role |
|---|---|---|
| Platinion green | `#0ECA91` | Primary: buttons, the active site, focus rings, the RFID series ("our system"), the "match" state |
| Mint | `#8AD9BC` | Secondary: selected rows, highlight tints, the count series in dark mode, a second warehouse in supply share |
| Black | `#000000` | Text in light mode, background in dark mode, text on green buttons |
| Grey | `#707070` | Muted text, borders, axes, the ERP series ("their system"), a third warehouse in supply share |
| Blush | `#F7EFF1` | Background in light mode, text in dark mode |

Contrast ratios, calculated with the WCAG formula:

| Pair | Ratio | Use |
|---|---|---|
| Green on black | 9.9:1 | Passes for text and graphics |
| Black on green | 9.9:1 | Button labels |
| Mint on black | 12.7:1 | Passes for text and graphics |
| Blush on black, black on blush | 18.6:1 | Body text |
| Grey on blush | 4.4:1 | Large text, borders and chart marks only. Below 4.5:1 for body text |
| Grey on black | 4.2:1 | Large text, borders and chart marks only |
| Green on blush | 1.9:1 | Fails. Never use green for text or thin lines in light mode |
| Mint on blush | 1.5:1 | Fails. Fills and tints only in light mode |

Rules that follow from the ratios:

- Dark mode is the default for the demo. The palette works best on black, where green and mint both pass.
- Light mode exists too. In light mode, green appears only as filled shapes with black text. Lines, icons and text in green use `#055A3F` (token `--brand-ink`), 7.3:1 on blush. The `dataviz` validator rejected the earlier candidate `#08875F`: next to the ERP grey it gave deutan ΔE 2.6 and normal vision ΔE 11.7. `#055A3F` gives ΔE 11.1 and 15.6.
- In light mode, the count series uses black where dark mode uses mint.
- Small muted text uses `#5E5E5E` on blush (5.7:1) and `#8C8C8C` on black (6.3:1).
- The validator also fails the palette on its lightness band and chroma floor, because grey is achromatic and green is light. These are brand constraints, accepted. Every chart with two or more series carries a legend and a table or tooltip values, so identity never rests on colour alone.
- Supply share uses green for WH1, the count colour (mint or black) for WH2 and grey for WH3.
- The palette has no warning colour. Anomalies and flags use an inverted badge (black on blush in light mode, blush on black in dark mode) plus an icon and a text label. Colour is never the only signal.

Chart series stay the same across all panels: RFID is green, ERP is grey and the count is mint in dark mode or black in light mode.

### Pages

A floating dock at the bottom of every page switches pages: Overview, Warehouses, Shops, Tags and Control, then the theme toggle. Control appears only on a device that has opened the control link. Navigation switches instantly; only the press feedback moves.

| Page | Device | Content |
|---|---|---|
| Overview (`/`) | Projector | Stock by state, read completeness, readers, site cards linking to each site, stock by site, recent trips, overdue, supply share, times (simulated and live apart), anomalies, investigations, throughput, weekly count accuracy (synthetic) |
| Warehouses (`/warehouses?site=WH2`) | Projector | Site picker; book stock by product and size, stock ageing, movements, counts, trips out, investigations, first in first out, throughput |
| Shops (`/shops?site=SHOP1`) | Projector | Site picker; book stock by product and size, ERP check for the last 7 days, movements, counts, trips in, investigations, throughput |
| Tag history (`/tags/<tag ID>`) | Projector | Every use of the tag, newest first: product and size, assignment time, the route, and each step with the time since the previous one |
| Tags (`/tags`) | Projector or phone | "Unassigned tags" table (back from shops or never used, real tags first) with an Assign button per row that opens product and size; pool counts; last week's sales by product; "Assigned recently" with where each bag is now; "Read before being assigned" only when a tag was tapped in unassigned |
| Control (`/control?key=...`) | The user's phone | Site picker for six sites with book stock, stock at the site by product, walk-in count with the simulated sweep, simulated ERP at shops, open investigations, latest scans, Clear demo data |

Every bag ID on the dashboards opens a hover card: product and size, use number, tag ID, current state and site, time since the last change, and whether the bag is simulated. The phone shows the full ID instead, because hover cards do not open on touch.

## First hardware test

Done on 2026-10-17 with version 1: both Unos uploaded, both bridges connected, taps reached the server. Repeat the bridge commands from Machines with the Cloudflare address. Unplug USB before any wiring change.

## Demo setup

Run in this order. Unplug USB before any wiring change.

Linux machine (the server). Nothing needs starting; check it is up:

```
cd ~/Desktop/bcg_pla
docker compose ps                                  # bcg_pla-app-1 is Up
docker ps --format '{{.Names}}' | grep tunnel      # wits-tats-tunnel-1 is listed
curl -s http://172.17.0.1:3010/api/health          # {"ok": true, ...}
docker compose logs app | grep -i key              # the control link and the key
```

If the app is down, run `docker compose up -d`. If the tunnel is down, run `docker compose --profile tunnel up -d` in `~/Desktop/projects/wits-tats`.

Each reader laptop, nothing plugged in (PowerShell, in the `bagtracker` folder):

```
curl.exe -o bridge.py https://bcg-pla.banzilenhlebela.co.za/files/bridge.py
curl.exe https://bcg-pla.banzilenhlebela.co.za/api/health
```

Each reader laptop, its Uno plugged in:

```
python bridge.py --list
python bridge.py --port auto:R1 --server https://bcg-pla.banzilenhlebela.co.za --key <key>   # IN laptop
python bridge.py --port auto:R2 --server https://bcg-pla.banzilenhlebela.co.za --key <key>   # OUT laptop
```

Phone: open `https://bcg-pla.banzilenhlebela.co.za/control?key=<key>`. Presenter laptop: open `https://bcg-pla.banzilenhlebela.co.za/tags?key=<key>` once, so it can assign tags. The status line shows Tracker, both laptops under Bridge, R1 in and R2 out, all filled. Projector: open `https://bcg-pla.banzilenhlebela.co.za/`. Before the audience arrives, tap Clear demo data on the phone.

| Bridge message | Cause | Fix |
|---|---|---|
| "tracker.py rejected the control key" | An old key or an old server address | Use the key from `docker compose logs app` and the bcg-pla address |
| "Blocked before reaching tracker.py" or 403 on the first line | An old `bridge.py` without its own user agent | Download `bridge.py` again from `/files/bridge.py` |
| "Cannot reach tracker.py" | No internet, or the name is not resolving yet | Check the laptop's internet; the health check above must answer |
| No `read INFO` line after "Connected" | The Uno did not restart when the port opened | Press the Uno's reset button |
| Garbled characters | The Uno runs another sketch | Upload `maize_tracker` from the Windows laptop |
| "Serial port ... not available" | Another program holds the port | Close the Arduino IDE, serial monitors and other bridges |
| `version=0x0` or `0xFF` | Reader wiring fault | Unplug USB, check SDA to D10 and 3.3V to 3.3V |

## Demo script

The six real tags start as bags in stock at SHOP1: `SEED-20-U1-93B73B38`, `FERT-10-U1-937C2A38`, `SEED-05-U1-F710AD64`, `FERT-15-U1-97F8A564`, `FERT-20-U1-84704E4D` and `SEED-10-U1-2B49D307`. WH3 and SHOP2 are empty. Every simulated count is exact; differences come only from what is done live. Live bags are overdue after 60 seconds in transit.

1. Overview. Show stock across six sites and the trips. Hover a bag ID; click it for its travel history. Sort or filter any table.
2. Sell. On the phone, choose SHOP1 and tap two real tags on OUT (for example `937C2A38` and `F710AD64`). They leave SHOP1 and appear under "Unassigned tags" on the Tags page.
3. Assign by need, on the laptop. On the Tags page, under "Assign by need", enter "10 bags, Seed, 10 kg" and "3 bags, Fertiliser, 20 kg", and press Assign. The two real tags are used first: `SEED-10-U2-937C2A38` and `SEED-10-U2-F710AD64`. Click one: use 1 went WH1, SHOP1, sold; use 2 has just started.
4. Receive. Choose WH3 (empty) and tap both on IN.
5. Dispatch. At WH3, tap both on OUT.
6. Deliver one. Choose SHOP2 (empty) and tap `937C2A38` on IN. The simulated ERP books it. A minute later the Overview flags `F710AD64` as overdue.
7. Count a full warehouse. Choose WH2, Start count, Simulated gun sweep, End count. 30 of 30: the count matches RFID.
8. Count with a difference. Choose SHOP2, Start count, tap `937C2A38` and `F710AD64`, End count. `F710AD64` is found at the count and its overdue flag clears. The result is "Count matches neither source": the bag skipped both the door reader and the ERP booking. Tap "ERP: book in a bag the door missed" before the count instead, and the result is "Door reads missed".
9. Mention the weekly count trend as the evidence for stopping the manual count.

Rehearsal checks: a tag tapped into a warehouse before it is assigned is flagged; name it under "Read before being assigned". At a shop, "ERP: skip booking for the next shop scan" before an arrival makes the next count say the ERP is wrong. Real tags still on a shop's shelf must be tapped during that shop's count.

## Presentation notes

Limits of the POC to state when presenting:

- The RC522 reads one tag at 2 to 3 cm. Production needs UHF (RAIN RFID) readers that read hundreds of tags per second at several metres.
- Bags cannot be read reliably inside a loaded truck. A metal box body blocks UHF. Production reads bags at the dock door as they are unloaded or loaded.
- Stacked produce absorbs part of the UHF signal. A site test with real bags must measure read rates before any purchase.
- The system tracks tags, not produce. Removed or swapped tags need reconciliation against dispatch notes or weighbridge records.
- The ERP in the demo is simulated. A real link needs a daily export from the shop's ERP.

Talking points:

- The events and the walk-in count check each other. Count accuracy over weeks is the evidence for stopping the manual count.
- At the shop, the gun settles every disagreement between the ERP and the door reads in minutes, without closing the site. This is the case for buying it.
- Tags are reused, so the tag type is a cost decision. Reusable clip-on tags win only if they cost less than buying a new tag for every bag, after losses and returns.
- Production hardware for one warehouse and one shop with two doors each comes to roughly USD 13,000 to 20,000, before duty, VAT, installation and software. This is arithmetic on listed prices. See `solution_design.md`, Part 3.

## Production implementation summary

Full detail, prices and sources are in `solution_design.md`, Part 3.

| Component | Choice |
|---|---|
| Tags | Reusable UHF EPC Gen2 tags, fitted by the NGO at packing and removed at the shop before sale. Hang tags or cable-tie tags, because adhesive inlays and sew-in labels do not come off cleanly. The type is chosen by site test |
| Tag return | Removed tags travel back to the NGO. Every tag not returned is a cost, so tag return rate is worth tracking |
| Doors | One fixed reader with antenna zones on both sides of each dock door. The read order gives direction |
| Walk-in count | One or two handheld UHF readers per site |
| Back-end | The same state rules as the demo. Events stored in GS1 EPCIS 2.0 format. Separate from the shop ERP, with a daily ERP export for the ERP check |
| Regulation | ICASA exempts UHF RFID in 865 to 868 MHz and 915 to 920 MHz. Equipment needs ICASA type approval. Buy through a local distributor |
| Pilot | Site test first, then one warehouse and one shop on one route, with the manual count alongside until the variance meets the agreed limit |

### Tag cost comparison

Not on the dashboard (decision of 2026-10-17). Use this section if the audience asks about tag cost.

The cheaper option wins. Reusable clip-on tags are compared with single-use tags bought for every bag.

| Input | Default | Source |
|---|---|---|
| Bags per year | 52,000 (1,000 a week) | Assumption. Replace with the NGO's volume |
| Tag pool | 3,000 tags | Assumption: tags in circulation at once, including tags travelling back to the NGO |
| Clip-on loss or damage | 2% per cycle (20 tags per 1,000 bags) | User assumption |
| Clip-on tag price | No verified price | Needs a quote. The research found no volume price for cable-tie tags |
| Adhesive inlay price | USD 0.06 to 0.07 | atlasRFIDstore, see `solution_design.md` |
| Sew-in tag price | EUR 0.37 | rfid.it, see `solution_design.md` |
| Return cost per tag | Unknown | Handling and transport back to the NGO |

Cost per bag:

- Single-use: the tag price.
- Reusable: the pool cost divided by the bags over the period, plus 2% of the clip-on price, plus the return cost per tag.

Without the pool and return costs, clip-on tags are cheaper while their price stays below 50 times the single-use price. That gives USD 3.25 against inlays and EUR 18.50 against sew-in tags. The pool purchase and the return cost lower both limits.

Worked example with a clip-on price of USD 1.00, a placeholder and not a quote, and no return cost:

| Option | Year 1 | Each later year |
|---|---|---|
| Clip-on | 3,000 x 1.00 + 0.02 x 52,000 x 1.00 = USD 4,040 | USD 1,040 |
| Adhesive inlay at USD 0.065 | USD 3,380 | USD 3,380 |
| Sew-in tag at EUR 0.37 | EUR 19,240 | EUR 19,240 |

At this placeholder price, clip-on tags cost more than inlays in year 1 and less from year 2. They cost less than sew-in tags from the start. The real answer needs a clip-on quote, the NGO's volume and the return cost.

## Work remaining

1. Destroy the Fly.io app: `fly apps destroy bcg-bag-tracker`.
2. Download the new `bridge.py` on both reader laptops from the Cloudflare address, and restart the bridges with the key from `docker compose logs`.
3. Run the version 2 demo script on the hardware with the phone.
4. Present to the team.
5. After the demo: a more complicated version of this problem, then a related but different problem. The user gives the details later.

Done on 2026-10-17: version 1 (backend, bridge, app, animation review, hosted tests on Tailscale and Fly.io), and version 2 (six sites, products and bag IDs, the tag pool, mock stock, the simulated sweep, the dock and the new pages, the local container).

## Open questions

None at present.

## Working preferences

- British English spelling.
- Brief, direct explanations.
- The user is new to Arduino hardware. Explain physical steps concretely: which pin, which socket, which end of a wire.
- Claude Code cannot touch the hardware. Ask the user to tap tags, check LEDs or move wires, then read the serial output to confirm each step.
