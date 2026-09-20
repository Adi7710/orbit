import Anthropic from "@anthropic-ai/sdk";

/**
 * Model registry. Claude is the reasoning and drafting layer. Nemotron, via
 * NVIDIA's hosted API (build.nvidia.com, OpenAI-compatible), does the
 * non-chat jobs: classification, estimation, document parsing. No local
 * models. Every call records which provider actually answered so degraded
 * mode is visible on screen.
 */
export const claude = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const NVIDIA_BASE = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
export const nvidiaKey = () => process.env.NVIDIA_API_KEY;

/** Preferred text model ids, first available wins. Override with NEMOTRON_MODEL. */
/**
 * The model to fail over to when the first one hangs. Measured 20 Sept
 * 09:53, eight prompt-only estimate calls each, thinking off:
 *
 *   nemotron-3.5-lightning-30b-a3b   5/8 answered   median 8.8 s   p90 timeout
 *   nemotron-3-super-120b-a12b       4/8 answered   median 0.6 s   p90 timeout, 503s
 *   mistralai/mistral-nemotron       6/8 answered   median 1.0 s   p90 timeout
 *
 * Nothing on the free endpoint avoids timeouts this morning, so the answer
 * is not a model, it is a second model: a short first budget on the primary,
 * then one attempt on the one with the best median, then the deterministic
 * tier. Override with NEMOTRON_FALLBACK_MODEL.
 */
export const NEMOTRON_FALLBACK_MODEL = process.env.NEMOTRON_FALLBACK_MODEL ?? "mistralai/mistral-nemotron";
/** How long the primary gets alone before the fallback is fired beside it. */
export const RACE_STAGGER_MS = Number(process.env.NEMOTRON_RACE_STAGGER_MS ?? 1500);

export const NEMOTRON_TEXT_CANDIDATES = [
  process.env.NEMOTRON_MODEL,
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-ultra-550b-a55b",
].filter((x): x is string => !!x);

export const NEMOTRON_PARSE_CANDIDATES = [process.env.NEMOTRON_PARSE_MODEL, "nvidia/nemotron-parse", "nvidia/nemoretriever-parse"].filter((x): x is string => !!x);

let modelCache: { ids: string[]; at: number } | undefined;

/** Lists the ids the key can actually call. Cached for 10 minutes. */
export async function availableModels(): Promise<string[]> {
  if (!nvidiaKey()) return [];
  if (modelCache && Date.now() - modelCache.at < 6e5) return modelCache.ids;
  try {
    const r = await fetch(`${NVIDIA_BASE}/models`, { headers: { Authorization: `Bearer ${nvidiaKey()}`, Connection: "close" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { id: string }[] };
    modelCache = { ids: (j.data ?? []).map((m) => m.id), at: Date.now() };
    return modelCache.ids;
  } catch {
    return [];
  }
}

export async function pickModel(candidates: string[]): Promise<string | undefined> {
  const ids = await availableModels();
  if (ids.length === 0) return candidates[0]; // key may lack /models access; try the first anyway
  return candidates.find((c) => ids.includes(c)) ?? candidates.find((c) => ids.some((id) => id.toLowerCase().includes(c.split("/").pop()!.toLowerCase())));
}

export type Provider = "nemotron-hosted" | "claude-fallback" | "heuristic";
export interface NemotronResult<T> { data: T; provider: Provider; model?: string; latencyMs: number; error?: string }

/** JSON-schema constrained call to hosted Nemotron. Falls back to a JSON-only prompt if the endpoint rejects response_format. */
export async function nemotronJson<T>(system: string, user: string, schema: object, fallback: () => T, timeoutMs = 15000, maxTokens = 512): Promise<NemotronResult<T>> {
  const key = nvidiaKey();
  if (!key) return { data: fallback(), provider: "heuristic", latencyMs: 0, error: "no NVIDIA_API_KEY" };
  const model = await pickModel(NEMOTRON_TEXT_CANDIDATES);
  if (!model) return { data: fallback(), provider: "heuristic", latencyMs: 0, error: "no nemotron model available" };

  const started = Date.now();
  /** Every in-flight request, so the loser of a race is aborted, not left to finish. */
  const inFlight = new Set<AbortController>();
  const attempt = async (withSchema: boolean, useModel: string = model) => {
    const ctrl = new AbortController();
    inFlight.add(ctrl);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        // Connection: close, measured 20 Sept 10:04 on eight sequential calls:
        // pooled keep-alive sockets answered 4/8 with a median of 7.2 s; a
        // fresh connection per request answered 6/8 at 1.3 s. The hangs were
        // stale sockets in the fetch pool, not only the model. Streaming was
        // worse (2/8).
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Connection: "close" },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: "system", content: `${system}\nRespond with a single JSON object and nothing else. Schema: ${JSON.stringify(schema)}` },
            { role: "user", content: user },
          ],
          ...(withSchema ? { response_format: { type: "json_schema", json_schema: { name: "out", schema, strict: true } } } : {}),
          temperature: 0,
          max_tokens: maxTokens,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
      const body = JSON.parse(text);
      const content: string = body.choices?.[0]?.message?.content ?? "";
      const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
      return JSON.parse(json) as T;
    } finally {
      clearTimeout(timer);
      inFlight.delete(ctrl);
    }
  };

  // Prompt-only first, schema second. Measured 2026-09-20 01:40 against
  // nemotron-3.5-lightning-30b-a3b with the same 64-token request:
  //
  //   without response_format   796 ms   {"minutes": 45, "domain": "learn"}
  //   with json_schema strict   15,434 ms  "										..." (never closes)
  //
  // Grammar-constrained decoding is degenerate on this endpoint: it accepts
  // the schema and then emits whitespace until max_tokens. Because the
  // endpoint never *rejects* the schema, the old order -- schema first, retry
  // only on rejection -- burned the whole timeout on every single call. That
  // is the entire "hosted latency is 8-10 s and spiky" finding, the 5/10
  // answered in the eval, and the planner timing out at 25 s. The schema is
  // still in the system prompt as text, and the JSON is extracted from the
  // reply; the constrained mode is kept only as a second attempt for a model
  // that ignores the prompt.
  // What each failure means, from the per-row eval on 2026-09-20 02:10: eight
  // rows answered in ~800 ms and four took 10-43 s. The slow four were 429s
  // (the key's rate limit), and a 429 used to fall into the schema retry --
  // the degenerate path above -- so every rate limit became a timeout.
  //
  //   429            -> wait, then the same prompt-only call once more
  //   non-JSON reply -> the schema attempt, which is what it is for
  //   timeout        -> give up; retrying doubles the wait for the same answer
  //   anything else  -> give up and say what it was
  const is429 = (e: unknown) => e instanceof Error && e.message.startsWith("429");
  const isNotJson = (e: unknown) => e instanceof SyntaxError;
  const errText = (e: unknown) => (e as Error).message;

  // A race, not a relay. Measured on submission morning, every hosted model
  // answered about 60-75% of calls inside budget and no model avoided
  // timeouts; a sequential failover made the worst case the sum of two
  // budgets. So the primary goes first and, RACE_STAGGER_MS later, the
  // fallback goes too; the first good JSON wins and the other request is
  // aborted. Two independent shots at ~70% each is ~90%, and the latency is
  // the faster of the two rather than the slower. The stagger keeps a quiet
  // API from being asked twice for nothing.
  const alt = NEMOTRON_FALLBACK_MODEL && NEMOTRON_FALLBACK_MODEL !== model ? NEMOTRON_FALLBACK_MODEL : undefined;
  const staggered = (useModel: string, ms: number) =>
    new Promise<{ data: T; used: string }>((resolve, reject) => {
      setTimeout(() => attempt(false, useModel).then((data) => resolve({ data, used: useModel }), reject), ms);
    });

  const runners = [staggered(model, 0), ...(alt ? [staggered(alt, RACE_STAGGER_MS)] : [])];
  try {
    const win = await Promise.any(runners);
    for (const c of inFlight) c.abort();
    return { data: win.data, provider: "nemotron-hosted", model: win.used, latencyMs: Date.now() - started };
  } catch (agg) {
    const errors: unknown[] = agg instanceof AggregateError ? agg.errors : [agg];
    const describe = errors.map((e, i) => `${i === 0 ? model : alt}: ${isTimeout(e) ? "timeout" : errText(e)}`).join("; ");
    // Both lost. A 429 on the primary earns one more prompt-only try after a
    // pause; a reply that was not JSON earns the schema attempt. Anything
    // else, or a second failure, is the deterministic tier's problem.
    const e1 = errors[0];
    if (!is429(e1) && !isNotJson(e1)) return { data: fallback(), provider: "heuristic", model, latencyMs: Date.now() - started, error: describe };
    try {
      if (is429(e1)) await new Promise((r) => setTimeout(r, 2500));
      const data = await attempt(isNotJson(e1));
      return { data, provider: "nemotron-hosted", model, latencyMs: Date.now() - started };
    } catch (e2) {
      return { data: fallback(), provider: "heuristic", model, latencyMs: Date.now() - started, error: `${describe} | retry: ${errText(e2)}` };
    }
  }
}

function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  return name === "AbortError" || name === "TimeoutError" || /abort|timeout/i.test(String((e as Error)?.message ?? ""));
}
