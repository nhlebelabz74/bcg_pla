"""Bag tracker: turns RFID scans into inventory events and serves a JSON API.

Two readers: R1 reads bags coming in and R2 reads bags going out. The phone's site
switch moves both readers between six sites: four warehouses and two shops.

Each fill of a tag is a bag cycle with a product and a size, shown as a bag ID such
as SEED-20-U1-93B73B38 (product, kg, use number, tag ID). A sold tag returns to the
tag pool, where it gets a new product and size before it is packed again.

Usage:
  python3 tracker.py --bridge        # live, lines arrive from bridge.py on the reader laptops
  python3 tracker.py --port COM7     # live, reads the Uno directly (single machine)
  python3 tracker.py                 # no hardware: type lines such as R1,04A1B2C3
  python3 tracker.py --summary       # print stock and anomalies, then exit

The Next.js app in app/ shows the pages and proxies /api/* to this server. Every
POST needs the control key. Live serial mode requires: pip install pyserial
"""

import argparse
import hmac
import json
import os
import random
import secrets
import socket
import sqlite3
import subprocess
import sys
import threading
import time
from collections import Counter
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import mock_data

DB_PATH = "inventory.db"
SYNTHETIC_PATH = Path(__file__).parent / "synthetic.json"
DEBOUNCE_S = 2.0       # ignore the same tag at the same reader within this window
BRIDGE_STALE_S = 15    # no contact from a bridge for this long shows it as offline
# Live taps run at demo scale (seconds); simulated bags run at production scale (hours).
TRIP_GAP_S = {False: 60, True: 3600}           # exits further apart start a new trip
OVERDUE_S = {False: 60, True: 36 * 3600}       # a bag in transit longer than this is flagged

READERS = {"R1": "IN", "R2": "OUT"}
SITES = {"WH1": "WAREHOUSE", "WH2": "WAREHOUSE", "WH3": "WAREHOUSE", "WH4": "WAREHOUSE",
         "SHOP1": "SHOP", "SHOP2": "SHOP"}
SITE_NAMES = {"WH1": "Warehouse 1", "WH2": "Warehouse 2", "WH3": "Warehouse 3",
              "WH4": "Warehouse 4", "SHOP1": "Shop 1", "SHOP2": "Shop 2"}
PACKING = "NGO"        # where an assigned tag waits to be packed onto a bag
PRODUCTS = {"SEED": "Seed", "FERT": "Fertiliser"}
SIZES = (5, 10, 15, 20)
STATES = ["ASSIGNED", "AT_WAREHOUSE", "IN_TRANSIT", "AT_SHOP", "SOLD", "MISSING"]
BOOK_STATE = {"WAREHOUSE": "AT_WAREHOUSE", "SHOP": "AT_SHOP"}
MOVEMENTS = ["WAREHOUSE_IN", "WAREHOUSE_OUT", "SHOP_IN", "SHOP_OUT"]

MOVES = {
    ("WAREHOUSE", "IN"): "WAREHOUSE_IN",
    ("WAREHOUSE", "OUT"): "WAREHOUSE_OUT",
    ("SHOP", "IN"): "SHOP_IN",
    ("SHOP", "OUT"): "SHOP_OUT",
}

# Where a scan puts the bag. The latest scan always decides where the bag is now.
NEW_STATE = {
    ("WAREHOUSE", "IN"): "AT_WAREHOUSE",
    ("WAREHOUSE", "OUT"): "IN_TRANSIT",
    ("SHOP", "IN"): "AT_SHOP",
    ("SHOP", "OUT"): "SOLD",
}

# The expected flow. Every other (facility, direction, current state) is an anomaly.
EXPECTED = {
    ("WAREHOUSE", "IN", "ASSIGNED"),    # a packed bag arrives
    ("WAREHOUSE", "IN", "IN_TRANSIT"),  # returned before delivery
    ("WAREHOUSE", "OUT", "AT_WAREHOUSE"),
    ("SHOP", "IN", "IN_TRANSIT"),
    ("SHOP", "OUT", "AT_SHOP"),
}

# An assigned tag has not been through a warehouse yet, so its notes match an unknown tag's.
ANOMALY_NOTES = {
    ("WAREHOUSE", "IN", None): "unknown tag entered warehouse: no product assigned",
    ("WAREHOUSE", "IN", "SOLD"): "reused tag entered warehouse without a new product assigned",
    ("WAREHOUSE", "IN", "AT_WAREHOUSE"): "entered warehouse twice without an exit read",
    ("WAREHOUSE", "IN", "AT_SHOP"): "entered warehouse while recorded at shop",
    ("WAREHOUSE", "OUT", None): "left warehouse without an entry read",
    ("WAREHOUSE", "OUT", "IN_TRANSIT"): "left warehouse twice without an entry read",
    ("WAREHOUSE", "OUT", "AT_SHOP"): "left warehouse while recorded at shop",
    ("WAREHOUSE", "OUT", "SOLD"): "left warehouse after sale without an entry read",
    ("SHOP", "IN", None): "arrived at shop but never received at a warehouse",
    ("SHOP", "IN", "AT_WAREHOUSE"): "arrived at shop without a dispatch read",
    ("SHOP", "IN", "AT_SHOP"): "entered shop twice without an exit read",
    ("SHOP", "IN", "SOLD"): "entered shop after sale",
    ("SHOP", "OUT", None): "left shop but never seen before",
    ("SHOP", "OUT", "AT_WAREHOUSE"): "left shop without dispatch or arrival reads",
    ("SHOP", "OUT", "IN_TRANSIT"): "left shop without an arrival read",
    ("SHOP", "OUT", "SOLD"): "left shop twice without an entry read",
}
MISSING_SEEN_NOTE = "missing bag seen again"
COUNT_FOUND_NOTE = "found at walk-in count"
COUNT_MISSING_NOTE = "not found at walk-in count"

FINDINGS = {
    "WAREHOUSE_IN": "seen entering",
    "WAREHOUSE_OUT": "seen leaving",
    "SHOP_IN": "seen entering",
    "SHOP_OUT": "seen leaving (sold) at",
    "COUNT_FOUND": "found at a walk-in count at",
}

OUTCOMES = {
    "ALL_AGREE": "All sources agree",
    "ERP_WRONG": "ERP differs from the count by {n}. Correct the ERP",
    "DOORS_MISSED": "Door reads missed. RFID corrected from the count",
    "NEITHER": "Count matches neither source. RFID corrected from the count",
    "RFID_MATCH": "Count matches RFID",
    "RFID_DIFFERS": "Count differs from RFID. RFID corrected from the count",
}


def now_ts(age=0.0):
    return (datetime.now() - timedelta(seconds=age)).isoformat(timespec="seconds")


def seconds_between(a, b):
    return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds()


def bag_id(product, kg, cycle, uid):
    """The full bag ID: product, size in kg, use number of the tag, tag ID."""
    return f"{product or 'NONE'}-{kg or 0:02d}-U{cycle}-{uid}"


def open_db(path):
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS bags (
            uid TEXT PRIMARY KEY,
            cycle INTEGER NOT NULL,
            product TEXT,
            kg INTEGER,
            state TEXT NOT NULL,
            site TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            simulated INTEGER NOT NULL DEFAULT 0,
            actual_site TEXT
        );
        CREATE TABLE IF NOT EXISTS cycles (
            uid TEXT NOT NULL,
            cycle INTEGER NOT NULL,
            product TEXT,
            kg INTEGER,
            assigned_at TEXT NOT NULL,
            source TEXT NOT NULL,
            PRIMARY KEY (uid, cycle)
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            uid TEXT NOT NULL,
            cycle INTEGER NOT NULL,
            site TEXT NOT NULL,
            reader TEXT NOT NULL,
            event TEXT NOT NULL,
            state_before TEXT,
            state_after TEXT NOT NULL,
            note TEXT
        );
        CREATE INDEX IF NOT EXISTS events_uid ON events (uid, id);
        CREATE TABLE IF NOT EXISTS counts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT NOT NULL,
            rfid_book INTEGER NOT NULL,
            erp_book INTEGER,
            counted INTEGER NOT NULL,
            seen TEXT NOT NULL,
            missing TEXT NOT NULL,
            found TEXT NOT NULL,
            outcome TEXT NOT NULL,
            flag TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS investigations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            cycle INTEGER NOT NULL,
            site TEXT NOT NULL,
            count_id INTEGER NOT NULL,
            opened_at TEXT NOT NULL,
            status TEXT NOT NULL,
            closed_at TEXT,
            resolution TEXT,
            event_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS erp_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            site TEXT NOT NULL,
            kind TEXT NOT NULL,
            source TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )
    columns = {r["name"] for r in con.execute("PRAGMA table_info(bags)")}
    if "product" not in columns:
        sys.exit(f"{path} uses an old schema. Rename or delete it and run again.")
    return con


def load_synthetic(path):
    """The synthetic weekly count trend, with week offsets turned into dates."""
    try:
        raw = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None
    today = date.today()
    for row in raw["weekly_counts"]["weeks"]:
        start = today + timedelta(weeks=row.pop("week_offset"))
        row["week_start"] = (start - timedelta(days=start.weekday())).isoformat()
        row["variance_pct"] = round(100 * abs(row["book"] - row["counted"]) / row["book"], 2)
    return raw


class Tracker:
    def __init__(self, db_path, debounce, synthetic_path=SYNTHETIC_PATH, new_key=False):
        self.con = open_db(db_path)
        self.lock = threading.RLock()
        self.debounce = debounce
        self.synthetic_path = synthetic_path
        self.last_seen = {}    # (reader, uid) -> monotonic time of last accepted scan
        self.reader_last = {}  # reader -> timestamp of last scan
        self.count = None      # {"site", "started", "seen"} while a walk-in count runs
        self.bridges = {}      # bridge session -> {"host", "port", "last"}
        self.bridge_seq = {}   # bridge session -> highest line number processed
        site = self._setting("site")
        self.site = site if site in SITES else "WH1"
        self.key = self._setting("control_key")
        if os.environ.get("CONTROL_KEY"):  # a hosted server sets its key as a secret
            self.key = os.environ["CONTROL_KEY"]
            self._set_setting("control_key", self.key)
        elif not self.key or new_key:
            self.key = secrets.token_urlsafe(9)
            self._set_setting("control_key", self.key)
        if self.con.execute("SELECT COUNT(*) FROM bags").fetchone()[0] == 0:
            with self.lock:
                self._seed()

    # Settings

    def _setting(self, key, default=None):
        row = self.con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def _set_setting(self, key, value):
        self.con.execute("INSERT INTO settings (key, value) VALUES (?, ?) "
                         "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))
        self.con.commit()

    def check_key(self, key):
        return bool(key) and hmac.compare_digest(str(key), self.key)

    # Demo network

    def _seed(self):
        """The simulated network, plus the four physical tags as bags in stock at SHOP1.

        The real tags' short history (assigned, through WH1, delivered to SHOP1) sits in the
        half hour before the seed, at demo scale, so live times stay in minutes.
        """
        now = datetime.now()
        shop = mock_data.REAL_START
        for i, (uid, product, kg) in enumerate(mock_data.REAL_TAGS):
            at = lambda minutes: (now - timedelta(minutes=minutes) + timedelta(seconds=20 * i)).isoformat(timespec="seconds")
            self.con.execute("INSERT INTO cycles VALUES (?, 1, ?, ?, ?, 'initial')", (uid, product, kg, at(30)))
            steps = [(at(30), PACKING, "TAGS", "TAG_ASSIGNED", "SOLD", "ASSIGNED"),
                     (at(25), "WH1", "R1", "WAREHOUSE_IN", "ASSIGNED", "AT_WAREHOUSE"),
                     (at(20), "WH1", "R2", "WAREHOUSE_OUT", "AT_WAREHOUSE", "IN_TRANSIT"),
                     (at(14), shop, "R1", "SHOP_IN", "IN_TRANSIT", "AT_SHOP")]
            for ts, site, reader, kind, before, after in steps:
                self.con.execute(
                    "INSERT INTO events (ts, uid, cycle, site, reader, event, state_before, state_after, note) "
                    "VALUES (?, ?, 1, ?, ?, ?, ?, ?, NULL)", (ts, uid, site, reader, kind, before, after))
            self.con.execute("INSERT INTO erp_entries (ts, site, kind, source) VALUES (?, ?, 'CHECK_IN', 'auto')",
                             (at(14), shop))
            self.con.execute(
                "INSERT INTO bags (uid, cycle, product, kg, state, site, updated_at) VALUES (?, 1, ?, ?, 'AT_SHOP', ?, ?)",
                (uid, product, kg, shop, at(14)))
        bags, cycles, events, erp, counts = mock_data.build(now, [t[0] for t in mock_data.REAL_TAGS])
        self.con.executemany(
            "INSERT INTO bags (uid, cycle, product, kg, state, site, updated_at, simulated, actual_site) "
            "VALUES (:uid, :cycle, :product, :kg, :state, :site, :updated_at, 1, :actual_site)", bags)
        self.con.executemany(
            "INSERT INTO cycles VALUES (:uid, :cycle, :product, :kg, :assigned_at, :source)", cycles)
        self.con.executemany(
            "INSERT INTO events (ts, uid, cycle, site, reader, event, state_before, state_after, note) "
            "VALUES (:ts, :uid, :cycle, :site, :reader, :event, :state_before, :state_after, :note)", events)
        self.con.executemany("INSERT INTO erp_entries (ts, site, kind, source) "
                             "VALUES (:ts, :site, :kind, :source)", erp)
        for c in counts:
            self.con.execute(
                "INSERT INTO counts (site, started_at, ended_at, rfid_book, erp_book, counted, seen, "
                "missing, found, outcome, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (c["site"], c["started_at"], c["ended_at"], c["rfid_book"], c["erp_book"], c["counted"],
                 json.dumps(c["seen"]), json.dumps(c["missing"]), json.dumps(c["found"]),
                 c["outcome"], c["flag"]))
        self.con.commit()
        print(f"Demo network seeded: {len(bags)} simulated bags and {len(mock_data.REAL_TAGS)} real tags")

    def reset(self):
        with self.lock:
            self.con.executescript(
                "DELETE FROM events; DELETE FROM bags; DELETE FROM cycles; DELETE FROM counts; "
                "DELETE FROM investigations; DELETE FROM erp_entries; DELETE FROM sqlite_sequence; "
                "DELETE FROM settings WHERE key = 'erp_skip_next';")
            self.last_seen.clear()
            self.reader_last.clear()
            self.count = None
            self._seed()
        print("Demo data cleared and the network restored")

    # Scans

    def scan(self, reader, uid, age=0.0):
        direction = READERS.get(reader)
        if direction is None or not uid:
            return
        seen_at = time.monotonic() - age
        with self.lock:
            last = self.last_seen.get((reader, uid))
            if self.debounce and last is not None and abs(seen_at - last) < self.debounce:
                return
            self.last_seen[(reader, uid)] = seen_at
            ts = now_ts(age)
            self.reader_last[reader] = ts
            if self.count is not None:
                self.count["seen"].add(uid)
                print(f"{ts}  {uid:<16} counted at {self.count['site']}")
                return
            self._record(ts, reader, direction, uid)

    def _bag(self, uid):
        return self.con.execute("SELECT * FROM bags WHERE uid = ?", (uid,)).fetchone()

    def _new_cycle(self, uid, cycle, product, kg, ts, source):
        self.con.execute("INSERT OR REPLACE INTO cycles VALUES (?, ?, ?, ?, ?, ?)",
                         (uid, cycle, product, kg, ts, source))

    def _write(self, ts, uid, cycle, product, kg, site, reader, event, before, after, note):
        cur = self.con.execute(
            "INSERT INTO events (ts, uid, cycle, site, reader, event, state_before, state_after, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ts, uid, cycle, site, reader, event, before, after, note))
        self.con.execute(
            "INSERT INTO bags (uid, cycle, product, kg, state, site, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(uid) DO UPDATE SET cycle = excluded.cycle, product = excluded.product, "
            "kg = excluded.kg, state = excluded.state, site = excluded.site, updated_at = excluded.updated_at",
            (uid, cycle, product, kg, after, site, ts))
        line = f"{ts}  {bag_id(product, kg, cycle, uid):<22} {site:<6} {event:<14} -> {after}"
        print(line + (f"   [ANOMALY: {note}]" if note else ""))
        return cur.lastrowid

    def _close_investigations(self, uid, ts, event, site, event_id):
        finding = f"{FINDINGS.get(event, event)} {site}"
        self.con.execute(
            "UPDATE investigations SET status = 'closed', closed_at = ?, resolution = ?, event_id = ? "
            "WHERE uid = ? AND status = 'open'", (ts, finding, event_id, uid))

    def _identity_for_entry(self, uid, row, ts):
        """Cycle, product and kg for a tag entering a warehouse, opening a new cycle if needed."""
        if row is None:
            self._new_cycle(uid, 1, None, None, ts, "unassigned")
            return 1, None, None
        if row["state"] == "SOLD":
            cycle = row["cycle"] + 1
            self._new_cycle(uid, cycle, None, None, ts, "unassigned")
            return cycle, None, None
        return row["cycle"], row["product"], row["kg"]

    def _record(self, ts, reader, direction, uid):
        facility = SITES[self.site]
        row = self._bag(uid)
        current = row["state"] if row else None
        if (facility, direction) == ("WAREHOUSE", "IN"):
            cycle, product, kg = self._identity_for_entry(uid, row, ts)
        elif row is None:
            cycle, product, kg = 1, None, None
            self._new_cycle(uid, 1, None, None, ts, "unassigned")
        else:
            cycle, product, kg = row["cycle"], row["product"], row["kg"]
        event = MOVES[(facility, direction)]
        new_state = NEW_STATE[(facility, direction)]
        if current == "MISSING":
            note = MISSING_SEEN_NOTE
        elif current == "SOLD" and row["cycle"] == 0:  # a new tag straight from the pool
            note = ANOMALY_NOTES[(facility, direction, None)]
        elif (facility, direction, current) in EXPECTED:
            note = None
        else:
            note = ANOMALY_NOTES[(facility, direction, None if current == "ASSIGNED" else current)]

        event_id = self._write(ts, uid, cycle, product, kg, self.site, reader, event, current, new_state, note)
        if current == "MISSING":
            self._close_investigations(uid, ts, event, self.site, event_id)
        if event == "SHOP_IN":
            if self._setting("erp_skip_next") == "1":
                self._set_setting("erp_skip_next", "0")
                print(f"{ts}  Simulated ERP at {self.site}: booking skipped")
            else:
                self._erp(ts, self.site, "CHECK_IN", "auto")
        elif event == "SHOP_OUT":
            self._erp(ts, self.site, "SALE", "auto")
        self.con.commit()

    # Simulated ERP, one per shop

    def _erp(self, ts, site, kind, source):
        self.con.execute("INSERT INTO erp_entries (ts, site, kind, source) VALUES (?, ?, ?, ?)",
                         (ts, site, kind, source))

    def _shop(self):
        if SITES[self.site] != "SHOP":
            raise ValueError("switch to a shop first")
        return self.site

    def erp_book_in(self):
        with self.lock:
            shop = self._shop()
            self._erp(now_ts(), shop, "CHECK_IN", "manual")
            self.con.commit()
        print(f"Simulated ERP at {shop}: manual check-in with no door read")

    def erp_skip_next(self):
        with self.lock:
            self._shop()
            self._set_setting("erp_skip_next", "1")
        print("Simulated ERP: the next shop arrival will not be booked")

    def _erp_book(self, shop):
        rows = dict(self.con.execute("SELECT kind, COUNT(*) FROM erp_entries WHERE site = ? GROUP BY kind",
                                     (shop,)).fetchall())
        return rows.get("CHECK_IN", 0) - rows.get("SALE", 0)

    # Site and walk-in counts

    def set_site(self, site):
        if site not in SITES:
            raise ValueError("unknown site")
        with self.lock:
            if self.count is not None:
                raise ValueError("end the count before switching site")
            self.site = site
            self._set_setting("site", site)
        print(f"Site switched to {site}")

    def start_count(self):
        with self.lock:
            if self.count is None:
                self.count = {"site": self.site, "started": now_ts(), "seen": set()}
        print(f"Count started at {self.site}")

    def sweep(self):
        """Simulated gun sweep: adds every simulated bag physically at the count's site."""
        with self.lock:
            if self.count is None:
                raise ValueError("start a count first")
            rows = self.con.execute("SELECT uid FROM bags WHERE simulated = 1 AND actual_site = ?",
                                    (self.count["site"],)).fetchall()
            self.count["seen"].update(r["uid"] for r in rows)
        print(f"Simulated sweep at {self.count['site']}: {len(rows)} bags read")
        return len(rows)

    def cancel_count(self):
        with self.lock:
            self.count = None
        print("Count cancelled")

    def end_count(self):
        with self.lock:
            c = self.count
            if c is None:
                raise ValueError("no count running")
            self.count = None
            site, seen, ended = c["site"], c["seen"], now_ts()
            facility = SITES[site]
            book = self._book(site)
            missing = sorted(book - seen)
            found = sorted(seen - book)
            rfid_match = not missing and not found
            erp_book = self._erp_book(site) if facility == "SHOP" else None
            if facility == "SHOP":
                erp_match = len(seen) == erp_book
                outcome = ("ALL_AGREE" if rfid_match and erp_match else "ERP_WRONG" if rfid_match
                           else "DOORS_MISSED" if erp_match else "NEITHER")
            else:
                outcome = "RFID_MATCH" if rfid_match else "RFID_DIFFERS"
            flag = OUTCOMES[outcome].format(n=abs(len(seen) - (erp_book or 0)))

            cur = self.con.execute(
                "INSERT INTO counts (site, started_at, ended_at, rfid_book, erp_book, counted, seen, "
                "missing, found, outcome, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (site, c["started"], ended, len(book), erp_book, len(seen), json.dumps(sorted(seen)),
                 json.dumps(missing), json.dumps(found), outcome, flag))
            count_id = cur.lastrowid

            # The count is the source of truth for RFID stock. Corrections are new events.
            here = BOOK_STATE[facility]
            for uid in found:
                row = self._bag(uid)
                before = row["state"] if row else None
                if facility == "WAREHOUSE":
                    cycle, product, kg = self._identity_for_entry(uid, row, ended)
                elif row is None:
                    cycle, product, kg = 1, None, None
                    self._new_cycle(uid, 1, None, None, ended, "unassigned")
                else:
                    cycle, product, kg = row["cycle"], row["product"], row["kg"]
                event_id = self._write(ended, uid, cycle, product, kg, site, "COUNT", "COUNT_FOUND",
                                       before, here, COUNT_FOUND_NOTE)
                if before == "MISSING":
                    self._close_investigations(uid, ended, "COUNT_FOUND", site, event_id)
            for uid in missing:
                row = self._bag(uid)
                self._write(ended, uid, row["cycle"], row["product"], row["kg"], site, "COUNT",
                            "COUNT_MISSING", row["state"], "MISSING", COUNT_MISSING_NOTE)
                self.con.execute(
                    "INSERT INTO investigations (uid, cycle, site, count_id, opened_at, status) "
                    "VALUES (?, ?, ?, ?, ?, 'open')", (uid, row["cycle"], site, count_id, ended))
            self.con.commit()
            result = self._counts(count_id=count_id)[0]
        print(f"Count ended at {site}: RFID book {len(book)}, ERP book {erp_book}, counted {len(seen)}, "
              f"missing {len(missing)}, found {len(found)}. {flag}")
        return result

    def close_investigation(self, inv_id, resolution):
        resolution = str(resolution or "").strip()
        if not resolution:
            raise ValueError("a resolution note is required")
        with self.lock:
            cur = self.con.execute(
                "UPDATE investigations SET status = 'closed', closed_at = ?, resolution = ? "
                "WHERE id = ? AND status = 'open'", (now_ts(), resolution[:200], inv_id))
            self.con.commit()
            if cur.rowcount == 0:
                raise ValueError("no open investigation with that id")
        print(f"Investigation {inv_id} closed by hand: {resolution}")

    # Tag pool and reuse

    def assign(self, orders=None, tags=None):
        """Gives pool tags a new product and size, one new cycle each.

        orders: [{"product", "kg", "qty"}], tags picked from the pool at random.
        tags:   [{"uid", "product", "kg"}], one named pool tag each.
        """
        def check(product, kg):
            if product not in PRODUCTS or kg not in SIZES:
                raise ValueError("choose a product (SEED or FERT) and a size (5, 10, 15 or 20)")

        clean, named = [], []
        for o in orders or []:
            product, kg, qty = str(o.get("product", "")).upper(), int(o.get("kg", 0)), int(o.get("qty", 0))
            check(product, kg)
            if not 1 <= qty <= 100:
                raise ValueError("each order line needs a quantity from 1 to 100")
            clean.append((product, kg, qty))
        for t in tags or []:
            product, kg = str(t.get("product", "")).upper(), int(t.get("kg", 0))
            check(product, kg)
            named.append((str(t.get("uid", "")).upper(), product, kg))
        if not clean and not named:
            raise ValueError("the order is empty")
        assigned, short = [], 0
        with self.lock:
            rows = self.con.execute("SELECT uid, simulated FROM bags WHERE state = 'SOLD' ORDER BY updated_at").fetchall()
            pool = [r["uid"] for r in rows]
            for uid, _, _ in named:
                if uid not in pool:
                    raise ValueError(f"tag {uid} is not in the pool")
            taken = {n[0] for n in named}
            # Demo rule: real tags back from the shops are used first, so the audience sees them
            # get new identities. The simulated pool fills the rest at random.
            real = [r["uid"] for r in rows if not r["simulated"] and r["uid"] not in taken]
            simulated = [r["uid"] for r in rows if r["simulated"] and r["uid"] not in taken]
            random.SystemRandom().shuffle(simulated)
            pool = simulated + real[::-1]  # pop() takes from the end: real tags first, oldest first
            picks = list(named)
            for product, kg, qty in clean:
                for _ in range(qty):
                    if pool:
                        picks.append((pool.pop(), product, kg))
                    else:
                        short += 1
            ts = now_ts()
            for uid, product, kg in picks:
                cycle = self._bag(uid)["cycle"] + 1
                self._new_cycle(uid, cycle, product, kg, ts, "assignment")
                self._write(ts, uid, cycle, product, kg, PACKING, "TAGS", "TAG_ASSIGNED", "SOLD", "ASSIGNED", None)
                assigned.append({"uid": uid, "id": bag_id(product, kg, cycle, uid)})
            self.con.commit()
        print(f"Assigned {len(assigned)} tags from the pool" + (f", {short} short" if short else ""))
        return {"assigned": assigned, "short": short}

    def identify(self, uid, product, kg):
        """Names the product of a bag that entered without one. Its cycle stays the same."""
        product, kg = str(product or "").upper(), int(kg or 0)
        if product not in PRODUCTS or kg not in SIZES:
            raise ValueError("choose a product and a size")
        with self.lock:
            row = self._bag(str(uid).upper())
            if row is None or row["product"]:
                raise ValueError("only a bag without a product can be named")
            self.con.execute("UPDATE bags SET product = ?, kg = ? WHERE uid = ?", (product, kg, row["uid"]))
            self.con.execute("UPDATE cycles SET product = ?, kg = ?, source = 'named' WHERE uid = ? AND cycle = ?",
                             (product, kg, row["uid"], row["cycle"]))
            self.con.commit()
        print(f"Bag {row['uid']} named {bag_id(product, kg, row['cycle'], row['uid'])}")

    # Lines from the Uno, directly or through bridge.py

    def handle_line(self, line, age=0.0):
        parts = line.strip().split(",")
        if parts[0] == "INFO":
            print("reader:", ",".join(parts[1:]))
            if len(parts) == 3 and parts[1] in READERS:
                with self.lock:
                    self._set_setting(f"reader_{parts[1]}", parts[2])
            return
        if parts[0] == "SCAN" and len(parts) == 3:
            self.scan(parts[1].strip().upper(), parts[2].strip().upper(), age)

    def bridge_lines(self, body):
        """Lines from bridge.py. Each carries a sequence number, so a resend is never applied twice."""
        session = str(body.get("session", ""))
        with self.lock:
            self.bridges[session] = {"host": body.get("host"), "port": body.get("port"), "last": now_ts()}
            done = self.bridge_seq.get(session, 0)
        for item in body.get("lines", []):
            seq = int(item.get("seq", 0))
            if seq <= done:
                continue
            age = min(max(float(item.get("age", 0)), 0.0), 86400.0)
            self.handle_line(str(item.get("line", "")), age)
            done = seq
            with self.lock:
                self.bridge_seq[session] = done
        return {"ack": done}

    # Read models

    def _book(self, site):
        state = BOOK_STATE[SITES[site]]
        rows = self.con.execute("SELECT uid FROM bags WHERE state = ? AND site = ?", (state, site))
        return {r["uid"] for r in rows}

    def _counts(self, site=None, count_id=None):
        sql, args = "SELECT * FROM counts WHERE 1 = 1", []
        if site:
            sql, args = sql + " AND site = ?", args + [site]
        if count_id:
            sql, args = sql + " AND id = ?", args + [count_id]
        rows = self.con.execute(sql + " ORDER BY id DESC", args).fetchall()
        return [dict(r, seen=json.loads(r["seen"]), missing=json.loads(r["missing"]),
                     found=json.loads(r["found"])) for r in rows]

    def _identities(self):
        return {(r["uid"], r["cycle"]): (r["product"], r["kg"])
                for r in self.con.execute("SELECT uid, cycle, product, kg FROM cycles")}

    def _bag_info(self, uids):
        """Details for the bags a page shows, for its hover cards."""
        uids = sorted(set(uids))
        info = {}
        for i in range(0, len(uids), 500):
            chunk = uids[i:i + 500]
            marks = ",".join("?" * len(chunk))
            for r in self.con.execute(f"SELECT * FROM bags WHERE uid IN ({marks})", chunk):
                info[r["uid"]] = {"id": bag_id(r["product"], r["kg"], r["cycle"], r["uid"]),
                                  "product": r["product"], "kg": r["kg"], "cycle": r["cycle"],
                                  "state": r["state"], "site": r["site"], "since": r["updated_at"],
                                  "simulated": bool(r["simulated"])}
        return info

    def _with_ids(self, rows, ids):
        for r in rows:
            product, kg = ids.get((r["uid"], r["cycle"]), (None, None))
            r["bag"] = bag_id(product, kg, r["cycle"], r["uid"])
        return rows

    def _investigations(self, site=None):
        sql = "SELECT * FROM investigations" + (" WHERE site = ?" if site else "") + " ORDER BY status DESC, id DESC"
        return [dict(r) for r in self.con.execute(sql, (site,) if site else ())]

    def _readers(self):
        now = now_ts()
        seen = sorted(self.bridges.values(), key=lambda b: b["last"], reverse=True)
        live = [b for b in seen if seconds_between(b["last"], now) <= BRIDGE_STALE_S] or seen[:1]
        bridge = None
        if live:
            age = seconds_between(live[0]["last"], now)
            bridge = {"host": " + ".join(str(b["host"]) for b in live),
                      "port": " + ".join(str(b["port"]) for b in live),
                      "last": live[0]["last"], "seconds": age, "online": age <= BRIDGE_STALE_S}
        return {
            "bridge": bridge,
            "readers": {r: {"direction": d, "info": self._setting(f"reader_{r}"),
                            "last_scan": self.reader_last.get(r)} for r, d in READERS.items()},
        }

    def _sites(self):
        books = Counter((r["site"], r["state"]) for r in self.con.execute("SELECT site, state FROM bags"))
        return [{"id": s, "name": SITE_NAMES[s], "facility": f, "book": books[(s, BOOK_STATE[f])]}
                for s, f in SITES.items()]

    def _site_stock(self, site):
        state = BOOK_STATE[SITES[site]]
        rows = self.con.execute("SELECT product, kg, COUNT(*) AS n FROM bags WHERE site = ? AND state = ? "
                                "GROUP BY product, kg ORDER BY product, kg", (site, state))
        return [{"product": r["product"], "kg": r["kg"], "bags": r["n"]} for r in rows]

    def state(self, authorised=False):
        with self.lock:
            ids = self._identities()
            recent = self._with_ids([dict(r) for r in self.con.execute(
                "SELECT id, ts, uid, cycle, site, reader, event, state_after, note FROM events "
                "WHERE reader != 'TAGS' ORDER BY id DESC LIMIT 15")], ids)
            count = None
            if self.count is not None:
                count = {"site": self.count["site"], "started": self.count["started"],
                         "seen": sorted(self.count["seen"])}
            last_count = next(iter(self._counts(site=self.site)), None)
            investigations = [i for i in self._investigations() if i["status"] == "open"]
            uids = [e["uid"] for e in recent] + [i["uid"] for i in investigations]
            uids += (count["seen"] if count else [])[:400]
            shop = self.site if SITES[self.site] == "SHOP" else None
            return {
                "authorised": authorised,
                "site": self.site,
                "sites": self._sites(),
                "book": len(self._book(self.site)),
                "site_stock": self._site_stock(self.site),
                "recent": recent,
                "count": count,
                "last_count": last_count,
                "investigations": self._with_ids(investigations, ids),
                "erp": ({"book": self._erp_book(shop), "skip_next": self._setting("erp_skip_next") == "1",
                         **self._erp_day(shop, date.today().isoformat())} if shop else None),
                "simulated_here": self.con.execute(
                    "SELECT COUNT(*) FROM bags WHERE simulated = 1 AND actual_site = ?", (self.site,)
                ).fetchone()[0],
                "bags": self._bag_info(uids),
                **self._readers(),
            }

    def _erp_day(self, shop, day):
        erp = dict(self.con.execute(
            "SELECT kind, COUNT(*) FROM erp_entries WHERE site = ? AND substr(ts, 1, 10) = ? GROUP BY kind",
            (shop, day)).fetchall())
        rfid_in = self.con.execute(
            "SELECT COUNT(*) FROM events WHERE event = 'SHOP_IN' AND site = ? AND substr(ts, 1, 10) = ?",
            (shop, day)).fetchone()[0]
        return {"date": day, "erp_check_ins": erp.get("CHECK_IN", 0), "erp_sales": erp.get("SALE", 0),
                "rfid_shop_in": rfid_in}

    def tags(self):
        """The tag pool, tags waiting to be packed, bags without a product, and recent demand."""
        with self.lock:
            ids = self._identities()
            rows = [dict(r) for r in self.con.execute("SELECT * FROM bags ORDER BY updated_at DESC")]
            week_ago = (datetime.now() - timedelta(days=7)).isoformat(timespec="seconds")
            sales = self.con.execute("SELECT uid, cycle FROM events WHERE event = 'SHOP_OUT' AND ts >= ?",
                                     (week_ago,)).fetchall()
            assignments = self._with_ids([dict(r) for r in self.con.execute(
                "SELECT e.ts, e.uid, e.cycle, b.cycle AS now_cycle, b.state AS now_state, b.site AS now_site, "
                "b.simulated FROM events e JOIN bags b USING (uid) WHERE e.event = 'TAG_ASSIGNED' "
                "ORDER BY e.id DESC LIMIT 50")], ids)
        demand = Counter(ids.get((s["uid"], s["cycle"]), (None, None)) for s in sales)

        def entry(r):
            return {"uid": r["uid"], "id": bag_id(r["product"], r["kg"], r["cycle"], r["uid"]),
                    "product": r["product"], "kg": r["kg"], "cycle": r["cycle"], "state": r["state"],
                    "site": r["site"], "since": r["updated_at"], "simulated": bool(r["simulated"])}

        pool = sorted((r for r in rows if r["state"] == "SOLD"), key=lambda r: r["simulated"])
        return {
            "pool": [entry(r) for r in pool],
            "assigned": [entry(r) for r in rows if r["state"] == "ASSIGNED"],
            "unnamed": [entry(r) for r in rows if r["product"] is None and r["state"] != "SOLD"],
            "uses": dict(Counter(r["cycle"] for r in rows if r["cycle"] > 0)),
            "demand": [{"product": p, "kg": k, "sold": n}
                       for (p, k), n in sorted(demand.items(), key=lambda x: -x[1]) if p],
            "recent_assignments": assignments,
            "products": PRODUCTS,
            "sizes": SIZES,
        }

    def tag_history(self, uid):
        """Every use of one tag: its product and size, and each step of that bag's travel."""
        uid = str(uid or "").strip().upper()
        with self.lock:
            bag = self._bag(uid)
            if bag is None:
                raise ValueError(f"no tag {uid} has been seen")
            cycles = {r["cycle"]: dict(r) for r in self.con.execute(
                "SELECT * FROM cycles WHERE uid = ? ORDER BY cycle", (uid,))}
            events = [dict(r) for r in self.con.execute(
                "SELECT id, ts, cycle, site, reader, event, state_before, state_after, note FROM events "
                "WHERE uid = ? ORDER BY ts, id", (uid,))]
        uses = []
        for n in sorted(set(cycles) | {e["cycle"] for e in events}, reverse=True):
            c = cycles.get(n, {})
            steps = [e for e in events if e["cycle"] == n]
            uses.append({
                "cycle": n,
                "id": bag_id(c.get("product"), c.get("kg"), n, uid),
                "product": c.get("product"),
                "kg": c.get("kg"),
                "assigned_at": c.get("assigned_at"),
                "source": c.get("source"),
                "steps": steps,
                "current": n == bag["cycle"],
            })
        return {"uid": uid, "simulated": bool(bag["simulated"]), "state": bag["state"], "site": bag["site"],
                "since": bag["updated_at"], "cycle": bag["cycle"],
                "id": bag_id(bag["product"], bag["kg"], bag["cycle"], uid), "uses": uses}

    def insights(self, site=None):
        """Every insight, for the whole network or for one site."""
        if site is not None and site not in SITES:
            raise ValueError("unknown site")
        with self.lock:
            ids = self._identities()
            events = [dict(r) for r in self.con.execute(
                "SELECT e.*, b.simulated FROM events e JOIN bags b USING (uid) "
                "WHERE e.reader != 'TAGS' ORDER BY e.ts, e.id")]
            bags = [dict(r) for r in self.con.execute("SELECT * FROM bags")]
            counts = self._counts(site=site)
            investigations = self._investigations(site)
            erp_rows = [dict(r) for r in self.con.execute("SELECT ts, site, kind FROM erp_entries")]
            readers = self._readers()
        self._with_ids(events, ids)
        self._with_ids(investigations, ids)
        synthetic = load_synthetic(self.synthetic_path)
        now = now_ts()
        sim = {b["uid"]: bool(b["simulated"]) for b in bags}

        # A stay is one unbroken period in one state, from the event that started it to
        # the event that ended it (None while the bag is still in that state).
        stays, open_stays = [], {}
        for e in events:
            if e["state_before"] == e["state_after"]:
                continue
            if e["uid"] in open_stays:
                state, start = open_stays.pop(e["uid"])
                stays.append((state, start, e))
            open_stays[e["uid"]] = (e["state_after"], e)
        stays += [(state, start, None) for state, start in open_stays.values()]

        def at(*places):
            """True when the request covers the whole network or one of these places."""
            return site is None or site in places

        def stats(values):
            if not values:
                return {"n": 0}
            return {"n": len(values), "avg": sum(values) / len(values), "min": min(values), "max": max(values)}

        def durations(state, start_event, end_event, simulated):
            return [seconds_between(s["ts"], e["ts"]) for st, s, e in stays
                    if st == state and s["event"] == start_event and e and e["event"] == end_event
                    and sim[s["uid"]] == simulated and at(s["site"]) | at(e["site"])]

        by_cycle = {}
        for e in events:
            by_cycle.setdefault((e["uid"], e["cycle"]), []).append(e)
        end_to_end = {True: [], False: []}
        for (uid, _), evs in by_cycle.items():
            first_in = next((e for e in evs if e["event"] == "WAREHOUSE_IN"), None)
            sale = next((e for e in evs if e["event"] == "SHOP_OUT"), None)
            if first_in and sale and (at(first_in["site"]) or at(sale["site"])):
                end_to_end[sim[uid]].append(seconds_between(first_in["ts"], sale["ts"]))

        times = {}
        for simulated, key in ((False, "live"), (True, "simulated")):
            times[key] = {
                "warehouse_dwell": stats(durations("AT_WAREHOUSE", "WAREHOUSE_IN", "WAREHOUSE_OUT", simulated)),
                "transit": stats(durations("IN_TRANSIT", "WAREHOUSE_OUT", "SHOP_IN", simulated)),
                "shop_dwell": stats(durations("AT_SHOP", "SHOP_IN", "SHOP_OUT", simulated)),
                "end_to_end": stats(end_to_end[simulated]),
            }

        sold_cycles = [k for k, evs in by_cycle.items()
                       if any(e["event"] == "SHOP_OUT" and at(e["site"]) for e in evs)]
        complete = [k for k in sold_cycles
                    if set(MOVEMENTS) <= {e["event"] for e in by_cycle[k]}
                    and not any(e["note"] for e in by_cycle[k])]

        # Trips: warehouse exits from one site with no gap longer than the trip gap.
        transit_end = {s["id"]: e for st, s, e in stays if st == "IN_TRANSIT"}
        end_status = {"SHOP_IN": "arrived", "COUNT_FOUND": "found at count", "COUNT_MISSING": "missing",
                      "WAREHOUSE_IN": "returned", "SHOP_OUT": "sold without arrival read"}
        trips, open_trip = [], {}
        for e in (e for e in events if e["event"] == "WAREHOUSE_OUT"):
            s = sim[e["uid"]]
            last = open_trip.get((e["site"], s))
            if last is None or seconds_between(last["last_ts"], e["ts"]) > TRIP_GAP_S[s]:
                last = {"id": len(trips) + 1, "site": e["site"], "departed": e["ts"], "last_ts": e["ts"],
                        "simulated": s, "bags": []}
                trips.append(last)
                open_trip[(e["site"], s)] = last
            last["last_ts"] = e["ts"]
            end = transit_end.get(e["id"])
            if end is None:
                age = seconds_between(e["ts"], now)
                status, secs, to = ("overdue" if age > OVERDUE_S[s] else "in transit"), age, None
            else:
                status = end_status.get(end["event"], "other")
                secs = seconds_between(e["ts"], end["ts"]) if status == "arrived" else None
                to = end["site"] if SITES.get(end["site"]) == "SHOP" else None
            last["bags"].append({"uid": e["uid"], "bag": e["bag"], "status": status, "seconds": secs, "to": to})
        for t in trips:
            arrived = [b["seconds"] for b in t["bags"] if b["status"] == "arrived"]
            dests = Counter(b["to"] for b in t["bags"] if b["to"])
            t["to"] = dests.most_common(1)[0][0] if dests else None
            t["sent"] = len(t["bags"])
            t["arrived"] = len(arrived)
            t["avg_transit"] = sum(arrived) / len(arrived) if arrived else None
            t["not_arrived"] = [b for b in t["bags"] if b["status"] != "arrived"]
            del t["last_ts"]
        trips = [t for t in trips if at(t["site"]) or (t["to"] and at(t["to"]))]

        overdue = [{"uid": s["uid"], "bag": s["bag"], "site": s["site"], "since": s["ts"],
                    "seconds": seconds_between(s["ts"], now), "simulated": sim[s["uid"]]}
                   for st, s, e in stays
                   if st == "IN_TRANSIT" and e is None and at(s["site"])
                   and seconds_between(s["ts"], now) > OVERDUE_S[sim[s["uid"]]]]

        ageing = sorted(({"uid": s["uid"], "bag": s["bag"], "site": s["site"], "since": s["ts"],
                          "seconds": seconds_between(s["ts"], now)}
                         for st, s, e in stays if st == "AT_WAREHOUSE" and e is None and at(s["site"])),
                        key=lambda a: -a["seconds"])

        # FIFO: a trip breaks first in, first out when a bag that entered the warehouse before
        # the trip's newest bag stays behind after the trip leaves.
        entry_of = {e["id"]: s for st, s, e in stays if st == "AT_WAREHOUSE" and e is not None}
        wh_stays = [(s, e) for st, s, e in stays if st == "AT_WAREHOUSE"]
        fifo_breaks = []
        fortnight = (datetime.now() - timedelta(days=14)).isoformat(timespec="seconds")
        for t in trips:
            if not at(t["site"]) or t["departed"] < fortnight:  # recent operations only
                continue
            exits = [e for e in events if e["event"] == "WAREHOUSE_OUT" and e["uid"] in {b["uid"] for b in t["bags"]}
                     and e["site"] == t["site"] and e["ts"] >= t["departed"]][:len(t["bags"])]
            entries = [entry_of[e["id"]]["ts"] for e in exits if e["id"] in entry_of]
            if not entries:
                continue
            newest, last_exit = max(entries), max(e["ts"] for e in exits)
            gap = TRIP_GAP_S[t["simulated"]]
            left = [s["bag"] for s, e in wh_stays
                    if s["site"] == t["site"] and s["ts"] < newest and s["uid"] not in {b["uid"] for b in t["bags"]}
                    and (e is None or seconds_between(last_exit, e["ts"]) > gap)]
            if left:
                fifo_breaks.append({"trip": t["id"], "site": t["site"], "dispatched": t["departed"],
                                    "older_left": len(left), "examples": left[:3]})
        fifo_breaks.sort(key=lambda f: f["dispatched"], reverse=True)

        scope = [b for b in bags if at(b["site"])]
        stock = {s: 0 for s in STATES}
        for b in scope:
            stock[b["state"]] += 1

        stock_by_site = {s: {st: 0 for st in STATES} for s in SITES}
        products_by_site = {s: {} for s in SITES}
        for b in bags:
            if b["site"] in SITES:
                stock_by_site[b["site"]][b["state"]] += 1
                if b["state"] == BOOK_STATE[SITES[b["site"]]]:
                    key = f"{b['product'] or 'NONE'}-{b['kg'] or 0:02d}"
                    products_by_site[b["site"]][key] = products_by_site[b["site"]].get(key, 0) + 1

        today = date.today()
        days = [(today - timedelta(days=d)).isoformat() for d in range(6, -1, -1)]
        throughput = {d: {m: 0 for m in MOVEMENTS} for d in days}
        for e in events:
            if e["event"] in MOVEMENTS and e["ts"][:10] in throughput and at(e["site"]):
                throughput[e["ts"][:10]][e["event"]] += 1

        erp_check = {}
        for shop in (s for s, f in SITES.items() if f == "SHOP" and at(s)):
            rows = []
            for d in days:
                rows.append({"date": d,
                             "erp_check_ins": sum(1 for r in erp_rows if r["site"] == shop
                                                  and r["kind"] == "CHECK_IN" and r["ts"][:10] == d),
                             "rfid_shop_in": sum(1 for e in events if e["site"] == shop
                                                 and e["event"] == "SHOP_IN" and e["ts"][:10] == d)})
            book = sum(1 for r in erp_rows if r["site"] == shop and r["kind"] == "CHECK_IN") - \
                sum(1 for r in erp_rows if r["site"] == shop and r["kind"] == "SALE")
            erp_check[shop] = {"days": rows, "erp_book": book}

        # Supply share: deliveries per route over 30 days, from arrivals that followed a dispatch.
        month_ago = (datetime.now() - timedelta(days=30)).isoformat(timespec="seconds")
        routes = {}
        for st, s, e in stays:
            if st == "IN_TRANSIT" and e is not None and e["event"] == "SHOP_IN" and e["ts"] >= month_ago:
                r = routes.setdefault((s["site"], e["site"]), {"deliveries": 0, "hours": []})
                r["deliveries"] += 1
                if sim[s["uid"]]:
                    r["hours"].append(seconds_between(s["ts"], e["ts"]) / 3600)
        supply = [{"from": w, "to": sh, "deliveries": r["deliveries"],
                   "avg_trip_hours": round(sum(r["hours"]) / len(r["hours"]), 1) if r["hours"] else None}
                  for (w, sh), r in sorted(routes.items()) if at(w, sh)]

        movements = [e for e in reversed(events) if at(e["site"])][:25]
        anomalies = [e for e in reversed(events) if e["note"] and at(e["site"])][:40]
        shown = ([e["uid"] for e in movements + anomalies] + [a["uid"] for a in ageing[:60]]
                 + [o["uid"] for o in overdue] + [i["uid"] for i in investigations]
                 + [b["uid"] for t in trips[-15:] for b in t["not_arrived"]])

        return {
            "now": now,
            "site": site,
            "sites": [{"id": s, "name": SITE_NAMES[s], "facility": f} for s, f in SITES.items()],
            "stock": stock,
            "stock_by_site": stock_by_site,
            "products_by_site": products_by_site,
            "times": times,
            "trips": trips[-15:][::-1],
            "overdue": overdue,
            "ageing": ageing[:60],
            "ageing_total": len(ageing),
            "fifo_breaks": fifo_breaks[:10],
            "fifo_total": len(fifo_breaks),
            "movements": movements,
            "anomalies": anomalies,
            "counts": counts[:20],
            "investigations": investigations,
            "completeness": {"sold": len(sold_cycles), "complete": len(complete)},
            "throughput": throughput,
            "erp_check": erp_check,
            "supply_share": supply,
            "weekly_counts": synthetic["weekly_counts"] if synthetic else None,
            "bags": self._bag_info(shown),
            "settings": {"trip_gap_s": TRIP_GAP_S, "overdue_s": OVERDUE_S},
            **readers,
        }


def read_serial(ser, tracker):
    while True:
        raw = ser.readline().decode(errors="ignore").strip()
        if raw:
            tracker.handle_line(raw)


def read_stdin(tracker):
    for raw in sys.stdin:
        raw = raw.strip()
        if raw:
            tracker.handle_line(raw if raw.startswith(("SCAN,", "INFO,")) else "SCAN," + raw)


def make_handler(tracker):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _query(self):
            return parse_qs(urlsplit(self.path).query)

        def _key(self):
            return self.headers.get("X-Control-Key") or (self._query().get("key") or [None])[0]

        def do_GET(self):
            path = urlsplit(self.path).path
            try:
                if path == "/api/state":
                    self._send(200, tracker.state(tracker.check_key(self._key())))
                elif path == "/api/insights":
                    self._send(200, tracker.insights((self._query().get("site") or [None])[0]))
                elif path == "/api/tags":
                    self._send(200, tracker.tags())
                elif path == "/api/tag":
                    self._send(200, tracker.tag_history((self._query().get("uid") or [""])[0]))
                elif path == "/api/health":
                    self._send(200, {"ok": True, "site": tracker.site})
                else:
                    self._send(404, {"error": "not found"})
            except ValueError as err:
                self._send(400, {"error": str(err)})

        def do_POST(self):
            path = urlsplit(self.path).path
            if not tracker.check_key(self._key()):
                return self._send(403, {"error": "control key missing or wrong"})
            length = int(self.headers.get("Content-Length") or 0)
            extra = {}
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                if path == "/api/site":
                    tracker.set_site(body.get("site"))
                elif path == "/api/count/start":
                    tracker.start_count()
                elif path == "/api/count/sweep":
                    extra["swept"] = tracker.sweep()
                elif path == "/api/count/end":
                    extra["result"] = tracker.end_count()
                elif path == "/api/count/cancel":
                    tracker.cancel_count()
                elif path == "/api/erp/book-in":
                    tracker.erp_book_in()
                elif path == "/api/erp/skip-next":
                    tracker.erp_skip_next()
                elif path == "/api/investigations/close":
                    tracker.close_investigation(int(body.get("id", 0)), body.get("resolution"))
                elif path == "/api/tags/assign":
                    return self._send(200, tracker.assign(body.get("orders"), body.get("tags")))
                elif path == "/api/tags/identify":
                    tracker.identify(body.get("uid"), body.get("product"), body.get("kg"))
                    return self._send(200, {"ok": True})
                elif path == "/api/reset":
                    tracker.reset()
                elif path == "/api/scan":  # simulated tap, for testing without hardware
                    tracker.scan(str(body.get("reader", "")).upper(), str(body.get("uid", "")).upper())
                elif path == "/api/serial":  # lines from bridge.py
                    if "lines" not in body:  # a single raw line, for manual tests
                        body = {"session": "manual", "lines": [{"seq": time.time_ns(), "line": body.get("line", "")}]}
                    return self._send(200, tracker.bridge_lines(body))
                else:
                    return self._send(404, {"error": "not found"})
            except (ValueError, TypeError) as err:
                return self._send(400, {"error": str(err)})
            self._send(200, {**tracker.state(True), **extra})

    return Handler


def addresses():
    """LAN and Tailscale addresses of this machine, for the startup links."""
    found = []
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # UDP connect sends nothing; it only picks the outgoing interface
        found.append(("LAN", s.getsockname()[0]))
    except OSError:
        pass
    finally:
        s.close()
    try:
        out = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=3)
        if out.returncode == 0 and out.stdout.strip():
            found.append(("Tailscale", out.stdout.split()[0]))
    except (OSError, subprocess.SubprocessError):
        pass
    return found or [("local", "127.0.0.1")]


def print_summary(tracker):
    data = tracker.insights()
    print("\nStock by state")
    for state, n in data["stock"].items():
        print(f"  {state:<14} {n}")
    for c in data["counts"][:5]:
        print(f"Count {c['id']} at {c['site']}: {c['flag']}")


def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--port", help="serial port of the Uno on this machine")
    mode.add_argument("--bridge", action="store_true", help="take reader lines from bridge.py over the network")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--synthetic", default=str(SYNTHETIC_PATH))
    ap.add_argument("--http", type=int, default=8000, help="port for the JSON API")
    ap.add_argument("--app-port", type=int, default=3000, help="port of the Next.js app, for the printed links")
    ap.add_argument("--public-url", default=os.environ.get("PUBLIC_URL"),
                    help="public address of the app, such as https://bcg-pla.banzilenhlebela.co.za")
    ap.add_argument("--new-key", action="store_true", help="replace the control key; old links stop working")
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()

    live = bool(args.port or args.bridge)
    tracker = Tracker(args.db, DEBOUNCE_S if live else 0.0, args.synthetic, args.new_key)
    if args.summary:
        print_summary(tracker)
        return

    if args.port:
        import serial  # pyserial
        ser = serial.Serial(args.port, args.baud, timeout=1)
        time.sleep(2)  # the Uno resets when the port opens
        threading.Thread(target=read_serial, args=(ser, tracker), daemon=True).start()
    elif sys.stdin and sys.stdin.isatty():
        threading.Thread(target=read_stdin, args=(tracker,), daemon=True).start()

    server = ThreadingHTTPServer(("0.0.0.0", args.http), make_handler(tracker))
    if args.public_url:
        url = args.public_url.rstrip("/")
        print(f"Public    control page (phone only): {url}/control?key={tracker.key}")
        print(f"Public    dashboard:                 {url}/")
        print(f"Public    bridge.py --server {url} --key {tracker.key}")
    else:
        for name, ip in addresses():
            print(f"{name:<9} control page (phone only): http://{ip}:{args.app_port}/control?key={tracker.key}")
            print(f"{name:<9} dashboard:                 http://{ip}:{args.app_port}/")
    print(f"API on port {args.http}. Site: {tracker.site}. Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()


if __name__ == "__main__":
    main()
