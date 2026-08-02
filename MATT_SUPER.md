# Matt Skills + Pi Subagents: Execution Handoff

**Status:** Design agreed; implementation pending
**Implementation spec:** `docs/plans/2026-08-02-002-feat-ticket-execution-workflow.md`

## Problem

The current workflow stops at an important seam:

```text
brainstorming → to-spec → to-tickets → ?
```

Matt Pocock's `to-tickets` produces tracer-bullet tickets that are safe to hand to agents, but deliberately does not define how those tickets are executed. Matt's `implement` is a single-agent implementation flow. A request such as "implement these tickets with subagents" does not by itself reproduce Superpowers' subagent-driven development guarantees.

A bare pi-subagents dispatch does not guarantee:

- an explicit approved ticket set rather than every `ready-for-agent` item;
- dependency ordering;
- one fresh implementation context per ticket;
- access to Matt's `tdd` guidance;
- separate Spec and Standards review;
- parent adjudication of review feedback;
- one reviewed commit and tracker update per ticket;
- a final whole-feature review and branch-finishing handoff.

This matters because Matt currently marks both specs and implementation tickets `ready-for-agent`, pi-subagents workers default to forked context unless overridden, and the tracker must remain useful across fresh Pi sessions.

## What We Are Changing

### 1. Add an execution chooser to `to-tickets`

After the user approves, `to-tickets` retains or publishes a durable parent-spec reference and publishes the explicit ticket set. It captures the user's approved test seams for each ticket, then assesses the work and asks the user to choose:

1. **Implement directly** — use Matt's existing `implement` guidance; the handoff pins its post-commit review order.
2. **Implement with subagents** — follow a new `execute-tickets` coordinator.

The agent recommends one option, but the user always decides. It captures `FEATURE_BASE_SHA` after the planning commit for either mode. Direct mode uses the unchanged `implement` skill for implementation guidance, then commits before its whole-feature `code-review` against that base so the review sees committed work.

Recommend direct implementation for a small, tightly coupled change that fits comfortably in one context. Recommend subagents for multiple substantial tickets, long or risky work, context pressure, or work that benefits from independent per-ticket review. This is agent judgment, not a rigid ticket-count heuristic.

### 2. Add a thin `execute-tickets` skill

The new skill will coordinate pi-subagents rather than duplicate its package implementation. It will require the durable parent-spec reference, explicit ticket-set references, and user-approved per-ticket test seams; it will never discover work by querying every `ready-for-agent` item.

Writers remain sequential in v1. Reviewers run in parallel.

For each ready ticket:

```text
claim ticket + record BASE_SHA
→ fresh worker in the feature worktree with Matt tdd guidance
→ parallel fresh Spec and Standards reviewers
→ parent adjudicates findings
→ resume the same worker for accepted fixes
→ re-review material fixes, maximum 3 rounds
→ parent validates
→ parent creates one ticket commit
→ record validation/commit and resolve ticket
→ recalculate dependency frontier
```

For a local Markdown tracker, tracker-file changes are excluded from the implementation diff and committed separately as a tracker-only bookkeeping commit after implementation commit and ticket resolution.

Workers do not commit. Reviewers are instructed not to edit. The parent owns the loop, git commits, tracker state, and final decisions.

After all tickets:

```text
fresh whole-feature Spec + Standards review from original base SHA
→ accepted fixes and re-review as needed
→ full configured repository verification
→ finishing-a-development-branch
```

### 3. Use one isolated feature worktree

Both execution modes use one persistent isolated feature worktree unless the session is already isolated. Sequential ticket workers share that worktree; there are no parallel writer worktrees in v1.

For a local Markdown tracker, only the explicit workflow-created spec and ticket files may be transferred into the feature worktree. Rebind the handoff references to their feature-worktree paths; tracker changes stay out of implementation commits and receive a separate tracker-only bookkeeping commit after resolution. Unrelated dirty changes or a broken baseline pause execution.

### 4. Use the configured tracker as the only durable ledger

Do not add a second progress file. Record the following against each ticket using the configured local/GitHub/GitLab tracker conventions:

- claim/status;
- base SHA;
- accepted and deferred review findings;
- validation evidence;
- final commit;
- resolved/closed state;
- for local Markdown tracking, a separate tracker-only bookkeeping commit after resolution.

This lets a new Pi session recover execution state from the tracker.

### 5. Preserve current Pi configuration

No worker/reviewer settings changes and no custom reviewer agent.

- Keep the configured worker and reviewer models/thinking levels.
- Launch ticket workers with `context: fresh`, the feature-worktree `cwd`, and Matt's `tdd` skill.
- Launch fresh built-in reviewers in parallel with explicit read-only instructions.
- Resume the same ticket worker for accepted fixes; use a fresh worker only if resumption fails.
- Capture and pass user-approved per-ticket test seams before either mode starts; keep TDD mandatory for bug regression tests and use it at those approved seams for features.
- Deploy the root memo with `rebuild.sh`, keeping `~/.pi/agent/MATT_SUPER.md` equal to its source copy.

## Why This Design

### It restores the useful Superpowers guarantees

The design keeps fresh per-ticket implementation contexts, independent review, bounded fix loops, parent control, verification, and final branch finishing without reinstalling Superpowers' full execution stack.

### It preserves Matt's strengths

Matt's tracer-bullet tickets remain the delegation unit, `implement` remains the lightweight direct path, `tdd` remains the implementation discipline, and `code-review` supplies the Spec/Standards rubrics.

### It uses pi-subagents where it is strongest

pi-subagents supplies fresh/forked contexts, parallel reviewers, worker resumption, acceptance evidence, and parent-orchestrated review-loop mechanics. The new skill only defines the missing ticket lifecycle.

### It avoids premature parallel-writer machinery

Managed parallel worktrees produce patch artifacts and add integration/review complexity. Sequential writers are easier to review against live files and preserve deterministic dependency ordering. Parallel writers can be added later only if measured throughput justifies them.

### It avoids configuration drift

Project-level pi-subagents agent overrides replace, rather than merge with, user agent configuration. Leaving settings unchanged avoids silently losing the current model and thinking choices. A custom reviewer is also unnecessary until instruction-level read-only behavior proves insufficient.

### It keeps the workflow recoverable

The tracker already contains ticket dependencies and status. Recording execution evidence there avoids a competing ledger and survives session compaction or restart.

## Agreed Boundaries

- No parallel ticket writers in v1.
- No label-wide ticket discovery.
- No nested subagent orchestration by ordinary workers.
- No custom reviewer agent.
- No new settings overrides.
- No second execution-state file.
- No generic affected-package shortcut; run the full configured suite unless repository instructions explicitly define a narrower gate.
- Maximum three review/fix rounds before escalating unresolved blockers to the user.
- Autonomous execution after the user's mode choice; pause only for ambiguity, failed baseline/validation, disputed findings, or unresolved blockers.
- `MATT_SUPER.md` is the decision/research memo; the implementation-ready contract lives in the separate spec.

## Primary References

- Matt Pocock `to-tickets`: <https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md>
- Matt Pocock `implement`: <https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md>
- Matt Pocock `code-review`: <https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md>
- Superpowers subagent-driven development: <https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md>
- pi-subagents review loop: <https://github.com/nicobailon/pi-subagents/blob/main/prompts/review-loop.md>
