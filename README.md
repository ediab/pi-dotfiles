# pi-elias

Elias's personal [pi](https://github.com/earendil-works/pi) (coding-agent harness) setup.
One repo, one command, and a fresh machine ends up with the same pi config every time.

## What you get

Running the bootstrap installs:

- **pi harness** — via npm (`@earendil-works/pi-coding-agent`), falling back to the official
  curl installer (`https://pi.dev/install.sh`) if npm fails.
- **pi packages** — the `PACKAGES` array in `bootstrap.sh` is the canonical list (web-access,
  subagents, ponytail, ask-user, compound-engineering, and more). See `bootstrap.sh` rather
  than this README — it's the source of truth so the two never drift.
  Package-installed skills (librarian, the `ce-*` suite, `ask-user`, superpowers, etc.) come
  along automatically with their packages — nothing extra to do.
- **Custom skills** — every directory under `home/skills/`, copied to `~/.pi/agent/skills/`
  (the path pi actually scans).
- **Custom extensions** — every file under `home/extensions/` (`clear`, `commit-push-pr`,
  `exit`, `statusline`, `terminal-status-title`) plus the `plan-mode/` directory extension,
  copied to `~/.pi/agent/extensions/`.
- **Agent config** — `home/settings.json` deployed as the canonical pi agent settings, and
  `home/AGENTS.md` seeded to `~/.pi/agent/AGENTS.md` (only when absent, so local-only
  sections like VPS access survive).

## What it does NOT install

- MCP servers (`~/.pi/agent/mcp.json`)
- Auth / API keys (`~/.pi/agent/auth.json`)
- Provider / model / theme settings (configure those in `~/.pi/agent/settings.json` after
  bootstrap, or edit `home/settings.json` and rebuild)

## Fresh-machine setup

Clone and run (recommended — fully self-contained):

```sh
git clone https://github.com/ediab/pi-elias.git
cd pi-elias
./bootstrap.sh
```

Or run directly via curl (note: the bundled skills and extensions won't be present without
a clone — `bootstrap.sh` will warn and skip them; clone for the full set):

```sh
curl -fsSL https://raw.githubusercontent.com/ediab/pi-elias/main/bootstrap.sh | bash
```

`bootstrap.sh` does three things, in order:

1. Installs the pi harness if it isn't already installed.
2. Installs the `PACKAGES` list via `pi install` and deploys `home/settings.json`.
3. Copies `home/skills/`, `home/extensions/`, and seeds `home/AGENTS.md`.

## Daily use

Edit the config files under `home/` in place, then re-apply:

```sh
./rebuild.sh
```

That's `pi update --all` plus a re-sync of `home/skills/`, `home/extensions/`, and
`home/settings.json` into `~/.pi/agent/`.

## Make it yours

This repo is Elias's. If you clone it, review these before you run `bootstrap.sh`:

- **Packages**: add/remove entries in the `PACKAGES` array at the top of `bootstrap.sh`.
- **Skills**: add/remove a directory under `home/skills/` — no script edit needed, every
  dir is deployed automatically.
- **Extensions**: add/remove a name in `CUSTOM_EXTENSIONS` or `CUSTOM_EXTENSION_DIRS` in
  `bootstrap.sh`, and put the file under `home/extensions/`.

**Heads-up:**

- `home/AGENTS.md` is Elias's personal agent policy. If you clone this repo you'd silently
  inherit it — edit or delete it if you don't want that.
- `home/settings.json` is the repo copy of your live pi agent settings. pi itself rewrites
  the live file (changelog version, installed-packages list). `sync-settings.sh` (below)
  keeps the repo copy fresh automatically; if you edit the live file by hand, re-sync it
  back into the repo before your next `./rebuild.sh` to avoid clobbering local changes.

## Repo tour

- `home/` — the actual config files, mirroring `~/.pi/agent/` one-to-one:
  `home/settings.json` -> `~/.pi/agent/settings.json`, `home/skills/` -> `~/.pi/agent/skills/`,
  `home/extensions/` -> `~/.pi/agent/extensions/`, `home/AGENTS.md` -> `~/.pi/agent/AGENTS.md`.
  Editing a file here is editing your deployed config.
- `bootstrap.sh` — fresh-machine setup. Run once.
- `rebuild.sh` — re-apply the config after any change. Run this every time.
- `sync-settings.sh` — auto-syncs the live `~/.pi/agent/settings.json` back into
  `home/settings.json` when pi rewrites it. Triggered by the launchd agent
  `com.pi-elias.sync-settings.plist` (watch path: `~/.pi/agent/settings.json`).
- `deploy-vps.sh` — pushes `home/skills/`, `home/extensions/`, and the live settings to the
  VPS (`ssh vps`) and reconciles installed packages against the canonical list.
- `docs/`, `CONCEPTS.md`, `HANDOFF.md`, `MANUAL_SKILLS.md` — project notes and archives.

## How the sync works

Files are **copied**, not symlinked. The dotfiles-style `home/` mirror keeps the repo
looking like the live tree, but pi manages `~/.pi/agent/` itself — it rewrites
`settings.json` on every install and package code is written into `extensions/` and
`skills/` — so a symlink would drag third-party package code into this repo. Copy on
bootstrap/rebuild, and `sync-settings.sh` copies the settings back when pi changes it.
