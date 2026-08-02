# pi-elias

Elias's personal [pi](https://github.com/earendil-works/pi) (coding-agent harness) setup.
One repo, one command, and a fresh machine ends up with the same pi config every time.

## What you get

Running the bootstrap installs:

- **pi harness** — via npm (`@earendil-works/pi-coding-agent`), falling back to the official
  curl installer (`https://pi.dev/install.sh`) if npm fails.
- **pi packages** — the canonical list is the `packages` array in `home/settings.json`. It stays
  in sync automatically: when you `pi install` / `pi uninstall` on a live machine,
  `sync-settings.sh` records the change in the repo. `bootstrap.sh` installs every package
  in that list. Package-installed skills (pi-subagents, pi-ponytail, whatever else you add)
  come along automatically with their packages — nothing extra to do.
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

`bootstrap.sh` does four things, in order:

1. Installs the pi harness if it isn't already installed.
2. Deploys `home/settings.json` and installs every package in its `packages` list.
3. Copies `home/skills/`, `home/extensions/`, and seeds `home/AGENTS.md`.
4. Installs the launchd auto-sync agent (`com.pi-elias.sync-settings.plist`, templated
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
- **Extensions**: add/remove a name in `CUSTOM_EXTENSIONS` or `CUSTOM_EXTENSION_DIRS` in
  `bootstrap.sh`, and put the file under `home/extensions/`.

**Heads-up:**

- `home/AGENTS.md` is Elias's personal agent policy. If you clone this repo you'd silently
  inherit it — edit or delete it if you don't want that.
- `home/settings.json` is the repo copy of your live pi agent settings. pi itself rewrites
  the live file (changelog version, installed-packages list). `sync-settings.sh` (below)
  keeps the repo copy fresh automatically; if you edit the live file by hand, re-sync it
  back into the repo before your next `./rebuild.sh` to avoid clobbering local changes.

## Ticket execution workflow (2026-08)

Until recently the curated pipeline ended at a seam: `brainstorming → to-spec → to-tickets → ?`.
Matt's `to-tickets` deliberately stops after publishing agent-safe tickets, and a bare
pi-subagents dispatch ("implement these tickets with subagents") does not by itself reproduce
the guarantees Superpowers' subagent-driven development gave: an explicit approved ticket set,
dependency ordering, fresh per-ticket contexts, independent Spec and Standards review, bounded
fix loops, one reviewed commit per ticket, and a final whole-feature review and branch-finishing
handoff.

**What was decided** (research memo `MATT_SUPER.md`; implementation-ready spec
`docs/plans/2026-08-02-002-feat-ticket-execution-workflow.md`):

- **`to-tickets` gains an execution handoff.** After tickets are published, it retains a durable
  parent-spec reference, gets your approval of per-ticket test seams, assesses the work, and
  asks you to choose: `Implement directly` (the unchanged Matt `implement` flow, with the
  commit-before-review order pinned so `code-review` sees a committed diff) or
  `Implement with subagents` (a new `execute-tickets` coordinator). The agent recommends; you
  always decide.
- **`execute-tickets` is a thin parent-orchestration skill** that drives pi-subagents instead of
  duplicating it: claim ticket → one fresh `worker` per ticket in a single feature worktree
  (Matt `tdd` guidance, `context: fresh`, no turn/tool budgets) → parallel fresh Spec and
  Standards reviewers → parent adjudication → resume the same worker for accepted fixes →
  parent validates and creates one reviewed commit per ticket → tracker resolution. Capped at
  three review/fix rounds, then a pause for you. Writers are sequential in v1.
- **The configured tracker is the only durable ledger.** No second progress file: claims, base
  SHAs, accepted/deferred findings, validation evidence, and commit SHAs are recorded per
  ticket, so a fresh Pi session can continue mid-run from the feature worktree.
- **Both modes converge** on a whole-feature Spec + Standards review from the original base,
  the full configured verification suite, and one `finishing-a-development-branch` call.

**Why this shape:**

- It restores the useful Superpowers guarantees without reinstalling Superpowers' execution
  stack, and without touching Matt's `implement`/`tdd`/`code-review` skills, pi-subagents
  defaults, or any pi settings/models (project overrides would silently replace user agent
  config).
- It uses pi-subagents where it is strongest — fresh/forked contexts, parallel reviewers,
  worker resumption — and only defines the missing ticket lifecycle itself. Reviewers get the
  Spec/Standards rubrics **pasted by the parent**: the vendored `code-review` skill is
  parent-orchestration text, so loading it into a read-only reviewer would contradict its own
  no-subagents instruction.
- Parallel writer worktrees were deliberately deferred: they produce patch handoffs and
  integration complexity that measured throughput doesn't yet justify.
- The `to-tickets` adaptation is **upstream-resilient**: the vendored Matt file receives only a
  one-line pointer; all handoff content lives in `home/skills/to-tickets/handoff.md`, so a
  future Matt update overwrites cleanly and re-adding the pointer is the only re-apply step.

**Status:** implemented (2026-08-02); deployed to `~/.pi/agent/` via `rebuild.sh --sync-only`.
The spec also added `rebuild.sh --sync-only`, which deploys skills and the memo without
touching installed packages or settings.

## Repo tour

- `home/` — the actual config files, mirroring `~/.pi/agent/` one-to-one:
  `home/settings.json` -> `~/.pi/agent/settings.json`, `home/skills/` -> `~/.pi/agent/skills/`,
  `home/extensions/` -> `~/.pi/agent/extensions/`, `home/AGENTS.md` -> `~/.pi/agent/AGENTS.md`.
  Editing a file here is editing your deployed config.
- `bootstrap.sh` — fresh-machine setup. Run once.
- `rebuild.sh` — re-apply the config after any change. Run this every time.
- `sync-settings.sh` — auto-syncs the live `~/.pi/agent/settings.json` back into
  `home/settings.json` when pi rewrites it. Triggered by the launchd agent
  `com.pi-elias.sync-settings.plist` (a template in this repo, installed and path-substituted
  by `bootstrap.sh` step 4; watch path: `~/.pi/agent/settings.json`).
- `deploy-vps.sh` — pushes `home/skills/`, `home/extensions/`, and the live settings to the
  VPS (`ssh vps`) and reconciles installed packages against the canonical list.
- `docs/plans/` — implementation-ready specs (e.g. `2026-08-02-002-feat-ticket-execution-workflow.md`);
  `docs/solutions/tooling-decisions/` — ADR-style records of past tooling choices.
- `MATT_SUPER.md` — research/decision memo for the ticket execution workflow (deployed to
  `~/.pi/agent/` alongside the skills); `CONCEPTS.md`, `HANDOFF.md`, `MANUAL_SKILLS.md` —
  project notes and archives.

## How the sync works

Files are **copied**, not symlinked. The dotfiles-style `home/` mirror keeps the repo
looking like the live tree, but pi manages `~/.pi/agent/` itself — it rewrites
`settings.json` on every install and package code is written into `extensions/` and
`skills/` — so a symlink would drag third-party package code into this repo. Copy on
bootstrap/rebuild, and `sync-settings.sh` copies the settings back when pi changes it.
