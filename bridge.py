"""Forward reader lines from the Uno on this laptop to tracker.py on another machine.

The Uno prints one line per tap (SCAN,R1,93B73B38). This script reads those lines
from the serial port and sends them to tracker.py with POST /api/serial.

Every line gets a sequence number and is held until tracker.py acknowledges it.
If the network or tracker.py is down, lines queue up and are resent in order, so
no scan is lost and none is applied twice. Each line carries its age, so a late
delivery keeps the time of the tap.

Usage, on any laptop with an Uno plugged in:
  python bridge.py --list                                  # show the USB serial ports, then exit
  python bridge.py --server <app address> --key <key>      # one Uno with both readers (breadboard)
  python bridge.py --port COM7:R1 --port COM9:R2 --server ... --key ...
                                                           # two Unos on this laptop, one reader each
  python bridge.py --port auto:R2 --server ... --key ...   # one of two Unos, on this laptop alone
  python bridge.py --stdin --server ... --key ...          # no Uno: type lines such as SCAN,R1,93B73B38

With one reader per Uno, wire each reader to D10 as reader A. Every such Uno reports
its reader as R1; the :R1 or :R2 after the port says which reader it really is.

The app address is the public one printed by tracker.py, or http://100.107.160.2:8000
over Tailscale.

Requires: pip install pyserial (not needed with --stdin)
"""

import argparse
import json
import queue
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.request

HEARTBEAT_S = 5  # contact tracker.py at least this often, so the dashboard shows the bridge online
BATCH = 50
# Cloudflare refuses Python's default user agent (Python-urllib) with 403, so the bridge names itself.
USER_AGENT = "bag-tracker-bridge/2.1"


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


# USB chips found on Unos: Arduino, Arduino.org, CH340 clones, FTDI, CP210x.
UNO_VIDS = {0x2341, 0x2A03, 0x1A86, 0x0403, 0x10C4}


def usb_ports():
    from serial.tools import list_ports

    return [p for p in list_ports.comports() if p.vid is not None]


def find_unos():
    """Serial ports that look like an Uno, by USB vendor id or description."""
    ports = usb_ports()
    unos = [p for p in ports if p.vid in UNO_VIDS
            or any(w in f"{p.description} {p.manufacturer}".lower() for w in ("arduino", "ch340"))]
    return [p.device for p in (unos or (ports if len(ports) == 1 else []))]


def port_names():
    return ", ".join(f"{p.device} ({p.description})" for p in usb_ports()) or "none"


def parse_port(spec):
    """'COM7' -> ('COM7', None); 'COM9:R2' -> ('COM9', 'R2'); 'auto:R1' -> ('auto', 'R1')."""
    head, sep, tail = spec.rpartition(":")
    if sep and tail.upper() in ("R1", "R2"):
        return head, tail.upper()
    return spec, None


def resolve_ports(specs):
    """Turn the --port options into [(device, reader or None)], finding Unos where asked."""
    specs = [parse_port(s) for s in specs]
    if any(dev == "auto" for dev, _ in specs):
        if len(specs) > 1:
            sys.exit("Use auto for one port only. With two Unos on this laptop, name both ports: "
                     f"--port <port>:R1 --port <port>:R2. USB serial ports found: {port_names()}.")
        found = find_unos()
        reader = specs[0][1]
        if len(found) == 1:
            log(f"Found the Uno on {found[0]}.")
            return [(found[0], reader)]
        if len(found) > 1:
            sys.exit(f"Found {len(found)} Unos: {', '.join(found)}. Say which one is the in reader: "
                     f"--port <port>:R1 --port <port>:R2. Run --list to see the ports.")
        sys.exit(f"No Uno found. USB serial ports found: {port_names()}. "
                 f"Check the USB cable, or name the port with --port.")
    if len(specs) > 1 and any(r is None for _, r in specs):
        sys.exit("With two Unos, give each port its reader: --port <port>:R1 --port <port>:R2.")
    readers = [r for _, r in specs if r]
    if len(readers) != len(set(readers)):
        sys.exit("Each reader can come from one Uno only.")
    return specs


def remap(line, reader):
    """On a one-reader Uno, its reader on D10 reports as R1. Rename it; drop the empty R2 slot."""
    if reader is None:
        return line
    parts = line.split(",")
    if len(parts) == 3 and parts[0] in ("SCAN", "INFO") and parts[1] in ("R1", "R2"):
        if parts[1] != "R1":
            return None
        parts[1] = reader
        return ",".join(parts)
    return line


def read_serial(port, reader, baud, lines):
    import serial  # pyserial

    name = f"{port}" + (f" (as {reader})" if reader else "")
    while True:
        try:
            with serial.Serial(port, baud, timeout=1) as ser:
                log(f"Opened {name}. The Uno restarts and prints its reader versions.")
                while True:
                    raw = ser.readline().decode(errors="ignore").strip()
                    line = remap(raw, reader) if raw else None
                    if line:
                        lines.put((time.monotonic(), line))
        except serial.SerialException as err:
            log(f"Serial port {name} not available ({err}). Is the Uno plugged in, and is a "
                f"serial monitor or another bridge holding the port? Retrying in 3 s.")
            time.sleep(3)


def read_stdin(lines):
    for raw in sys.stdin:
        raw = raw.strip()
        if raw:
            lines.put((time.monotonic(), raw if raw.startswith(("SCAN,", "INFO,")) else "SCAN," + raw))


def post(server, key, body):
    req = urllib.request.Request(
        server.rstrip("/") + "/api/serial", data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "X-Control-Key": key, "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def check(server):
    try:
        req = urllib.request.Request(server.rstrip("/") + "/api/health", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=5) as resp:
            info = json.loads(resp.read())
        log(f"Reached tracker.py at {server}. Current site: {info.get('site')}.")
        return True
    except (urllib.error.URLError, OSError, ValueError) as err:
        log(f"Cannot reach tracker.py at {server} ({err}).")
        log("Check: tracker.py --bridge and the app are running on the Linux machine; the address "
            "matches the one tracker.py printed; this laptop has internet access.")
        return False


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--port", action="append",
                     help="Uno port such as COM7 or /dev/ttyACM0, or auto. Add :R1 or :R2 for a one-reader "
                          "Uno. Repeat for a second Uno. Default: auto")
    src.add_argument("--stdin", action="store_true", help="read typed lines instead of a serial port")
    src.add_argument("--list", action="store_true", help="show the USB serial ports, then exit")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--server", help="app address, such as https://reference2025.tail86aa3f.ts.net")
    ap.add_argument("--key", help="control key printed by tracker.py")
    args = ap.parse_args()

    if args.list:
        found = find_unos()
        for p in usb_ports():
            print(f"{p.device:<16} {p.description}" + ("   <- looks like an Uno" if p.device in found else ""))
        if not usb_ports():
            print("No USB serial ports. Plug the Uno in, or install the CH340 driver for a clone.")
        return
    if not args.server or not args.key:
        ap.error("--server and --key are required")

    lines = queue.Queue()
    if args.stdin:
        ports = []
        threading.Thread(target=read_stdin, args=(lines,), daemon=True).start()
    else:
        ports = resolve_ports(args.port or ["auto"])
        for device, reader in ports:
            threading.Thread(target=read_serial, args=(device, reader, args.baud, lines), daemon=True).start()

    check(args.server)
    session = secrets.token_hex(4)
    host = socket.gethostname()
    pending = []  # [(seq, read_at, line)] not yet acknowledged, oldest first
    seq = 0
    connected = None
    last_contact = 0.0
    backoff = 1.0

    while True:
        try:
            read_at, line = lines.get(timeout=0.2)
            seq += 1
            pending.append((seq, read_at, line))
            log(f"read  {line}")
            continue  # drain everything that is waiting before sending
        except queue.Empty:
            pass
        if not pending and time.monotonic() - last_contact < HEARTBEAT_S:
            continue
        batch = pending[:BATCH]
        now = time.monotonic()
        body = {"session": session, "host": host,
                "port": ", ".join(d + (f":{r}" if r else "") for d, r in ports) or "stdin",
                "lines": [{"seq": s, "line": l, "age": round(now - t, 3)} for s, t, l in batch]}
        try:
            ack = post(args.server, args.key, body)["ack"]
        except urllib.error.HTTPError as err:
            text = err.read(2000).decode(errors="ignore")
            if err.code == 403 and "control key" in text:
                log("tracker.py rejected the control key. Copy the key from docker compose logs app.")
            elif err.code == 403:
                log("Blocked before reaching tracker.py (403 from the network or Cloudflare).")
            else:
                log(f"tracker.py answered {err.code}.")
            connected = False
            time.sleep(backoff)
            backoff = min(backoff * 2, 10)
            continue
        except (urllib.error.URLError, OSError, ValueError) as err:
            if connected is not False:
                log(f"Lost contact with tracker.py ({err}). Holding lines and retrying.")
            connected = False
            if pending:
                log(f"{len(pending)} line(s) waiting.")
            time.sleep(backoff)
            backoff = min(backoff * 2, 10)
            continue
        if connected is not True:
            log("Connected to tracker.py.")
        connected = True
        backoff = 1.0
        last_contact = time.monotonic()
        sent = [p for p in pending if p[0] <= ack]
        pending = [p for p in pending if p[0] > ack]
        for s, _, l in sent:
            log(f"sent  {l}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
