# Personal Pi Workflow — What, Why, Where

This document records a workflow redesign done on Elias's personal machine. It is
written so an agent on another machine can understand the reasoning and **selectively
adopt whichever parts apply**. It does not prescribe steps; each component below lists
what it is, which failure mode motivated it, and where it lives, so you can judge
relevance against local reality.

---

## Problem

Elias's work profile: solo Python data engineering, quantitative research, ML
pipelines. Load datasets from Snowflake (often alternative-data providers),
reconcile sources, transform/join/aggregate, train or score models, validate,
emit operational outputs (Slack alerts), maintain pipelines as sources change.

The failures that actually hurt are not conventional app-dev bugs:

- incorrect joins / silent grain changes (fan-out, row loss)
- duplicates, missing observations, stale/incomplete source data
- timestamp, timezone, and as-of-date mistakes
- look-ahead bias, feature leakage, train/test contamination
- preprocessing drifting between training and inference
- misleading evaluation (good average over bad slices)
- idempotency breaks, duplicate external side effects (double alerts)
- code that runs green and is analytically wrong

Two meta-failures dominated tooling attempts: errors caught by luck ("sometimes
never"), and heavyweight frameworks whose planning/review ceremony cost more than
it caught.

## Diagnosis

Process frameworks (brainstorm→spec→subagent-relay pipelines, formal SDD) add
structure **above** the code while doing nothing **below** it. No planning ceremony
catches a wrong join — only executable checks do. And the context that wrote code
is structurally blind to its own mistakes (measured self-review bias), so review
needs genuinely fresh context, not stronger instructions to the same session.

Design principle adopted:

> Less ceremony above the code, more teeth below it. Alignment before building;
> named runnable checks before transforms; fresh-context review before deploy;
> everything else tiered by stakes and optional.

Evidence behind the choices: subagent implement/review relays showed 10–15× token
overhead without quality gains on simple tasks; spec-driven workflows were called
"the illusion of work" by their own communities; fresh-context review is the single
best-supported agentic practice in the literature.

## What was built, and why

### Skills

Each skill is one directory: `SKILL.md` (+ optional supporting files). "Auto" means
the agent loads it when a task matches; slash means Elias invokes it.

| Skill | Invoked | Why it exists (failure mode addressed) |
|---|---|---|
| `data-task` | auto | THE core piece. Loads on any data/pipeline/ML task; carries 4 standing rules, a bug checklist walked at both plan-time and review-time, and the definition-of-done. Directly attacks "runs green, analytically wrong". |
| `plan` (`/plan`) | slash | Soft-lock read-only planning → one plan file. Its plan template forces a **Data Contract** section (grain, source quirks, as-of semantics, join cardinality, leakage rules) and requires named runnable checks agreed BEFORE implementation. Attacks misalignment and "checks as afterthought". |
| `review` (`/review`) | slash | Fresh-context review: intent + diff + checklist go into a temp brief; a headless `pi -p --no-session` instance reviews it with ZERO shared context, hunting grain/fan-out/timestamps/leakage/parity/double-send paths. Attacks self-review bias. Mandatory before anything feeds scheduled jobs/models/alerts. |
| `grilling`, `grill-me`, `grill-with-docs` | auto / `/grill-me`, `/grill-with-docs` | Relentless interview resolving every decision branch before building. `grill-with-docs` additionally builds a `CONTEXT.md` glossary + ADRs. Attacks misalignment ("built the wrong thing") and vocabulary drift across sessions. |
| `domain-modeling` | auto | Glossary/ADR discipline. Required — `grill-with-docs` is just a stub pointing here. |
| `diagnosing-bugs` | auto | Disciplined loop: get a red signal FIRST, then minimise → hypothesise → instrument → fix. Attacks hypothesis-jumping during debugging. |
| `research` | auto | Background investigation against primary sources producing a cited findings file. For provider/source quirk investigations. |
| `handoff` (`/handoff`) | slash | Compacts a conversation into a handoff doc so a fresh session can continue. Context hygiene. |
| `bro`, `wait-what`, `show-me` | slash | Communication repair / visualization. Convenience, not reliability. |

Deliberately NOT adopted, and why: orchestration/subagent packages (per-task
implementer/reviewer relays cost 10–15× tokens on simple tasks); ticket-triage state
machines (team product cadence, not solo pipelines); formal spec-driven development
(illusion-of-work criticism; the real "spec" is a data contract inside the plan).

### Verification kit — `data-task/templates/`

Three Python files copied per project into `tests/`. Every function maps to a
specific failure mode:

| File | Guards against |
|---|---|
| `datachecks.py` | grain violations (`expect_unique`), join fan-out via grain snapshot-before/assert-after (`expect_same_grain`), silent row loss vs baseline (`expect_count_within`), nulls (`expect_no_nulls`), look-ahead (`expect_no_future_dates`), stale sources (`expect_freshness`), source disagreement made explicit (`reconcile`) |
| `eval_harness.py` | random splits on temporal data (`time_split`, `expanding_windows`), models no better than naive (`beat_baseline` — ties lose), misleading averages (`slice_report`) |
| `side_effects.py` | duplicate alerts on retry/rerun (`Emitter` dedup key recorded BEFORE send, crash-safe, persists across restarts), accidental sends (dry-run default; live requires `ALERTS_LIVE=1`) |

### The workflow that ties it together

Standing rules (via `data-task`, always): state grain after every load · LIMIT
exploratory warehouse queries · acceptance checks written before transforms ·
side effects dry-run by default.

Tiers:

- **Tier 0** small change: just work; standing rules only.
- **Tier 1** ordinary pipeline/model work: `/grill-me` if fuzzy → `/plan`
  (Data Contract + named checks) → implement checks-first → acceptance suite green →
  `/review` if diff feeds live jobs → commit.
- **Tier 2** large build: Tier 1 + stage gates, historical replay validation,
  cutover checklist (dry-run verified · dedup key tested · rerun idempotent ·
  freshness alarm armed), promote plan → durable spec once live.

Definition of done: acceptance green · fresh-context review passed for live-affecting
diffs · no unverified analytical claims · spot-check one result against reality.

Also installed but optional: `@dietrichgebert/ponytail` pi package (minimality
discipline — fights over-built code; note it minimizes code, not wrongness).

## Where everything lives

In this repo (`ediab/pi-dotfiles`):

| Artifact | Path |
|---|---|
| All skills | `home/skills/<name>/` |
| Verification kit | `home/skills/data-task/templates/{datachecks,eval_harness,side_effects}.py` |
| Workflow reference (personal machine) | `docs/WORKFLOW.md` |
| Hardening backlog (5 known gaps + plan) | `docs/plans/2026-08-23-workflow-hardening.md` |
| Package list | `packages` array in `home/settings.json` |
| This file | `WORK-PC.md` |

On a deployed machine, skills land in `~/.pi/agent/skills/<name>/`; `data-task`
references its templates at that absolute path, so keep that layout if you copy it.

## Notes for selective adoption

- **Dependency:** `grill-with-docs` requires `domain-modeling` — copy together or
  not at all.
- **Coherence:** `review` reads the `data-task` checklist; the checklist assumes the
  templates exist. The trio (`data-task` + templates, `plan`, `review`) is the load-
  bearing set; grilling/domain-modeling/diagnosing-bugs/research are independent.
- `plan` and `review` assume the `pi` harness (headless mode for review). Any agent
  harness with isolated sub-processes works for the same pattern.
- Never copy personal credentials or machine-specific notes (`auth.json`, VPS/SSH
  sections of AGENTS.md). Configure model/provider locally.

*When reality contradicts this file, fix one of them immediately.*
