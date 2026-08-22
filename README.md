# pi-dotfiles

Elias's personal [pi](https://github.com/earendil-works/pi) (coding-agent harness) setup.
One repo, one command, and a fresh machine ends up with the same pi config every time.

## What you get

Running the bootstrap installs:

- **pi harness** — via npm (`@earendil-works/pi-coding-agent`), falling back to the official
  curl installer (`https://pi.dev/install.sh`) if npm fails.
- **pi packages** — the canonical list is the `packages` array in `home/settings.json`. It stays
  in sync automatically: when you `pi install` / `pi uninstall` on a live machine,
  `sync-settings.sh` records the change in the repo. `bootstrap.sh` installs every package
  in that list. Package-installed skills come along automatically with their packages —
  nothing extra to do.
- **Custom skills** — every directory under `home/skills/`, copied to `~/.pi/agent/skills/`
  (the path pi actually scans).
- **Custom extensions** — every file under `home/extensions/` (`clear`, `exit`,
  `statusline`, `terminal-status-title`), copied to `~/.pi/agent/extensions/`.
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
git clone https://github.com/ediab/pi-dotfiles.git
cd pi-dotfiles
./bootstrap.sh
```

Or run directly via curl (note: the bundled skills and extensions won't be present without
a clone — `bootstrap.sh` will warn and skip them; clone for the full set):

```sh
curl -fsSL https://raw.githubusercontent.com/ediab/pi-dotfiles/main/bootstrap.sh | bash
```

`bootstrap.sh` does four things, in order:

1. Installs the pi harness if it isn't already installed.
2. Deploys `home/settings.json` and installs every package in its `packages` list.
3. Copies `home/skills/`, `home/extensions/`, and seeds `home/AGENTS.md`.
4. Installs the launchd auto-sync agent (`com.pi-dotfiles.sync-settings.plist`, templated
   with your repo path) so `settings.json` changes flow back into the repo automatically.

## Daily use

Edit the config files under `home/` in place, then re-apply:

```sh
./rebuild.sh
```

That's `pi update --all` plus a re-sync of `home/skills/`, `home/extensions/`, and
`home/settings.json` into `~/.pi/agent/`.

### Keeping the repo in sync

| What | Direction | How |
|---|---|---|
| `settings.json` (provider, model, theme, packages) | live → repo, **automatic** | launchd agent (installed by `bootstrap.sh` step 4) watches the live file; `sync-settings.sh` commits any `pi`-made change within seconds |
| `home/skills/`, `home/extensions/` | repo → live | edit in the repo, then `./rebuild.sh`; live edits are overwritten |
| `home/AGENTS.md` | repo → live (seed only) | the live copy keeps your local-only sections (e.g. VPS access) — the one file that intentionally drifts |
| `auth.json`, `mcp.json`, `models-store.json`, sessions, caches | never in repo | secrets and runtime state, by design |

Bottom line: your settings reflect into the repo by themselves; the repo is the source of
truth for skills, extensions, and the base `settings.json` that gets deployed to new machines.

## Make it yours

This repo is Elias's. If you clone it, review these before you run `bootstrap.sh`:

- **Packages**: `pi install <pkg>` / `pi uninstall <pkg>` on a live machine —
  `sync-settings.sh` records it in `home/settings.json` — or edit `home/settings.json`'s
  `packages` list directly.
- **Skills**: add/remove a directory under `home/skills/` — no script edit needed, every
  dir is deployed automatically.
- **Extensions**: add/remove a file (`.ts`/`.js`) or a directory (`index.ts`/`index.js`)
  under `home/extensions/` — auto-discovered, no script edit needed.

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
- `rebuild.sh` — re-apply the config after any change. Run this every time. Supports
  `--sync-only` to deploy skills/extensions without touching installed packages or settings.
- `sync-settings.sh` — auto-syncs the live `~/.pi/agent/settings.json` back into
  `home/settings.json` when pi rewrites it. Triggered by the launchd agent
  `com.pi-dotfiles.sync-settings.plist` (a template in this repo, installed and path-substituted
  by `bootstrap.sh` step 4; watch path: `~/.pi/agent/settings.json`).
- `deploy-vps.sh` — pushes `home/skills/`, `home/extensions/`, and the live settings to the
  VPS (`ssh vps`) and reconciles installed packages against the canonical list.
- `docs/`, `CONCEPTS.md`, `HANDOFF.md` — archival notes and planning records, kept
  **local-only** and gitignored (not canonical config; find them in git history).

## How the sync works

Files are **copied**, not symlinked. The dotfiles-style `home/` mirror keeps the repo
looking like the live tree, but pi manages `~/.pi/agent/` itself — it rewrites
`settings.json` on every install and package code is written into `extensions/` and
`skills/` — so a symlink would drag third-party package code into this repo. Copy on
bootstrap/rebuild, and `sync-settings.sh` copies the settings back when pi changes it.
