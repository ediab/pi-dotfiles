# Work PC Rollout — Personal Pi Workflow

**This file is written for an AI agent session on Elias's work machine.** It explains
why this workflow exists, what was built on the personal machine, and — if you are an
agent reading this on the work PC — exactly what to do: install the portable parts,
validate them against the live work projects, adapt where needed, and report.

Human-readable context first (sections 1–3), then your instructions (sections 4–6).

---

## 1. Problem

Elias does mostly solo Python data engineering, quantitative research, and ML:
load datasets from Snowflake (often alternative-data providers), reconcile sources,
transform/join/aggregate, train or score models, validate, emit operational outputs
(Slack alerts), and maintain these pipelines as sources change.

The hard failures are not conventional app-dev bugs. They are:

- incorrect joins / silent grain changes (fan-out, row loss)
- duplicates, missing observations, stale/incomplete source data
- timestamp, timezone, and as-of-date mistakes
- look-ahead bias, feature leakage, train/test contamination
- preprocessing that drifts between training and inference
- misleading model evaluation (good average over bad slices)
- idempotency breaks and duplicate external side effects (double alerts)
- code that runs green and is analytically wrong

Two meta-failures dominated tooling attempts: **silently-wrong analysis** caught by
luck ("sometimes never"), and **process overhead** — heavyweight frameworks whose
plans/review loops cost more than they catch.

## 2. Diagnosis

Frameworks (Superpowers-style brainstorm→spec→subagent-relay pipelines, formal SDD)
add structure *above* the code while doing almost nothing *below* it. But no planning
ceremony catches a wrong join — only executable checks do. Meanwhile the authoring
context is structurally blind to its own mistakes (self-review bias), so verification
needs fresh context, not more instructions.

Conclusion implemented on the personal machine — the **minimum effective process**:

> Less ceremony above the code, more teeth below it. Alignment before building,
> named runnable checks before transforms, fresh-context review before deploy,
> everything else tiered by stakes and optional.

## 3. Solution inventory (what lives in this repo)

All paths below are relative to this repo. Skills deploy by copying the directory
into `~/.pi/agent/skills/`. Nothing requires npm or network beyond the clone.

### Skills

| Skill | Type | Purpose |
|---|---|---|
| `home/skills/data-task/` | auto-invoked | Loads on any data/pipeline/ML task: 4 standing rules, bug checklist walked at plan AND review time, definition-of-done |
| `home/skills/plan/` | `/plan` | Soft-lock read-only planning → `docs/plans/YYYY-MM-DD-<topic>.md`; includes **Data Contract** section (grain, source quirks, as-of semantics, join cardinality, leakage rules); Verification = named runnable checks agreed BEFORE implementation |
| `home/skills/review/` | `/review` | Fresh-context review: writes intent + diff + checklist to a temp brief, spawns a headless `pi -p --no-session` instance that shares ZERO context with the builder; mandatory before anything feeds scheduled jobs/models/alerts |
| `home/skills/grilling/` + `grill-me`, `grill-with-docs` | mixed | Relentless interview resolving every decision branch; `grill-with-docs` also builds `CONTEXT.md` glossary + ADRs |
| `home/skills/domain-modeling/` | auto-invoked | The glossary/ADR discipline (required by grill-with-docs) |
| `home/skills/diagnosing-bugs/` | auto-invoked | Red signal → minimise → hypothesise → instrument → fix loop |
| `home/skills/research/` | auto-invoked | Background investigation against primary sources, cited output file |
| `home/skills/handoff/` | `/handoff` | Compacts a conversation into a handoff doc for a fresh session |

Deliberately NOT used: orchestration/subagent packages, ticket-triage state machines,
formal spec-driven development. Documented reasons: per-task implementer/reviewer
relays showed 10–15× token overhead with no quality gain on simple tasks; SDD's own
communities call much of it "the illusion of work". Fresh context is obtained with a
headless call, not an orchestration layer.

### Verification kit (`home/skills/data-task/templates/`)

Copy per project into `tests/`. Each guard maps to a real failure mode:

| File | Guards against |
|---|---|
| `datachecks.py` | grain violations (`expect_unique`), join fan-out / row loss (`expect_same_grain`, `expect_count_within`), nulls, look-ahead (`expect_no_future_dates`), stale sources (`expect_freshness`), source disagreement (`reconcile`) |
| `eval_harness.py` | random splits on temporal data (`time_split`, `expanding_windows`), models that lose to naive baselines (`beat_baseline` — ties lose), misleading averages (`slice_report`) |
| `side_effects.py` | duplicate alerts on retry/rerun (`Emitter`: dedup key recorded BEFORE send, crash-safe), accidental sends (dry-run default; live needs `ALERTS_LIVE=1`) |

### Standing rules (always-on, from `data-task`)

1. State dataset grain after every load; can't state it → stop.
2. LIMIT/sample exploratory warehouse queries.
3. Acceptance checks written before transforms.
4. Side effects dry-run by default.

### Tiers

- **Tier 0 (small change):** just work; standing rules apply; no artifacts.
- **Tier 1 (ordinary pipeline/model work):** `/grill-me` if fuzzy → `/plan`
  (Data Contract + named checks) → implement checks-first → acceptance suite green →
  `/review` if diff feeds live jobs → commit.
- **Tier 2 (large build):** Tier 1 + stage-gated execution, historical replay
  validation, cutover checklist (dry-run verified · dedup key tested · rerun
  idempotent · freshness alarm armed), promote plan → durable spec once live.

**Definition of done:** acceptance green · fresh-context review passed for
live-affecting diffs · no unverified analytical claims · spot-check one result
against known reality.

---

## 4. INSTALL — agent, do this first

This machine has partial restrictions (managed laptop, possibly proxied npm). Install
in two tiers; do NOT let Tier B block Tier A.

**Tier A — zero-install core (no npm, no scripts):**

```bash
git clone git@github.com:ediab/pi-dotfiles.git   # or the approved mirror/copy
mkdir -p ~/.pi/agent/skills
cp -R pi-dotfiles/home/skills/* ~/.pi/agent/skills/
ls ~/.pi/agent/skills   # expect: bro convert-documents-to-markdown data-task
                        # diagnosing-bugs domain-modeling grill-me grill-with-docs
                        # grilling handoff herdr plan research review show-me wait-what
```

Verify: start `pi` in any repo, type `/plan` — the planning-mode prompt should load;
mention a data transform task — the `data-task` skill should engage.

**Tier B — packages, only if approved:** the canonical list is `packages` in
`home/settings.json`. None are required for the workflow above except optionally
`@dietrichgebert/ponytail` (minimality discipline) — `pi install` it if the registry
is reachable; otherwise skip without consequence.

**Do NOT copy:** `auth.json` (personal API keys), the personal `AGENTS.md` VPS/SSH
sections, MCP configs. Work-machine credentials and policies are separate; ask Elias
what model/provider to configure.

## 5. MISSION — validate against live work projects

Full autonomy granted, bounded as follows. Work through Elias's live work repos
(discover them, then confirm the list with Elias before starting).

**Guardrails (hard):**

- Branch + local commits only. NEVER push to any remote. Never rebase shared branches.
- Never touch credentials, secrets, prod configs, CI files, or dependency versions
  without asking.
- Destructive ops (`rm -rf`, force-push, dropping tables) → ask first, always.
- If a repo isn't clearly Elias's own work, report instead of modifying.

**Per-repo procedure:**

1. **Classify:** Is it a data pipeline / ML / dashboard repo? Scheduled anywhere?
   External side effects? What data sources? Existing tests?
2. **Risk-rank** all repos: scheduled + side effects + weak tests = highest priority.
   Inconsistent test culture overall means triage, not blanket rollout.
3. **For each repo (highest risk first):**
   - Create/update `AGENTS.md`: what the repo is, how to run/test it, known source
     quirks, deploy notes. Factual and short — this is the highest-leverage file an
     agent reads.
   - If the domain has confusing vocabulary, run a `grill-with-docs` session with
     Elias → produce `CONTEXT.md`.
   - Copy the three template files into `tests/`; wire acceptance checks for the most
     critical transform(s): grain keys, count-vs-baseline, freshness, no-future-dates.
     Wire `side_effects.Emitter` wherever alerts/webhooks are sent.
     Make checks runnable: `pytest tests/`.
   - Fix ONLY what blocks the checks from running. Anything deeper → report.
4. **Report:** write `ROLLOUT-REPORT.md` (repo root, uncommitted) summarizing: repos
   seen, classification table, changes made (file + why), checks wired + their status,
   recommendations not acted on, and anything that needs human decisions.

**Stop conditions:** missing credentials for a source; ambiguity about repo ownership;
any request that would touch teammates' work; Snowflake access questions (use only
sanctioned/read-only paths on a corporate account).

## 6. Expected deltas vs the personal setup

- Model/provider will differ (corporate gateway or different API key) — configure,
  don't import.
- Corporate Snowflake: prefer an existing read-only role; the personal machine's
  lesson (agents should never hold write credentials) applies doubly at work.
- Herdr, intercom, VPS deploy scripts are personal-machine conveniences — skip.
- If npm is blocked entirely, everything in sections 1–5 still works: the whole
  methodology is markdown + copied Python files.

---

*Maintained in `ediab/pi-dotfiles`. When reality contradicts this file, fix one of them
immediately.*
