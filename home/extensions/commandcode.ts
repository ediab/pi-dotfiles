// Command Code provider for pi — minimal custom provider (GOAT/Provider plan).
// Uses Command Code's documented Provider API: https://api.commandcode.ai/provider/v1
//   - claude-* models  → Anthropic-compatible endpoint  (pi appends /v1/messages)
//   - everything else  → OpenAI-compatible endpoint     (pi appends /chat/completions)
// Auth: API key (user_...) via `/login` → Command Code → API key,
// or the COMMAND_CODE_API_KEY env var.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const API_BASE = "https://api.commandcode.ai/provider/v1";
const ANTHROPIC_BASE = "https://api.commandcode.ai/provider";

// Model families whose Provider API accepts reasoning_effort. Snapshot of the
// official CLI catalog (command-code@1.32.2); add new families as they ship.
const EFFORT_FAMILIES = [
  "deepseek/deepseek-v4",
  "google/gemini",
  "gpt-5",
  "xai/grok",
  "Qwen/Qwen3.8",
  "zai-org/GLM-5",
  "sakana/fugu-ultra",
  "stealth/ox-alpha",
];

// Models without extended thinking support (per the CLI catalog).
const NON_REASONING = ["claude-haiku", "Kimi-K2.5", "Kimi-K2.6"];

export default async function (pi: ExtensionAPI) {
  const res = await fetch(`${API_BASE}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`commandcode: /models returned ${res.status}`);
  const { data } = (await res.json()) as {
    data: Array<{ id: string; name: string; context_length: number }>;
  };

  pi.registerProvider("commandcode", {
    name: "Command Code",
    baseUrl: API_BASE,
    apiKey: "$COMMAND_CODE_API_KEY",
    models: data.map((m) => {
      const isClaude = m.id.startsWith("claude-");
      const reasoning = !NON_REASONING.some((n) => m.id.includes(n));
      return {
        id: m.id,
        name: `${m.name} (CC)`,
        reasoning,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.context_length,
        maxTokens: 65536,
        api: isClaude ? "anthropic-messages" : "openai-completions",
        baseUrl: isClaude ? ANTHROPIC_BASE : API_BASE,
        compat: isClaude
          ? {
              supportsEagerToolInputStreaming: false,
              supportsLongCacheRetention: false,
              supportsCacheControlOnTools: false,
              forceAdaptiveThinking: reasoning,
            }
          : {
              supportsStore: false,
              supportsDeveloperRole: false,
              maxTokensField: "max_tokens",
              supportsReasoningEffort: EFFORT_FAMILIES.some((f) => m.id.startsWith(f)),
            },
      };
    }),
  });
}
