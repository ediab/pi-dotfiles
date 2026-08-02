---
name: execute-tickets
description: Execute an explicit, user-approved ticket set with fresh per-ticket worker contexts, parallel Spec and Standards review, bounded fix rounds, and one reviewed commit per ticket — the parent orchestrates; workers never commit. Use after the to-tickets implementation handoff when the user chooses subagent execution.
---

# Execute Tickets

Parent-controlled execution of an explicit ticket set with pi-subagents. The parent owns the
loop: git commits, tracker state, review adjudication, and final decisions. Workers
implement; they never commit. Reviewers report; they never edit.

## Inputs

Require all of these before starting (do not invent any of them):

- an explicit parent-spec reference;
- the explicit ticket-set references;
- user-approved per-ticket test seams;
- `FEATURE_BASE_SHA` (captured by the handoff);
- `TRACKER_FILES` (local Markdown tracker only);
- the feature-worktree `cwd`.

Never discover executable work by querying every `ready-for-agent` item.

## Scope

- Operate only on the explicit ticket set. A blocker outside the set is an unresolved
  blocker: pause unless already resolved.
- Before the first worker, read each full ticket, the parent spec, repository instructions,
  the configured tracker guidance (`docs/agents/issue-tracker.md`), and all dependency
  edges.
- Validate the dependency graph: pause on cycles, missing ticket references, or
  contradictory state.
- Use `FEATURE_BASE_SHA` as the common base.

## Frontier

After every resolved ticket, recalculate the ready frontier (tickets whose blockers are all
resolved). When several are ready, take the earliest approved dependency order. Never launch
two ticket writers concurrently.

## Per-ticket loop

### 1. Claim

Claim the ticket using the configured tracker conventions and record
`BASE_SHA=$(git rev-parse HEAD)` in its comment/history. For a local Markdown tracker, leave
the claim change unstaged in `TRACKER_FILES` for its later tracker-only bookkeeping commit.

### 2. Launch one worker

Launch one `worker` with:

- `context: fresh`;
- `cwd` = the persistent feature worktree;
- Matt's `tdd` skill selected;
- `acceptance: "checked"`;
- no managed worktree;
- no hard turn/tool budget;
- enough elapsed time for the ticket-sized slice.

The worker task must include: the full ticket, the parent-spec reference/content, the
approved per-ticket test seams, relevant repository instructions, resolved blocker context,
and `BASE_SHA`.

The worker contract must say: implement only the approved ticket; use TDD at the approved
test seams and always add a regression test for a bug fix; run focused checks/typechecking
as appropriate; do not invoke subagents; do not commit, stage, close tickets, alter
`TRACKER_FILES`, or alter unrelated files; report changed files, commands with exit status,
validation evidence, surprises, and residual risks.

Require checked implementation evidence from the worker. Do not ask for artificial report
files.

### 3. Inspect the result

Before each worker run: snapshot `TRACKER_FILES` and the ignored-file manifest. After the
worker returns, verify:

- `HEAD == BASE_SHA` and the index is empty;
- `TRACKER_FILES` are byte-for-byte unchanged;
- the complete committable change set — tracked changes plus the full contents of every
  non-ignored, non-tracker untracked file (excluding `TRACKER_FILES` locally) — is non-empty
  and limited to approved scope. Record that untracked-file list for the review and commit
  gates;
- every ignored-file delta is an expected generated artifact from an approved setup/test
  command the worker reported; otherwise pause. Ignored or tracker-only changes never
  satisfy this gate.

If the worker failed or timed out: inspect its handoff and the actual worktree state for
partial mutations before resuming or replacing it. Never start a concurrent replacement
writer.

### 4. Review

Before launching reviewers, snapshot: exact `git status --porcelain=v1 -z` output, the
tracked implementation diff, byte hashes for every non-ignored, non-tracker untracked file
and `TRACKER_FILES`, and a fresh ignored-file manifest.

Launch two built-in `reviewer` agents in parallel, `context: fresh`, `cwd` = the feature
worktree. The parent pastes each reviewer's rubric into its prompt, extracted from the
`code-review` skill — the Standards reviewer gets the smell baseline and
repo-overrides/judgement-call rules, the Spec reviewer gets the Spec brief. Do not load the
`code-review` skill into a reviewer: it is parent-orchestration text (its step 4 tells the
reader to spawn sub-agents), which contradicts the no-subagents instruction below.

Explicitly instruct both reviewers: inspect files and commands directly; do not
edit/write/commit; do not invoke subagents. Because the changes are uncommitted, they must
review `git diff BASE_SHA` plus the full contents of every non-tracker untracked file
recorded above, ignoring known `TRACKER_FILES` (local). Matt's committed-branch-only
`git diff <base>...HEAD` is insufficient here.

- The **Spec** reviewer reports, against the originating ticket and parent spec: missing or
  partial requirements; unrequested behavior/scope creep; apparently implemented
  requirements whose behavior is wrong; exact ticket/spec evidence for every finding.
- The **Standards** reviewer reads repository standards and applies the pasted rubric
  (Matt's smell baseline), with documented repo standards overriding heuristics;
  distinguishes hard violations from judgment calls; skips tooling-enforced style.

As each reviewer returns, require the entire pre-review snapshot — including exact equality
of the ignored-file manifest — to be unchanged. Any reviewer mutation invalidates both
parallel reports: inspect and restore, or pause before launching replacements. If any
invariant fails, do not commit or continue.

Keep the two reports separate. Apply `receiving-code-review` discipline and classify
findings as: blockers or unapproved decisions requiring the user; fixes worth doing now;
optional/deferred; rejected with a short technical reason. Do not blindly apply reviewer
suggestions. Pause for product, scope, architecture, data-loss, or security decisions not
already approved.

If fixes are accepted, resume the same completed ticket worker with only the adjudicated
findings. Use a fresh worker with the same contract only if resumption fails. Run another
pair of fresh reviewers only after material/non-trivial fixes.

Count each fresh parallel review pass as one review/fix round; a failed-validation repair
consumes one such round, and if material, its required re-review is part of that same round.
Stop early when no blockers or fixes-worth-doing remain. Cap each ticket at three
review/fix rounds; if blockers remain, record them and pause for the user.

### 5. Validate, commit, resolve

After review acceptance, the parent runs the ticket's focused tests, relevant
typecheck/build, and any acceptance checks named by the ticket/repository. If validation
fails: scope a repair within approved scope, resume the ticket worker (fresh fallback only
if resumption fails); the repair consumes one review/fix round; re-review it when material,
then rerun validation. After three total rounds or an unfixable failure, record evidence and
pause.

Then:

- Inspect `git diff --check`, explicitly whitespace-check every non-tracker untracked
  implementation file, inspect the complete final implementation change set (excluding
  `TRACKER_FILES` locally), and check git status.
- Stage only the reviewed implementation files; verify the staged paths equal the reviewed
  tracked + untracked implementation file set; run `git diff --cached --check`; create
  exactly one implementation commit for the ticket. Workers never commit; local
  `TRACKER_FILES` are never included.
- Commit message: follow repository instructions; absent a project convention, use a
  concise ticket-referencing conventional commit.
- Record accepted/deferred findings, validation commands/results, and the final commit SHA
  in the configured tracker.
- Resolve/close the ticket only after its commit exists and validation passes. Do not
  release dependent tickets before tracker resolution and commit completion.
- For a local Markdown tracker, create one tracker-only bookkeeping commit containing only
  `TRACKER_FILES` after recording and resolving. Never fold it into an implementation
  commit.

## Whole-feature completion

After every explicit ticket is resolved, confirm no explicit ticket remains blocked/open and
the worktree is clean. Snapshot the exact clean `HEAD`, index, and worktree state, then run
fresh parallel built-in whole-feature Spec and Standards reviewers (`context: fresh`,
feature-worktree `cwd`) against `git diff FEATURE_BASE_SHA...HEAD`, using the original
parent spec and all explicit tickets; ignore known `TRACKER_FILES` (local). Prohibit
edit/write/commit/subagents; apply the same pasted rubrics as per-ticket review. As each
reviewer returns, require the snapshot to remain byte-for-byte unchanged; any mutation
invalidates both reports and must be restored or paused before replacement review.

Apply the same adjudication rules and one shared maximum-three-round cap to final review and
final-validation repairs. Final fixes use one writer at a time; cross-ticket fixes may use
one fresh worker with the complete feature context; the parent creates a separate final-fix
commit and records it against the parent spec/feature tracker item. For a local Markdown
tracker, commit that tracker update separately before re-review or completion.

Run the full configured repository verification suite unless repository instructions
explicitly specify a narrower completion gate. If it fails: assign one writer to a repair
within approved scope, commit and record the repair, re-run whole-feature review when the
repair is material, then rerun the full suite. Each failed-suite repair consumes one round;
after three rounds, or when correction requires an unapproved decision or is impossible
within scope, record the evidence and pause.

Apply `verification-before-completion`: make no passing/completion claim without fresh
command evidence. Then invoke `finishing-a-development-branch` once — its
integration/PR/keep/discard menu is the expected final user interaction.

## Autonomy and stop conditions

The mode selection in the handoff was the implementation approval gate; execution then
proceeds autonomously through the explicit ticket set. Do not pause at routine ticket
boundaries. Pause only for:

- ambiguous or contradictory approved scope;
- unrelated dirty worktree state;
- failed baseline where proceeding is a user decision;
- dependency graph errors or external unresolved blockers;
- unapproved product/scope/architecture/security/data-loss decisions;
- unresolved blockers after three review rounds;
- failed ticket or final validation that cannot be corrected within approved scope;
- the final branch-finishing menu.

Record enough tracker state before every pause that a fresh Pi session can continue safely
in the feature worktree.

## Phase references

When each phase begins, read the installed skill that governs it: `code-review` (extract
the Standards/Spec rubrics for reviewer prompts), `receiving-code-review` (adjudication),
`verification-before-completion` (completion evidence), `finishing-a-development-branch`
(final integration).
