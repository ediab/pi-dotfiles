---
title: Workflow Doc-Save Consistency
type: fix
date: 2026-08-02
topic: workflow-docs-consistency
artifact_contract: implementation-spec/v1
artifact_readiness: implementation-ready
execution: code
---

## Goal Capsule

- **Objective:** Close the four doc-save consistency gaps found in the 2026-08-02 audit of the curated pipeline (brainstorming → to-spec → to-tickets → handoff → execute-tickets): no tracker configuration for pi-elias itself, `bootstrap.sh` not shipping `MATT_SUPER.md`, stale "spec" wording in the brainstorming checklist/diagram, and an ambiguous `visual-companion.md` path reference.
- **Product authority:** Elias, owner of the `pi-elias` harness configuration.
- **Source of truth:** `~/dev/pi-elias`; deploy skills to `~/.pi/agent` with `rebuild.sh --sync-only`.
- **Related work:** `docs/plans/2026-08-02-002-feat-ticket-execution-workflow.md` (the ticket execution workflow whose audit produced these findings).
- **Open blockers:** None.

## Problem Frame

The audit of the doc-save surface across the curated pipeline found four gaps:

1. **pi-elias has no tracker configuration.** `docs/agents/issue-tracker.md` does not exist, `.scratch/` is unused, and the repo's de-facto convention (specs/plans as frontmatter-marked files under `docs/plans/`) is recorded nowhere. Every skill in the pipeline — `to-spec`, `to-tickets`, `code-review`, `execute-tickets` — resolves its tracker behavior through `docs/agents/issue-tracker.md` (via `/setup-matt-pocock-skills`), so the pipeline cannot run in this repo until the convention is recorded.
2. **`bootstrap.sh` does not deploy `MATT_SUPER.md`.** `rebuild.sh` (both modes) and `deploy-vps.sh` ship the memo; a fresh `bootstrap.sh` machine gets the skills but not the memo. Nothing reads the memo at runtime (it is a decision record), so this is drift, not breakage — but the three deploy paths should agree.
3. **Stale "spec" wording in `brainstorming`.** The 2026-08-02 rename moved the design record to `docs/brainstorming/YYYY-MM-DD-<topic>-brainstorming.md` and rewrote the prose, but the checklist item 7 label and the process-flow diagram still say "Spec self-review" / "User reviews spec?".
4. **Ambiguous `visual-companion.md` reference.** `brainstorming/SKILL.md` line 145 reads `skills/brainstorming/visual-companion.md`; that path resolves only when the current directory is `~/.pi/agent` (live) and does not exist at all in the repo (which uses `home/skills/…`).

## Current State

- `docs/agents/` — does not exist; no tracker guidance file.
- `bootstrap.sh` — deploys skills, extensions, settings, AGENTS.md seed; no memo step.
- `home/skills/brainstorming/SKILL.md` — prose renamed to design doc; checklist item 7 and diagram still "spec"-labeled; line 145 references `skills/brainstorming/visual-companion.md`.
- `rebuild.sh` (both modes) and `deploy-vps.sh` — already copy `MATT_SUPER.md` (proven pattern to reuse).

## Product Decisions

1. **Record the tracker convention by hand.** Write `docs/agents/issue-tracker.md` directly, capturing what this repo actually does; do not run `/setup-matt-pocock-skills` interactively (it would interview for a convention that already exists in practice).
2. **Specs keep the `docs/plans/` convention; tickets use the standard local-markdown shape.** The spec/plan location and triage marker (`artifact_readiness`) are this repo's established convention; ticket publication follows `issue-tracker-local.md`'s shape (`.scratch/<topic>/issues/NN-<slug>.md`, `Status:` lines, `Blocked by:`), which the handoff and `execute-tickets` already target. Do not gitignore `.scratch/` — the handoff's W5 transfer requires uncommitted planning artifacts to be visible.
3. **`bootstrap.sh` gains the same memo copy `rebuild.sh` uses.** Same `cp` + FAILED-fallback pattern, placed after the AGENTS.md seed block.
4. **The brainstorming artifact vocabulary is fully aligned.** Checklist, diagram, and prose all say "design doc"; the visual-companion reference resolves from any working directory.

## Functional Requirements

### F1 — Tracker convention for pi-elias

- **F1.1.** Create `docs/agents/issue-tracker.md` recording:
  - Spec/plan location: `docs/plans/YYYY-MM-DD-NNN-<type>-<topic>.md`, frontmatter with `title`, `type`, `date`, `topic`, `artifact_contract`, `artifact_readiness`, `execution`.
  - Triage marker: `artifact_readiness: implementation-ready` is the agent-grabbable state (this repo's `ready-for-agent` equivalent); `draft` is not.
  - Ticket location: `.scratch/<topic>/issues/NN-<slug>.md`, numbered from `01` in dependency order; `Blocked by:` lines; `Status:` values `ready-for-agent` → `claimed` → `resolved` (matching `to-tickets` and `execute-tickets`).
  - Note that `.scratch/` is intentionally not gitignored: uncommitted planning artifacts must be visible for the handoff's W5 transfer.
- **F1.2.** The recorded conventions must match what the skills read: spec location and triage vocabulary (for `to-spec`/`code-review`), ticket shape and status lifecycle (for `to-tickets`/`execute-tickets`/`wayfinder`).
- **F1.3.** Update `README.md`'s repo tour to list `docs/agents/issue-tracker.md`.

### F2 — bootstrap.sh ships the memo

- **F2.1.** Add after the AGENTS.md seed block: `cp "$SCRIPT_DIR/MATT_SUPER.md" "$HOME/.pi/agent/MATT_SUPER.md"` with the same success/FAILED echo pattern as `rebuild.sh`.
- **F2.2.** Update the step 3 echo to mention the memo.

### F3 — brainstorming vocabulary aligned

- **F3.1.** Checklist item 7: "**Spec self-review**" → "**Design self-review**".
- **F3.2.** Process-flow diagram: node "Spec self-review\n(fix inline)" → "Design self-review\n(fix inline)"; node and edges "User reviews spec?" → "User reviews design doc?".
- **F3.3.** No other "spec"-meaning-the-design-record wording remains in the checklist, prose, or diagram.

### F4 — visual-companion reference

- **F4.1.** Replace `skills/brainstorming/visual-companion.md` with a self-resolving reference: `visual-companion.md` in this skill's directory (next to `SKILL.md`), which exists identically in the repo (`home/skills/brainstorming/`) and live (`~/.pi/agent/skills/brainstorming/`).

## Acceptance Examples

### AE1 — tracker guidance resolves

- **Given:** the fixes are deployed.
- **Then:** `docs/agents/issue-tracker.md` exists; `code-review`'s "run `/setup-matt-pocock-skills` if `docs/agents/issue-tracker.md` is missing" precondition resolves; a fresh `to-spec` invocation in this repo would publish to `docs/plans/` per the recorded convention (real run deferred, see Out of Scope).

### AE2 — fresh bootstrap ships the memo

- **Given:** the fixes are deployed.
- **Then:** `bootstrap.sh` passes `bash -n`, contains the memo `cp` step, and the sandbox reproduction of that step places a byte-identical `MATT_SUPER.md` under a temp `HOME/.pi/agent/`.

### AE3 — brainstorming says design doc

- **Given:** the fixes are deployed.
- **Then:** grep for `User reviews spec|Spec self-review` matches nothing in the repo or live copy of `brainstorming/SKILL.md`.

### AE4 — visual-companion resolves anywhere

- **Given:** the fixes are deployed.
- **Then:** no `skills/brainstorming/visual-companion.md` literal remains, and `visual-companion.md` exists next to `SKILL.md` in both repo and live copies.

## Out of Scope

- Running `/setup-matt-pocock-skills` interactively in this repo.
- A full `bootstrap.sh` run against a temp HOME (network-heavy package installs); the memo step is verified statically and by sandbox reproduction, and the full run is deferred to the next fresh machine/VPS.
- Exercising the real to-spec → to-tickets → execute-tickets pipeline in pi-elias (the residual AE exercise of the 002 spec).
- Gitignoring `.scratch/` (would break the handoff's W5 transfer) or migrating existing `docs/plans/` files.
- Renaming the deployed `to-spec` or `to-tickets` artifacts.

## Implementation Map

1. Write `docs/agents/issue-tracker.md` per F1.1/F1.2.
2. Add the memo step to `bootstrap.sh` per F2.
3. Fix `home/skills/brainstorming/SKILL.md` checklist and diagram labels per F3.
4. Fix the `visual-companion.md` reference per F4.
5. Update `README.md` repo tour (F1.3).
6. Deploy with `rebuild.sh --sync-only`.
7. Run the Verification Contract.

## Verification Contract

Fresh evidence for:

```bash
bash -n bootstrap.sh
grep -n "MATT_SUPER.md" bootstrap.sh                        # memo step present
grep -rn "User reviews spec\|Spec self-review" home/skills/brainstorming ~/.pi/agent/skills/brainstorming || true   # no matches
grep -rn "skills/brainstorming/visual-companion.md" . --include="*.md" | grep -v node_modules || true               # no matches
ls docs/agents/issue-tracker.md
diff -u home/skills/brainstorming/SKILL.md ~/.pi/agent/skills/brainstorming/SKILL.md
diff -u home/skills/brainstorming/visual-companion.md ~/.pi/agent/skills/brainstorming/visual-companion.md
git -C ~/dev/pi-elias diff --check
git -C ~/dev/pi-elias status --short
```

Also confirm:

- the memo `cp` step is byte-identical in pattern to `rebuild.sh`'s (same source, same destination, same FAILED fallback);
- a sandbox run of the copy step with `HOME` pointed at a temp dir places a `cmp`-identical `MATT_SUPER.md`;
- the recorded tracker convention matches `issue-tracker-local.md`'s ticket shape and `to-tickets`' status vocabulary;
- `home/settings.json`, `home/skills/to-tickets/SKILL.md`, and `home/skills/execute-tickets/SKILL.md` are unchanged;
- the final diff contains only files required by this spec.

## Sources

- 2026-08-02 audit findings (this conversation).
- `home/skills/setup-matt-pocock-skills/issue-tracker-local.md` — local tracker conventions.
- `docs/plans/2026-08-02-002-feat-ticket-execution-workflow.md` — the workflow whose surface was audited.
