import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const ENTRY_TYPE = "plan-files-state";
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
      const current = await checkedContents(previous);
      if (withoutChecks(current) !== withoutChecks(previous.plan)) throw new Error("Plan file has manual edits; refusing to overwrite them. Restore the saved version before resubmitting.");
      if (previous.plan !== plan) await writeFile(previous.path, `${plan}\n`, { flag: constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW });
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

export function registerPlanFiles(pi: ExtensionAPI, queue: Queue) {
  // Reservations prevent parallel creates of identical subjects from sharing an ordinal.
  const reservations = new Map<string, Map<string, number>>();
  const branch = (ctx: ExtensionContext) => ctx.sessionManager.getBranch();
  const state = (ctx: ExtensionContext) => savedState(branch(ctx));
  const notify = (ctx: ExtensionContext, error: unknown) => ctx.ui.notify(`Plan files: ${error instanceof Error ? error.message : String(error)}`, "error");
  const persist = (value: SavedState) => pi.appendEntry(ENTRY_TYPE, value);
  const reservationKey = (ctx: ExtensionContext, artifact: Artifact) => `${ctx.sessionManager.getSessionId()}:${artifact.path}`;

  // State is read from getBranch on every event, so reload/tree navigation never replays file writes.
  const restore = (_event: unknown, ctx: ExtensionContext) => { reservations.clear(); state(ctx); };
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
    if (!artifact?.approved || saved.failedPlan || input.action !== "create") return;
    const tasks = checklist(artifact.plan);
    const key = reservationKey(ctx, artifact);
    const reserved = reservations.get(key) ?? new Map<string, number>();
    reservations.set(key, reserved);
    const occupied = new Set(reserved.values());
    const snapshot = branch(ctx).findLast((e) => e.type === "message" && e.message.role === "toolResult" && e.message.toolName === "todo" && !e.message.isError);
    const details = snapshot?.type === "message" && snapshot.message.role === "toolResult" ? snapshot.message.details : undefined;
    if (record(details) && Array.isArray(details.tasks)) {
      for (const task of details.tasks) {
        if (record(task) && record(task.metadata) && task.metadata.piPlanFile === relative(artifact.root, artifact.path)
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

  // Global extensions load before npm packages: upstream accepts legacy plans at
  // agent_end, then shows its ready menu at agent_settled, after this handler.
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
      notify(ctx, error);
      return { action: "handled" };
    }
  });

  pi.on("before_agent_start", (_event, ctx) => {
    let content: string;
    if (upstream(branch(ctx))?.enabled) {
      content = "Plan-files contract: do not create or update live todos during Plan mode. Finish with plan_mode_complete containing a nonempty Markdown task checklist (- [ ] Subject), outside code fences. Use short, exact task subjects. The companion saves this plan before review; only implementation approval activates live tasks.";
    } else {
      const saved = state(ctx);
      const artifact = saved.artifact;
      if (!artifact?.approved || saved.failedPlan) return;
      content = `Implementation has been approved for ${artifact.path}. FIRST use the existing todo tool to list tasks (includeDeleted:true), reuse tasks linked by the metadata below, and create only missing checklist tasks before implementing. Never clear/delete unrelated todos. Preserve exact subjects and ordinals, even when subjects repeat. Create uses pending; update already-finished tasks to completed after verifying them. Keep linked tasks in_progress/completed as work proceeds, and reopen them when work remains; their Markdown boxes sync automatically. Do not rewrite the plan file yourself.\n\n${JSON.stringify(checklist(artifact.plan).map((t, i) => ({ subject: t.subject, metadata: { piPlanFile: relative(artifact.root, artifact.path), piPlanTask: i + 1 } })), null, 2)}`;
    }
    return { message: { customType: "plan-files-guidance", content, display: false } };
  });
}
