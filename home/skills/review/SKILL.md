---
name: review
description: Fresh-context code review — spawns a headless pi instance that sees only intent + diff + checklist, never this conversation. Use before merging or deploying anything that feeds live/scheduled jobs.
disable-model-invocation: true
argument-hint: "[base-ref] — git ref to diff against (default: merge-base with main)"
---

# Fresh-Eyes Review

The context that wrote a change reads its own intent, not its own text — it cannot
see its own blind spots. This skill hands the diff to a **fresh agent** with zero
conversation context and makes it hunt for data bugs.

## Steps

1. **Base ref**: use `$ARGUMENTS` if given, otherwise `git merge-base main HEAD`
   (fall back to `main` if that fails).
2. **Collect the changeset**: `git diff <base>` plus `git status --short` for
   untracked files. If the diff exceeds ~1500 lines, don't paste it — list changed
   files with per-file stats and tell the reviewer to read them.
3. **Determine intent**: use the Goal + Verification sections of the most relevant
   plan in `docs/plans/` if one exists; otherwise ask the user for a one-line
   statement of what this change is supposed to do. Never invent intent.
4. **Write the brief** to `/tmp/pi-review-brief.md`:

   ```markdown
   # Review brief
   You are a fresh-context reviewer. Read ~/.pi/agent/skills/data-task/SKILL.md
   first and apply its checklist throughout.

   ## Intent
   <intent paragraph + the named acceptance checks>

   ## Changeset
   <diff, or file list + instruction to read the files>

   ## Your job
   Hunt specifically for: grain changes, join fan-out, silent row loss,
   timestamp/timezone/as-of errors, look-ahead bias and train/test leakage,
   train/inference preprocessing parity breaks, misleading evaluation, duplicate
   side-effect paths (double alerts on retry), idempotency breaks.
   Report: numbered findings, each with severity (BLOCKER / should-fix / nit),
   the file:line, and why it is wrong given the intent. Then a second list of
   things you checked and found fine. If the changeset is correct, say so plainly.
   Do not fix anything. Report only.
   ```

5. **Spawn the reviewer** (give bash a generous timeout — reviews take minutes):

   ```bash
   pi -p --no-session "Read /tmp/pi-review-brief.md and do what it says."
   ```

6. **Triage findings** with the user: fix the real ones, explicitly dismiss the
   rest. If fixes are substantial, re-run steps 2–5 once. Then delete the brief.

## When to skip

Trivial diffs (< ~20 lines, no transform/model/alert logic): eyeballing it here is
fine. Anything feeding a scheduled job, a model, or Slack: this review is mandatory.
