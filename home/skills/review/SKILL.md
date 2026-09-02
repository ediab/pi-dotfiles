---
name: review
description: Fresh-context code review — spawns the reviewer subagent (GLM-5.3 Flash, max thinking) in this session with only intent + base ref, never this conversation. Use before merging or deploying anything that feeds live/scheduled jobs.
disable-model-invocation: true
argument-hint: "[base-ref] — git ref to diff against (default: merge-base with main)"
---

# Fresh-Eyes Review

The context that wrote a change reads its own intent, not its own text — it cannot
see its own blind spots. This skill hands the changeset to the **reviewer subagent**
(fresh context, own model) and makes it hunt for bugs.

## Steps

1. **Base ref**: use `$ARGUMENTS` if given, otherwise `git merge-base main HEAD`
   (fall back to `main` if that fails).
2. **Determine intent**: use the Goal + Verification sections of the most relevant
   plan in `docs/plans/` if one exists; otherwise ask the user for a one-line
   statement of what this change is supposed to do. Never invent intent.
3. **Spawn the reviewer** — foreground `Agent` call (wait for it; reviews take
   minutes):

   - `agent`: `reviewer`
   - `prompt`: the base ref, the intent paragraph, the changed-file list from
     `git status --short`, and — if the change touches data pipelines, models, or
     queries — "Read ~/.pi/agent/skills/data-task/SKILL.md first and apply its
     checklist throughout."

   The agent collects its own diff and runs its own protocol; don't paste the diff
   into the prompt.
4. **Triage findings** with the user: fix the real ones, explicitly dismiss the
   rest. If fixes are substantial, re-run steps 3 once.

## When to skip

Trivial diffs (< ~20 lines, no transform/model/alert logic): eyeballing it here is
fine. Anything feeding a scheduled job, a model, or Slack: this review is mandatory.
