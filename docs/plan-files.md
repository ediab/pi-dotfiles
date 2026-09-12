# Plan files and live tasks

Installed package: `npm:@narumitw/pi-plan-mode@0.58.0` (pinned because the companion uses its completion/state and handoff formats).
Companion: `home/extensions/plan-files/`, deployed by `./rebuild.sh --sync-only`.

## Workflow

1. Use `/plan <request>` to explore and clarify without editing project code.
2. Complete the plan with a Markdown task checklist (`- [ ] Exact task subject`). The companion requires a checklist and saves the full plan **before the implementation review menu**.
3. Files live at `<git-root>/docs/plans/YYYY-MM-DD-short-title.md`. Revisions retain their path; new workflows/sessions use numeric collision suffixes rather than overwriting another plan. Outside Git, the current directory is used with a warning.
4. Choose implementation here or in a fresh session. The companion instructs the implementation agent to list existing todos and create missing linked tasks **before implementation**. Creation uses the existing `todo` tool, not direct mutation of its internal store. No live tasks are created while planning.
5. Successful linked todo updates automatically check/uncheck the matching Markdown box. Unrelated todos are untouched. Deleted tasks remain unchecked. Use `/todos` to inspect the live task list.

Task metadata uses `piPlanFile` (repository-relative path) and `piPlanTask` (one-based checklist ordinal). Matching todo creates receive this metadata automatically; duplicate subjects retain distinct ordinals. Keep task subjects and ordering stable during implementation.

## Safety and recovery

- Failed saves and manually edited plans block the automatic implementation handoff rather than silently implementing an unsaved version. Reconcile the file, then resubmit the completed plan.
- Checklist synchronization preserves prose edits but refuses changed checklist subjects/order. Symlinked plan directories/files and hardlinked files are rejected.
- Reload and session-tree navigation restore branch-owned state without rewriting files. Fresh implementation recovers the matching artifact from its parent session.
- Save/revision uses explicit file writes; these are the deliberate exception to read-only planning. Declining implementation does not delete the saved file.
- If an upstream fresh-session kickoff fails and puts its prompt in the editor, manually submitting that prompt is not recognized as automatic approval. Resume the source planning session and select implementation again to retain task linking.
- Live todo creation is agent-driven, not an atomic bulk operation. The companion supplies instructions and duplicate-link protection; it does not execute another extension's tool directly.

## Validation

```sh
node --test home/extensions/plan-files/plan-files.test.mjs
```

The tests cover save-before-review event ordering, repository-root resolution, revision/collision behavior, failed saves, symlink protection, explicit approval, fresh/reloaded sessions, task errors/reopening, duplicate subjects, and parallel checkbox updates. Recheck upstream contracts before changing the pinned package version.
