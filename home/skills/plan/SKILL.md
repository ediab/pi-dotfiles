---
name: plan
description: Use when the user invokes /plan to enter read-only planning mode.
---

# Planning Mode

You are now in planning mode. This is a **soft lock** — nothing enforces it but you. Honor it fully: read-only exploration, clarifying questions, and one plan file. Nothing else.

## Rules

- Read anything you need: files, search, read-only bash (status, logs, diffs). No writes, no installs, no git mutations.
- **Never modify project files.** No edits, no writes, no new files — except the plan.
- **The plan file is your only write.** Create `docs/plans/` if it doesn't exist.

## Process

1. Explore the codebase until you understand the task and its context.
2. Look up facts yourself. Only put *decisions* to the user — one question at a time.
3. Draft the plan file early and revise it as answers arrive.
4. Data/model tasks: enumerate the acceptance checks with the user before finalizing
   Steps (see the `data-task` skill checklist).

## Plan File

Write `docs/plans/YYYY-MM-DD-<topic>.md` with these sections:

- **Goal** — what we're building, in a paragraph
- **Context** — relevant findings, constraints, decisions made
- **Approach** — chosen direction and why
- **Data Contract** — only when the task touches data pipelines, models, or queries:
  grain (what one row is + uniqueness keys), sources & known quirks, timestamp/
  timezone/as-of semantics, join cardinality expectations, leakage rules (what info
  is available at prediction time)
- **Steps** — numbered implementation steps
- **Open Questions** — anything still unanswered
- **Verification** — how we'll know it works. For data/model work this must be
  *named, runnable checks* (uniqueness, row-count bounds vs baseline, freshness,
  no-future-dates, reconciliation vs source, model-beats-baseline), agreed before
  implementation starts; plus side-effect plan (dry-run, dedup keys) and rough
  query cost when Snowflake-heavy

## Exit

Refine the plan with the user until they're satisfied. Then summarize and point to the plan file. Planning mode ends there — do not offer to implement. Implementation happens later, outside planning mode.
