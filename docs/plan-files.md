# Plan files and live tasks

Installed package: `npm:@narumitw/pi-plan-mode@0.58.0` (pinned because the companion uses its completion/state and handoff formats).
Companion: `home/extensions/plan-files/`, deployed by `./rebuild.sh --sync-only`.

## Workflow

1. Use `/plan <request>` to explore and clarify without editing project code.
2. Complete the plan with a Markdown task checklist (`- [ ] Exact task subject`). The companion requires a checklist and saves the full plan **before the implementation review menu**.
3. Files live at `<git-root>/docs/plans/YYYY-MM-DD-short-title.md`. Revisions retain their path; new workflows/sessions use numeric collision suffixes rather than overwriting another plan. Outside Git, the current directory is used with a warning.
4. Choose implementation here or in a fresh session. The companion instructs the implementation agent to list existing todos and create missing linked tasks **before implementation**. Creation uses the existing `todo` tool, not direct mutation of its internal store. No live tasks are created while planning.
5. Successful linked todo updates automatically check/uncheck the matching Markdown box. Unrelated todos are untouched. The todo tool makes `completed` one-way and `deleted` terminal, so to resume finished or deleted work, delete the linked task and create a replacement with the same exact subject (the companion re-links the same ordinal). `todo clear` is blocked while an approved linked implementation is active so unrelated todos and boxes are preserved. Use `/todos` to inspect the live task list.

Task metadata uses `piPlanFile` (repository-relative path) and `piPlanTask` (one-based checklist ordinal). Matching todo creates receive this metadata automatically; duplicate subjects retain distinct ordinals. Keep task subjects and ordering stable during implementation. Matching is exact — a rephrased subject is not linked, so it never silently updates a box.

## Safety and recovery

- Failed saves and manually edited plans block the automatic implementation handoff rather than silently implementing an unsaved version. Reconcile the file, then resubmit the completed plan.
- A revision whose original plan file (or its `docs/plans` directory) was deleted recreates the same path with exclusive creation; if a file reappears during the race, the revision is refused instead of overwriting it. `failedPlan` clears only after a successful write.
- Prose-only revisions keep manual tick marks when the checklist subjects/order are unchanged. A revision that changes the checklist while tasks are checked is refused with a reconciliation message rather than dropping checked progress.
- Checklist synchronization preserves prose edits but refuses changed checklist subjects/order. Symlinked plan directories/files and hardlinked files are rejected.
- Reload and session-tree navigation restore branch-owned state without rewriting files. Fresh implementation recovers the matching artifact from its parent session.
- Save/revision uses explicit file writes; these are the deliberate exception to read-only planning. Declining implementation does not delete the saved file.
- If a handoff is rejected, the companion blocks it, keeps the saved plan unapproved, and tells you to resume the source planning session. Upstream may still report that a fresh implementation session started: that success notice is not proof the kickoff reached the model, because returning `handled` makes the upstream `sendUserMessage` resolve. Only implement after the companion has approved the handoff.
- Live todo creation is agent-driven, not an atomic bulk operation. The companion supplies instructions, metadata injection, and duplicate-link protection, but it cannot force the model to create the linked tasks. Treat agent-driven creation as best-effort and use `/todos` to confirm before work starts.

## Divergences from Codex plan mode

The contract text and the handoff flow are ported from Codex CLI's plan mode (`codex-rs/collaboration-mode-templates/templates/plan.md`, `handlers/plan.rs`, `plan_implementation.rs`), including the `<proposed_plan>` parser and the fresh-session prompt. These differences are deliberate:

| Codex CLI | Here | Why |
| --- | --- | --- |
| The plan is prose inside a `<proposed_plan>` block that the runtime strips and streams | `plan_mode_complete` tool call | A tool result is a gate the companion can verify before approving implementation; the `<proposed_plan>` parser remains as a legacy fallback for models that ignore the tool |
| No plan persistence: the plan lives only in the thread ([openai/codex#19125](https://github.com/openai/codex/issues/19125)) | Saved to `<git-root>/docs/plans/*.md` before the review menu | Durability, plus a stable path for the checkbox link |
| Read-only is prompt-enforced; only the checklist tool is hard-rejected, and violations are reported ([openai/codex#32594](https://github.com/openai/codex/issues/32594)) | Runtime tool allowlist plus a shell inspector with per-command argument validators | Same intent, enforced rather than requested |
| `request_user_input` is registered per mode, so tool schemas change on a mode switch | Schemas stay stable; only the runtime policy changes | Keeps the prompt cache intact across transitions |
| Checklist state is in-memory (`update_plan` / `EventMsg::PlanUpdate`); nothing maps to Markdown | Linked `todo` tasks tick the Markdown checkboxes in the saved plan | Progress has to outlive the session |
| 2–3 mutually exclusive question options | 1–3 questions with 2–4 options | Pi's `ask_user_question` schema, which appends its own free-text row |

Not adopted from Codex: the medium reasoning preset for plan mode (`thinkingLevel` stays `inherit`), and step-size discipline for the checklist tool, which `@juicesharp/rpiv-todo` already ships as prompt guidelines.

## Validation

```sh
node --test home/extensions/plan-files/plan-files.test.mjs
```

The tests cover save-before-review event ordering, repository-root resolution, revision/collision behavior, failed saves, symlink protection, explicit approval, fresh/reloaded sessions, task errors/reopening, duplicate subjects, parallel checkbox updates, reservation release on denial/abort and at turn boundaries, blocked `todo clear`, missing-file recovery, manual-tick preservation, and handoff recovery. Reopening tests drive the reducer actually shipped by `@juicesharp/rpiv-todo` (skipped only if that package is absent). Recheck upstream contracts before changing the pinned package version.
