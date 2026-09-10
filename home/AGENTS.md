# Working Principles

Project-level `AGENTS.md` / `CLAUDE.md` files layer on top of this one and take precedence where they are more specific.

* Make the smallest correct change that fully solves the task.
* Do not broaden scope or refactor unrelated code unless necessary.
* Inspect relevant code before modifying it. Follow existing project patterns and conventions.
* Do not guess APIs, types, file locations, or library behaviour when they can be verified from the repository or installed dependencies.
* Prefer simple implementations over additional abstractions unless complexity is justified by the task.
* If the task is sufficiently specified, proceed. Ask only when unresolved ambiguity would materially change the implementation.

## Repository Navigation

* Search for relevant files and symbols before reading large parts of the repository.
* Read enough surrounding code to understand interfaces, callers, tests, and local conventions before editing.
* Prefer existing utilities and abstractions over introducing duplicates.
* Treat repository documentation, configuration, tests, and source code as the source of truth.

## Changes

* Preserve existing behaviour unless the requested change requires otherwise.
* Avoid speculative backwards compatibility, fallback paths, or defensive abstractions that are not required.
* Do not remove apparently intentional functionality without confirming that it is part of the requested change.
* Keep changes localized and easy to review.

## Validation

* After modifying code, run the most relevant available tests, type checks, linters, or validation commands.
* Prefer targeted checks during iteration; run broader project checks when appropriate before finishing.
* Fix errors introduced by your changes. Do not hide failures by weakening tests, types, or validation.
* Report validation that could not be run.

## Git

* Do not commit, push, rebase, reset, stash, or modify branches unless explicitly requested.
* Do not overwrite or revert unrelated working-tree changes.
* Assume other work may exist in the repository.
* **Standing exception:** `~/dev/configs` and `~/dev/pi-dotfiles` are repos where committing after an edit is expected (see Local environment). Pushing still requires an explicit request.

## Communication

* Be concise and technical.
* State important assumptions, material trade-offs, and unresolved risks.
* When finished, summarize what changed and any relevant validation performed.

## Local environment

### Library and API documentation

Use the `context7` MCP server for library/API documentation — it returns current, version-pinned docs, so it is more accurate than web search or guessing from memory.

Flow: `mcp({ tool: "context7_resolve-library-id", args: '{"libraryName": "react"}' })` to get a library ID, then `mcp({ tool: "context7_query-docs", args: '{"libraryId": ".../react", "topic": "hooks"}' })` for up-to-date docs. Prefer this for exact API signatures, current options, and version-pinned behavior.

### pi-dotfiles sync

Keep pi-dotfiles in sync with the live harness: whenever you install/remove a package, edit `~/.pi/agent/settings.json`, or add/edit a skill, extension, or agent, mirror that change in `~/dev/pi-dotfiles` (`home/settings.json`, `home/skills/`, `home/extensions/`, `home/agents/`) and commit it, so other machines reinstall identically. Packages need no manual mirroring — `sync-settings.sh` records `pi install`/`pi uninstall` into `home/settings.json` automatically. `rebuild.sh` deploys skills/extensions/agents/settings but **not** `AGENTS.md`; `bootstrap.sh` seeds it only when absent, so keep the repo copy in step by hand.

### Dotfiles & configs

Shell, terminal, and editor configs live in `~/dev/configs/` (git repo). Edit them there and commit, so they stay versioned and syncable across machines.

Symlinked (edit in `~/dev/configs/` directly):
- `.zshrc` → `~/.zshrc`
- `ghostty/config` → `~/.config/ghostty/config`
- `starship.toml` → `~/.config/starship.toml`
- `vscode/settings.json` → `~/Library/Application Support/Code/User/settings.json`
- `vscode/keybindings.json` → `~/Library/Application Support/Code/User/keybindings.json`

Pi agent files — `settings.json`, `extensions/` — are **not** in configs. They live in `~/dev/pi-dotfiles/home/` and are deployed to `~/.pi/agent/` as copies by `bootstrap.sh`/`rebuild.sh`. Edit them in `~/dev/pi-dotfiles/home/`, then run `~/dev/pi-dotfiles/rebuild.sh`. Note: `pi` itself rewrites `settings.json` (changelog version, installed-packages list); re-sync live→repo after such changes to avoid backup drift.

Also: `vscode/extensions.txt` — list of installed VS Code extensions, regenerated with `code --list-extensions`.

### VPS access

To access this VPS use `ssh vps` (alias defined in `~/.ssh/config`).
- Host: `77.42.90.4`
- User: `diab`
- IdentityFile: `~/.ssh/id_rsa_nroot`
- ControlMaster multiplexing enabled; LocalForward 18789, 18792, 19999.
- `deploy-vps.sh` does not sync `AGENTS.md`; the VPS has its own copy.
