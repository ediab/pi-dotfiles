# Pi Setup & Workflow — Canonical Reference

One page describing how this pi installation is configured and how Elias runs
data/pipeline/ML work through it. Update this file when the system changes;
if a rule here conflicts with reality, fix one of them immediately.

---

## Harness

- **pi** (minimal core by design: no built-in plan mode, subagents, or permission popups)
- Model: opencode-go / ox-alpha-free, thinking level max
- Config lives in `home/settings.json` (repo) → synced to `~/.pi/agent/settings.json`
  automatically by the launchd agent when pi rewrites it. Skills/extensions: edit under
  `home/`, then `./rebuild.sh --sync-only`. VPS gets the same via `./deploy-vps.sh`.

## Packages

| Package | Role |
|---|---|
| pi-web-access | web search / fetch |
| pi-mcp-adapter | MCP bridge (context7 docs, youtube-music) |
| @ff-labs/pi-fff | fast fuzzy file/grep search |
| pi-code-previews | code previews in TUI |
| pi-lsp | LSP diagnostics/hover/definitions |
| rpiv-ask-user-question | structured questions UI |
| pi-terminal-theme | theme plumbing |
| pi-intercom | session-to-session messaging |
| pi-btw | side-note capture |
| pi-clarify | clarification flows |
| @dietrichgebert/ponytail | minimality discipline (6 skills + mode extension; `/ponytail lite\|full\|ultra`) |

Deliberately NOT installed: any orchestration/subagent package. Fresh-context work
happens via `pi -p --no-session` headless calls instead (see /review).

## Skill inventory

**Data discipline**
- `data-task` *(auto)* — loads on any data/pipeline/ML task. Standing rules, bug
  checklist, definition-of-done. Templates at `~/.pi/agent/skills/data-task/templates/`.
- `plan` (`/plan`) — soft-lock read-only planning → `docs/plans/YYYY-MM-DD-<topic>.md`.
  Includes **Data Contract** section; Verification = named runnable checks agreed first.
- `review` (`/review [ref]`) — fresh-context review: spawns headless pi with intent +
  diff + checklist, zero contamination from the building session. **Mandatory before
  anything feeds a scheduled job, model, or Slack.**

**Alignment & knowledge**
- `grilling` *(auto)* / `grill-me` — relentless interview to resolve every decision branch
- `grill-with-docs` (`/grill-with-docs`) — grilling + builds CONTEXT.md glossary & ADRs
- `domain-modeling` *(auto)* — the glossary/ADR discipline (makes grill-with-docs work)
- `handoff` (`/handoff`) — compact conversation → handoff doc for a fresh session

**Debugging & investigation**
- `diagnosing-bugs` *(auto)* — red signal → minimise → hypothesise → instrument → fix
- `research` *(auto)* — background investigation against primary sources, cited output

**Communication & misc**
- `bro` (`/bro`), `wait-what` (`/wait-what`), `show-me` (`/show-me`) — re-explain,
  re-pitch, visualize
- `convert-documents-to-markdown` *(auto)*, `herdr` (explicit mentions only)
- ponytail skills: minimal-solution ladder on coding tasks; audit/debt/review variants

---

## The workflow

### Standing rules — always, every session (via data-task)

1. State dataset grain after every load ("one row = …"). Can't state it → stop.
2. LIMIT/sample exploratory Snowflake queries; say when a query will be expensive.
3. Acceptance checks written BEFORE transforms (agree them with the user at Tier 1+).
4. Side effects dry-run by default; live sends require ALERTS_LIVE=1 / explicit opt-in.

### Tier 0 — small change (< ~30 min, no grain/schema implications)

Just work with pi. No plan file, no ceremony. Standing rules still apply.
Eye-check output → commit.

### Tier 1 — ordinary pipeline/model work (hours)

```
requirements fuzzy? → /grill-me
                    → /plan                    (Data Contract + named checks)
                    → approve plan
                    → implement                (data-task auto-engages; checks first)
                    → pytest acceptance suite green
feeds live jobs?    → /review
                    → commit / deploy
learned a quirk?    → update project AGENTS.md / CONTEXT.md
```

### Tier 2 — large multi-stage build (new pipeline, migration, model→prod)

Tier 1 plus:
- Full `/plan` document; stages each gated by named checks
- Historical replay: new pipeline over a past window vs old outputs / reality
- Cutover checklist: dry-run verified · alert dedup key tested · rerun idempotency
  tested · freshness alarm armed · steady-state query cost measured
- Promote plan → durable spec in repo once live (autotrader AGENTS.md pattern)

### Definition of done (any task producing numbers or alerts)

1. Acceptance suite green (the checks named in the plan)
2. Fresh-context review passed if diff touches live/model/alert paths
3. No unverified analytical claims — every number traces to a query or assertion
4. Spot-check one result against known reality (manual, reflex-level habit)

---

## Verification kit (copy per project from data-task/templates/)

| File | Gives you |
|---|---|
| `datachecks.py` | grain uniqueness · fan-out tripwire (grain before/after joins) · row-count bounds · nulls · look-ahead (`event_ts > as_of`) · freshness · two-source reconciliation |
| `eval_harness.py` | chronological splits · expanding walk-forward windows · beat-naive-baseline gate (ties lose) · per-slice stability report |
| `side_effects.py` | dedup-keyed emitter (records BEFORE send — crash-safe) · dry-run default · persists across restarts |

Conventions worth keeping:
- Jobs take `--start/--end`; deterministic output per window → idempotent reruns, free backfills, easy replay validation.
- Research results pin the data snapshot (date/hash) they were computed on.
- Scheduled jobs end by running their own acceptance checks; failure must surface somewhere actually looked.

---

## Known gaps / next fixes (in priority order)

1. Post-deploy monitoring: dev-time checks don't catch drift (provider schema change,
   stale partitions). Wire scheduled-job outputs to automated checks + alarms.
2. Blast radius: agent uses live Snowflake creds → switch to READ-ONLY service account
   with spend quota. Writes to prod tables should be explicit steps, never side effects.
3. Template hardening: kit passed synthetic tests only — adopt on ONE real pipeline,
   patch what reality breaks (mixed tz, string timestamps, pandas ≥2.2 quirks).
4. Schema-drift assertion: snapshot `{col: dtype}` per source, compare per run.
5. Habits, not tooling: spot-check against reality; resist adding process until a real
   failure names the missing piece.
