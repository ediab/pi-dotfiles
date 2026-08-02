# Implementation handoff (to-tickets step 6)

Read this after the tickets are published and approved. It captures the durable execution
inputs, gets the user's explicit mode choice, prepares one isolated feature worktree, and
hands the explicit ticket set to either the direct `implement` flow or the `execute-tickets`
coordinator. Follow it in order; do not skip ahead.

## 1. Retain a durable parent-spec reference

Before showing any chooser, the work needs a parent spec that survives this conversation:

- If the user supplied a spec path or issue, use it.
- Otherwise publish the approved conversation as a parent spec through the configured
  `to-spec` convention (the tracker's spec location — e.g. `.scratch/<feature-slug>/spec.md`
  for a local Markdown tracker).
- A conversation alone is not a valid execution reference. If publication fails, report the
  published ticket references and stop.
- Retain the parent-spec reference and exactly the tickets created/approved in this
  invocation — nothing else.

## 2. Approve per-ticket test seams

Before assessing a mode and before presenting the chooser, get the user's approval of the
test seams for every ticket:

- Carry forward `to-spec` testing decisions when present; otherwise present proposed seams.
- Record an explicit decision for a ticket that needs no new automated test.
- Never waive a regression test for a bug fix — TDD is mandatory there.

## 3. Assess the work and recommend a mode

Use task judgment, not a ticket-count rule:

- **Recommend direct** for small, tightly coupled, low-risk work that comfortably fits one
  parent context.
- **Recommend subagents** for multiple substantial tickets, long or risky work, context
  pressure, or work that materially benefits from independent per-ticket review.

## 4. Present the chooser

Present exactly two choices, the recommended one first, marked `(Recommended)`:

1. `Implement directly`
2. `Implement with subagents`

The user always decides; they may choose against the recommendation. Ask before any worktree
creation or implementation. If the user declines or abandons the choice, stop after reporting
the published spec/ticket references.

## 5. Prepare one isolated feature workspace

Applies to both modes, in this order:

1. **Detect isolation.** Follow `using-git-worktrees`; check for an existing linked worktree
   before creating one. The mode selection above was the worktree-consent question — do not
   ask a second one.
2. **Create one feature workspace.** Use one meaningful feature branch/worktree for the full
   ticket set. Never use pi-subagents managed parallel writer worktrees.
3. **Transfer local planning artifacts (local Markdown tracker only).** If the tracker
   produced uncommitted planning artifacts:
   - Transfer ONLY the explicit workflow-created parent spec and approved ticket files into
     the feature worktree, leaving the original checkout clean. Rebind all handoff and ledger
     references to their feature-worktree paths. Do not transfer unrelated changes.
   - Commit the transferred artifacts as a planning commit before recording any
     implementation base SHA.
   - After the transfer, the feature branch is the authoritative copy of the ledger for this
     feature. Continuation sessions operate in the feature worktree — find it with
     `git worktree list` from the original checkout, or check out the feature branch (its
     bookkeeping commits carry the ledger history).
   - If unrelated dirty changes exist, the transfer is unsafe, or the workspace is not clean
     after the planning commit: pause and ask the user. Never stash or move unrelated changes
     silently.
4. **Baseline.** Run project setup and the repository's documented baseline check. If it
   fails, report the exact failure and ask whether to diagnose or proceed.
5. **Capture the base SHA.** After the planning commit and before either execution mode
   begins, capture once:
   `FEATURE_BASE_SHA=$(git rev-parse HEAD)` — the common whole-feature review base for both
   modes.
6. **Define tracker files (local Markdown tracker only).** `TRACKER_FILES` = the explicit
   parent-spec and ticket files. Leave their state changes unstaged during implementation,
   exclude them from implementation-diff checks and code commits, and commit them separately
   as tracker-only bookkeeping after each ticket is resolved.
7. **Build the ignored-file manifest.** After setup and baseline checks, with a NUL-safe
   program:
   - `git ls-files -z --others --ignored --exclude-standard`, sorted by raw pathname bytes;
     `lstat` each path without following symlinks.
   - Record the raw path and type; SHA-256 the bytes of regular files; SHA-256 the raw
     link-target bytes of symlinks; record a directory marker for directories (their
     enumerated children carry content).
   - Pause on sockets, devices, FIFOs, or other special types.
   - Compare manifests by exact record equality. Ignored files are never implementation
     deliverables and never satisfy a diff, review, validation-evidence, or commit gate.

## 6. Execute the chosen mode

- **Direct** — follow `implement`'s implementation/TDD/validation guidance with the explicit
  spec/ticket references and approved test seams, then apply the direct-mode completion
  order in the next section.
- **Subagents** — read and follow the `execute-tickets` skill with the explicit spec/ticket
  references, `FEATURE_BASE_SHA`, `TRACKER_FILES` (local), and approved test seams.

## 7. Direct-mode completion

Do not edit `home/skills/implement/SKILL.md` (or the installed copy). Use the unchanged
`implement` guidance; this handoff only replaces its final review/commit order:

- After the direct implementation's focused validation, create the implementation commit
  BEFORE invoking Matt's `code-review` against `FEATURE_BASE_SHA` — the review must see the
  committed whole-feature diff. Do not run a pre-commit duplicate review.
- After each review pass, verify its reviewers did not change `HEAD`, stage files, or alter
  the worktree. If material accepted review fixes are made, commit them and rerun
  `code-review` against the same base.
- After successful implementation/review, record the implementation commit(s) and validation
  against the explicit tracker items and resolve the completed tickets. For a local Markdown
  tracker, stage code separately from `TRACKER_FILES` and create a tracker-only bookkeeping
  commit after the tracker updates; tracker-only changes never satisfy the
  implementation-diff gate.
- Then run the final verification gate — the full configured repository suite unless
  repository instructions explicitly define a narrower gate, with fresh command evidence
  only — and invoke `finishing-a-development-branch` once.
