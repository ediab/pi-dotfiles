# Workflow Hardening — Gaps 1–5

**Status:** draft — blocked on Open Questions below
**Source:** Known-gaps list in `docs/WORKFLOW.md`, items 1–5

## Goal

Make reliability independent of dev-time checks and memory: catch failures *after*
deploy, contain blast radius on Snowflake, prove the verification kit against real
data, detect source schema drift, and encode the two habits that no tool can enforce.

## Context

- Kit: `home/skills/data-task/templates/{datachecks,eval_harness,side_effects}.py`,
  deployed via `rebuild.sh --sync-only` (local) and `deploy-vps.sh` (VPS).
  Tested synthetically only (9 passing smoke cases, clean 3-row frames).
- Live jobs run on the VPS (docker/systemd/cron); side effects go to Slack.
- Pi sessions use Elias's primary Snowflake credentials (read AND write).
- Gap→workstream map: **A**=gap 2, **B**=gaps 3+4 (one effort), **C**=gap 1, **D**=gap 5.
  Order is dependency-driven: monitoring (C) is only as good as the checks it runs,
  so the kit gets proven (B) first; A is fast and independent; D rides along.

## Approach

### Workstream A — Read-only Snowflake access (gap 2)

1. Draft Snowflake bootstrap SQL: `AGENT_ROLE`; `AGENT_WH` warehouse with
   AUTO_SUSPEND + RESOURCE MONITOR (monthly credit cap, suspend+notify at thresholds);
   `GRANT USAGE ON WAREHOUSE`, `GRANT SELECT` on the databases agents need;
   `AGENT_USER` with key-pair auth, default role/warehouse set.
   → **verify:** SQL reviewed by Elias before running.
2. Elias executes the SQL (requires sufficient admin rights).
   → **verify:** `SHOW GRANTS TO USER AGENT_USER` matches intent.
3. Wire credentials locally (env file outside any repo; path documented in
   WORKFLOW.md only). Update pi/project AGENTS.md standing rule: *agents connect
   with the read-only profile; any DDL/DML → stop and hand back to Elias.*
   → **verify:** a fresh session connects and queries via the new profile.
4. Negative tests as the agent user: `CREATE TABLE`, `INSERT`, `DELETE` all fail
   with insufficient privileges; resource monitor visible on AGENT_WH.
   → **verify:** screenshots/output captured in this plan's thread.
5. Rollout: switch agent workflows to the new profile; keep personal creds for
   admin console only.
   **Rollback:** drop user/role/monitor — nothing else touched.

### Workstream B — Pilot hardening + schema drift (gaps 3 + 4)

0. Pick the pilot pipeline. Criteria: live/scheduled · fed by Snowflake · moderate
   size · numbers Elias personally cares about. *(decision needed)*
1. Integrate: copy templates into pilot `tests/`; write acceptance checks for the
   EXISTING transforms (grain keys, count-vs-baseline, freshness, no-future-dates).
   → **verify:** suite runs green-or-honest-red against REAL pulled data.
2. Fix what reality breaks, each fix driven by a failing smoke-test case added to
   the kit first. Anticipated: string timestamps from Snowflake; mixed tz-aware/
   naive columns raising TypeError; **NaT silently passing the future-date check**
   (`NaT > x` is False — must count NaT explicitly); NaN pairs silently ignored in
   `reconcile`; pandas-version guard for `groupby.apply(include_groups=…)`.
   → **verify:** kit smoke suite extended; old cases still pass.
3. Schema-drift helpers in `datachecks.py`: `fingerprint_schema(df)` →
   `{col: pandas_dtype_string}`; `expect_schema(df, snapshot_path, allow_new=False)`
   comparing against per-source JSON snapshots stored in the project repo, plus an
   explicit `--update-snapshot` escape hatch (deliberate, reviewed changes only).
   → **verify:** renamed column in a fixture gets caught; update flow refreshes cleanly.
4. Push everything upstream: commit template fixes to pi-dotfiles →
   `rebuild.sh --sync-only` → `deploy-vps.sh`.
   → **verify:** template file hashes identical local ↔ VPS.
5. One-paragraph retrospective in WORKFLOW.md: what real data broke.
   **Exit criteria:** pilot suite green on real data · ≥1 genuine upstream fix ·
   drift tripwire demonstrated on the pilot's sources.

### Workstream C — Post-deploy monitoring (gap 1)

1. Inventory VPS jobs: unit/cron/compose name → what it produces → what "healthy"
   means (freshness SLA, row-count expectation, output location).
   → **artifact:** table in the pilot project's docs; becomes the watchdog registry.
2. Per-job self-check entrypoint: `tests/test_live_output.py` reusing datachecks
   against the job's latest output; runnable standalone
   (`pytest -q tests/test_live_output.py`).
3. Watchdog script on VPS (`~/bin/pi-watchdog`, daily cron): runs every registered
   job's check; posts **one** Slack summary per day via `side_effects.Emitter`
   (dedup key `check:date` — a flapping failure alerts once per day, never spams):
   all-green one-liner, or the failure list.
   → **verify:** inject a failure → exactly one alert; fix → green summary next day.
4. Silence detection: watchdog flags any job whose output is older than its SLA
   even if the job "succeeded" — staleness is a first-class alarm, not a footnote.
   → **verify:** stale fixture flagged.
5. Document the pattern in WORKFLOW.md; roll out to remaining jobs one at a time
   (never all at once).

### Workstream D — Habits encoded (gap 5)

1. Mirror the spot-check rule into `data-task` definition-of-done
   ("one result verified against known reality") — it currently lives only in
   WORKFLOW.md, but the skill is what sessions actually load.
2. Add a change-budget line to WORKFLOW.md header: *no new process/tooling until a
   real failure names the missing piece.*
3. Nothing else. Habits can't be enforced, only placed where attention already flows.

## Sequencing & effort

| Order | Workstream | Effort | Depends on |
|---|---|---|---|
| 1 | A — read-only Snowflake | ~1 session + Elias runs SQL | nothing |
| 2 | B — pilot + schema drift | 1–2 sessions | pilot chosen |
| 3 | C — watchdog | 1–2 sessions | B exit criteria |
| — | D — habit encoding | minutes | nothing (do immediately) |

## Overall verification

- Agent Snowflake user provably cannot write; spend monitor active on its warehouse.
- Pilot acceptance suite green on real data; kit smoke suite grown; hashes identical
  across machines.
- Watchdog daily summary observed ≥3 consecutive days including one injected failure.
- WORKFLOW.md updated; zero unrelated behavior changed.

## Open Questions (blocking)

1. **Pilot pipeline** — which project? (live, Snowflake-fed, you care about its numbers)
2. **Snowflake rights** — can you create user/warehouse/resource monitor (or who can),
   and is key-pair auth acceptable?
3. **Slack routing** — which channel/webhook receives watchdog summaries, and should
   job-level failure alerts go there too instead of scattered channels?
4. **VPS inventory** — any schedulers outside docker/systemd/cron the watchdog must cover?
