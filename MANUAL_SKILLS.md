# Manual Skills

Skills are maintained as standalone copies under `~/.pi/agent/skills/` instead of
being loaded from packages. Two upstream sources were originally copied in:
superpowers (obra) and mattpocock. This file records the **curated** state after
combining the two schools (2025-07-15).

## Curated set — 24 skills

### Superpowers kept (6) — ideation + mechanics + behavioral discipline
| Skill | Role |
|-------|------|
| `brainstorming` | Design exploration. **Edited:** advisory (no auto-gate); exit rewired `writing-plans` → `to-spec`. |
| `dispatching-parallel-agents` | Concurrent independent subagent tasks (the "subagents" mechanic). |
| `using-git-worktrees` | Isolated workspaces (the "worktrees" mechanic). |
| `finishing-a-development-branch` | Integration/PR menu. Already standalone — no edit needed. |
| `receiving-code-review` | Handle review feedback w/ rigor, anti-sycophancy. Already source-agnostic — works with Matt `code-review`, no edit needed. |
| `verification-before-completion` | Fresh-evidence discipline for "done" claims. |

### Matt Pocock kept (18) — pipeline + the rest
`setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `implement`, `tdd`,
`diagnosing-bugs`, `code-review`, `codebase-design`, `domain-modeling`, `prototype`,
`research`, `resolving-merge-conflicts`, `grilling`, `grill-me`, `grill-with-docs`,
`handoff`, `teach`, `writing-great-skills`.

## Dropped (9)
- Superpowers (7): `test-driven-development`, `subagent-driven-development`,
  `executing-plans`, `writing-plans`, `systematic-debugging`,
  `requesting-code-review`, `writing-skills`.
- Matt Pocock (2): `triage`, `wayfinder`.

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
   machines); drop SP `writing-plans`; rewire `brainstorming` → `to-spec`.
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

## Edits actually applied (live copies in `~/.pi/agent/skills/`)
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
2. **Reproducibility gap (open decision).** `install.sh`/`update.sh` only install the 3
   custom skills (`handoff grill-me grilling`). The other 21 curated skills are static
   copies sourced from upstream, and the `brainstorming` edits live only in the live
   copy — so a fresh machine won't auto-reproduce this curation. Pick one:
   (a) vendor all 24 skill dirs into `~/dev/pi-elias/skills/` and expand `CUSTOM_SKILLS`
       to whole-directory copies in both scripts (reproduces exactly; bloats the repo;
       diverges from "upstream is source of truth");
   (b) teach `install.sh` to fetch the curated subset from upstream at install time,
       then re-apply the `brainstorming` edits (lean repo; more script logic);
   (c) leave as-is (manual re-copy from upstream + re-apply edits; current behavior).
3. Periodically re-sync `cp ~/.pi/agent/settings.json ~/dev/pi-elias/settings.json`
   (pi rewrites the live one; see the note in `update.sh`).

## Maintenance
- Static copies; they do not receive upstream updates unless you manually pull and re-copy.
- Superpowers: `github.com/obra/superpowers` · Matt Pocock: `github.com/mattpocock/skills`.
- To update a skill: pull upstream, review the diff, merge desired changes into
  `~/.pi/agent/skills/<skill-name>/` (and re-apply the `brainstorming` edits if updating
  that one).
- To add/remove a skill: edit `~/.pi/agent/skills/`, then update this file.