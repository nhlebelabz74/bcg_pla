# Bag tracking: demo workflow, dashboard insights and production implementation

## Scenario

An NGO grows non-fresh produce, packs it into bags and trucks the bags to a warehouse. Trucks then carry bags from the warehouse to a shop. Each shop is serviced by several warehouses.

Today both sites close for half a day each week so staff can count bags by hand. The shop has an ERP that records bags checked in and out, but it does not record which warehouse a bag came from. The warehouse has no system.

The new system is separate from the shop ERP. It has two jobs:

1. Record each bag entering and leaving each warehouse and shop. These events give trip times, storage times and stock levels.
2. Let a person walk in on any day and count the bags present with a handheld reader, without closing the site.

The two jobs check each other. The events give the book stock (the count the system expects from its in and out events). The walk-in count gives the physical stock. A difference between them is either a missed read or a lost bag. The weekly shutdown can stop once the two agree reliably.

### Where information lives

The tag carries only a unique ID. Each reader is registered in the system with its site, facility type and direction. The database holds each bag's state and history.

Facility type and direction belong to the reader, because a bag has no knowledge of where it is. Origin is not tracked, because the NGO grows all the produce and supplies the equipment (decision of 2026-10-17).

## Part 1: live demo with RC522 readers

### Hardware for the demo

The demo uses the two RC522 readers on hand and the four tags. R1 is the in reader and R2 is the out reader. A site switch on a phone moves both readers between the warehouse and the shop.

| Reader | Uno SDA pin | Direction | Label on the table |
|---|---|---|---|
| R1 | D10 | in | Door, in |
| R2 | D8 | out | Door, out |

The other six lines (SCK, MOSI, MISO, RST, GND, 3.3V) are shared through breadboard rows, as in the wiring table in `plan.md`.

### Software for the demo

Each Uno plugs into any laptop with a free USB port, and `bridge.py` on that laptop forwards each reader line over HTTPS to the public address `https://bcg-pla.banzilenhlebela.co.za`. The tracker and the Next.js app run in one Docker container on the Linux machine, which plays the part of an online server. An existing Cloudflare tunnel publishes it. Any laptop with internet access can run a bridge, and any phone can open the pages.

```
RC522 readers -> Uno -> USB -> any laptop running bridge.py
  -> HTTPS -> Cloudflare tunnel -> container on the Linux machine (app and tracker)
  -> phone (control page) and projector (dashboards)
```

The demo network has four warehouses and two shops. Four real tags move through it live, and about 230 simulated bags fill it, with histories over ten days and three planted errors for the counts to find. Each bag has a product and size, shown in its ID: `SEED-20-U1-93B73B38` is seed, 20 kg, the first use of tag `93B73B38`. Sold tags return to a pool and get new identities on the Tags page.

| Page | Device | Contents |
|---|---|---|
| Control (`/control?key=...`) | The user's phone | Site switch for six sites, book stock, walk-in count with a simulated gun sweep, simulated ERP at shops, investigations, latest scans |
| Overview, Warehouses, Shops | Projector | The insights in Part 2, for the network or one site |
| Tags | Projector or phone | The tag pool and random assignment of pool tags to a packing order |

The state rules, the count reconciliation, the simulated network, the API and the database are specified in `plan.md` under System design. The setup steps and the demo script are in `plan.md` under Demo setup and Demo script.

## Part 2: dashboard insights

All of these come from the events table, the count table and the reader table. Times in the demo are seconds. In production they are hours and days.

### Stock

| Insight | Calculation | Question it answers |
|---|---|---|
| Book stock per site | Bags whose current state is at that site | How many bags should be there now? |
| Count variance | Book stock minus last walk-in count, with the list of missing and unexpected bags | Does the system match reality? |
| Stock ageing | Days since WAREHOUSE_IN for each bag still at a warehouse, in age bands | Which bags are at risk of spoiling or pest damage? |
| FIFO compliance | Dispatched bags that are newer than bags left behind | Are the oldest bags leaving first? |

### Time

| Insight | Calculation | Question it answers |
|---|---|---|
| Warehouse dwell | WAREHOUSE_OUT minus WAREHOUSE_IN per bag, as a distribution per warehouse | How long does stock sit in storage? |
| Trip time | SHOP_IN minus WAREHOUSE_OUT, per trip and per route | How long does each warehouse take to reach each shop? |
| Shop dwell | SHOP_OUT minus SHOP_IN per bag | How fast does each shop sell stock? |
| End to end time | SHOP_OUT minus first WAREHOUSE_IN | How long from receipt to sale? |

### Flow

| Insight | Calculation | Question it answers |
|---|---|---|
| Throughput | In and out events per site per day | How busy is each door, and when? |
| Supply share | SHOP_IN events per source warehouse (from the simulated network in the demo) | Which warehouses supply which shop? |

### Exceptions

| Insight | Calculation | Question it answers |
|---|---|---|
| Overdue in transit | Bags in transit longer than the route's normal trip time | Has a bag been lost or diverted? |
| Trip shortfall | Bags that left on a trip minus bags that arrived | Did the whole load arrive? |
| Missing at count | Bags in book stock but not seen at a walk-in count | Where is shrinkage happening? |
| Anomaly list | All ANOMALY events with notes | Which reads are failing, and where? |
| ERP check | Daily SHOP_IN count against the ERP's daily check-in count, from an export (a simulated ERP per shop in the demo) | Do the two systems agree? |

### System health

| Insight | Calculation | Question it answers |
|---|---|---|
| Read completeness | Share of sold bags with every expected event recorded | How many reads does each door miss? |
| Count accuracy trend | Count variance per site over time (synthetic weekly data in the demo) | Can the weekly shutdown stop? |
| Reader activity | Last scan time per reader | Is any reader offline? |

Read completeness and count accuracy decide whether the system can replace the manual count. Report both from the first day of a pilot.

## Part 3: production implementation

Production uses UHF RFID (also called RAIN RFID, standard EPC Gen2). One UHF reader reads hundreds of tags per second at several metres, with no line of sight needed. The RC522 in the demo is a different technology (HF, 13.56 MHz) and does not scale to a dock door.

Prices below come from reseller listings retrieved on 2026-10-16. They are in the listing currency and exclude South African import duty, VAT, cabling, mounting and labour. A local integrator quote is needed before any budget is fixed.

### Components per site

| Component | Purpose | Quantity |
|---|---|---|
| Tag on each bag | Gives the bag a unique ID | One per bag |
| Fixed reader with antennas at each dock door | Reads bags entering and leaving, with direction | One door set per door |
| Handheld reader | Walk-in counts | One or two per site |
| Network link | Sends reads to the back-end: a fixed line or an LTE router, on a UPS | One per site |
| Back-end | Turns reads into events, stores them and serves the dashboard | Shared by all sites |

### Where reads happen

Bags cannot be read reliably inside a loaded truck. A metal box body blocks passive UHF reads ([US patent 10311269](https://patents.google.com/patent/US10311269)). Portals for curtain-sided trucks exist, but no source reports read rates for bags buried in a full load of grain. Grain stops a share of the signal, and bags in the middle of a load are read least.

The reliable design reads bags at the dock door as they are unloaded or loaded. Bags pass through the door's read zone singly, on a trolley or on a forklift pallet. The unloading process then becomes part of the system: every bag must pass through the read zone.

No measured read rate exists for bags at 12 to 14% moisture in the middle of a pallet. One water-heavy pallet read at about 60%, because only the outer cases responded ([RFID Journal](https://www.rfidjournal.com/?p=176811)). Dry grain affects UHF less than water does ([RFID Journal](https://www.rfidjournal.com/?p=176443)). The pilot has to measure this on real bags before the full purchase.

### Direction of travel

Each door has antennas on both sides of the door, or a pair of antenna zones in sequence. The order in which the zones see a tag gives the direction. Readers can also use the trend in signal strength or phase as a tag approaches and leaves. A motion sensor or light curtain restricts reads to moments when goods are moving through the door, which cuts stray reads.

Cross-reads (a tag read by the wrong door's antennas) are the main source of false events. Integrators reduce them with shielding panels, antenna angle and reader power calibration, tuned on site.

If a site has separate doors for receiving and dispatch, each door can take one direction only. Direction then comes from the door, as in the demo.

### Tags

| Tag type | Price at volume | Notes | Source |
|---|---|---|---|
| Sew-in textile tag (HID LinTRAK C10S, Impinj M850 chip) | EUR 0.37 each at 10,000+ | Rated for 200 industrial washes, so likely to survive handling | [rfid.it](https://rfid.it/en/hid-global-lintrak/5291-lintrak-c10s-mri-m850-textile-uhf-rfid-tags-52x10mm.html) |
| Adhesive inlay (Avery Dennison MiniWeb, Impinj M830 chip) | USD 0.06 to 0.07 each at 40,000 to 100,000 | Adhesion to woven polypropylene or jute is untested | [atlasRFIDstore](https://www.atlasrfidstore.com/avery-dennison-smartrac-miniweb-fcc-rfid-wet-inlay-m830/) |
| Hang tag | About USD 0.05 to 0.20 each | Marketplace listings; supplier quality unverified | [Made-in-China](https://m.made-in-china.com/company-kalifang/) |

Current chips (Impinj M830 and M850, NXP UCODE 9) have 96 or 128 bits of EPC memory. 96 bits holds a GS1 SGTIN-96 identifier: a company prefix, an item reference and a serial number. No published case study covers UHF tags on grain sacks. The nearest is KWS seed bags tracked across 18 sites in Europe ([SIGMA](https://www.sigma-chemnitz.de/en/references/references/reference-video-kws-europe-wide-tracing-of-seed-bags)).

The NGO fits the tag when it packs the bag. Shop staff remove it before sale, and the tag returns to the NGO for reuse. A reusable tag must come off without damage, which favours hang tags or cable-tie tags over adhesive inlays and sew-in labels. The tag's cost spreads over many cycles, but every tag not returned is a loss, so tag return rate is worth tracking. The system starts a new bag cycle each time a sold tag enters a warehouse again.

### Fixed readers and antennas

| Item | Price | Source |
|---|---|---|
| Impinj R700 reader, four antenna ports | USD 1,499, plus USD 140 for a PoE+ injector | [atlasRFIDstore](https://atlasrfidstore.com/impinj-r700-rain-rfid-reader) |
| Zebra FX9600 reader, four ports | USD 1,274; GBP 858 for the EMEA variant | [CDW](https://cdw.com/product/zebra-fx9600-fixed-rfid-reader/7106627), [LambdaTek](https://www.lambda-tek.com/Zebra-FX9600-42325A50-E8-sh/B48692788) |
| Zebra FX7500 reader, four ports | USD 1,103 to 2,010 | [CDW](https://cdw.com/product/zebra-fx7500-4-rfid-reader-usb-ethernet-100/3355676) |
| Zebra AN480 antenna | USD 317 to 497 each | [SHI](https://www.shi.com/product/46979988/Zebra-AN480-RFID-antenna) |
| Dual-side portal (TronRFID) | USD 5,600 | [rfid4ustore](https://rfid4ustore.com/rfid-readers/rfid-portals/) |

A four-port reader with four antennas comes to roughly USD 2,800 to 3,500 per door in hardware. Two adjacent doors can share one four-port reader with two antennas each, at the cost of weaker direction sensing.

### Handheld readers

| Model | Price | Read rate | Range | Source |
|---|---|---|---|---|
| Chainway C72 (Android, built-in reader) | EUR 820 | 1,200 tags/s | over 15 m outdoors | [rfid.it](https://rfid.it/en/358-handheld-rfid-reader) |
| Zebra RFD40 (sled for a phone) | USD 1,263 | 1,300+ tags/s | 6+ m | [SHI](https://www.shi.com/product/44075932/) |
| Zebra RFD90 long range | USD 1,949 | 1,300 tags/s | up to 22.9 m | [Levata](https://www.levata.com/zebra-rfd90-handheld-terminals) |
| TSL 3166 (Bluetooth) | USD 2,007 | 1,200 tags/s | 9 m | [atlasRFIDstore](https://www.atlasrfidstore.com/tsl-3166-bluetooth-rugged-uhf-rfid-reader) |

A walk-in count is one person walking the aisles with the handheld. The handheld app uploads the list of tags it saw, and the back-end compares that list with book stock. Bags deep inside a stack are the ones most likely to be missed. The pilot measures this as well.

### South African requirements

ICASA exempts UHF RFID from a spectrum licence in these bands ([Radio Frequency Spectrum Regulations, Annexure B](https://source.acts.co.za/electronic-communications-act-2005/n279_annexure_b.php)):

| Band | Power limit |
|---|---|
| 865 to 868 MHz | 2 W ERP |
| 916.1 to 916.5, 917.3 to 917.7, 918.5 to 918.9 and 919.7 to 920.1 MHz | 4 W ERP |
| 915.4 to 919 MHz, frequency hopping systems | 4 W ERP |

All radio equipment still needs ICASA type approval, held by a locally registered company. Buying through a local distributor covers this. Order the regional variant of each reader that matches these bands. The National Radio Frequency Plan 2026 has not been checked for changes to these entries.

Local suppliers include PDC (Impinj distributor for South Africa), Mantech (Invengo distributor for Africa), Osiris and Rugged SA (Chainway resellers), and RFDigi and Techsolutions in Pretoria. Their integration capability is unverified.

### Software

Each reader filters raw reads and publishes them over MQTT or REST: Impinj readers through the IoT Device Interface, Zebra readers through IoT Connector. The back-end applies the same rules as the demo: debounce, direction, state checks, trips and counts. GS1 EPCIS 2.0 (ratified in 2022) defines a standard format for these events. Storing events in that format lets other parties' systems read them later. Third-party middleware such as SIGMA GRAIDWARE does the read-to-event step as a product, as an alternative to building it.

The back-end stays separate from the shop ERP. A daily export of ERP check-ins feeds the ERP check in Part 2.

### Connectivity and hosting

Production has no bridge laptop and needs no private network. Each reader is a network device that sends its reads to a hosted back-end. The reader opens the connection outward, in the same way a browser loads a website. An outward connection passes through the site's router and firewall, so no site opens an inbound port.

| Part | Demo | Production |
|---|---|---|
| Reader | RC522 on an Uno | Fixed UHF reader on the site network, powered over Ethernet (PoE) |
| Getting reads out | `bridge.py` on a laptop | The reader's own MQTT or HTTPS output, or a small gateway box on site |
| Site connection | The laptop's Wi-Fi | One internet link per site: a fixed line or an LTE router |
| Server | The Linux machine in Docker behind a Cloudflare tunnel | A hosted server or cloud service with a public HTTPS address and an MQTT broker |
| Database | SQLite file | A managed database such as Postgres, with daily backups, once several sites write at once |
| Handheld counts | Taps on the demo readers | The handheld app uploads the list of tags it saw over Wi-Fi or mobile data |
| Access | One shared control key in the link | A separate credential per device (client certificate or token over TLS) and a login per staff member |

Rural links drop and power cuts are common, so delivery must survive gaps. The demo bridge shows the method. Each read carries a sequence number and stays on the site until the server acknowledges it. The server ignores a number it has already applied, so a resend never doubles a read. Each read carries the time the reader saw it, so a late upload keeps its true time. Readers set their clocks over the network (NTP).

Whether a reader's own buffer survives a long outage is not verified. Ask the supplier (PDC for Impinj) for the buffer size and its behaviour on power loss. If the buffer is too small, a gateway sits between the reader and the internet. An industrial PC or a Raspberry Pi with an LTE modem fits, and it does what `bridge.py` does in the demo. Each site also needs a UPS (backup battery) for the reader, the PoE switch and the router.

A private network such as Tailscale or a VPN still helps with remote support: updating reader firmware and checking gateways. It carries no read data.

The hosted server is the single point every site depends on. Host it with a provider that offers monitoring and automatic restarts, or keep a standby copy. If the server is down, the sites keep buffering and nothing is lost until the buffers fill.

### Indicative pilot hardware cost

These figures are arithmetic on the listed prices for one warehouse and one shop with two doors each. No source gives a pilot total.

| Item | Quantity | Range (USD) |
|---|---|---|
| Door set: four-port reader with four antennas | 4 | 11,200 to 14,000 |
| Handheld reader | 2 | about 1,800 to 3,900 |
| Tags (sew-in at EUR 0.37, or inlay at USD 0.07) | 5,000 | about 350 to 2,000 |
| Total hardware | | about 13,000 to 20,000 |

Excluded: duty, VAT, cabling, mounting, shielding, network links, UPS units, gateways, hosting, installation, software and integrator fees.

### Pilot plan

1. Run a site test before buying. Borrow a reader and handheld from a local integrator. Tag 100 real bags with each candidate tag type. Measure read rates at a dock door with bags carried singly, on trolleys and on pallets. Measure handheld count accuracy on a full stack.
2. Choose the tag type and the unloading method from the test results.
3. Install door sets and handhelds at one warehouse and one shop on one route.
4. Run the weekly manual count alongside the system. Compare count variance and read completeness each week.
5. Stop the weekly shutdown at the pilot site once the variance stays within an agreed threshold for an agreed number of weeks.
6. Extend to the other warehouses that serve the shop.

### Production risks

| Risk | Effect | Mitigation |
|---|---|---|
| Low read rate through stacked grain | Missed events and false variances | Site test; read bags singly or in layers at the door |
| Tag loss or damage | Bag disappears from the system | Choose the tag type by test; spare tags at each site |
| Cross-reads between doors | False direction events | Shielding, antenna tuning, motion triggers |
| Bags bypassing the read zone | Missed events | Make the read zone the only route; monitor read completeness |
| Tag removed or swapped | System tracks a tag, not the produce | Reconcile against weighbridge records or dispatch notes |
| Site connectivity | Delayed events | Readers or a site gateway buffer reads and resend in order when the link returns; confirm the buffer size with the supplier |
| Power cuts | Reader and router stop; bags pass unread | UPS for the reader, PoE switch and router; read completeness shows the gap |
| Stolen or lost device credentials | False reads sent to the server | A credential per device, revoked on its own; reads accepted only over TLS |
| Hosted server outage | Dashboard stops; sites keep buffering | Provider monitoring and automatic restart; buffers sized for the longest expected outage |

## Answered questions

| Question | Answer (2026-10-17) |
|---|---|
| Does "out" at the shop mean a sale or a bag leaving through the door? | A sale |
| Who assigns trips in production? | Out of scope. The demo groups exits by time |
| Where is the tag fitted? | The NGO fits it at packing. The shop removes it before sale, and the tag is reused |
