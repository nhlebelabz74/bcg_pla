# Bag tracking with RFID: proof of concept

A BCG Platinion hackathon proof of concept. An NGO packs seed and fertiliser into tagged bags, trucks them to warehouses, then to shops. Today both sites close for half a day each week to count bags by hand. This system records every bag entering and leaving each site with RFID readers, and lets staff count any day with a handheld reader (the "gun") instead of closing.

The demo network has four warehouses (WH1 to WH4) and two shops (SHOP1, SHOP2). Six real tags move through it live on two RC522 readers; about 220 simulated bags fill the rest. Each fill of a tag is a bag with its own ID, such as `SEED-20-U1-93B73B38` (product, kg, use number, tag ID). A sold tag returns to the pool and is assigned a new product and size by need.

## What is in this folder

| Path | Content |
|---|---|
| `plan.md` | The full design: decision log, system design, pages, demo setup and demo script. Start here |
| `solution_design.md` | Insight catalogue, production hardware research with prices and sources, pilot plan |
| `tracker.py` | Backend: state rules, sites, products, tag pool, walk-in counts, insights, JSON API (Python standard library) |
| `mock_data.py` | The simulated network with backdated histories |
| `bridge.py` | Runs on each reader laptop: forwards scans from an Arduino Uno to the server |
| `maize_tracker/maize_tracker.ino` | Arduino sketch for up to two RC522 readers |
| `app/` | Next.js frontend: Overview, Warehouses, Shops, Tags, tag history and the phone control page |
| `Dockerfile`, `start.sh`, `docker-compose.yml` | One container with the backend and the frontend |
| `synthetic.json` | The weekly count accuracy trend (synthetic) |

## Run it

With Docker:

```
echo "CONTROL_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')" > .env
docker compose up -d --build
docker compose logs app | grep -i key
```

The app listens on `172.17.0.1:3010` (the Docker bridge, for a Cloudflare tunnel). To open it directly, change the `ports` line in `docker-compose.yml` to `"127.0.0.1:3010:3000"` and browse to `http://127.0.0.1:3010`. Open `/control?key=<key>` to drive the demo, or paste the key into the Unlock box on the Tags page.

Without Docker:

```
python3 tracker.py --bridge                         # API on port 8000; prints the key
cd app && npm install && npm run build && npx next start -p 3000
```

Without hardware, `POST /api/scan` with `{"reader": "R1", "uid": "..."}` and the key in `X-Control-Key` simulates a tap, and `python3 bridge.py --stdin --server http://127.0.0.1:3000 --key <key>` sends typed lines such as `SCAN,R1,93B73B38`.
