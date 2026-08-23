#!/usr/bin/env bash
# pi-dotfiles — update pi + all installed packages, and re-sync bundled custom skills.
# For day-to-day updates on a machine already bootstrapped by bootstrap.sh.
# New machine? Use bootstrap.sh instead.
#   rebuild.sh              → full: pi update --all + settings.json + skills + extensions + memo
#   rebuild.sh --sync-only  → skills + extensions + memo only; no package or settings changes
#                             (used after skill/memo edits when packages/settings must stay put)
set -euo pipefail

SYNC_ONLY=0
if [ "${1:-}" = "--sync-only" ]; then
  SYNC_ONLY=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PI_SKILLS_DIR="$HOME/.pi/agent/skills"
PI_EXTENSIONS_DIR="$HOME/.pi/agent/extensions"
# Skills deployed below = every dir in $SCRIPT_DIR/home/skills/ (whole-dir copies).
# Extensions are auto-discovered from home/extensions — every top-level .ts/.js file is a
# single-file extension, every subdirectory with an index.ts/index.js is a directory
# extension. Add/remove by file/dir; no script edit needed.
shopt -s nullglob
CUSTOM_EXTENSIONS=()
for src in "$SCRIPT_DIR/home/extensions/"*.ts "$SCRIPT_DIR/home/extensions/"*.js; do
  CUSTOM_EXTENSIONS+=("$(basename "${src%.*}")")
done
CUSTOM_EXTENSION_DIRS=()
for src in "$SCRIPT_DIR/home/extensions/"*/; do
  [ -f "$src/index.ts" ] || [ -f "$src/index.js" ] || continue
  CUSTOM_EXTENSION_DIRS+=("$(basename "$src")")
done
shopt -u nullglob

if [ "$SYNC_ONLY" = "1" ]; then
  echo "==> sync-only: skipping 'pi update --all' and the settings.json copy"
else
  echo "==> 1/3  pi + packages"
  pi update --all

  echo "==> 2/3  settings.json (repo → live)"
  # Repo is source of truth for the pi agent settings.json. NOTE: pi itself rewrites
  # this file (changelog version, installed-packages list); if you edit the live file,
  # re-sync it back into the repo (`cp ~/.pi/agent/settings.json ~/Dev/pi-dotfiles/settings.json`)
  # before re-running rebuild.sh to avoid clobbering local changes.
  cp "$SCRIPT_DIR/home/settings.json" "$HOME/.pi/agent/settings.json" \
    && echo "    settings.json  re-synced" \
    || echo "    FAILED: home/settings.json"
fi

echo "==> 3/3  skills (every dir in $SCRIPT_DIR/home/skills/) + extensions (${#CUSTOM_EXTENSIONS[@]} total)"
mkdir -p "$PI_SKILLS_DIR"
shopt -s nullglob
for src in "$SCRIPT_DIR/home/skills"/*/; do
  skill="$(basename "$src")"
  rm -rf "$PI_SKILLS_DIR/$skill"
  cp -R "$SCRIPT_DIR/home/skills/$skill" "$PI_SKILLS_DIR/"
  echo "    $skill  re-synced"
done
shopt -u nullglob

mkdir -p "$PI_EXTENSIONS_DIR"
for ext in "${CUSTOM_EXTENSIONS[@]}"; do
  src="$SCRIPT_DIR/home/extensions/$ext.ts"
  [ -f "$src" ] || src="$SCRIPT_DIR/home/extensions/$ext.js"
  cp "$src" "$PI_EXTENSIONS_DIR/$(basename "$src")"
  echo "    $ext  re-synced"
done
if [ "${#CUSTOM_EXTENSION_DIRS[@]}" -gt 0 ]; then
  for ext in "${CUSTOM_EXTENSION_DIRS[@]}"; do
    src="$SCRIPT_DIR/home/extensions/$ext"
    mkdir -p "$PI_EXTENSIONS_DIR/$ext"
    cp -R "$src/". "$PI_EXTENSIONS_DIR/$ext/"
    echo "    $ext/  re-synced"
  done
fi

# Prompt templates: every .md in home/prompts/ → ~/.pi/agent/prompts/. Add/remove by file; no script edit needed.
PI_PROMPTS_DIR="$HOME/.pi/agent/prompts"
mkdir -p "$PI_PROMPTS_DIR"
shopt -s nullglob
for src in "$SCRIPT_DIR/home/prompts/"*.md; do
  cp "$src" "$PI_PROMPTS_DIR/"
  echo "    $(basename "$src")  re-synced"
done
shopt -u nullglob

echo "==> done."
