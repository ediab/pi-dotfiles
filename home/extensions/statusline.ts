/**
 * elias-statusline — theme-aware HUD for Pi.
 * Forked from pi-shannon-statusline: matrix rain removed, colors driven by
 * ctx.ui.theme. Simplified: no icons, no timer, bare context %, live ponytail
 * status appended at render time.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────

interface GitStatus {
	branch: string;
	isDirty: boolean;
	ahead: number;
	behind: number;
}

// ── State ──────────────────────────────────────────────────────────

let thinkingLevel = "";
let hudText = "";
let requestFooterRender: (() => void) | null = null;

// ── Theme helpers ──────────────────────────────────────────────────

type Theme = { fg?: (token: string, text: string) => string } | undefined;

function fg(theme: Theme, token: string, text: string): string {
	return theme?.fg ? theme.fg(token, text) : text;
}

function sep(theme: Theme): string {
	return fg(theme, "dim", "│");
}

// thinking tiers — higher effort = hotter color
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

// ── Context ────────────────────────────────────────────────────────

function ctxColor(percent: number): string {
	if (percent >= 85) return "error";
	if (percent >= 70) return "warning";
	return "success";
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

		let isDirty = false, ahead = 0, behind = 0;
		try {
			const { stdout } = await execFileAsync("git", ["--no-optional-locks", "status", "--porcelain"], {
				cwd: dir, timeout: 1500, encoding: "utf8",
			});
			isDirty = stdout.trim().length > 0;
		} catch { /* ignore */ }

		try {
			const { stdout: revOut } = await execFileAsync("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], {
				cwd: dir, timeout: 1500, encoding: "utf8",
			});
			const parts = revOut.trim().split(/\s+/);
			if (parts.length === 2) { behind = parseInt(parts[0]!, 10) || 0; ahead = parseInt(parts[1]!, 10) || 0; }
		} catch { /* no upstream */ }

		return { branch, isDirty, ahead, behind };
	} catch { return null; }
}

// ── Ponytail ───────────────────────────────────────────────────────

/**
 * Live ponytail mode from the ponytail extension's status indicator
 * (`● 🐴 ponytail: ⚡ FULL`). Strip its ANSI/emoji noise and keep the trailing
 * word, re-themed to match this footer. Empty while ponytail is off.
 */
function ponytailSegment(theme: Theme, footerData: any): string {
	const raw: string = footerData?.getExtensionStatuses?.().get("ponytail") ?? "";
	const plain = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
	if (!plain) return "";
	const mode = plain.split(/\s+/).pop() ?? "";
	if (!mode) return "";
	return `${fg(theme, "muted", "ponytail")} ${fg(theme, "accent", mode.toUpperCase())}`;
}

// ── HUD renderer ───────────────────────────────────────────────────

async function buildHud(ctx: any): Promise<string> {
	const theme: Theme = ctx?.ui?.theme;
	const dir = ctx?.cwd ?? "";
	const segments: string[] = [];

	// Model + thinking level: `provider/id MAX`.
	const provider = ctx?.model?.provider ?? "";
	const id = ctx?.model?.id ?? "";
	let modelSeg = fg(theme, "accent", [provider, id].filter(Boolean).join("/") || "pi");
	if (thinkingLevel && thinkingLevel !== "off") {
		modelSeg += ` ${fg(theme, THINK_COLOR[thinkingLevel] ?? "accent", thinkingLevel.toUpperCase())}`;
	}
	segments.push(modelSeg);

	if (dir) {
		segments.push(fg(theme, "warning", shortenDisplayPath(dir, homedir(), 30)));
	}

	const git = await getGit(dir);
	if (git) {
		const dirty = git.isDirty ? "*" : "";
		let gitStr = fg(theme, "accent", `${git.branch}${dirty}`);
		if (git.ahead > 0) gitStr += ` ${fg(theme, "success", `↑${git.ahead}`)}`;
		if (git.behind > 0) gitStr += ` ${fg(theme, "error", `↓${git.behind}`)}`;
		segments.push(gitStr);
	}

	try {
		const usage = ctx.getContextUsage?.();
		if (usage) {
			const pct = Math.min(100, Math.max(0, usage.percent ?? 0));
			let ctxSeg = fg(theme, ctxColor(pct), `${pct.toFixed(1)}%`);
			const win = usage.contextWindow ?? 0;
			const winLabel = win >= 1_000_000 ? `${Math.round(win / 1_000_000)}M`
				: win >= 1000 ? `${Math.round(win / 1000)}k` : "";
			if (winLabel) ctxSeg += ` ${fg(theme, "dim", `(${winLabel})`)}`;
			segments.push(ctxSeg);
		}
	} catch { /* context usage unavailable */ }

	// Session cost — same accumulation pi's default footer uses.
	let cost = 0;
	for (const e of ctx.sessionManager?.getEntries?.() ?? []) {
		const u = e.type === "message" ? e.message?.usage
			: (e.type === "branch_summary" || e.type === "compaction") ? e.usage : undefined;
		if (u) cost += u.cost?.total ?? 0;
	}
	if (cost > 0) segments.push(fg(theme, "muted", `$${cost.toFixed(3)}`));

	return segments.join(` ${sep(theme)} `);
}

// ── Refresh + entry ────────────────────────────────────────────────

function refreshHud(ctx: any) {
	buildHud(ctx).then(text => {
		hudText = text;
		requestFooterRender?.();
	}).catch(() => {});
}

function installFooter(ctx: any) {
	ctx.ui.setFooter((tui: any, theme: Theme, footerData: any) => {
		const requestRender = () => tui.requestRender();
		requestFooterRender = requestRender;
		const unsubscribe = footerData.onBranchChange(() => refreshHud(ctx));
		const s = sep(theme);

		return {
			dispose() {
				unsubscribe();
				if (requestFooterRender === requestRender) requestFooterRender = null;
			},
			invalidate() {},
			render(width: number): string[] {
				// Ponytail appended here, not baked into hudText, so /ponytail <mode>
				// flips instantly on the re-render its setStatus triggers.
				const text = [hudText, ponytailSegment(theme, footerData)].filter(Boolean).join(` ${s} `);
				return [...wrapTextWithAnsi(text, Math.max(1, width))];
			},
		};
	});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		hudText = "";
		installFooter(ctx);
		thinkingLevel = pi.getThinkingLevel?.() ?? "";
		refreshHud(ctx);
	});

	pi.on("model_select", (_event, ctx) => refreshHud(ctx));

	pi.on("thinking_level_select", (event, ctx) => {
		thinkingLevel = (event as any).level ?? thinkingLevel;
		refreshHud(ctx);
	});

	pi.on("turn_end", (_event, ctx) => refreshHud(ctx));
}
