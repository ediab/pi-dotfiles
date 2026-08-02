---
title: Ticket Execution Handoff with Pi Subagents
type: feat
date: 2026-08-02
topic: ticket-execution-workflow
artifact_contract: implementation-spec/v1
artifact_readiness: implementation-ready
execution: code
---

## Goal Capsule

- **Objective:** Bridge Matt Pocock's `to-tickets` output to either the existing direct `implement` flow or a parent-orchestrated pi-subagents ticket loop, with an agent recommendation and an explicit user choice before implementation.
- **Product authority:** Elias, owner of the `pi-elias` harness configuration.
- **Source of truth:** `~/dev/pi-elias`; deploy skills to `~/.pi/agent` with `rebuild.sh --sync-only`.
- **Research/decision memo:** `MATT_SUPER.md`.
- **Execution profile:** Pi skills plus one sync-only memo-deployment step; no package update, extension, or settings change.
- **Open blockers:** None.

## Problem Frame

The curated workflow currently ends at:

```text
brainstorming → to-spec → to-tickets → implement
```

Matt's `to-tickets` deliberately creates agent-safe tracer-bullet tickets without prescribing an executor. Matt's `implement` handles a spec or ticket set in the current parent agent, while pi-subagents provides delegation primitives but does not infer Superpowers' ticket lifecycle from the phrase "implement with subagents."

The missing seam must offer the user the same kind of implementation handoff Superpowers provided:

- recommend direct or subagent execution based on the actual task;
- ask the user before any implementation;
- preserve a lightweight direct path;
- provide fresh ticket workers, independent reviews, bounded fixes, durable tracker state, verification, and branch finishing in the delegated path.

## Current State

Relevant canonical files:

- `home/skills/to-tickets/SKILL.md` — vendored Matt skill, currently ends after publishing tickets; will receive only a pointer line to `handoff.md` so upstream pulls stay trivial.
- `home/skills/to-tickets/handoff.md` — new sibling file carrying the execution-handoff section (H2–H11, W1–W11, D2–D4); the only edited part of the skill, kept out of the vendored `SKILL.md`.
- `home/skills/implement/SKILL.md` — vendored Matt direct implementation skill; keep unchanged.
- `home/skills/tdd/SKILL.md` — implementation guidance supplied to workers.
- `home/skills/code-review/SKILL.md` — source of the Spec and Standards review rubrics.
- `home/skills/receiving-code-review/SKILL.md` — parent adjudication discipline.
- `home/skills/using-git-worktrees/SKILL.md` — isolated workspace procedure.
- `home/skills/verification-before-completion/SKILL.md` — fresh-evidence completion discipline.
- `home/skills/finishing-a-development-branch/SKILL.md` — final integration menu.
- `MANUAL_SKILLS.md` — curated-skill inventory and maintenance notes.
- `rebuild.sh` — copies every `home/skills/*/` directory into `~/.pi/agent/skills/`.

Relevant installed package behavior:

- pi-subagents worker default context is forked; ticket launches must override it to `fresh`.
- pi-subagents reviewer default context is fresh.
- built-in reviewers have mutation tools, so read-only behavior is instruction-enforced in v1.
- project agent overrides replace user agent entries rather than merging them; do not add overrides.
- managed `worktree: true` parallel writers produce patch handoffs and are outside v1.

## Product Decisions

1. **The choice is presented at the end of `to-tickets`.** The user should not need to remember another command merely to see the implementation options.
2. **The choice is always explicit.** The agent recommends; the user decides.
3. **Direct mode uses Matt's unedited `implement` guidance.** The handoff only pins its commit/review order; do not recreate a parent-side ticket coordinator.
4. **Subagent mode is a new thin `execute-tickets` skill.** It owns orchestration but reuses pi-subagents and Matt review/TDD guidance.
5. **Ticket writers are sequential in v1.** Reviewers may run in parallel.
6. **Both modes use one isolated feature worktree.** Reuse an existing isolated workspace when present.
7. **The configured tracker is the only durable execution ledger.** Do not create a progress file.
8. **Workers leave changes uncommitted.** The parent validates and commits.
9. **Accepted ticket-review fixes resume the same worker.** Start a fresh fallback only if resumption fails.
10. **Review/fix loops stop after three review rounds.** Escalate unresolved blockers.
11. **Both paths converge on whole-feature review, final verification, and `finishing-a-development-branch`.**
12. **Run the full configured repository suite unless repository instructions explicitly define a narrower gate.**
13. **No Pi settings or custom agent changes.** Preserve current models and thinking levels.
14. **Capture durable execution inputs before either mode starts.** A parent-spec reference and per-ticket approved test seams must survive the current conversation.
15. **Keep local tracker bookkeeping separate from implementation commits.**

## Functional Requirements

### Handoff from `to-tickets`

- **H1.** Preserve all existing `to-tickets` gathering, exploration, slicing, approval, dependency, and publishing behavior.
- **H2.** Before showing the chooser, retain a durable parent-spec reference: use a supplied spec path/issue, or publish the approved conversation as a parent spec through the configured `to-spec` convention. A conversation alone is not a valid execution reference; if publication fails, report the ticket references and stop. Retain that parent-spec reference and exactly the tickets created/approved in this invocation.
- **H3.** Assess whether direct or subagent execution is preferable using task judgment, not a rigid ticket-count rule.
- **H4.** Recommend direct implementation when the work is small, tightly coupled, low-risk, and comfortably fits one parent context.
- **H5.** Recommend subagents when the work contains multiple substantial tickets, is long/risky, creates context pressure, or materially benefits from independent per-ticket review.
- **H6.** Present two choices with the recommended choice first and marked `(Recommended)`:
  - `Implement directly`
  - `Implement with subagents`
- **H7.** Ask before worktree creation or implementation. The user may choose against the recommendation.
- **H8.** If the user declines or abandons the choice, stop after reporting the published spec/ticket references.
- **H9.** If direct is selected, prepare the feature worktree, then use the unchanged `implement` skill's implementation/TDD/validation guidance with the explicit spec/ticket references and approved test seams. The handoff applies D2–D4 for final commit/review ordering.
- **H10.** If subagents are selected, prepare the feature worktree, then load and follow `execute-tickets` with the explicit spec/ticket references and approved test seams.
- **H11.** Before assessing or recommending a mode under H3–H5 and before presenting the chooser, obtain the user's approval of per-ticket test seams. Carry forward `to-spec` testing decisions when present; otherwise present proposed seams. Record an explicit decision for a ticket needing no new automated test, but never waive a bug-fix regression test.

### Isolated feature workspace

- **W1.** Follow `using-git-worktrees`: detect an existing linked worktree before creating one.
- **W2.** The mode selection under H7 is the single worktree-consent question for both modes; do not ask a second worktree-consent question.
- **W3.** When isolation must be created, use one meaningful feature branch/worktree for the full ticket set.
- **W4.** Do not use pi-subagents managed parallel writer worktrees.
- **W5.** If a local Markdown tracker produced uncommitted planning artifacts, transfer only the explicit workflow-created parent spec and approved ticket files into the feature worktree, leaving the original checkout clean. Rebind all handoff and ledger references to their feature-worktree paths; do not transfer unrelated changes. The transfer makes the feature branch the authoritative copy of the ledger for this feature: continuation sessions must operate in the feature worktree (discoverable from the original checkout via `git worktree list`, or by checking out the feature branch, whose bookkeeping commits carry the ledger history).
- **W6.** Commit transferred local planning artifacts as a planning commit before recording implementation base SHAs.
- **W7.** If unrelated dirty changes exist, safe transfer fails, or the new workspace is not clean after the planning commit, pause and ask the user.
- **W8.** Run project setup and the repository's documented baseline check. If the baseline fails, report the exact failure and ask whether to diagnose or proceed.
- **W9.** After the planning commit and before either execution mode begins, capture `FEATURE_BASE_SHA=$(git rev-parse HEAD)` once. It is the common whole-feature review base.
- **W10.** For a local Markdown tracker, define `TRACKER_FILES` as the explicit parent-spec and ticket files. Leave their state changes unstaged during implementation, exclude them from implementation-diff checks and code commits, then commit them separately as tracker-only bookkeeping after each ticket is resolved.
- **W11.** After setup and baseline checks, build an ignored-file manifest with a NUL-safe program. Enumerate raw paths with `git ls-files -z --others --ignored --exclude-standard`, sort them by raw pathname bytes, and use `lstat` without following symlinks. For each path, record the raw path and type; hash regular-file bytes with SHA-256; hash a symlink's raw link-target bytes with SHA-256; record a directory marker because its enumerated children carry content; pause on sockets, devices, FIFOs, or other special types. Compare manifests by exact record equality. Ignored files are never implementation deliverables and never satisfy a diff, review, validation-evidence, or commit gate.

### `execute-tickets` input and scope

- **E1.** Require an explicit parent-spec reference and explicit ticket-set references.
- **E2.** Never discover executable work by querying all `ready-for-agent` items.
- **E3.** Read each full ticket, the parent spec, repository instructions, configured tracker guidance, and dependency edges before launching a worker.
- **E4.** Operate only on the explicit ticket set. A blocker outside the set is an unresolved blocker and causes a pause unless already resolved.
- **E5.** Validate the dependency graph. Pause on cycles, missing ticket references, or contradictory state.
- **E6.** Recalculate the ready frontier after every resolved ticket. When multiple tickets are ready, choose the earliest approved dependency order. Never launch two ticket writers concurrently.
- **E7.** Use the common `FEATURE_BASE_SHA` captured by W9.

### Per-ticket lifecycle

- **T1.** Before implementation, claim the ticket using configured tracker conventions and record `BASE_SHA=$(git rev-parse HEAD)` in its comment/history. For a local Markdown tracker, leave the claim change unstaged in `TRACKER_FILES` for its later tracker-only bookkeeping commit.
- **T2.** Launch one `worker` with:
  - `context: fresh`;
  - `cwd` set to the persistent feature worktree;
  - Matt's `tdd` skill selected;
  - explicit `acceptance: "checked"`;
  - no managed worktree;
  - no hard turn/tool budget;
  - enough elapsed time for the ticket-sized slice.
- **T3.** The worker task must include the full ticket, parent-spec reference/content, approved per-ticket test seams, relevant repository instructions, resolved blocker context, and `BASE_SHA`.
- **T4.** The worker contract must say:
  - implement only the approved ticket;
  - use TDD at the approved test seams and always add a regression test for a bug fix;
  - run focused checks/typechecking as appropriate;
  - do not invoke subagents;
  - do not commit, stage, close tickets, alter `TRACKER_FILES`, or alter unrelated files;
  - report changed files, commands with exit status, validation evidence, surprises, and residual risks.
- **T5.** Require checked implementation evidence from the worker, but do not add artificial report files.
- **T6.** After the worker returns, the parent inspects the worktree and verifies the complete committable implementation change set—tracked changes plus the full contents of every non-ignored, non-tracker untracked file, excluding `TRACKER_FILES` for a local Markdown tracker—is non-empty and limited to approved scope before review. Record that untracked-file list for the review and commit gates. Compare the ignored-file manifest with W11: every ignored-file delta must be an expected generated artifact from an approved setup/test command reported by the worker; otherwise pause. Ignored or tracker-only changes do not satisfy this gate.
- **T7.** Before each worker run, snapshot `TRACKER_FILES` and the W11 ignored-file manifest; before launching reviewers, snapshot exact `git status --porcelain=v1 -z` output, the tracked implementation diff, byte hashes for every non-ignored, non-tracker untracked file and `TRACKER_FILES`, and a fresh ignored-file manifest. After a worker returns, verify `HEAD == BASE_SHA`, the index is empty, `TRACKER_FILES` are byte-for-byte unchanged, only the ticket's allowed committable files changed, and every ignored-file delta satisfies T6. As each parallel reviewer returns, require the entire pre-review snapshot—including exact equality of the W11 ignored-file manifest—to be unchanged. Any reviewer mutation invalidates both parallel reports; inspect and restore or pause before launching replacements. If any invariant fails, do not commit or continue.
- **T8.** If the worker fails or times out, inspect its handoff and actual worktree state. Resume or replace it only after establishing whether partial mutations exist; never start a concurrent replacement writer.

### Ticket review

- **R1.** Launch two built-in `reviewer` agents in parallel with `context: fresh` and the feature-worktree `cwd`. The parent supplies each reviewer's rubric directly in its prompt, extracted from the `code-review` skill: the Standards reviewer receives the smell baseline and repo-overrides/judgement-call rules, the Spec reviewer receives the Spec brief. Do not load the `code-review` skill into a reviewer — it is parent-orchestration text whose step 4 instructs the reader to spawn sub-agents, contradicting R2; the skill itself delivers its rubrics by parent-paste, and R1 uses the same mechanism.
- **R2.** Explicitly instruct both reviewers to inspect files and commands directly, not edit/write/commit, and not invoke subagents.
- **R3.** Because ticket changes are uncommitted, reviewers must inspect `git diff BASE_SHA` plus the full contents of every non-tracker untracked file recorded by T6, ignoring known `TRACKER_FILES` for local Markdown tracking. Matt's committed-branch-only `git diff <base>...HEAD` command is insufficient here.
- **R4.** The **Spec** reviewer uses the originating ticket and parent spec to report:
  - missing or partial requirements;
  - unrequested behavior/scope creep;
  - apparently implemented requirements whose behavior is wrong;
  - exact ticket/spec evidence for every finding.
- **R5.** The **Standards** reviewer reads repository standards and applies the rubric pasted per R1 (Matt's documented smell baseline), with repository standards overriding heuristics. It distinguishes hard violations from judgment calls and skips tooling-enforced style.
- **R6.** Keep the two reports separate. The parent then applies `receiving-code-review` discipline and classifies findings as:
  - blockers or unapproved decisions requiring the user;
  - fixes worth doing now;
  - optional/deferred findings;
  - rejected findings with a short technical reason.
- **R7.** Do not blindly apply reviewer suggestions. Pause for product, scope, architecture, data-loss, or security decisions not already approved.
- **R8.** If fixes are accepted, resume the same completed ticket worker with only the adjudicated findings. Use a fresh worker with the same contract only if resumption fails.
- **R9.** Run another pair of fresh reviewers only after material/non-trivial fixes.
- **R10.** Count each fresh parallel review pass as one review/fix round. A failed-validation repair consumes one such round; if material, its required re-review is part of that same round. Stop early when no blockers or fixes-worth-doing remain.
- **R11.** Cap each ticket at three review/fix rounds. If blockers remain, record them and pause for the user.

### Ticket validation, commit, and tracker resolution

- **C1.** After review acceptance, the parent runs the ticket's focused tests, relevant typecheck/build, and any acceptance checks named by the ticket/repository. If validation fails, scope a repair within approved scope and resume the ticket worker (or use a fresh fallback only if resumption fails). A failed-validation repair consumes one review/fix round; re-review it under R9 when material, then rerun validation. After three total rounds or an unfixable failure, record evidence and pause under A3.
- **C2.** The parent inspects `git diff --check`, explicitly whitespace-checks every non-tracker untracked implementation file, inspects the complete final implementation change set (excluding `TRACKER_FILES` for a local tracker), and checks git status before committing.
- **C3.** The parent stages only the reviewed implementation files, verifies the staged paths equal the reviewed tracked and untracked implementation file set, runs `git diff --cached --check`, and creates exactly one implementation commit for the ticket after review and validation. Workers never commit, and local `TRACKER_FILES` are never included.
- **C4.** The commit message follows repository instructions; absent a project convention, use a concise ticket-referencing conventional commit.
- **C5.** Record accepted/deferred findings, validation commands/results, and the final commit SHA in the configured tracker.
- **C6.** Resolve/close the ticket only after its commit exists and validation passes.
- **C7.** Do not release dependent tickets before tracker resolution and commit completion; for local Markdown tracking, that includes the tracker-only bookkeeping commit.
- **C8.** For local Markdown tracking, after C5/C6 create one tracker-only bookkeeping commit containing only `TRACKER_FILES`. Do not fold it into an implementation commit.

### Whole-feature completion

- **F1.** After every explicit ticket is resolved, confirm no explicit ticket remains blocked/open and the worktree is clean.
- **F2.** Snapshot the exact clean `HEAD`, index, and worktree state, then run fresh parallel built-in whole-feature Spec and Standards reviewers with `context: fresh` and the feature-worktree `cwd` against `git diff FEATURE_BASE_SHA...HEAD`, using the original parent spec and all explicit tickets; for a local tracker, ignore known `TRACKER_FILES`. Explicitly prohibit edit/write/commit/subagents; apply R4–R5 with the rubrics pasted per R1 — do not load the `code-review` skill into a reviewer. As each reviewer returns, require the snapshot to remain byte-for-byte unchanged; any mutation invalidates both reports and must be restored or paused before replacement review.
- **F3.** Apply the same adjudication rules and one shared maximum-three-round cap to final review and final-validation repairs.
- **F4.** A final-review or final-validation fix uses one writer at a time. Cross-ticket fixes may use one fresh worker with the complete feature context; the parent creates a separate final-fix commit and records it against the parent spec/feature tracker item. For a local Markdown tracker, commit that tracker update separately before re-review or completion.
- **F5.** Run the full configured repository verification suite unless repository instructions explicitly specify a narrower completion gate. If it fails, assign one writer under F4 to a repair within approved scope, commit and record the repair, re-run F2 when the repair is material, then rerun the full suite. Each failed-suite repair consumes one round under F3. After three rounds, or when correction requires an unapproved decision or is impossible within scope, record the evidence and pause under A3. This requirement applies to both execution modes.
- **F6.** Apply `verification-before-completion`: make no passing/completion claim without fresh command evidence.
- **F7.** Invoke `finishing-a-development-branch` once. Its integration/PR/keep/discard menu is the expected final user interaction.

### Direct-mode completion

- **D1.** Do not edit `home/skills/implement/SKILL.md`.
- **D2.** Direct mode uses the unchanged `implement` skill for implementation/TDD/validation guidance against the explicit spec/ticket set and approved per-ticket test seams inside the isolated worktree. The handoff wrapper replaces only its final review/commit order below; it does not edit `implement`.
- **D3.** After the direct implementation's focused validation, the parent creates its implementation commit before invoking Matt's existing `code-review` against `FEATURE_BASE_SHA`; the review must see the committed whole-feature diff. Do not run a pre-commit duplicate review. After each review pass, verify its reviewers did not change `HEAD`, stage files, or alter the worktree. If material accepted review fixes are made, commit them and rerun `code-review` against the same base.
- **D4.** After successful implementation/review, record the resulting implementation commit(s) and validation against the explicit tracker items and resolve completed tickets. For a local Markdown tracker, stage code separately from `TRACKER_FILES` and create a tracker-only bookkeeping commit after tracker updates; tracker-only changes never satisfy the implementation-diff gate. Then run the final verification gate and invoke `finishing-a-development-branch`.

### Autonomous behavior and stop conditions

- **A1.** The mode selection is the implementation approval gate. Subagent mode then proceeds autonomously through the explicit ticket set.
- **A2.** Do not pause at routine ticket boundaries.
- **A3.** Pause only for:
  - ambiguous or contradictory approved scope;
  - unrelated dirty worktree state;
  - failed baseline where proceeding is a user decision;
  - dependency graph errors or external unresolved blockers;
  - unapproved product/scope/architecture/security/data-loss decisions;
  - unresolved blockers after three review rounds;
  - failed ticket or final validation that cannot be corrected within approved scope;
  - the final branch-finishing menu.
- **A4.** Record enough tracker state before every pause that a fresh Pi session can continue safely in the feature worktree (W5).

## Packaging Requirements

- **P1.** Add `home/skills/execute-tickets/SKILL.md`; keep it concise and orchestration-focused. Do not copy pi-subagents' full review-loop prompt or Matt's full smell baseline into it.
- **P2.** The skill may instruct the parent to read the installed `code-review` (to extract the Standards and Spec rubrics for reviewer prompts per R1), `receiving-code-review`, `verification-before-completion`, and `finishing-a-development-branch` skills when their phase begins.
- **P3.** Keep the vendored `home/skills/to-tickets/SKILL.md` almost verbatim: add only one pointer line telling the parent to read and follow `handoff.md` (a new sibling file in the same skill dir) after tickets are published. `handoff.md` carries the substantial execution-handoff content — chooser and test-seam approval (H2–H11), shared workspace preparation (W1–W11), and direct-mode completion pinning (D2–D4). This isolates the local edit from upstream: a Matt update to `SKILL.md` overwrites cleanly and the pointer line is re-added; `handoff.md` never conflicts. Whole-dir deployment (`rebuild.sh`) copies sibling files automatically.
- **P4.** Do not edit `implement`, `tdd`, `code-review`, pi-subagents built-ins, or `home/settings.json`.
- **P5.** Update `MANUAL_SKILLS.md` from 25 to 26 curated skills, classify `execute-tickets` as the local Matt/pi-subagents bridge, document the `to-tickets` adaptation (`handoff.md` + pointer line, moving `to-tickets` from the verbatim bucket into the edited-skills bucket with the manual re-apply-on-pull note), and update the end-to-end pipeline.
- **P6.** Keep `MATT_SUPER.md` at the `pi-elias` repository root and add a `rebuild.sh --sync-only` mode that copies canonical skills and the memo to `~/.pi/agent` while skipping `pi update --all` and the `home/settings.json` copy; do not rely on manual copying.
- **P7.** Run `rebuild.sh --sync-only` after implementation so canonical skills and the memo replace the live copies without changing installed packages or settings. Capture the live settings checksum and installed pi-subagents version before deployment and require both to be unchanged afterward.

## Acceptance Examples

### AE1 — small direct recommendation

- **Given:** `to-tickets` publishes one small, tightly coupled ticket.
- **When:** It reaches the implementation handoff.
- **Then:** It presents both modes, marks direct implementation recommended, and waits.
- **And when:** The user chooses direct.
- **Then:** It prepares one isolated feature worktree, passes the durable references and approved seams to unchanged `implement` guidance, commits implementation, then runs `code-review` against `FEATURE_BASE_SHA`.

### AE2 — substantial subagent recommendation

- **Given:** A durable parent-spec reference and several substantial dependent tickets.
- **When:** `to-tickets` reaches the handoff.
- **Then:** It obtains approval of per-ticket test seams, recommends subagents, and still allows direct execution.
- **And when:** Subagents are selected.
- **Then:** `execute-tickets` receives only those durable references and approved seams and never queries a label-wide queue.

### AE3 — sequential writers, parallel reviewers

- **Given:** Two tickets are simultaneously ready.
- **When:** Subagent execution starts.
- **Then:** Only the earliest approved ticket gets a fresh writer.
- **And after its worker returns:** The Spec and Standards reviewers run in parallel against `git diff BASE_SHA` and the full contents of every non-tracker untracked file, ignoring known `TRACKER_FILES` for local Markdown tracking.
- **And:** Their pre-review diff, untracked-file hashes, and ignored-file manifest remain byte-for-byte unchanged, or both reports are invalidated.
- **And:** No second writer starts until the first ticket is reviewed, validated, committed, and resolved.

### AE4 — review fixes

- **Given:** Reviewers identify valid fixes within approved scope.
- **When:** The parent adjudicates them.
- **Then:** The same worker session is resumed with only accepted findings.
- **And:** Material fixes receive fresh parallel review.
- **And after three rounds:** Any remaining blocker causes a tracker update and user pause.

### AE5 — durable continuation

- **Given:** A session ends after ticket 2 of 4.
- **When:** A new session receives the same explicit spec/ticket set and continues in the feature worktree (found via `git worktree list` from the original checkout, or by checking out the feature branch).
- **Then:** It can resolve the durable parent-spec/ticket references against their feature-worktree paths (W5), read claimed/resolved status, base/commit SHAs, findings, and validation from the configured tracker, and safely recalculate the frontier without a progress file.

### AE6 — safe local tracker transfer

- **Given:** Local Markdown spec/ticket files are the only dirty workflow-created files.
- **When:** The user selects an implementation mode.
- **Then:** Only those explicit files move into the isolated feature worktree, rebind to its paths, and receive a planning commit, leaving the original checkout clean.
- **And after a ticket is resolved:** Its implementation commit excludes tracker files, and its tracker state is committed separately.
- **But given:** Unrelated dirty changes.
- **Then:** Execution pauses instead of stashing or moving them silently.

### AE7 — completion

- **Given:** All tickets passed their individual gates.
- **When:** Whole-feature review passes but the full configured suite fails within approved scope.
- **Then:** One writer repairs it, the parent creates and records a separate fix commit, material repairs receive fresh whole-feature review, and the suite is rerun within the shared three-round cap.
- **And when:** Whole-feature review and the full configured suite pass.
- **Then:** The parent reports fresh evidence and invokes `finishing-a-development-branch` once.

## Out of Scope

- Parallel implementation writers or per-ticket managed worktrees.
- Automatic ticket discovery from `ready-for-agent` labels.
- A custom read-only reviewer agent.
- New worker/reviewer model overrides or other Pi settings changes.
- Nested subagent dispatch from ordinary workers.
- A second progress ledger or generated review-report files.
- Generic monorepo affected-package heuristics.
- Changes to Matt's `implement`, `tdd`, or `code-review` source skills.
- Automatic PR creation outside `finishing-a-development-branch`.

## Implementation Map

1. Add the pointer line to `home/skills/to-tickets/SKILL.md` and write the handoff content in the new `home/skills/to-tickets/handoff.md` (P3).
2. Add `home/skills/execute-tickets/SKILL.md` implementing the parent-controlled lifecycle above.
3. Update `MANUAL_SKILLS.md` inventory, adaptations, pipeline, and maintenance notes.
4. Add the root-memo deployment step and `--sync-only` path to `rebuild.sh`.
5. Review the diff for accidental upstream-skill changes.
6. Capture the live settings checksum and installed pi-subagents version, then run `rebuild.sh --sync-only` to deploy canonical skills and the memo.
7. Verify repo/live copies match and the captured settings checksum and pi-subagents version did not change.

## Verification Contract

The implementation session must capture fresh evidence for:

```bash
git -C ~/dev/pi-elias diff --check
diff -u ~/dev/pi-elias/home/skills/to-tickets/SKILL.md ~/.pi/agent/skills/to-tickets/SKILL.md
diff -u ~/dev/pi-elias/home/skills/to-tickets/handoff.md ~/.pi/agent/skills/to-tickets/handoff.md
diff -u ~/dev/pi-elias/home/skills/execute-tickets/SKILL.md ~/.pi/agent/skills/execute-tickets/SKILL.md
cmp ~/dev/pi-elias/MATT_SUPER.md ~/.pi/agent/MATT_SUPER.md
git -C ~/dev/pi-elias status --short
```

Also confirm:

- `rebuild.sh --sync-only` skips `pi update --all` and does not copy `home/settings.json`;
- the live settings checksum and installed pi-subagents version are identical before and after deployment;
- `home/settings.json` is unchanged;
- `home/skills/implement/SKILL.md` is unchanged;
- `execute-tickets` is discoverable as a live skill after `rebuild.sh --sync-only`;
- `MANUAL_SKILLS.md` reports 26 skills and the updated pipeline;
- the final diff contains only files required by this spec.

Note: these checks verify packaging only — none of them exercises the workflow guarantees (AE1–AE7). Exercise the local-tracker continuation and transfer paths (AE5–AE6) first, in a later session inside a user repo with a configured tracker.

## Sources

- `MATT_SUPER.md` — reviewed research and agreed rationale.
- Matt `to-tickets`: <https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md>
- Matt `implement`: <https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md>
- Matt `code-review`: <https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md>
- Superpowers subagent-driven development: <https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md>
- pi-subagents review loop: <https://github.com/nicobailon/pi-subagents/blob/main/prompts/review-loop.md>
