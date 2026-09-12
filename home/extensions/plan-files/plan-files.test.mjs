import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat, symlink, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { ENTRY_TYPE, UPSTREAM_PLANNING_WIDGET_KEY, checklist, handoffPlan, parentBranch, registerPlanFiles, savedState, withoutChecks } from "./plan-files.ts";

const PLAN = "# Ship feature\n\nImplement carefully.\n\n- [ ] Add feature\n- [ ] Add tests";
const handoff = (plan = PLAN) => `Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n${plan}`;
const transfer = (plan = PLAN, fresh = true) => `A previous agent produced the plan below to accomplish the user's task. Implement the plan${fresh ? " in a fresh context" : ""}. Treat the plan as the source of user intent, re-read files as needed, and carry the work through implementation and verification.\n\n${plan}`;

async function directory(t, git = true) {
  const path = await realpath(await mkdtemp(join(tmpdir(), "pi-plan-files-test-")));
  t.after(() => rm(path, { recursive: true, force: true }));
  if (git) execFileSync("git", ["init", "-q", path]);
  return path;
}

function harness(cwd, { entries = [], sessionId = "session-one", parentSession } = {}) {
  let counter = entries.length;
  let handlers = new Map();
  const notifications = [];
  const queued = [];
  const queues = new Map();
  const append = (entry) => {
    const next = structuredClone({ ...entry, id: `entry-${++counter}`, parentId: entries.at(-1)?.id ?? null });
    entries.push(next);
    return next.id;
  };
  const pi = {
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    appendEntry(customType, data) { append({ type: "custom", customType, data }); },
  };
  const widgets = [];
  const ctx = {
    cwd,
    ui: {
      notify(message, level) { notifications.push({ message, level }); },
      setWidget(key, content) { widgets.push({ key, content }); },
    },
    sessionManager: {
      getBranch: () => entries,
      getSessionId: () => sessionId,
      getHeader: () => ({ type: "session", id: sessionId, parentSession }),
    },
  };
  const queue = async (path, fn) => {
    assert.ok(isAbsolute(path));
    queued.push(path);
    const result = (queues.get(path) ?? Promise.resolve()).then(fn);
    queues.set(path, result.catch(() => {}));
    return result;
  };
  const load = () => { handlers = new Map(); registerPlanFiles(pi, queue); };
  load();
  const emit = async (name, event = {}) => {
    let result;
    for (const handler of handlers.get(name) ?? []) result = await handler(event, ctx) ?? result;
    return result;
  };
  const upstream = (data) => pi.appendEntry("plan-mode-state", data);
  const start = () => upstream({ enabled: true, awaitingAction: false });
  const complete = async (plan = PLAN) => {
    const input = { plan };
    const blocked = await emit("tool_call", { toolName: "plan_mode_complete", toolCallId: "complete", input });
    if (blocked?.block) return blocked;
    upstream({ enabled: true, awaitingAction: true, latestPlan: plan, latestPlanSource: "plan_mode_complete" });
    await emit("tool_result", { toolName: "plan_mode_complete", input, details: { version: 1, source: "plan_mode_complete", plan }, isError: false });
  };
  const artifact = () => savedState(entries).artifact;
  const approve = async (text = handoff(artifact()?.plan)) => {
    upstream({ enabled: false, awaitingAction: false, activeImplementation: { plan: artifact()?.plan } });
    return emit("input", { text, source: "extension" });
  };
  const todoResult = async (input, tasks, options = {}) => {
    const event = { toolName: "todo", toolCallId: "todo", input, details: { tasks, nextId: Math.max(0, ...tasks.map((t) => t.id)) + 1, ...options.details }, isError: false, ...options };
    await emit("tool_result", event);
    append({ type: "message", message: { role: "toolResult", toolName: "todo", details: event.details, isError: event.isError } });
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { pi, ctx, entries, append, emit, load, start, complete, artifact, upstream, approve, todoResult, notifications, queued, widgets, flush };
}

function linked(artifact, id, ordinal, status = "pending") {
  return { id, subject: checklist(artifact.plan)[ordinal - 1].subject, status, metadata: { piPlanFile: relative(artifact.root, artifact.path), piPlanTask: ordinal } };
}

// Loads the reducer actually shipped by the installed @juicesharp/rpiv-todo.
// Node refuses to strip types under node_modules, so copy the four runtime
// modules to a temp tree and rewrite their .js specifiers to .ts.
async function installedReducer(t) {
  const base = join(homedir(), ".pi", "agent", "npm", "node_modules", "@juicesharp", "rpiv-todo", "state");
  try {
    await stat(join(base, "state-reducer.ts"));
  } catch {
    t.skip("installed @juicesharp/rpiv-todo is not available");
    return undefined;
  }
  const dir = await realpath(await mkdtemp(join(tmpdir(), "pi-rpiv-reducer-")));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "state"));
  for (const name of ["state-reducer", "invariants", "task-graph", "state"]) {
    const source = await readFile(join(base, `${name}.ts`), "utf8");
    await writeFile(join(dir, "state", `${name}.ts`), source.replace(/from "(\.\/[\w-]+)\.js"/g, 'from "$1.ts"'));
  }
  const module = await import(pathToFileURL(join(dir, "state", "state-reducer.ts")).href);
  return module.applyTaskMutation;
}

async function approved(t, plan = PLAN) {
  const root = await directory(t);
  const h = harness(root);
  h.start();
  await h.complete(plan);
  await h.approve();
  return h;
}

test("checklist ignores fenced examples and preserves duplicate ordinals and exact positions", () => {
  const plan = "# Test\r\n- [ ] Same\r\n```md\n- [ ] Example\n````\n~~~\n- [x] Example\n~~~\n  1. [X] Same\n* [ ] Third\n- [ ]   \n";
  const tasks = checklist(plan);
  assert.deepEqual(tasks.map((t) => t.subject), ["Same", "Same", "Third"]);
  assert.deepEqual(tasks.map((t) => plan[t.position]), [" ", "X", " "]);
  assert.ok(withoutChecks(plan).includes("1. [ ] Same"));
  assert.ok(withoutChecks(plan).includes("- [x] Example"));
});

test("planning widget is hidden after lifecycle events while plan flow is unaffected", async (t) => {
  const h = harness(await directory(t));
  const published = ["Plan mode: planning", "Plan policy allows: read.", "Finish with plan_mode_complete when decision-ready."];
  for (const event of ["session_start", "before_agent_start", "agent_end"]) {
    // Upstream publishes synchronously on the event; global extensions run
    // first, so the deferred clear lands after its publish on the same tick.
    const pending = h.emit(event);
    h.ctx.ui.setWidget(UPSTREAM_PLANNING_WIDGET_KEY, published);
    await pending;
    await h.flush();
    assert.deepEqual(h.widgets.at(-1), { key: UPSTREAM_PLANNING_WIDGET_KEY, content: undefined });
  }
  h.start();
  await h.complete();
  assert.match(await readFile(h.artifact().path, "utf8"), /Ship feature/);
});

test("completion saves at repo root before review, without live tasks before approval", async (t) => {
  const root = await directory(t);
  await mkdir(join(root, "src"));
  const h = harness(join(root, "src"));
  h.start();
  const guidance = await h.emit("before_agent_start");
  assert.match(guidance.message.content, /do not create or update live todos/);
  assert.equal((await h.emit("tool_call", { toolName: "todo", input: { action: "create" } })).block, true);
  await h.complete();
  const a = h.artifact();
  assert.equal(a.root, root);
  assert.match(a.path, /docs\/plans\/\d{4}-\d{2}-\d{2}-ship-feature\.md$/);
  assert.equal(await readFile(a.path, "utf8"), `${PLAN}\n`);
  assert.equal(a.approved, false);
  assert.equal(h.entries.some((e) => e.message?.toolName === "todo"), false);
  // Upstream shows its ready menu only after tool_result and agent_end have finished.
  await h.emit("agent_end");
  await h.emit("agent_settled");
  assert.equal(await readFile(a.path, "utf8"), `${PLAN}\n`);
  assert.ok(h.queued.includes(a.path));
});

test("requires checkboxes only in active Plan mode; ignores errors and unaccepted results", async (t) => {
  const h = harness(await directory(t));
  assert.equal(await h.emit("tool_call", { toolName: "plan_mode_complete", input: { plan: "ordinary plan" } }), undefined);
  h.start();
  assert.equal((await h.complete("# Plan\n```\n- [ ] example\n```" )).block, true);
  const event = { toolName: "plan_mode_complete", input: { plan: PLAN }, details: { version: 1, source: "plan_mode_complete", plan: PLAN } };
  await h.emit("tool_result", event);
  assert.equal(h.artifact(), undefined);
  h.upstream({ enabled: true, latestPlan: PLAN });
  await h.emit("tool_result", { ...event, isError: true });
  assert.equal(h.artifact(), undefined);
  await h.emit("tool_result", { ...event, details: { ...event.details, plan: `${PLAN}!` } });
  assert.equal(h.artifact(), undefined);
});

test("revisions keep their path; new workflows and sessions exclusively allocate collision suffixes", async (t) => {
  const root = await directory(t);
  const h = harness(root);
  h.start();
  await h.complete();
  const original = h.artifact().path;
  await writeFile(original, PLAN.replace("- [ ] Add feature", "- [x] Add feature") + "\n");
  await h.complete(PLAN.replace("Ship feature", "Renamed feature"));
  assert.equal(h.artifact().path, original);
  h.upstream({ enabled: false });
  h.start();
  await h.complete();
  assert.equal(h.artifact().path, original.replace(".md", "-2.md"));
  const other = harness(root, { sessionId: "session-two" });
  other.start();
  await other.complete();
  assert.equal(other.artifact().path, original.replace(".md", "-3.md"));
  assert.match(await readFile(original, "utf8"), /Renamed feature/);
});

test("manual prose revisions fail visibly, persist failure and block implementation", async (t) => {
  const h = harness(await directory(t));
  h.start();
  await h.complete();
  const path = h.artifact().path;
  await writeFile(path, `${PLAN}\n\nUser addition.\n`);
  await h.complete(PLAN.replace("carefully", "thoroughly"));
  assert.match(h.notifications.at(-1).message, /manual edits/);
  assert.ok(savedState(h.entries).failedPlan);
  h.load();
  await h.emit("session_start");
  h.upstream({ enabled: false });
  assert.equal((await h.emit("input", { source: "extension", text: handoff(PLAN.replace("carefully", "thoroughly")) })).action, "handled");
  assert.match(await readFile(path, "utf8"), /User addition/);
  assert.equal(h.artifact().approved, false);
});

test("cwd fallback is explicit outside Git", async (t) => {
  const root = await directory(t, false);
  const h = harness(root);
  h.start();
  await h.complete();
  assert.equal(h.artifact().root, root);
  assert.ok(h.notifications.some((n) => n.level === "warning" && n.message.includes("outside Git")));
});

test("save failures block automatic handoffs and never claim success", async (t) => {
  const root = await directory(t);
  await writeFile(join(root, "docs"), "not a directory");
  const h = harness(root);
  h.start();
  await h.complete();
  assert.equal(h.artifact(), undefined);
  assert.equal(savedState(h.entries).failedPlan, PLAN);
  assert.ok(h.notifications.some((n) => n.level === "error"));
  assert.equal(h.notifications.some((n) => n.message.startsWith("Plan saved:")), false);
  h.upstream({ enabled: false });
  assert.equal((await h.emit("input", { source: "extension", text: handoff() })).action, "handled");
});

test("symlinked docs, plans and plan files cannot escape the repository", async (t) => {
  const outside = await directory(t, false);
  for (const seam of ["docs", "plans", "file"]) {
    const root = await directory(t);
    const h = harness(root);
    if (seam === "docs") await symlink(outside, join(root, "docs"));
    if (seam === "plans") {
      await mkdir(join(root, "docs"));
      await symlink(outside, join(root, "docs", "plans"));
    }
    h.start();
    if (seam === "file") {
      await h.complete();
      const path = h.artifact().path;
      await rm(path);
      await writeFile(join(outside, "external.md"), PLAN);
      await symlink(join(outside, "external.md"), path);
    }
    await h.complete(`${PLAN}\n\nRevision`);
    assert.equal(savedState(h.entries).failedPlan, `${PLAN}\n\nRevision`);
    assert.ok(h.notifications.some((n) => n.level === "error"));
  }
  assert.deepEqual(await readdir(outside), ["external.md"]);
  assert.equal(await readFile(join(outside, "external.md"), "utf8"), PLAN);
});

test("only exact extension handoffs approve implementation, then inject first-create instructions", async (t) => {
  for (const format of [handoff, (p) => transfer(p, false), () => "Implement the plan."]) {
    const h = harness(await directory(t));
    h.start();
    await h.complete();
    const text = format(PLAN);
    await h.emit("input", { source: "interactive", text });
    assert.equal(h.artifact().approved, false);
    await h.emit("input", { source: "extension", text: `Please ${text}` });
    assert.equal(h.artifact().approved, false);
    assert.equal(await h.approve(text), undefined);
    assert.equal(h.artifact().approved, true);
    const guidance = (await h.emit("before_agent_start")).message;
    assert.equal(guidance.display, false);
    assert.match(guidance.content, /FIRST use the existing todo tool/);
    assert.match(guidance.content, /reuse tasks/);
    assert.match(guidance.content, /Never clear\/delete unrelated/);
    assert.match(guidance.content, /"piPlanTask": 2/);
  }
});

test("successful mutated task alone syncs completion, errors and deletion", async (t) => {
  const h = await approved(t);
  const a = h.artifact();
  const one = linked(a, 1, 1);
  const two = linked(a, 2, 2);
  const unrelated = { id: 3, subject: "Unrelated", status: "completed" };
  const create = { action: "create", subject: one.subject };
  await h.emit("tool_call", { toolName: "todo", toolCallId: "create-one", input: create });
  assert.deepEqual(create.metadata, one.metadata);
  await h.todoResult(create, [one], { toolCallId: "create-one" });
  await h.todoResult({ action: "update", id: 1 }, [{ ...one, status: "completed" }, two, unrelated]);
  assert.match(await readFile(a.path, "utf8"), /\[x\] Add feature/);
  await h.todoResult({ action: "update", id: 2 }, [one, { ...two, status: "completed" }, unrelated]);
  assert.equal(checklist(await readFile(a.path, "utf8")).filter((c) => false).length, 0);
  assert.equal((await readFile(a.path, "utf8")).match(/\[x\]/g).length, 2, "stale task 1 snapshot must not reopen it");
  await h.todoResult({ action: "update", id: 1 }, [one, two], { details: { tasks: [one, two], error: "failed", nextId: 3 } });
  await h.todoResult({ action: "update", id: 1 }, [one, two], { isError: true });
  assert.equal((await readFile(a.path, "utf8")).match(/\[x\]/g).length, 2);
  await h.todoResult({ action: "delete", id: 1 }, [{ ...one, status: "deleted" }, two]);
  assert.match(await readFile(a.path, "utf8"), /\[ \] Add feature/);
  assert.match(await readFile(a.path, "utf8"), /\[x\] Add tests/);
  await h.todoResult({ action: "delete", id: 2 }, [one, { ...two, status: "deleted" }]);
  assert.equal((await readFile(a.path, "utf8")).includes("[x]"), false);
  const before = await readFile(a.path, "utf8");
  await h.todoResult({ action: "update", id: 3 }, [{ ...one, status: "completed" }, two, unrelated]);
  await h.todoResult({ action: "list" }, [{ ...one, status: "completed" }, two, unrelated]);
  assert.equal(await readFile(a.path, "utf8"), before);
  assert.deepEqual(unrelated, { id: 3, subject: "Unrelated", status: "completed" });
});

test("parallel task results use the file mutation queue, without lost checkmarks", async (t) => {
  const h = await approved(t);
  const a = h.artifact();
  const one = linked(a, 1, 1);
  const two = linked(a, 2, 2);
  await Promise.all([
    h.todoResult({ action: "update", id: 1 }, [{ ...one, status: "completed" }, two]),
    h.todoResult({ action: "update", id: 2 }, [one, { ...two, status: "completed" }]),
  ]);
  assert.equal((await readFile(a.path, "utf8")).match(/\[x\]/g).length, 2);
});

test("duplicate subjects receive different ordinals; failed creates release reservations", async (t) => {
  const h = await approved(t, "# Duplicates\n- [ ] Same\n- [ ] Same");
  const first = { action: "create", subject: "Same" };
  const second = { ...first };
  await h.emit("tool_call", { toolName: "todo", toolCallId: "one", input: first });
  await h.emit("tool_call", { toolName: "todo", toolCallId: "two", input: second });
  assert.equal(first.metadata.piPlanTask, 1);
  assert.equal(second.metadata.piPlanTask, 2);
  assert.equal((await h.emit("tool_call", { toolName: "todo", toolCallId: "three", input: { action: "create", subject: "Same" } })).block, true);
  await h.todoResult(first, [], { toolCallId: "one", isError: true });
  const retry = { action: "create", subject: "Same" };
  await h.emit("tool_call", { toolName: "todo", toolCallId: "retry", input: retry });
  assert.equal(retry.metadata.piPlanTask, 1);
  await h.todoResult(retry, [linked(h.artifact(), 1, 1)], { toolCallId: "retry" });
  await h.todoResult(second, [linked(h.artifact(), 1, 1), linked(h.artifact(), 2, 2)], { toolCallId: "two" });
  await h.todoResult({ action: "update", id: 2 }, [linked(h.artifact(), 1, 1), linked(h.artifact(), 2, 2, "completed")]);
  assert.match(await readFile(h.artifact().path, "utf8"), /- \[ \] Same\n- \[x\] Same/);
});

test("reload and branch navigation restore approval without resaving or duplicating todos", async (t) => {
  const h = await approved(t);
  const a = h.artifact();
  await h.todoResult({ action: "create" }, [linked(a, 1, 1)]);
  const queuedBefore = h.queued.length;
  h.load();
  await h.emit("session_start");
  assert.match((await h.emit("before_agent_start")).message.content, /reuse tasks/);
  assert.equal((await h.emit("tool_call", { toolName: "todo", toolCallId: "again", input: { action: "create", subject: "Add feature", metadata: { piPlanTask: 1 } } })).block, true);
  assert.equal(h.queued.length, queuedBefore);
  h.entries.splice(0);
  await h.emit("session_tree");
  assert.equal(await h.emit("before_agent_start"), undefined);
  assert.equal(h.artifact(), undefined);
});

test("fresh keep/history handoffs recover only the parent branch's exact saved plan", async (t) => {
  const root = await directory(t);
  const parent = harness(root);
  parent.start();
  await parent.complete();
  const session = join(root, "parent.jsonl");
  await writeFile(session, [{ type: "session", id: "parent", version: 3 }, ...parent.entries].map((e) => JSON.stringify(e)).join("\n") + "\n");
  for (const text of [handoff(), transfer()]) {
    const fresh = harness(root, { sessionId: "fresh", parentSession: session });
    if (text === handoff()) fresh.upstream({ enabled: false, activeImplementation: { plan: PLAN } });
    await fresh.emit("session_start");
    assert.equal(await fresh.emit("input", { source: "extension", text }), undefined);
    assert.equal(fresh.artifact().path, parent.artifact().path);
    assert.equal(fresh.artifact().approved, true);
    assert.equal(fresh.entries.filter((e) => e.customType === ENTRY_TYPE).length, 1);
    assert.match((await fresh.emit("before_agent_start")).message.content, /FIRST/);
  }
  const wrong = harness(root, { sessionId: "wrong", parentSession: session });
  assert.equal((await wrong.emit("input", { source: "extension", text: handoff(`${PLAN}\n`) })).action, "handled", "suffix must match exactly, not trim/heuristic matching");
  assert.equal(wrong.artifact(), undefined);
  assert.equal(handoffPlan("Please implement some plan"), undefined);
  // A matching artifact on an abandoned branch is not sufficient.
  const abandoned = [...parent.entries, { type: "custom", id: "other-leaf", parentId: parent.entries[0].id, customType: "other", data: {} }];
  await writeFile(session, abandoned.map((e) => JSON.stringify(e)).join("\n"));
  assert.equal(savedState(await parentBranch(session)).artifact, undefined);
  const other = harness(root, { sessionId: "other", parentSession: session });
  assert.equal((await other.emit("input", { source: "extension", text: handoff() })).action, "handled");
});

test("sync validates stored artifact and subjects, preserves prose edits, rejects arbitrary metadata paths", async (t) => {
  const h = await approved(t);
  const a = h.artifact();
  const one = linked(a, 1, 1, "completed");
  await writeFile(a.path, `${PLAN}\n\nUser note.\n`);
  await h.todoResult({ action: "update", id: 1 }, [one]);
  assert.match(await readFile(a.path, "utf8"), /\[x\] Add feature/);
  assert.match(await readFile(a.path, "utf8"), /User note/);
  const edited = PLAN.replace("Add feature", "User task");
  await writeFile(a.path, edited);
  await h.todoResult({ action: "update", id: 1 }, [one]);
  assert.equal(await readFile(a.path, "utf8"), edited);
  assert.match(h.notifications.at(-1).message, /checklist was edited/);
  await writeFile(a.path, PLAN);
  await h.todoResult({ action: "update", id: 1 }, [{ ...one, metadata: { ...one.metadata, piPlanFile: "../../external.md" } }]);
  assert.equal(await readFile(a.path, "utf8"), PLAN);
});

test("legacy completion saves after upstream agent_end and before its ready menu", async (t) => {
  const h = harness(await directory(t));
  await h.emit("agent_end", { messages: [{ content: PLAN }] });
  await h.emit("agent_settled");
  assert.equal(h.artifact(), undefined);
  // npm package handlers register after the global companion, as in live Pi.
  h.pi.on("agent_end", () => h.upstream({ enabled: true, latestPlan: PLAN, latestPlanSource: "legacy_proposed_plan" }));
  h.pi.on("agent_settled", async () => {
    assert.equal(await readFile(h.artifact().path, "utf8"), `${PLAN}\n`);
  });
  h.start();
  await h.emit("agent_end");
  assert.equal(h.artifact(), undefined);
  await h.emit("agent_settled");
  const first = h.artifact().path;
  h.upstream({ enabled: false });
  h.start();
  await h.emit("agent_end");
  await h.emit("agent_settled");
  assert.notEqual(h.artifact().path, first);
});

test("denied or aborted todo creates release their reservation for a same-turn retry", async (t) => {
  const h = await approved(t, "# Retry\n- [ ] Same\n- [ ] Same");
  const first = { action: "create", subject: "Same" };
  await h.emit("tool_call", { toolName: "todo", toolCallId: "one", input: first });
  assert.equal(first.metadata.piPlanTask, 1);
  // A call denied before execution emits tool_execution_end but never tool_result.
  await h.emit("tool_execution_end", { toolName: "todo", toolCallId: "one", isError: true, result: {} });
  const retry = { action: "create", subject: "Same" };
  assert.equal(await h.emit("tool_call", { toolName: "todo", toolCallId: "retry", input: retry }), undefined);
  assert.equal(retry.metadata.piPlanTask, 1, "the released ordinal is reusable");
});

test("deleted linked tasks free their ordinal for a replacement after the turn ends", async (t) => {
  const h = await approved(t, "# Reopen\n- [ ] Fix bug");
  const a = h.artifact();
  const first = { action: "create", subject: "Fix bug" };
  await h.emit("tool_call", { toolName: "todo", toolCallId: "one", input: first });
  await h.todoResult(first, [linked(a, 1, 1)], { toolCallId: "one" });
  await h.emit("turn_end", { turnIndex: 0, message: {}, toolResults: [] });
  const remove = { action: "delete", id: 1 };
  await h.emit("tool_call", { toolName: "todo", toolCallId: "delete", input: remove });
  await h.todoResult(remove, [linked(a, 1, 1, "deleted")], { toolCallId: "delete" });
  const again = { action: "create", subject: "Fix bug" };
  assert.equal(await h.emit("tool_call", { toolName: "todo", toolCallId: "two", input: again }), undefined, "a deleted task must not block re-creation");
  assert.equal(again.metadata.piPlanTask, 1);
});

test("todo clear is blocked during an approved linked implementation", async (t) => {
  const h = await approved(t);
  const result = await h.emit("tool_call", { toolName: "todo", toolCallId: "clear", input: { action: "clear" } });
  assert.equal(result.block, true);
  assert.match(result.reason, /Clear/i);
});

test("installed reducer semantics: reopening uses delete then replacement create", async (t) => {
  const apply = await installedReducer(t);
  if (!apply) return;
  const h = await approved(t, "# Reopen\n- [ ] Fix bug");
  const a = h.artifact();
  let state = { tasks: [], nextId: 1 };
  const run = async (input, toolCallId) => {
    const blocked = await h.emit("tool_call", { toolName: "todo", toolCallId, input });
    assert.equal(blocked, undefined, `unexpected block for ${JSON.stringify(input)}`);
    const result = apply(state, input.action, input);
    state = result.state;
    const details = { action: input.action, params: input, tasks: state.tasks, nextId: state.nextId, ...(result.op.kind === "error" ? { error: result.op.message } : {}) };
    await h.todoResult(input, state.tasks, { toolCallId, details });
    await h.emit("turn_end", { turnIndex: 0, message: {}, toolResults: [] });
    return result.op;
  };
  const created = await run({ action: "create", subject: "Fix bug" }, "create-one");
  assert.equal(created.kind, "create");
  assert.equal(state.tasks.find((x) => x.id === created.taskId).metadata.piPlanTask, 1);
  assert.equal((await run({ action: "update", id: created.taskId, status: "completed" }, "complete-one")).kind, "update");
  assert.match(await readFile(a.path, "utf8"), /\[x\] Fix bug/);
  assert.equal((await run({ action: "update", id: created.taskId, status: "in_progress" }, "reopen-one")).kind, "error");
  assert.match(await readFile(a.path, "utf8"), /\[x\] Fix bug/, "an illegal reopen must not touch the box");
  assert.equal((await run({ action: "delete", id: created.taskId }, "delete-one")).kind, "delete");
  assert.match(await readFile(a.path, "utf8"), /\[ \] Fix bug/);
  const replacement = await run({ action: "create", subject: "Fix bug" }, "create-two");
  assert.equal(replacement.kind, "create");
  assert.notEqual(replacement.taskId, created.taskId, "deleted tasks are replaced, not revived");
  assert.equal(state.tasks.find((x) => x.id === replacement.taskId).metadata.piPlanTask, 1, "the replacement re-links the same ordinal");
});

test("revisions recreate a deleted plan file and directory at the same path", async (t) => {
  const h = harness(await directory(t));
  h.start();
  await h.complete();
  const a = h.artifact();
  await rm(a.path);
  await h.complete(PLAN.replace("carefully", "thoroughly"));
  assert.equal(savedState(h.entries).failedPlan, undefined);
  assert.equal(h.artifact().path, a.path);
  assert.match(await readFile(a.path, "utf8"), /thoroughly/);
  await rm(join(a.root, "docs"), { recursive: true, force: true });
  await h.complete(PLAN.replace("carefully", "carefully and quickly"));
  assert.equal(savedState(h.entries).failedPlan, undefined);
  assert.equal(h.artifact().path, a.path);
  assert.match(await readFile(a.path, "utf8"), /quickly/);
});

test("prose-only revisions keep manual ticks; checked checklist changes are refused", async (t) => {
  const h = harness(await directory(t));
  h.start();
  await h.complete();
  const a = h.artifact();
  await writeFile(a.path, PLAN.replace("- [ ] Add feature", "- [x] Add feature") + "\n");
  await h.complete(PLAN.replace("carefully", "thoroughly"));
  assert.match(await readFile(a.path, "utf8"), /\[x\] Add feature/);
  assert.match(await readFile(a.path, "utf8"), /thoroughly/);
  await h.complete(PLAN.replace("Add tests", "Add docs"));
  assert.match(h.notifications.at(-1).message, /checked/);
  assert.match(await readFile(a.path, "utf8"), /\[x\] Add feature/);
  assert.match(await readFile(a.path, "utf8"), /Add tests/);
});

test("failed handoffs stay blocked and report safe recovery without prefilling approval", async (t) => {
  const h = harness(await directory(t));
  h.start();
  await h.complete();
  h.upstream({ enabled: false });
  const result = await h.emit("input", { source: "extension", text: handoff(`${PLAN}\n`) });
  assert.equal(result.action, "handled");
  assert.match(h.notifications.at(-1).message, /resume the planning session/);
  assert.equal(h.artifact().approved, false);
});

test("an approved plan without linked todos warns once after the first working turn", async (t) => {
  const h = await approved(t);
  const a = h.artifact();
  const warnings = () => h.notifications.filter((n) => n.level === "warning");
  assert.equal(warnings().length, 0);
  await h.emit("turn_end", { turnIndex: 0, message: {}, toolResults: [] });
  assert.equal(warnings().length, 0, "a turn without tool work is not proof of anything");
  await h.emit("turn_end", { turnIndex: 1, message: {}, toolResults: [{ toolName: "read" }] });
  assert.equal(warnings().length, 1);
  assert.ok(warnings()[0].message.includes(relative(a.root, a.path)));
  assert.match(warnings()[0].message, /no todo is linked/);
  await h.emit("turn_end", { turnIndex: 2, message: {}, toolResults: [{ toolName: "read" }] });
  assert.equal(warnings().length, 1, "one warning per session is enough");
});

test("a linked todo silences the warning for the rest of the session", async (t) => {
  const h = await approved(t);
  const a = h.artifact();
  const warnings = () => h.notifications.filter((n) => n.level === "warning");
  await h.todoResult({ action: "create", subject: "Add feature" }, [linked(a, 1, 1)]);
  await h.emit("turn_end", { turnIndex: 0, message: {}, toolResults: [{ toolName: "todo" }] });
  assert.equal(warnings().length, 0);
  await h.todoResult({ action: "delete", id: 1 }, [linked(a, 1, 1, "deleted")]);
  await h.emit("turn_end", { turnIndex: 1, message: {}, toolResults: [{ toolName: "todo" }] });
  assert.equal(warnings().length, 0, "the check already succeeded; later deletions do not reopen it");
});

test("unapproved sessions and re-entered plan mode never warn about links", async (t) => {
  const h = harness(await directory(t));
  const warnings = () => h.notifications.filter((n) => n.level === "warning");
  h.start();
  await h.complete();
  await h.emit("turn_end", { turnIndex: 0, message: {}, toolResults: [{ toolName: "read" }] });
  assert.equal(warnings().length, 0, "an unapproved plan is not an implementation");
  await h.approve();
  h.start();
  await h.emit("turn_end", { turnIndex: 0, message: {}, toolResults: [{ toolName: "read" }] });
  assert.equal(warnings().length, 0, "plan-mode turns are not implementation turns");
});
