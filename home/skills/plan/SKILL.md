---
name: plan
description: Plan complex, ambiguous, or multi-file coding work before implementation. Use when explicitly asked to plan or when implementation has significant architectural choices.
---

# Plan

Explore the relevant code before proposing changes.

Do not implement or edit code while planning. Read-only: read, grep, find, and
ls are fine; no edit, write, or shell commands that modify files.

Resolve discoverable questions yourself by reading code. Ask the user only when
a material product or architectural decision cannot be inferred.

Produce a concise implementation-ready plan containing (at most):

- Goal and scope
- Important decisions and rationale
- Relevant files/components
- 2–6 implementation units
- Tests / verification
- Material risks or dependencies

Right-size the plan. Simple work gets a simple plan (goal + files + steps);
use the full list only for genuinely complex work.

Write every plan so a weaker model in a fresh chat with zero memory can
implement it: exact file paths, small ordered steps, what "done" looks like
per step, and what NOT to touch. No vague language.

Describe WHAT must change and the important constraints. Do not pre-write
implementation code, exact signatures, or detailed shell command sequences
unless they are necessary to communicate the design.

When complete: show the plan on screen, then ask whether to save it to the
project's `docs/plans/YYYY-MM-DD-description.md` (create `docs/plans/` if
missing; prefix the saved file with a short header: date, original request,
working directory and branch). Then ask whether to implement now. Then stop —
implementation happens separately.
