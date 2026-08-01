#!/usr/bin/env bash
# pi-elias — install the pi coding-agent harness + Elias's packages + skills.
# Does NOT install MCPs, auth keys, or provider/model settings.
set -euo pipefail

# Skills bundled in this repo under home/skills (whole directories, including subdocs).
# Add/remove a skill by adding/removing its directory under home/skills/; no script edit needed.

# Custom extensions bundled in this repo under home/extensions (single-file .ts -> ~/.pi/agent/extensions/).
CUSTOM_EXTENSIONS=(clear commit-push-pr exit statusline terminal-status-title)
# Custom directory extensions bundled in this repo (dir with index.ts -> ~/.pi/agent/extensions/<name>/).
CUSTOM_EXTENSION_DIRS=(plan-mode)

# Resolve the repo root (works for clone+run and curl|bash via $0).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PI_SKILLS_DIR="$HOME/.pi/agent/skills"   # note: 'agent' singular — the path pi scans

echo "==> 1/3  pi harness"
if command -v pi >/dev/null 2>&1; then
  echo "    pi already installed ($(pi --version 2>/dev/null || echo unknown)); skipping"
else
  echo "    installing via npm..."
  if ! npm install -g --ignore-scripts @earendil-works/pi-coding-agent; then
    echo "    npm failed; falling back to curl installer..."
    curl -fsSL https://pi.dev/install.sh | sh
  fi
  command -v pi >/dev/null 2>&1 || { echo "    ERROR: pi still not on PATH"; exit 1; }
fi

echo "==> 2/3  packages (canonical list = home/settings.json, auto-synced from live by sync-settings.sh)"

# Deploy canonical pi agent settings.json from this repo as the base; pi install
# below appends each installed package into it. Live edits to settings.json are
# re-synced back into the repo automatically by sync-settings.sh (launchd).
cp "$SCRIPT_DIR/home/settings.json" "$HOME/.pi/agent/settings.json" \
  && echo "    settings.json  deployed" \
  || echo "    FAILED: home/settings.json"

# Packages to install = string entries in settings.json's packages array (the same
# list deploy-vps.sh reconciles against). No separate PACKAGES array to drift.
PKGS="$(python3 - "$SCRIPT_DIR/home/settings.json" <<'PY'
import json, sys
print("\n".join(p for p in json.load(open(sys.argv[1]))["packages"] if isinstance(p, str)))
PY
)"
if [ -z "$PKGS" ]; then
  echo "    WARNING: no package list found in home/settings.json (clone the repo for the full set)"
fi
for pkg in $PKGS; do
  pi install "$pkg" || echo "  FAILED: $pkg  (rerun: pi install $pkg)"
done

echo "==> 3/3  skills (every dir in $SCRIPT_DIR/home/skills/) + extensions (${#CUSTOM_EXTENSIONS[@]} total) + AGENTS.md seed"
mkdir -p "$PI_SKILLS_DIR"
shopt -s nullglob
for src in "$SCRIPT_DIR/home/skills"/*/; do
  skill="$(basename "$src")"
  rm -rf "$PI_SKILLS_DIR/$skill"
  cp -R "$SCRIPT_DIR/home/skills/$skill" "$PI_SKILLS_DIR/"
  echo "    $skill  installed"
done
shopt -u nullglob

PI_EXTENSIONS_DIR="$HOME/.pi/agent/extensions"
mkdir -p "$PI_EXTENSIONS_DIR"
for ext in "${CUSTOM_EXTENSIONS[@]}"; do
  src="$SCRIPT_DIR/home/extensions/$ext.ts"
  [ -f "$src" ] || src="$SCRIPT_DIR/home/extensions/$ext.js"
  if [ ! -f "$src" ]; then
    echo "  MISSING: $ext (no $src) — clone the repo instead of curl|bash"
    continue
  fi
  cp "$src" "$PI_EXTENSIONS_DIR/$(basename "$src")"
  echo "    $ext  installed"
done
for ext in "${CUSTOM_EXTENSION_DIRS[@]}"; do
  src="$SCRIPT_DIR/home/extensions/$ext"
  if [ ! -d "$src" ]; then
    echo "  MISSING: $ext (no $src/) — clone the repo instead of curl|bash"
    continue
  fi
  mkdir -p "$PI_EXTENSIONS_DIR/$ext"
  cp -R "$src/". "$PI_EXTENSIONS_DIR/$ext/"
  echo "    $ext/  installed"
done

# Seed ~/.pi/agent/AGENTS.md from the sanitized repo copy. Only when absent — never clobber
# local-only sections like VPS access details.
if [ ! -f "$HOME/.pi/agent/AGENTS.md" ] && [ -f "$SCRIPT_DIR/home/AGENTS.md" ]; then
  cp "$SCRIPT_DIR/home/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
  echo "    AGENTS.md  seeded (add any local-only sections, e.g. VPS access, manually)"
else
  echo "    AGENTS.md  already present — left untouched (local edits preserved)"
fi

echo "==> verify"
command -v pi >/dev/null 2>&1 && echo "    pi: $(pi --version)" || echo "    pi: MISSING"
echo "    packages:"
pi list 2>/dev/null || echo "    pi list failed"
shopt -s nullglob
for src in "$SCRIPT_DIR/home/skills"/*/; do
  skill="$(basename "$src")"
  [ -f "$PI_SKILLS_DIR/$skill/SKILL.md" ] && echo "    ok: $skill" || echo "    MISSING: $skill"
done
shopt -u nullglob
for ext in "${CUSTOM_EXTENSIONS[@]}"; do
  [ -f "$HOME/.pi/agent/extensions/$ext.ts" ] && echo "    ok: $ext" || echo "    MISSING: $ext"
done
for ext in "${CUSTOM_EXTENSION_DIRS[@]}"; do
  [ -f "$HOME/.pi/agent/extensions/$ext/index.ts" ] && echo "    ok: $ext/" || echo "    MISSING: $ext"
done
[ -f "$HOME/.pi/agent/AGENTS.md" ] && echo "    ok: AGENTS.md" || echo "    MISSING: AGENTS.md"

echo "==> done."
echo "    MCPs and auth keys were NOT installed — configure those separately."
