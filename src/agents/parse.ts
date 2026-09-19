import { NVIDIA_BASE, NEMOTRON_PARSE_CANDIDATES, nvidiaKey, pickModel } from "./models";

/**
 * Nemotron Parse via NVIDIA's hosted API. Input: one page image (PNG/JPEG as
 * base64). Output: markdown plus per-element bounding boxes and classes.
 * The hosted endpoint follows the nemoretriever-parse convention: an image in
 * the user message and a tool selecting the output mode. If the deployment
 * rejects the tools parameter we retry without it and parse whatever comes.
 */
export interface ParsedElement { type: string; text: string; bbox: [number, number, number, number]; page: number }
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

/** Accepts either tool_calls with a JSON array of {type,text,bbox} or plain markdown content. */
function normalize(body: unknown, page: number): { markdown: string; elements: ParsedElement[] } {
  const b = body as { choices?: { message?: { content?: string; tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const msg = b.choices?.[0]?.message;
  const elements: ParsedElement[] = [];
  let markdown = msg?.content ?? "";
  const args = msg?.tool_calls?.[0]?.function?.arguments;
  if (args) {
    try {
      const arr = JSON.parse(args) as { type?: string; text?: string; bbox?: { xmin: number; ymin: number; xmax: number; ymax: number } | number[] }[];
      for (const el of Array.isArray(arr) ? arr : []) {
        const bb = el.bbox;
        const box: [number, number, number, number] = Array.isArray(bb) ? [bb[0], bb[1], bb[2], bb[3]] : bb ? [bb.xmin, bb.ymin, bb.xmax, bb.ymax] : [0, 0, 0, 0];
        elements.push({ type: el.type ?? "Text", text: el.text ?? "", bbox: box, page });
      }
      if (!markdown) markdown = elements.map((e) => e.text).join("\n");
    } catch {
      /* fall through with markdown only */
    }
  }
  return { markdown, elements };
}
