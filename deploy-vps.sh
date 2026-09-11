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
# Ponytail default mode (off = on-demand via /ponytail full). Push local config so VPS matches.
if [ -f "$HOME/.config/ponytail/config.json" ]; then
  ssh "$VPS_HOST" 'mkdir -p ~/.config/ponytail'
  rsync -az "$HOME/.config/ponytail/config.json" "$VPS_HOST:~/.config/ponytail/config.json"
fi

echo "==> 2/4  skills + prompts + agents + AGENTS.md + configs"
rsync -az --delete "$REPO_DIR/home/skills/" "$VPS_HOST:~/.pi/agent/skills/"
rsync -az --delete "$REPO_DIR/home/prompts/" "$VPS_HOST:~/.pi/agent/prompts/"
rsync -az --delete "$REPO_DIR/home/agents/" "$VPS_HOST:~/.pi/agent/agents/"
rsync -az "$REPO_DIR/home/models.json" "$VPS_HOST:~/.pi/agent/models.json"
rsync -az "$REPO_DIR/home/subagents.json" "$VPS_HOST:~/.pi/agent/subagents.json"
rsync -az "$REPO_DIR/home/AGENTS.md" "$VPS_HOST:~/.pi/agent/AGENTS.md"
ssh "$VPS_HOST" 'rm -f ~/.pi/agent/subagents-lite.json'  # legacy lite config, superseded by tintinweb pi-subagents
# leftovers from packages that are no longer installed anywhere
ssh "$VPS_HOST" 'rm -rf ~/.pi/agent/pi-pretty ~/.pi/agent/intercom; rm -f ~/.pi/agent/lsp.json ~/.pi/agent/claude-bridge.json'

# Per-machine package configs: not versioned in the repo, but mirrored so the VPS behaves the same.
for cfg in zentui.json code-previews.json; do
  if [ -f "$PI_DIR/$cfg" ]; then
    rsync -az "$PI_DIR/$cfg" "$VPS_HOST:~/.pi/agent/$cfg"
  fi
done

# web-search.json: same routing/preferences as local, but the TinyFish key comes from a 0600
# file on the VPS instead of the macOS Keychain (Linux has no `security`). The key is pulled
# from the local Keychain when present and never lands in the repo.
if command -v security >/dev/null 2>&1 && security find-generic-password -s tinyfish-api-key -w >/dev/null 2>&1; then
  security find-generic-password -s tinyfish-api-key -w | ssh "$VPS_HOST" 'umask 077; cat > ~/.pi/agent/tinyfish-api-key'
fi
python3 - "$REPO_DIR/home/web-search.json" <<'PY' | ssh "$VPS_HOST" 'cat > ~/.pi/agent/web-search.json'
import json, sys
cfg = json.load(open(sys.argv[1]))
cfg["tinyfishApiKey"] = '!cat "$HOME/.pi/agent/tinyfish-api-key"'
print(json.dumps(cfg, indent=2) + "\n")
PY
# mcp.json is deliberately NOT synced: MCP servers are per-machine (youtube-music runs a local
# macOS node build), so the VPS keeps its own entry list.

echo "==> 3/4  extensions"
# herdr-agent-state.ts is installed and versioned by Herdr on each machine (see
# 'herdr integration status'), not shipped by this repo — exclude it so --delete leaves the
# VPS's own copy alone. Do not drop this exclude: --delete would remove it from the VPS.
rsync -az --delete --exclude=herdr-agent-state.ts "$REPO_DIR/home/extensions/" "$VPS_HOST:~/.pi/agent/extensions/"

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
