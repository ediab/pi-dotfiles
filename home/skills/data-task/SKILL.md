---
name: data-task
description: >-
  Definition-of-done and bug checklist for data engineering, pipeline, quantitative
  research, dashboard, and ML work: loading datasets, joins, feature engineering,
  aggregation, training/evaluating models, validation, Snowflake queries, scheduled
  jobs, or external side effects (Slack alerts). Use whenever a task touches data
  transformations or models.
---

# Data Task Discipline

Data code fails differently from app code: it runs green and produces silently-wrong
results. The failure modes are known and checkable. Your job on every data task is to
make the failure modes **runnable checks** instead of hopes.

## Standing rules (always)

1. **State the grain after every load.** One sentence: "one row = one flight per day
   per carrier." If you can't state it, stop and find out before joining anything.
2. **LIMIT exploratory Snowflake queries** (`LIMIT 1000` / sample / date-bounded slice).
   Full scans only when the task requires them, and say so before running.
3. **Checks before transforms.** For any non-trivial transform/model work, write the
   named acceptance checks (below) *before* writing the pipeline code. Get the user's
   OK on them for Tier-1+ tasks.
4. **Side effects default to dry-run.** Nothing sends a Slack message / writes outward
   without an explicit opt-in (`--dry-run` off). Use `templates/side_effects.py`.

## Definition of done

A data task is done when:

1. **Acceptance suite is green** — the checks written for this task run and pass
   (pytest + `datachecks.py` helpers; see Templates).
2. **Fresh-context review passed** — if the diff feeds a live/scheduled job, a fresh
   agent (subagent or new session) reviews the diff against the stated intent using
   the checklist below. It must see intent + diff + checklist, not this conversation.
3. **No unverified analytical claims.** Every number reported to the user has a query
   or assertion behind it.

## The checklist

Walk it when **planning** (which checks does this task need?) and when **reviewing**
(which could this diff have broken?).

**Grain & joins**
- [ ] Grain stated; uniqueness keys asserted (`expect_unique`)
- [ ] Join keys map 1:1 across sources? Cardinality expected and asserted
      (`expect_same_grain` before/after each join catches fan-out)
- [ ] Row count vs baseline within tolerance (`expect_count_within`) — catches silent
      row loss and duplicate-generating joins

**Data quality**
- [ ] Null rates in key columns bounded (`expect_no_nulls`)
- [ ] Staleness/freshness of source checked (`expect_freshness`) — stale/incomplete
      recent partitions are the classic silent killer
- [ ] Source disagreements reconciled explicitly (`reconcile`), not averaged away

**Time**
- [ ] Timezone of every timestamp column known and normalized deliberately
- [ ] As-of semantics explicit: what did the world look like at prediction time?
      No event timestamps after as_of feed features (`expect_no_future_dates`)
- [ ] Late-arriving / restated data handled (idempotent upserts, not blind appends)

**ML leakage & integrity**
- [ ] Features use only information available at prediction time
- [ ] Split by time or entity group, never randomly shuffled rows, unless justified
- [ ] Preprocessing fit on train only — one fitted object reused at inference
      (sklearn `Pipeline`), never refit on full data
- [ ] Model must beat a naive baseline (persistence / prior rate) — `eval_harness.beat_baseline`
- [ ] Eval protocol fixed before looking at results; agent must not modify metric
      computation to improve the score (reward hacking)

**Ops**
- [ ] Reruns idempotent: running twice == running once
- [ ] Alerts deduped by key; dry-run path tested before live send
- [ ] Freshness alarm exists for any scheduled job's output
- [ ] Query cost of steady-state job roughly known

## Templates

Copy per project, then adapt thresholds:

```
~/.pi/agent/skills/data-task/templates/datachecks.py    # pandas assertions
~/.pi/agent/skills/data-task/templates/eval_harness.py  # splits, baseline, stability
~/.pi/agent/skills/data-task/templates/side_effects.py  # dedup emitter, dry-run guard
```

```bash
cp ~/.pi/agent/skills/data-task/templates/*.py <project>/tests/
```

They are starting points — edit freely in the project; do not edit the templates
unless improving the kit itself.

## Fresh-context review protocol

Give the reviewer exactly three things:
1. Intent: the plan/goal paragraph + the named acceptance checks
2. The diff (`git diff main...HEAD`)
3. This checklist

Ask it to hunt specifically for: grain changes, join fan-out, timestamp/as-of bugs,
leakage, train/inference parity breaks, double-send paths. Report findings as a list;
fix real ones, dismiss the rest explicitly.
