# Manual Skills

The curated set of 25 skills is **vendored** in this repo at `skills/` (whole
directories, including subdocs) and deployed to `~/.pi/agent/skills/` by
`install.sh`/`update.sh`. This repo is the source of truth: upstream repos
(superpowers / mattpocock) are only consulted when you choose to pull an update.
Two upstream sources were originally copied in: superpowers (obra) and mattpocock.
This file records the **curated** state after combining the two schools (2025-07-15).

## Curated set — 25 skills

### Superpowers kept (6) — ideation + mechanics + behavioral discipline
| Skill | Role |
|-------|------|
| `brainstorming` | Design exploration. **Edited:** advisory (no auto-gate); exit rewired `writing-plans` → `to-spec`. |
| `dispatching-parallel-agents` | Concurrent independent subagent tasks (the "subagents" mechanic). |
| `using-git-worktrees` | Isolated workspaces (the "worktrees" mechanic). |
| `finishing-a-development-branch` | Integration/PR menu. Already standalone — no edit needed. |
| `receiving-code-review` | Handle review feedback w/ rigor, anti-sycophancy. Already source-agnostic — works with Matt `code-review`, no edit needed. |
| `verification-before-completion` | Fresh-evidence discipline for "done" claims. |

### Matt Pocock kept (19) — pipeline + the rest
`setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `wayfinder`, `implement`, `tdd`,
`diagnosing-bugs`, `code-review`, `codebase-design`, `domain-modeling`, `prototype`,
`research`, `resolving-merge-conflicts`, `grilling`, `grill-me`, `grill-with-docs`,
`handoff`, `teach`, `writing-great-skills`.

## Dropped (8)
- Superpowers (7): `test-driven-development`, `subagent-driven-development`,
  `executing-plans`, `writing-plans`, `systematic-debugging`,
  `requesting-code-review`, `writing-skills`.
- Matt Pocock (1): `triage`.

## Rationale (the 10 grilling decisions)
1. **TDD posture — bug-mandatory.** Keep Matt `tdd` (advisory red-green-refactor) +
   Matt `diagnosing-bugs` regression-test-before-fix rule. Drop SP
   `test-driven-development` (Iron Law). Features test-optional; bug fixes must get a
   regression test.
2. **Execution — lean Matt for the build.** Keep Matt `implement`; keep SP
   `dispatching-parallel-agents`, `using-git-worktrees`,
   `finishing-a-development-branch`. Drop SP `subagent-driven-development` + `executing-plans`.
3. **Planning — light Matt.** Keep Matt `to-spec` + `to-tickets` (run
   `/setup-matt-pocock-skills`); drop Matt `triage` + `wayfinder` (heavy state
   machines; _`wayfinder` later re-added 2026-07-29 — see Addendum below_); drop SP `writing-plans`; rewire `brainstorming` → `to-spec`.
4. **Debugging.** Keep Matt `diagnosing-bugs`; drop SP `systematic-debugging`.
5. **Code review.** Keep Matt `code-review` + SP `receiving-code-review`; drop SP
   `requesting-code-review`.
6. **Writing skills.** Keep Matt `writing-great-skills`; drop SP `writing-skills`
   (its "no skill without a failing test" Iron Law is off-precision once TDD is bug-only).
7. **Brainstorming gate — fully advisory.** Drop the `You MUST` + `<HARD-GATE>` + the
   "even a config change" anti-pattern. Fires only on trigger.
8. TDD-coupled adjustments folded into the drops — only `brainstorming` needed an edit.
9. `verification-before-completion` — kept as-is (not a gate; no Matt equivalent for the
   anti-claim-hedging discipline).
10. Confirmed the rest; kept `grill-me` as the `/grill-me` alias.

## Edits applied (now live in the vendored copy at `skills/<skill>/`)
- `brainstorming/SKILL.md`: advisory frontmatter; removed `<HARD-GATE>` block and the
  "This Is Too Simple" anti-pattern; softened the checklist header; step 6 path →
  `docs/specs/` with a note that `to-spec` produces the canonical PRD; step 9 →
  `to-spec`; the process-flow diagram terminal + edge → `to-spec`; terminal paragraph
  → `to-spec`; the "After the Design" Implementation section → `to-spec`.
- `receiving-code-review/SKILL.md`: **no edit** — already source-agnostic (splits by
  human-partner vs external reviewers; Matt `code-review` output falls under
  "external reviewers").
- `finishing-a-development-branch/SKILL.md`: **no edit** — already standalone
  (detects its own worktree vs. normal-repo state; doesn't reference the dropped
  `executing-plans`/`subagent-driven-development`).
- The other 24 skill dirs are vendored verbatim from upstream (unchanged). 25 total.

## Deployment
- `install.sh` / `update.sh` deploy **every directory** under `skills/` as a whole-dir
  copy (`rm -rf` the live skill first, then `cp -R`) so live exactly matches the repo —
  no stale subdocs, no SKILL.md-only gaps. Add a skill = drop a dir under `skills/`;
  remove one = delete the dir. No script edits needed (the loop globs `skills/*/`).
- **Live skill edits are overwritten on the next `update.sh`** — edit in the repo, then
  run `update.sh` (or `install.sh`) to deploy. This mirrors how `settings.json` is
  already handled.

## Config fixes so reinstall doesn't clobber the curation
- `install.sh`: removed `git:github.com/obra/superpowers` from `PACKAGES`. Previously a
  fresh-machine install would `pi install` superpowers → re-inject the
  `using-superpowers` bootstrap + all 13 SP skills, undoing the 7 SP drops.
- `settings.json` (repo): removed `superpowers` from the `installed-packages` list
  (syncing live → repo; the live file already had it gone).

## End-to-end blend
`brainstorming` (SP, advisory) → `to-spec` → `to-tickets` (Matt planning) →
`implement` (Matt, advisory `/tdd`) → `tdd` (Matt; **mandatory for bugs** via
`diagnosing-bugs`) → `code-review` (Matt Standards+Spec) → `receiving-code-review` (SP
discipline) → `verification-before-completion` (SP) → `finishing-a-development-branch`
(SP integrate). Heavy/parallel work goes through `dispatching-parallel-agents` +
`using-git-worktrees`. No trigger collisions remain (the only double-trigger, `grill-me`
vs `grilling` on "grill me", was accepted deliberately as an alias).

## Follow-ups
1. **Run `/setup-matt-pocock-skills` per repo** where you want `to-spec`/`to-tickets`.
   It is per-repo tracker config (GitHub / GitLab / local markdown), not global.
2. ~~Reproducibility gap~~ **RESOLVED (vendored).** All 25 skill dirs now live in this
   repo under `skills/` and both scripts deploy every dir — a fresh-machine
   `install.sh` reproduces the curation exactly.
3. Periodically re-sync `cp ~/.pi/agent/settings.json ~/dev/pi-elias/settings.json`
   (pi rewrites the live one; see the note in `update.sh`).
   Likewise for skills: edit in repo, then `~/dev/pi-elias/update.sh` deploys to live.
   (To capture a live-only edit back into the repo, re-copy that dir:
   `cp -R ~/.pi/agent/skills/<name>/. ~/dev/pi-elias/skills/<name>/`.)

## Maintenance
- Skills are vendored in this repo (`skills/`); this repo is the source of truth. They
  do NOT auto-update from upstream.
- Upstreams (only consulted when you choose to pull): superpowers
  `github.com/obra/superpowers` · Matt Pocock `github.com/mattpocock/skills`.
- To pull an upstream update for a skill: copy the new version into `skills/<name>/`,
  review the diff, re-apply the `brainstorming` edits if it's `brainstorming`, commit,
  then run `update.sh` to deploy to live.
- To add a skill: drop a dir under `skills/`, commit, run `update.sh`.
- To remove a skill: delete its dir under `skills/`, commit; then also
  `rm -rf ~/.pi/agent/skills/<name>` (the deploy loop only (re)deploys dirs that
  exist in the repo — it won't remove a skill you deleted from the repo).
- After any live `settings.json` change, re-sync into the repo:
  `cp ~/.pi/agent/settings.json ~/dev/pi-elias/settings.json`.

## Addendum

- **2026-07-29 — `wayfinder` re-added.** Reversed decision #3's drop of Matt
  `wayfinder`. It pairs with `to-spec`/`to-tickets` for efforts too large for one
  agent session, charted as a map of decision tickets on the repo's issue tracker.
  Dropped originally as a "heavy state machine"; re-added on explicit request after
  confirming its dependencies (`/grilling`, `/domain-modeling`, `/research`,
  `/prototype`, `/setup-matt-pocock-skills`) are all already installed. Vendored
  verbatim from upstream — no edits. Curated set now 25 (SP 6 + Matt 19). Re-deploy
  to any other machine with `~/dev/pi-elias/update.sh` (or `install.sh`).