"""Mock stock for the demo network: four warehouses, two shops, about 230 simulated bags.

Every simulated bag gets a backdated history (warehouse entry, trip, shop arrival, sale)
so the dashboards show realistic times in hours and days. Simulated bags are marked
in the database and on screen. Their real location is stored separately
(actual_site). It always matches the records, so a simulated gun sweep counts every
site exactly; a count only differs when the user makes it differ with the real tags.

WH3 and SHOP2 hold no stock, so the live demo route (WH3 to SHOP2) shows only real tags.
Their past trips and sales stay in the history, and every bag that reached SHOP2 was sold.

The generator is seeded, so Clear demo data always restores the same network.
"""

import random
from datetime import datetime, timedelta

# The physical tags. They start as bags in stock at SHOP1, so tapping one out at the
# shop (a sale) frees it into the tag pool, ready to be assigned to a new bag.
REAL_TAGS = [
    ("93B73B38", "SEED", 20),   # white card
    ("937C2A38", "FERT", 10),   # white card
    ("F710AD64", "SEED", 5),    # blue fob
    ("97F8A564", "FERT", 15),   # blue fob
    ("84704E4D", "FERT", 20),   # extra tag, found 2026-10-17
    ("2B49D307", "SEED", 10),   # extra tag, found 2026-10-17
]
REAL_START = "SHOP1"
EMPTY_SITES = ("WH3", "SHOP2")

# Warehouse to shop routes with a typical trip time in hours.
ROUTES = {
    ("WH1", "SHOP1"): 3.0,
    ("WH2", "SHOP1"): 5.0,
    ("WH4", "SHOP1"): 7.5,
    ("WH2", "SHOP2"): 4.0,
    ("WH3", "SHOP2"): 2.5,
    ("WH4", "SHOP2"): 6.0,
}
# Bags still sitting in each warehouse, entered over the last day.
STILL_AT_WAREHOUSE = {"WH1": 18, "WH2": 30, "WH3": 0, "WH4": 34}
PRODUCT_MIX = [("SEED", 20), ("SEED", 10), ("SEED", 5), ("FERT", 20), ("FERT", 15),
               ("FERT", 10), ("FERT", 5), ("SEED", 15)]


def iso(t):
    return t.isoformat(timespec="seconds")


def build(now, avoid):
    """Returns (bags, cycles, events, erp, counts) as lists of dicts, events in time order."""
    rng = random.Random(7)
    used = set(avoid)

    def new_uid():
        while True:
            uid = "%08X" % rng.getrandbits(32)
            if uid not in used:
                used.add(uid)
                return uid

    bags, cycles, events, erp = {}, [], [], []

    def event(t, uid, site, reader, kind, before, after, note=None, cycle=None):
        events.append({"ts": iso(t), "uid": uid, "cycle": cycle or bags[uid]["cycle"], "site": site,
                       "reader": reader, "event": kind, "state_before": before,
                       "state_after": after, "note": note})
        bags[uid]["state"], bags[uid]["site"], bags[uid]["updated_at"] = after, site, iso(t)

    def add_bag(site, state, actual):
        uid = new_uid()
        product, kg = rng.choice(PRODUCT_MIX)
        cycle = rng.choices([1, 2, 3], weights=[6, 3, 1])[0]
        bags[uid] = {"uid": uid, "cycle": cycle, "product": product, "kg": kg, "state": "ASSIGNED",
                     "site": site, "updated_at": None, "simulated": 1, "actual_site": actual}
        for c in range(1, cycle):
            # An earlier fill of a reused tag, 40 to 70 days ago: assigned, through a warehouse, sold.
            p, k = rng.choice(PRODUCT_MIX)
            wh, shop = rng.choice(list(ROUTES))
            assigned = now - timedelta(days=40 + 14 * (cycle - c) + rng.uniform(0, 6))
            cycles.append({"uid": uid, "cycle": c, "product": p, "kg": k, "source": "mock",
                           "assigned_at": iso(assigned)})
            entered = assigned + timedelta(hours=rng.uniform(6, 30))
            left = entered + timedelta(days=rng.uniform(1, 4))
            arrived = left + timedelta(hours=ROUTES[(wh, shop)] * rng.uniform(0.9, 1.2))
            sold = arrived + timedelta(hours=rng.uniform(6, 60))
            event(entered, uid, wh, "R1", "WAREHOUSE_IN", "ASSIGNED", "AT_WAREHOUSE", cycle=c)
            event(left, uid, wh, "R2", "WAREHOUSE_OUT", "AT_WAREHOUSE", "IN_TRANSIT", cycle=c)
            event(arrived, uid, shop, "R1", "SHOP_IN", "IN_TRANSIT", "AT_SHOP", cycle=c)
            event(sold, uid, shop, "R2", "SHOP_OUT", "AT_SHOP", "SOLD", cycle=c)
            erp.append({"ts": iso(arrived), "site": shop, "kind": "CHECK_IN", "source": "mock"})
            erp.append({"ts": iso(sold), "site": shop, "kind": "SALE", "source": "mock"})
        cycles.append({"uid": uid, "cycle": cycle, "product": product, "kg": kg, "source": "mock",
                       "assigned_at": iso(now - timedelta(days=12))})
        bags[uid]["state"], bags[uid]["site"] = "ASSIGNED", site
        return uid

    # Trips over the last ten days. Each trip carries 4 to 9 bags from one warehouse.
    trips = []
    for day in range(10, 0, -1):
        for _ in range(rng.choice([1, 2, 2, 3])):
            route = rng.choice(list(ROUTES))
            depart = now - timedelta(days=day, hours=rng.uniform(-10, 4))
            trips.append((depart, route, rng.randint(4, 9)))
    # Two trips still on the road, recent enough not to be overdue at production scale.
    trips.append((now - timedelta(hours=2.5), ("WH2", "SHOP1"), 4))
    trips.append((now - timedelta(hours=1.2), ("WH4", "SHOP1"), 3))
    trips.sort()

    door_missed_left = 0       # no planted missed door reads: simulated counts come out exact
    anomaly_left = 1           # SHOP2 arrival without a dispatch read

    for depart, (wh, shop), n in trips:
        trip_time = timedelta(hours=ROUTES[(wh, shop)] * rng.uniform(0.85, 1.25))
        for i in range(n):
            uid = add_bag(wh, "ASSIGNED", None)
            entered = depart - timedelta(days=rng.uniform(1.0, 1.4))
            event(entered, uid, wh, "R1", "WAREHOUSE_IN", "ASSIGNED", "AT_WAREHOUSE")
            left = depart + timedelta(minutes=2 * i)
            arrive = left + trip_time + timedelta(minutes=rng.uniform(-20, 20))
            skip_dispatch = shop == "SHOP2" and anomaly_left and arrive < now and rng.random() < 0.3
            if skip_dispatch:
                anomaly_left -= 1
            else:
                event(left, uid, wh, "R2", "WAREHOUSE_OUT", "AT_WAREHOUSE", "IN_TRANSIT")
            if arrive > now:
                bags[uid]["actual_site"] = None  # on the road: no count can see it
                continue
            if shop == "SHOP1" and door_missed_left and now - arrive < timedelta(days=2):
                door_missed_left -= 1
                bags[uid]["actual_site"] = shop
                erp.append({"ts": iso(arrive), "site": shop, "kind": "CHECK_IN", "source": "mock"})
                continue
            before = "AT_WAREHOUSE" if skip_dispatch else "IN_TRANSIT"
            note = "arrived at shop without a dispatch read" if skip_dispatch else None
            event(arrive, uid, shop, "R1", "SHOP_IN", before, "AT_SHOP", note)
            bags[uid]["actual_site"] = shop
            erp.append({"ts": iso(arrive), "site": shop, "kind": "CHECK_IN", "source": "mock"})
            sold = arrive + timedelta(hours=rng.uniform(5, 80))
            if shop in EMPTY_SITES:  # an empty shop has sold everything it received
                sold = arrive + (now - arrive) * rng.uniform(0.2, 0.9)
            if shop in EMPTY_SITES or (sold < now - timedelta(hours=1) and rng.random() < 0.75):
                event(sold, uid, shop, "R2", "SHOP_OUT", "AT_SHOP", "SOLD")
                bags[uid]["actual_site"] = None
                erp.append({"ts": iso(sold), "site": shop, "kind": "SALE", "source": "mock"})

    for wh, n in STILL_AT_WAREHOUSE.items():
        for _ in range(n):
            uid = add_bag(wh, "ASSIGNED", wh)
            entered = now - timedelta(days=rng.uniform(0.05, 0.9))
            event(entered, uid, wh, "R1", "WAREHOUSE_IN", "ASSIGNED", "AT_WAREHOUSE")
    # Two old bags left behind at WH4 while newer stock went out: a first in, first out break.
    for days_ago in (9.5, 8.2):
        uid = add_bag("WH4", "ASSIGNED", "WH4")
        event(now - timedelta(days=days_ago), uid, "WH4", "R1", "WAREHOUSE_IN", "ASSIGNED", "AT_WAREHOUSE")

    # A past count at WH1, yesterday, when everything agreed.
    wh1 = sorted(uid for uid, b in bags.items() if b["site"] == "WH1" and b["state"] == "AT_WAREHOUSE")
    counts = [{"site": "WH1", "started_at": iso(now - timedelta(days=1, minutes=12)),
               "ended_at": iso(now - timedelta(days=1)), "rfid_book": len(wh1), "erp_book": None,
               "counted": len(wh1), "seen": wh1, "missing": [], "found": [],
               "outcome": "RFID_MATCH", "flag": "Count matches RFID"}]

    events.sort(key=lambda e: e["ts"])
    erp.sort(key=lambda e: e["ts"])
    return list(bags.values()), cycles, events, erp, counts


if __name__ == "__main__":
    bags, cycles, events, erp, counts = build(datetime.now(), [t[0] for t in REAL_TAGS])
    from collections import Counter
    print(len(bags), "bags,", len(events), "events,", len(erp), "ERP entries")
    print(Counter((b["state"], b["site"]) for b in bags))
