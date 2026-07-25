/**
 * elias-statusline — theme-aware HUD for Pi.
 * Forked from pi-shannon-statusline: matrix rain removed, colors driven by
 * ctx.ui.theme instead of a hardcoded Monokai Pro palette.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────

interface GitStatus {
	branch: string;
	isDirty: boolean;
	ahead: number;
	behind: number;
	modified: number;
	added: number;
	deleted: number;
	untracked: number;
}

// ── State ──────────────────────────────────────────────────────────

let sessionStartTime = 0;
let lastCtx: any = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let modelProvider = "";
let modelId = "";
let thinkingLevel = "";
let cwd = "";

// ── Icons (plain glyphs, no emoji — matches shannon's set) ─────────

const I_MODEL = "λ";
const I_PATH = "⌘";
const I_BRANCH = "⎇";
const I_CLOCK = "✦";
const I_CTX = "⊡";
const I_CLAUDE = "※";
const I_MCP = "⊕";
const I_THINK = "✶";

// ── Theme helpers ──────────────────────────────────────────────────

type Theme = { fg?: (token: string, text: string) => string } | undefined;

function fg(theme: Theme, token: string, text: string): string {
	return theme?.fg ? theme.fg(token, text) : text;
}

function sep(theme: Theme): string {
	return fg(theme, "dim", "│");
}

// thinking tiers — higher effort = hotter color, mirroring ctxColor
const THINK_COLOR: Record<string, string> = {
	minimal: "dim",
	low: "success",
	medium: "accent",
	high: "warning",
	xhigh: "error",
	max: "error",
};

// ── Fish-style path shortening (from shannon-statusline) ───────────

function abbreviateSegment(segment: string): string {
	if (segment.length <= 1) return segment;
	const extra = segment.match(/[-.](.)/);
	return extra ? `${segment[0]}${extra[0]}` : segment[0]!;
}

function truncateTailSegment(segment: string, maxLen: number): string {
	if (segment.length <= maxLen) return segment;
	if (maxLen <= 1) return "…";
	const extStart = segment.lastIndexOf(".");
	const hasExt = extStart > 0 && extStart < segment.length - 1;
	if (!hasExt) return `…${segment.slice(-(maxLen - 1))}`;
	const ext = segment.slice(extStart);
	const base = segment.slice(0, extStart);
	const budget = maxLen - ext.length - 1;
	if (budget <= 0) return `…${ext.slice(-(maxLen - 1))}`;
	return `…${base.slice(-budget)}${ext}`;
}

function shortenDisplayPath(fullPath: string, home: string, maxLen: number): string {
	if (!fullPath) return "";
	let display = fullPath;
	if (home && fullPath === home) return "~";
	if (home && fullPath.startsWith(home + "/")) {
		display = "~" + fullPath.slice(home.length);
	}

	const prefix = display.startsWith("~") ? "~" : display.startsWith("/") ? "/" : "";
	const rawParts = display.split("/").filter(Boolean);
	const parts = prefix === "~" ? rawParts.slice(1) : rawParts;
	if (parts.length <= 1) return display;

	const tail = parts.slice(-1);
	const head = parts.slice(0, -1).map(abbreviateSegment);
	let shortened = [...head, ...tail].join("/");
	if (prefix) shortened = prefix + "/" + shortened;

	if (shortened.length <= maxLen) return shortened;

	const ellipsis = prefix + "/…/" + tail.join("/");
	if (ellipsis.length <= maxLen) return ellipsis;

	const budget = Math.max(1, maxLen - (prefix ? prefix.length + 4 : 3));
	return `${prefix ? prefix + "/" : ""}…/${truncateTailSegment(tail[0]!, budget)}`;
}

// ── Context bar (theme-aware: threshold tokens, no rgb gradient) ────

function ctxColor(percent: number): string {
	if (percent >= 85) return "error";
	if (percent >= 70) return "warning";
	return "success";
}

function ctxBar(theme: Theme, percent: number, width: number): string {
	const safeP = Math.min(100, Math.max(0, percent));
	const filled = Math.round((safeP / 100) * width);
	const empty = width - filled;
	return `${fg(theme, ctxColor(safeP), "█".repeat(filled))}${fg(theme, "dim", "░".repeat(empty))}`;
}

// ── Formatters ─────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(0)}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
}

// ── Git ────────────────────────────────────────────────────────────

async function getGit(dir: string): Promise<GitStatus | null> {
	if (!dir) return null;
	try {
		const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: dir, timeout: 1500, encoding: "utf8",
		});
		const branch = branchOut.trim();
		if (!branch) return null;

		let isDirty = false, modified = 0, added = 0, deleted = 0, untracked = 0;
		try {
			const { stdout: statusOut } = await execFileAsync("git", ["--no-optional-locks", "status", "--porcelain"], {
				cwd: dir, timeout: 1500, encoding: "utf8",
			});
			const lines = statusOut.trim().split("\n").filter(Boolean);
			isDirty = lines.length > 0;
			for (const line of lines) {
				if (line.startsWith("??")) untracked++;
				else if (line[0] === "A") added++;
				else if (line[0] === "D" || line[1] === "D") deleted++;
				else if (line[0] === "M" || line[1] === "M" || line[0] === "R" || line[0] === "C") modified++;
			}
		} catch { /* ignore */ }

		let ahead = 0, behind = 0;
		try {
			const { stdout: revOut } = await execFileAsync("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], {
				cwd: dir, timeout: 1500, encoding: "utf8",
			});
			const parts = revOut.trim().split(/\s+/);
			if (parts.length === 2) { behind = parseInt(parts[0]!, 10) || 0; ahead = parseInt(parts[1]!, 10) || 0; }
		} catch { /* no upstream */ }

		return { branch, isDirty, ahead, behind, modified, added, deleted, untracked };
	} catch { return null; }
}

// ── Config counter ─────────────────────────────────────────────────

function countConfigs(dir: string) {
	let agentsMd = 0, mcps = 0;
	const home = homedir();
	try {
		if (existsSync(join(dir, "AGENTS.md"))) agentsMd++;
		if (existsSync(join(dir, "CLAUDE.md"))) agentsMd++;

		try {
			const mcpCache = JSON.parse(readFileSync(join(home, ".pi", "agent", "mcp-cache.json"), "utf8"));
			const servers = mcpCache?.servers;
			if (servers && typeof servers === "object") mcps = Object.keys(servers).length;
		} catch { /* ignore */ }
	} catch { /* ignore */ }
	return { agentsMd, mcps };
}

// ── Mode segments (icon + dim label + colored level, no emoji) ─────

function thinkSegment(theme: Theme, level: string): string {
	const color = THINK_COLOR[level] ?? "accent";
	return `${fg(theme, color, I_THINK)} ${fg(theme, "muted", "thinking")} ${fg(theme, color, level.toUpperCase())}`;
}

// ── HUD renderer ───────────────────────────────────────────────────

async function buildHud(ctx: any): Promise<string[]> {
	const lines: string[] = [];
	const theme: Theme = ctx?.ui?.theme;
	const s = sep(theme);
	const dir = cwd;

	// ── Line 1: Model + Thinking + Context ──
	const line1: string[] = [];

	let modelStr: string;
	if (modelProvider && modelId) {
		modelStr = `${fg(theme, "accent", I_MODEL)} ${fg(theme, "muted", modelProvider)}/${fg(theme, "accent", modelId)}`;
	} else if (modelId) {
		modelStr = `${fg(theme, "accent", I_MODEL)} ${fg(theme, "accent", modelId)}`;
	} else if (modelProvider) {
		modelStr = `${fg(theme, "accent", I_MODEL)} ${fg(theme, "accent", modelProvider)}`;
	} else {
		modelStr = `${fg(theme, "accent", I_MODEL)} ${fg(theme, "accent", "pi")}`;
	}
	line1.push(modelStr);

	if (thinkingLevel && thinkingLevel !== "off") line1.push(thinkSegment(theme, thinkingLevel));

	try {
		const usage = ctx.getContextUsage?.();
		if (usage) {
			const pct = usage.percent ?? 0;
			const bar = ctxBar(theme, pct, 10);
			const win = usage.contextWindow ?? 0;
			const winLabel = win >= 1_000_000 ? `${(win / 1_000_000).toFixed(1)}M` : win >= 1000 ? `${Math.round(win / 1000)}k` : "";
			let ctxStr = `${fg(theme, "accent", I_CTX)} ${bar} ${fg(theme, ctxColor(pct), `${pct.toFixed(1)}%`)}`;
			if (winLabel) ctxStr += ` ${fg(theme, "dim", `(${winLabel})`)}`;
			line1.push(ctxStr);
		}
	} catch { /* context usage unavailable */ }

	lines.push(line1.join(` ${s} `));

	// ── Line 2: Path + Git + Configs + Duration ──
	const line2: string[] = [];

	if (dir) {
		const home = homedir();
		line2.push(`${fg(theme, "warning", I_PATH)} ${fg(theme, "warning", shortenDisplayPath(dir, home, 30))}`);
	}

	const git = await getGit(dir);
	if (git) {
		const dirty = git.isDirty ? "*" : "";
		let gitStr = `${fg(theme, "accent", I_BRANCH)} ${fg(theme, "accent", `${git.branch}${dirty}`)}`;
		const details: string[] = [];
		if (git.ahead > 0) details.push(fg(theme, "success", `↑${git.ahead}`));
		if (git.behind > 0) details.push(fg(theme, "error", `↓${git.behind}`));
		if (git.modified > 0) details.push(fg(theme, "error", `!${git.modified}`));
		if (git.added > 0) details.push(fg(theme, "success", `+${git.added}`));
		if (git.deleted > 0) details.push(fg(theme, "error", `✘${git.deleted}`));
		if (git.untracked > 0) details.push(fg(theme, "muted", `?${git.untracked}`));
		if (details.length > 0) gitStr += ` ${details.join(" ")}`;
		line2.push(gitStr);
	}

	const configs = countConfigs(dir);
	if (configs.agentsMd > 0) line2.push(`${fg(theme, "accent", I_CLAUDE)} ${fg(theme, "accent", `×${configs.agentsMd}`)} ${fg(theme, "dim", "AGENTS.md")}`);
	if (configs.mcps > 0) line2.push(`${fg(theme, "warning", I_MCP)} ${fg(theme, "warning", `×${configs.mcps}`)} ${fg(theme, "dim", "MCPs")}`);

	if (sessionStartTime > 0) {
		line2.push(`${fg(theme, "dim", I_CLOCK)} ${fg(theme, "dim", fmtDuration(Date.now() - sessionStartTime))}`);
	}

	lines.push(line2.join(` ${s} `));

	return lines;
}

// ── Refresh + entry ────────────────────────────────────────────────

function refreshHud(ctx: any) {
	buildHud(ctx).then(lines => {
		if (lines.length > 0) ctx.ui.setWidget("elias-statusline", lines, { placement: "belowEditor" });
	}).catch(() => {});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		sessionStartTime = Date.now();
		lastCtx = ctx;
		cwd = ctx.cwd;
		if (ctx.model) {
			modelProvider = (ctx.model as any).provider ?? "";
			modelId = (ctx.model as any).id ?? "";
		}
		thinkingLevel = pi.getThinkingLevel?.() ?? "";
		if (tickInterval) clearInterval(tickInterval);
		tickInterval = setInterval(() => { if (lastCtx) refreshHud(lastCtx); }, 1000);
		refreshHud(ctx);
	});

	pi.on("model_select", (event, ctx) => {
		if (event.model) {
			modelProvider = (event.model as any).provider ?? "";
			modelId = (event.model as any).id ?? "";
		}
		refreshHud(ctx);
	});

	pi.on("thinking_level_select", (event, ctx) => {
		thinkingLevel = (event as any).level ?? thinkingLevel;
		refreshHud(ctx);
	});

	pi.on("turn_end", (_event, ctx) => refreshHud(ctx));
}
