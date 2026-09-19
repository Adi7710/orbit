import { NVIDIA_BASE, NEMOTRON_PARSE_CANDIDATES, nvidiaKey, pickModel } from "./models";

/**
 * Nemotron Parse via NVIDIA's hosted API. Input: one page image (PNG/JPEG as
 * base64). Output: markdown plus per-element bounding boxes and classes.
 *
 * Response shape, verified against the hosted endpoint on 2026-09-19 (#6):
 *   tool_calls[0].function.arguments is a JSON **array of arrays** - one inner
 *   array per image in the request - and each element is
 *   { type, text, bbox: { xmin, ymin, xmax, ymax } } with the box **normalized
 *   0..1**, not pixels. Tables come back as LaTeX tabular text inside `text`.
 *   Checkbox glyphs are dropped by the model.
 *
 * Clients multiply bbox by the rendered image size to draw. Keeping 0..1 here
 * means the same numbers work for the web panel, the iOS overlay, and any
 * render resolution.
 */
export interface ParsedElement {
  type: string;
  text: string;
  /** [xmin, ymin, xmax, ymax], normalized 0..1 relative to the page image. */
  bbox: [number, number, number, number];
  page: number;
}
export interface ParsedPage { page: number; markdown: string; elements: ParsedElement[]; model?: string; raw?: unknown; error?: string }

export async function parsePageImage(base64Png: string, page = 1, mime = "image/png"): Promise<ParsedPage> {
  const key = nvidiaKey();
  if (!key) return { page, markdown: "", elements: [], error: "no NVIDIA_API_KEY" };
  const model = (await pickModel(NEMOTRON_PARSE_CANDIDATES)) ?? NEMOTRON_PARSE_CANDIDATES[0];

  const call = async (withTools: boolean) => {
    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: `<img src="data:${mime};base64,${base64Png}" />` }],
        ...(withTools ? { tools: [{ type: "function", function: { name: "markdown_bbox" } }] } : {}),
        max_tokens: 3000,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };

  let body: unknown;
  try {
    body = await call(true);
  } catch (e1) {
    try {
      body = await call(false);
    } catch (e2) {
      return { page, markdown: "", elements: [], model, error: `${(e1 as Error).message} | ${(e2 as Error).message}` };
    }
  }
  return { page, ...normalize(body, page), model, raw: body };
}

type RawBox = { xmin: number; ymin: number; xmax: number; ymax: number } | number[];
type RawElement = { type?: string; text?: string; bbox?: RawBox };

function toBox(bb: RawBox | undefined): [number, number, number, number] {
  if (Array.isArray(bb)) return [bb[0] ?? 0, bb[1] ?? 0, bb[2] ?? 0, bb[3] ?? 0];
  if (bb) return [bb.xmin, bb.ymin, bb.xmax, bb.ymax];
  return [0, 0, 0, 0];
}

/**
 * Accepts the array-of-arrays the hosted model returns, a flat array, or plain
 * markdown content. Flattening one level is the fix for #6: reading the outer
 * array as elements produced a single empty element and lost every box.
 */
export function normalize(body: unknown, page: number): { markdown: string; elements: ParsedElement[] } {
  const b = body as { choices?: { message?: { content?: string; tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const msg = b.choices?.[0]?.message;
  let markdown = msg?.content ?? "";
  const elements: ParsedElement[] = [];
  const args = msg?.tool_calls?.[0]?.function?.arguments;

  if (args) {
    try {
      const parsed: unknown = JSON.parse(args);
      const flat: RawElement[] = Array.isArray(parsed)
        ? (parsed as unknown[]).flatMap((x) => (Array.isArray(x) ? (x as RawElement[]) : [x as RawElement]))
        : [];
      for (const el of flat) {
        if (!el || typeof el !== "object") continue;
        const text = (el.text ?? "").trim();
        if (!text) continue;
        elements.push({ type: el.type ?? "Text", text, bbox: toBox(el.bbox), page });
      }
      if (!markdown) markdown = elements.map((e) => e.text).join("\n");
    } catch {
      /* keep whatever markdown we have */
    }
  }
  return { markdown, elements };
}
