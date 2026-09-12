import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const ENTRY_TYPE = "plan-files-state";
// Widget key owned by upstream npm:@narumitw/pi-plan-mode (see its
// src/presentation.ts): the 3-line "Plan mode: planning" banner. Clearing it is
// display-only and touches neither the plan-mode status entry nor plan state.
export const UPSTREAM_PLANNING_WIDGET_KEY = "plan-mode-plan";
const UPSTREAM = "plan-mode-state";
const COMPLETE = "plan_mode_complete";
const exec = promisify(execFile);
type Queue = <T>(path: string, operation: () => Promise<T>) => Promise<T>;
type Entry = { id: string; parentId?: string | null; type: string; customType?: string; data?: unknown };
type Upstream = { enabled: boolean; latestPlan?: string; latestPlanSource?: string; activeImplementation?: { plan: string }; savedPlan?: { plan: string } };
export type Artifact = { root: string; path: string; plan: string; workflow: string; approved: boolean };
type SavedState = { artifact?: Artifact; failedPlan?: string };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function upstream(branch: Entry[]): Upstream | undefined {
  const value = branch.findLast((e) => e.type === "custom" && e.customType === UPSTREAM)?.data;
  return record(value) && typeof value.enabled === "boolean" ? value as Upstream : undefined;
}

export function savedState(branch: Entry[]): SavedState {
  const value = branch.findLast((e) => e.type === "custom" && e.customType === ENTRY_TYPE)?.data;
  if (!record(value)) return {};
  const a = value.artifact;
  const valid = record(a) && typeof a.root === "string" && isAbsolute(a.root)
    && typeof a.path === "string" && dirname(a.path) === join(a.root, "docs", "plans")
    && basename(a.path).endsWith(".md") && typeof a.plan === "string"
    && typeof a.workflow === "string" && typeof a.approved === "boolean";
  return {
    ...(valid ? { artifact: a as Artifact } : {}),
    ...(typeof value.failedPlan === "string" ? { failedPlan: value.failedPlan } : {}),
  };
}

// The first enabled entry after a disabled entry identifies a workflow, not a revision.
function workflow(branch: Entry[], sessionId: string): string | undefined {
  let first: string | undefined;
  for (const entry of branch) {
    if (entry.type !== "custom" || entry.customType !== UPSTREAM || !record(entry.data)) continue;
    if (entry.data.enabled === false) first = undefined;
    else if (entry.data.enabled === true) first ??= entry.id;
  }
  return first ? `${sessionId}:${first}` : undefined;
}

export function checklist(markdown: string): { subject: string; position: number }[] {
  const tasks: { subject: string; position: number }[] = [];
  let fence: { char: string; length: number } | undefined;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
    } else {
      const task = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\]\s+)(\S.*?)(?:\r)?$/.exec(line);
      if (task) tasks.push({ subject: task[4].trim(), position: offset + task[1].length });
    }
    offset += line.length + 1;
  }
  return tasks;
}

export function withoutChecks(plan: string): string {
  const chars = plan.split("");
  for (const task of checklist(plan)) chars[task.position] = " ";
  return chars.join("").trimEnd();
}

function sameSubjects(left: string, right: string) {
  return JSON.stringify(checklist(left).map((t) => t.subject)) === JSON.stringify(checklist(right).map((t) => t.subject));
}

// Copies existing tick marks from `current` onto a revision whose checklist
// subjects/order are unchanged, so prose-only revisions keep manual progress.
function mergedChecks(plan: string, current: string): string {
  const chars = plan.split("");
  const existing = checklist(current);
  checklist(plan).forEach((task, index) => {
    const source = existing[index];
    if (source && current[source.position] !== " ") chars[task.position] = current[source.position];
  });
  return chars.join("");
}

export async function repositoryRoot(cwd: string): Promise<{ root: string; fallback: boolean }> {
  try {
    const { stdout } = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    return { root: await realpath(stdout.trim()), fallback: false };
  } catch (error) {
    // Only an ordinary non-repository is a cwd fallback; git/config/permission errors must surface.
    if (!record(error) || !String(error.stderr).includes("not a git repository")) throw error;
    return { root: await realpath(cwd), fallback: true };
  }
}

// Reject symlinks altogether in the managed path, including ones pointing inside the repo.
async function safePath(root: string, path: string, createDirectories = false) {
  if (await realpath(root) !== root || dirname(path) !== join(root, "docs", "plans")) throw new Error("Invalid plan file location");
  for (const directory of [join(root, "docs"), join(root, "docs", "plans")]) {
    if (createDirectories) {
      try { await mkdir(directory); } catch (error) { if (!record(error) || error.code !== "EEXIST") throw error; }
    }
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe plan directory: ${directory}`);
  }
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) throw new Error(`Unsafe plan file: ${path}`);
  } catch (error) {
    if (!record(error) || error.code !== "ENOENT") throw error;
  }
}

async function checkedContents(artifact: Artifact): Promise<string> {
  await safePath(artifact.root, artifact.path);
  const file = await open(artifact.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let contents: string;
  try { contents = await file.readFile("utf8"); } finally { await file.close(); }
  if (!sameSubjects(contents, artifact.plan)) throw new Error("Plan checklist was edited; restore its subjects/order before syncing or implementing");
  return contents;
}

function slug(plan: string) {
  const title = /^#{1,6}\s+(.+)$/m.exec(plan)?.[1] ?? "plan";
  return title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "plan";
}

export async function savePlan(root: string, plan: string, key: string, previous: Artifact | undefined, queue: Queue): Promise<Artifact> {
  if (!checklist(plan).length) throw new Error("Completed plans must include nonempty Markdown tasks, e.g. - [ ] Add tests. Resubmit with plan_mode_complete.");
  if (previous?.workflow === key) {
    if (previous.root !== root) throw new Error("Working repository changed during this plan workflow");
    await queue(previous.path, async () => {
      let current: string | undefined;
      try {
        current = await checkedContents(previous);
      } catch (error) {
        // A deleted plan file (or its directory) is recoverable: recreate the
        // same path below instead of failing every future revision.
        if (!record(error) || error.code !== "ENOENT") throw error;
      }
      if (current === undefined) {
        await safePath(previous.root, previous.path, true);
        try {
          await writeFile(previous.path, `${plan}\n`, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW });
        } catch (error) {
          if (record(error) && error.code === "EEXIST") throw new Error(`Plan file reappeared while recreating ${previous.path}; refusing to overwrite it. Restore it or start a new plan.`);
          throw error;
        }
        return;
      }
      const existing = current;
      if (withoutChecks(existing) !== withoutChecks(previous.plan)) throw new Error("Plan file has manual edits; refusing to overwrite them. Restore the saved version before resubmitting.");
      const aligned = sameSubjects(previous.plan, plan);
      if (!aligned && checklist(existing).some((t) => existing[t.position] !== " ")) throw new Error("Revision changes the task checklist while tasks are checked; uncheck the saved plan or keep the original task subjects/order, then resubmit.");
      const contents = `${aligned ? mergedChecks(plan, existing) : plan}\n`;
      if (contents !== existing) await writeFile(previous.path, contents, { flag: constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW });
    });
    return { ...previous, plan, approved: false };
  }
  const stem = `${new Date().toISOString().slice(0, 10)}-${slug(plan)}`;
  for (let suffix = 1; ; suffix++) {
    const path = join(root, "docs", "plans", `${stem}${suffix === 1 ? "" : `-${suffix}`}.md`);
    const created = await queue(path, async () => {
      await safePath(root, path, true);
      try {
        await writeFile(path, `${plan}\n`, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW });
        return true;
      } catch (error) {
        if (record(error) && error.code === "EEXIST") return false;
        throw error;
      }
    });
    if (created) return { root, path, plan, workflow: key, approved: false };
  }
}

const HANDOFF = "Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n";
const TRANSFER = "A previous agent produced the plan below to accomplish the user's task. Implement the plan";
const TRANSFER_END = ". Treat the plan as the source of user intent, re-read files as needed, and carry the work through implementation and verification.\n\n";
export function handoffPlan(text: string): string | undefined {
  for (const prefix of [HANDOFF, `${TRANSFER}${TRANSFER_END}`, `${TRANSFER} in a fresh context${TRANSFER_END}`]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length);
  }
  return undefined;
}

// Parent headers name a session file, not a plan path. Follow only its last written branch.
export async function parentBranch(path: string): Promise<Entry[]> {
  const entries = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line)) as Entry[];
  const byId = new Map(entries.filter((e) => e.type !== "session").map((e) => [e.id, e]));
  const branch: Entry[] = [];
  let entry = entries.findLast((e) => e.type !== "session");
  const seen = new Set<string>();
  while (entry) {
    if (seen.has(entry.id)) throw new Error("Invalid parent session tree");
    seen.add(entry.id);
    branch.unshift(entry);
    entry = entry.parentId ? byId.get(entry.parentId) : undefined;
  }
  return branch;
}

function hidePlanningWidget(ctx: ExtensionContext) {
  // Deferred past the current tick so it lands after upstream's synchronous
  // setWidget publish on the same event; unref'd to never hold shutdown open.
  // Upstream only renders the widget in planning/ready states and clears it
  // itself on shutdown, so an uncleared extra tick is at most a transient flash.
  const timer = setTimeout(() => {
    try { ctx.ui.setWidget(UPSTREAM_PLANNING_WIDGET_KEY, undefined); } catch { /* UI gone; nothing to hide */ }
  }, 0);
  (timer as unknown as { unref?: () => void }).unref?.();
}

export function registerPlanFiles(pi: ExtensionAPI, queue: Queue) {
  // Reservations prevent parallel creates of identical subjects from sharing an ordinal.
  const reservations = new Map<string, Map<string, number>>();
  // Plan paths already checked for a linked todo; one warning per session is enough.
  const warned = new Set<string>();
  // Tool calls that produced a tool_result. Denied or aborted calls never do,
  // so tool_execution_end can release the reservation they leave behind.
  const resolvedCalls = new Set<string>();
  const branch = (ctx: ExtensionContext) => ctx.sessionManager.getBranch();
  const state = (ctx: ExtensionContext) => savedState(branch(ctx));
  const notify = (ctx: ExtensionContext, error: unknown) => ctx.ui.notify(`Plan files: ${error instanceof Error ? error.message : String(error)}`, "error");
  const persist = (value: SavedState) => pi.appendEntry(ENTRY_TYPE, value);
  const reservationKey = (ctx: ExtensionContext, artifact: Artifact) => `${ctx.sessionManager.getSessionId()}:${artifact.path}`;
  const clearReservations = () => { reservations.clear(); resolvedCalls.clear(); };

  // State is read from getBranch on every event, so reload/tree navigation never replays file writes.
  const restore = (_event: unknown, ctx: ExtensionContext) => { clearReservations(); state(ctx); hidePlanningWidget(ctx); };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);

  async function save(plan: string, ctx: ExtensionContext) {
    const before = state(ctx);
    try {
      const key = workflow(branch(ctx), ctx.sessionManager.getSessionId());
      if (!key) return;
      const { root, fallback } = await repositoryRoot(ctx.cwd);
      if (fallback) ctx.ui.notify(`Plan files: outside Git; using ${root}/docs/plans.`, "warning");
      const artifact = await savePlan(root, plan, key, before.artifact, queue);
      persist({ artifact });
      ctx.ui.notify(`Plan saved: ${artifact.path}`, "info");
    } catch (error) {
      persist({ artifact: before.artifact, failedPlan: plan });
      notify(ctx, error);
    }
  }

  pi.on("tool_call", (event, ctx) => {
    const input = event.input as Record<string, unknown>;
    const active = upstream(branch(ctx))?.enabled;
    if (active && event.toolName === COMPLETE && (typeof input.plan !== "string" || !checklist(input.plan).length)) {
      return { block: true, reason: "Include a nonempty Markdown task checklist outside code fences (e.g. - [ ] Add tests), then resubmit the complete plan with plan_mode_complete." };
    }
    if (event.toolName !== "todo") return;
    if (active) return { block: true, reason: "Do not use live todos in Plan mode. Include proposed Markdown checkboxes in the completed plan; live tasks start only after implementation approval." };
    const saved = state(ctx);
    const artifact = saved.artifact;
    if (!artifact?.approved || saved.failedPlan) return;
    if (input.action === "clear") {
      return { block: true, reason: "Clearing all todos would orphan linked plan tasks and leave their checkboxes stale. Operate on specific task ids instead." };
    }
    if (input.action !== "create") return;
    const tasks = checklist(artifact.plan);
    const key = reservationKey(ctx, artifact);
    const reserved = reservations.get(key) ?? new Map<string, number>();
    reservations.set(key, reserved);
    const occupied = new Set(reserved.values());
    const snapshot = branch(ctx).findLast((e) => e.type === "message" && e.message.role === "toolResult" && e.message.toolName === "todo" && !e.message.isError);
    const details = snapshot?.type === "message" && snapshot.message.role === "toolResult" ? snapshot.message.details : undefined;
    if (record(details) && Array.isArray(details.tasks)) {
      for (const task of details.tasks) {
        // Deleted tasks are terminal; their ordinal must be reusable by a replacement.
        if (record(task) && task.status !== "deleted" && record(task.metadata) && task.metadata.piPlanFile === relative(artifact.root, artifact.path)
          && Number.isInteger(task.metadata.piPlanTask) && tasks[Number(task.metadata.piPlanTask) - 1]?.subject === task.subject) occupied.add(Number(task.metadata.piPlanTask));
      }
    }
    const metadata = record(input.metadata) ? input.metadata : {};
    const requested = metadata.piPlanTask;
    const index = Number.isInteger(requested) && tasks[Number(requested) - 1]?.subject === input.subject
      ? Number(requested)
      : tasks.findIndex((t, i) => t.subject === input.subject && !occupied.has(i + 1)) + 1;
    if ((!index || occupied.has(index)) && tasks.some((t) => t.subject === input.subject)) {
      return { block: true, reason: "This plan task already has a linked or pending todo create. List todos and reuse/update the matching piPlanFile + piPlanTask instead of creating a duplicate." };
    }
    if (!index) return;
    input.metadata = { ...metadata, piPlanFile: relative(artifact.root, artifact.path), piPlanTask: index };
    reserved.set(event.toolCallId, index);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === COMPLETE) {
      const details = event.details;
      const current = upstream(branch(ctx));
      if (!event.isError && record(details) && details.version === 1 && details.source === COMPLETE
        && typeof details.plan === "string" && current?.enabled && current.latestPlan === details.plan) await save(details.plan, ctx);
      return;
    }
    if (event.toolName !== "todo") return;
    resolvedCalls.add(event.toolCallId);
    const saved = state(ctx);
    const artifact = saved.artifact;
    if (!artifact?.approved || saved.failedPlan || upstream(branch(ctx))?.enabled) return;
    const key = reservationKey(ctx, artifact);
    const details = event.details;
    if (event.isError || !record(details) || details.error) {
      reservations.get(key)?.delete(event.toolCallId);
      return;
    }
    // Never sync the full snapshot: sibling results can carry stale statuses for other tasks.
    const id = event.input.action === "create" ? Number(details.nextId) - 1
      : ["update", "delete"].includes(String(event.input.action)) ? event.input.id : undefined;
    const task = Array.isArray(details.tasks) ? details.tasks.find((t) => record(t) && t.id === id) : undefined;
    if (!record(task) || !record(task.metadata) || task.metadata.piPlanFile !== relative(artifact.root, artifact.path)) return;
    const index = task.metadata.piPlanTask;
    if (!Number.isInteger(index) || checklist(artifact.plan)[Number(index) - 1]?.subject !== task.subject) return;
    if (!["completed", "pending", "in_progress", "deleted"].includes(String(task.status))) return;
    try {
      await queue(artifact.path, async () => {
        const contents = await checkedContents(artifact);
        const position = checklist(contents)[Number(index) - 1].position;
        const next = contents.slice(0, position) + (task.status === "completed" ? "x" : " ") + contents.slice(position + 1);
        if (next !== contents) await writeFile(artifact.path, next, { flag: constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW });
      });
    } catch (error) { notify(ctx, error); }
  });

  // Reservations only bridge the gap between a todo tool_call and its result.
  // A denied/aborted call emits tool_execution_end but never tool_result.
  pi.on("tool_execution_end", (event) => {
    if (resolvedCalls.has(event.toolCallId)) return;
    for (const reserved of reservations.values()) reserved.delete(event.toolCallId);
  });
  // toolResults are persisted before turn_end; drop remaining reservations so a
  // deleted or retried task can reuse its ordinal in later turns. The same
  // boundary reports an approved plan whose linked tasks were never created,
  // because nothing else would signal that its checkboxes cannot sync.
  pi.on("turn_end", (event, ctx) => {
    clearReservations();
    const artifact = state(ctx).artifact;
    if (!artifact?.approved || state(ctx).failedPlan || upstream(branch(ctx))?.enabled) return;
    if (!Array.isArray(event.toolResults) || !event.toolResults.length) return;
    const planFile = relative(artifact.root, artifact.path);
    if (warned.has(planFile)) return;
    warned.add(planFile);
    const linked = branch(ctx).some((entry) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "todo" && !entry.message.isError
      && record(entry.message.details) && Array.isArray(entry.message.details.tasks)
      && entry.message.details.tasks.some((task) => record(task) && task.status !== "deleted" && record(task.metadata) && task.metadata.piPlanFile === planFile));
    if (!linked) ctx.ui.notify(`Plan files: no todo is linked to ${planFile} yet, so its checkboxes will not sync. Ask the agent to create the plan tasks with the todo tool.`, "warning");
  });

  // Global extensions load before npm packages: upstream accepts legacy plans at
  // agent_end, then shows its ready menu at agent_settled, after this handler.
  // Every upstream widget publish is synchronous, so a deferred clear runs after
  // it on the same tick regardless of extension order.
  pi.on("agent_settled", async (_event, ctx) => {
    const current = upstream(branch(ctx));
    if (current?.enabled && current.latestPlanSource === "legacy_proposed_plan" && current.latestPlan
      && (state(ctx).artifact?.plan !== current.latestPlan || state(ctx).failedPlan
        || state(ctx).artifact?.workflow !== workflow(branch(ctx), ctx.sessionManager.getSessionId()))) await save(current.latestPlan, ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (event.source !== "extension") return;
    const transferred = handoffPlan(event.text);
    if (transferred === undefined && event.text !== "Implement the plan.") return;
    try {
      const currentBranch = branch(ctx);
      const current = upstream(currentBranch);
      if (current?.enabled) throw new Error("Implementation handoff blocked while Plan mode is enabled");
      let saved = state(ctx);
      if (!saved.artifact && transferred !== undefined) {
        const parent = ctx.sessionManager.getHeader()?.parentSession;
        if (parent) saved = savedState(await parentBranch(parent));
      }
      const artifact = saved.artifact;
      const previousPlanState = upstream(currentBranch.slice(0, currentBranch.findLastIndex((e) => e.type === "custom" && e.customType === UPSTREAM)));
      const approvedPlan = transferred ?? current?.activeImplementation?.plan ?? previousPlanState?.latestPlan;
      if (!artifact || saved.failedPlan || approvedPlan !== artifact.plan
        || (current?.activeImplementation && current.activeImplementation.plan !== artifact.plan)) {
        throw new Error("Implementation blocked: no matching successfully saved plan. Resume planning and resubmit with plan_mode_complete.");
      }
      const { root } = await repositoryRoot(ctx.cwd);
      if (root !== artifact.root) throw new Error("Implementation repository does not match the saved plan");
      await queue(artifact.path, async () => {
        const contents = await checkedContents(artifact);
        if (withoutChecks(contents) !== withoutChecks(artifact.plan)) throw new Error("Saved plan has manual edits; implementation blocked until reconciled");
      });
      persist({ artifact: { ...artifact, approved: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(ctx, new Error(`${message} Nothing was implemented and the prompt was not delivered to the model; resume the planning session and choose implementation again (linked tasks are preserved there).`));
      return { action: "handled" };
    }
  });

  // Upstream publishes the banner synchronously on this event (before the
  // companion in load order); the deferred clear lands after it on the tick.
  pi.on("agent_end", (_event, ctx) => { hidePlanningWidget(ctx); });

  pi.on("before_agent_start", (_event, ctx) => {
    hidePlanningWidget(ctx);
    let content: string;
    if (upstream(branch(ctx))?.enabled) {
      content = "Plan-files contract: do not create or update live todos during Plan mode. Finish with plan_mode_complete containing a nonempty Markdown task checklist (- [ ] Subject), outside code fences. Use short, exact task subjects. The companion saves this plan before review; only implementation approval activates live tasks.";
    } else {
      const saved = state(ctx);
      const artifact = saved.artifact;
      if (!artifact?.approved || saved.failedPlan) return;
      content = `Implementation has been approved for ${artifact.path}. FIRST use the existing todo tool to list tasks (includeDeleted:true), reuse tasks linked by the metadata below, and create only missing checklist tasks before implementing. Never clear/delete unrelated todos. Preserve exact subjects and ordinals, even when subjects repeat. Create uses pending; update already-finished tasks to completed after verifying them. Keep linked tasks in_progress/completed as work proceeds. The todo tool forbids completed->pending/in_progress and never revives deleted tasks, so to resume one, delete the linked task, wait for its result, then create a replacement in a separate tool batch with the same exact subject and piPlanTask metadata; the companion re-links the same ordinal. Never call todo clear during implementation. Their Markdown boxes sync automatically. Do not rewrite the plan file yourself.\n\n${JSON.stringify(checklist(artifact.plan).map((t, i) => ({ subject: t.subject, metadata: { piPlanFile: relative(artifact.root, artifact.path), piPlanTask: i + 1 } })), null, 2)}`;
    }
    return { message: { customType: "plan-files-guidance", content, display: false } };
  });
}
