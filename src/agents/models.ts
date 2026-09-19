import Anthropic from "@anthropic-ai/sdk";

/**
 * Model registry. Claude is the reasoning and drafting layer. Nemotron (via
 * any OpenAI-compatible endpoint: Ollama on the Mac, hosted NIM, or an L4)
 * does the non-chat jobs: classification, estimation, extraction. Every call
 * records which provider actually answered so degraded mode is visible.
 */
export const claude = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface NemotronResult<T> { data: T; provider: "nemotron-local" | "nemotron-hosted" | "claude-fallback" | "heuristic"; latencyMs: number }

const endpoints = () => [
  { name: "nemotron-local" as const, url: process.env.NEMOTRON_BASE_URL, key: process.env.NEMOTRON_API_KEY ?? "ollama", model: process.env.NEMOTRON_MODEL ?? "nemotron-3-nano-4b" },
  { name: "nemotron-hosted" as const, url: "https://integrate.api.nvidia.com/v1", key: process.env.NVIDIA_API_KEY, model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
].filter((e) => e.url && e.key);

/** JSON-schema constrained call to Nemotron with fallback chain. */
export async function nemotronJson<T>(system: string, user: string, schema: object, fallback: () => T, timeoutMs = 8000): Promise<NemotronResult<T>> {
  for (const ep of endpoints()) {
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${ep.url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ep.key}` },
        body: JSON.stringify({
          model: ep.model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_schema", json_schema: { name: "out", schema, strict: true } },
          temperature: 0,
          max_tokens: 400,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const body = await res.json();
      const text = body.choices?.[0]?.message?.content ?? "";
      const data = JSON.parse(text.replace(/^```json|```$/g, "").trim()) as T;
      return { data, provider: ep.name, latencyMs: Date.now() - started };
    } catch {
      continue;
    }
  }
  return { data: fallback(), provider: "heuristic", latencyMs: 0 };
}
