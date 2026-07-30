#!/usr/bin/env bash
# Auto-sync: live ~/.pi/agent/settings.json → pi-elias repo.
# Triggered by launchd WatchPaths when pi mutates settings.json.
set -euo pipefail

LIVE="$HOME/.pi/agent/settings.json"
REPO="$HOME/dev/pi-elias"
DEST="$REPO/settings.json"

# ponytail: debounce via sleep — launchd may fire multiple times in a burst
sleep 5

# Only act if the file actually changed
if diff -q "$LIVE" "$DEST" &>/dev/null; then
  exit 0
fi

cp "$LIVE" "$DEST"
cd "$REPO"
git add settings.json
git commit -m "auto: sync settings.json from pi" --allow-empty
