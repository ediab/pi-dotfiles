# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Tech Documentation Lookups

Use the `context7` MCP server for library/API documentation — it returns current, version-pinned docs, so it's more accurate than web search or guessing from memory.

Flow: `mcp({ tool: "context7_resolve-library-id", args: '{"libraryName": "react"}' })` to get a library ID, then `mcp({ tool: "context7_query-docs", args: '{"libraryId": ".../react", "topic": "hooks"}' })` for up-to-date docs. Prefer this for exact API signatures, current options, and version-pinned behavior.

## Custom pi commands

Slash commands added via extensions in `~/dev/pi-dotfiles/home/extensions/` (synced to `~/.pi/agent/extensions/` by `bootstrap.sh`/`rebuild.sh`):

- `/clear` — clear the conversation, start a fresh session (alias for `/new`)
- `/exit` — quit pi (alias for `/quit`)

## pi-dotfiles sync

Keep pi-dotfiles in sync with the live harness: whenever you install/remove a package, edit `~/.pi/agent/settings.json`, or add/edit a skill or extension, mirror that change in `~/dev/pi-dotfiles` (`home/settings.json`, `home/skills/`, `home/extensions/`) so other machines reinstall identically. Packages need no manual mirroring — `sync-settings.sh` records `pi install`/`pi uninstall` into `home/settings.json` automatically.

## Dotfiles & configs

Shell, terminal, and editor configs live in `~/dev/configs/` (git repo). When you edit any of these, commit the change there so they're versioned and syncable across machines.

Symlinked (edit in `~/dev/configs/` directly):
- `.zshrc` → `~/.zshrc`
- `ghostty/config` → `~/.config/ghostty/config`
- `starship.toml` → `~/.config/starship.toml`
- `vscode/settings.json` → `~/Library/Application Support/Code/User/settings.json`
- `vscode/keybindings.json` → `~/Library/Application Support/Code/User/keybindings.json`

Pi agent files — `settings.json`, `extensions/no-footer.ts`, `extensions/statusline.ts` — are **not** in configs. They live in `~/dev/pi-dotfiles/home/` and are deployed to `~/.pi/agent/` as copies by `bootstrap.sh`/`rebuild.sh`. Edit them in `~/dev/pi-dotfiles/home/`, then run `~/dev/pi-dotfiles/rebuild.sh`. Note: `pi` itself rewrites `settings.json` (changelog version, installed-packages list); re-sync live→repo after such changes to avoid backup drift.

Also: `vscode/extensions.txt` — list of installed VS Code extensions, regenerated with `code --list-extensions`.

## VPS access

To access this VPS use `ssh vps` (alias defined in `~/.ssh/config`).
- Host: `77.42.90.4`
- User: `diab`
- IdentityFile: `~/.ssh/id_rsa_nroot`
- ControlMaster multiplexing enabled; LocalForward 18789, 18792, 19999.
