#!/usr/bin/env bash
# deploy-vps.sh — push local pi config to VPS, sync packages/skills/extensions.
set -euo pipefail

VPS_HOST="${1:-vps}"
PI_DIR="$HOME/.pi/agent"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1/4  settings.json"
rsync -az "$PI_DIR/settings.json" "$VPS_HOST:~/.pi/agent/settings.json"

echo "==> 2/4  skills"
rsync -az --delete "$REPO_DIR/skills/" "$VPS_HOST:~/.pi/agent/skills/"

echo "==> 3/4  extensions"
rsync -az --delete "$REPO_DIR/extensions/" "$VPS_HOST:~/.pi/agent/extensions/"

echo "==> 4/4  reconcile packages"
# Read the canonical package list from the freshly deployed settings.json on the VPS,
# then install missing and remove surplus.
ssh "$VPS_HOST" bash -s <<'REMOTE'
  set -euo pipefail
  PI_DIR="$HOME/.pi/agent"

  # extract package identifiers (strings only, skip objects like {source:..., skills:...})
  wanted=$(python3 -c "
import json, sys
d = json.load(open('$PI_DIR/settings.json'))
for p in d.get('packages', []):
    if isinstance(p, str):
        print(p)
")
  installed=$(pi list 2>/dev/null | grep -oP '^\s+npm:@?\S+' | tr -d ' ' || true)

  echo "  wanted:" $(echo "$wanted" | wc -l) "  installed:" $(echo "$installed" | wc -l)

  # install missing
  while IFS= read -r pkg; do
    if [ -z "$pkg" ]; then continue; fi
    if ! echo "$installed" | grep -qxF "$pkg"; then
      echo "  + $pkg"
      pi install "$pkg"
    fi
  done <<< "$wanted"

  # remove surplus
  while IFS= read -r pkg; do
    if [ -z "$pkg" ]; then continue; fi
    if ! echo "$wanted" | grep -qxF "$pkg"; then
      echo "  - $pkg"
      pi uninstall "$pkg" || echo "  (uninstall failed — may not be removable)"
    fi
  done <<< "$installed"
REMOTE

echo "==> done. vps synced from local."
