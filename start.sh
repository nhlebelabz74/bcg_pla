#!/bin/sh
# Starts the tracker and the app together. If either stops, the container stops
# and the host restarts it. The database lives in DATA_DIR, on a persistent disk.
set -e
cd /srv
python3 -u tracker.py --bridge --db "${DATA_DIR:-/data}/inventory.db" --http 8000 &
TRACKER=$!
(cd app && exec node server.js) &
APP=$!
trap 'kill $TRACKER $APP 2>/dev/null' TERM INT
while kill -0 $TRACKER 2>/dev/null && kill -0 $APP 2>/dev/null; do sleep 2; done
kill $TRACKER $APP 2>/dev/null || true
exit 1
