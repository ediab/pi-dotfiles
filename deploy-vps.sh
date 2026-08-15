#!/usr/bin/env bash
# deploy-vps.sh — push local pi config to VPS, sync packages/skills/extensions.
set -euo pipefail

VPS_HOST="${1:-vps}"
PI_DIR="$HOME/.pi/agent"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1/4  settings.json + auth.json"
# Snapshot the old settings on the VPS first — step 4 needs it to find surplus packages
# (pi list only reflects the NEW settings by the time it runs).
ssh "$VPS_HOST" 'cp ~/.pi/agent/settings.json ~/.pi/agent/settings.json.pre-deploy 2>/dev/null || true'
rsync -az "$PI_DIR/settings.json" "$VPS_HOST:~/.pi/agent/settings.json"
rsync -az "$PI_DIR/auth.json" "$VPS_HOST:~/.pi/agent/auth.json"
ssh "$VPS_HOST" 'chmod 600 ~/.pi/agent/auth.json'

echo "==> 2/4  skills"
rsync -az --delete "$REPO_DIR/home/skills/" "$VPS_HOST:~/.pi/agent/skills/"

echo "==> 3/4  extensions"
rsync -az --delete "$REPO_DIR/home/extensions/" "$VPS_HOST:~/.pi/agent/extensions/"

echo "==> 4/4  reconcile packages"
# Read the canonical package list from the freshly deployed settings.json on the VPS,
# then install missing and remove surplus.
ssh "$VPS_HOST" bash -s <<'REMOTE'
  set -euo pipefail
  PI_DIR="$HOME/.pi/agent"

  # extract package identifiers (strings only, skip objects like {source:..., skills:...})
  strings_only() {
    python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
for p in d.get('packages', []):
    if isinstance(p, str):
        print(p)
" "$1" 2>/dev/null || true
  }

  wanted=$(strings_only "$PI_DIR/settings.json")
  had=$(strings_only "$PI_DIR/settings.json.pre-deploy")  # pre-deploy snapshot (step 1)

  # install packages that are missing on disk (pi list shows settings entries even
  # when the package dir is absent, so check the install dir itself)
  while IFS= read -r pkg; do
    if [ -z "$pkg" ]; then continue; fi
    case "$pkg" in
      npm:*)      dir="$PI_DIR/npm/node_modules/${pkg#npm:}" ;;
      git:*)      dir="$PI_DIR/git/${pkg#git:}" ;;
      https://*)  dir="$PI_DIR/git/${pkg#https://}" ;;
      *)          dir="" ;;
    esac
    if [ -n "$dir" ] && [ ! -e "$dir" ]; then
      echo "  + $pkg (missing on disk)"
      pi install "$pkg"
    fi
  done <<< "$wanted"

  # remove surplus (packages that were installed before the deploy but are no longer wanted)
  while IFS= read -r pkg; do
    if [ -z "$pkg" ]; then continue; fi
    if ! echo "$wanted" | grep -qxF "$pkg"; then
      echo "  - $pkg"
      pi uninstall "$pkg" || echo "  (uninstall failed — may not be removable)"
    fi
  done <<< "$had"

  rm -f "$PI_DIR/settings.json.pre-deploy"
REMOTE

echo "==> done. vps synced from local."
