import { NextResponse } from "next/server";
import { parsePageImage } from "@/agents/parse";
import { obligationsFromPages } from "@/agents/syllabus";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST multipart form with `pages` (one or more PNG/JPEG page images) and
 * optional `courseCode`. Returns the parsed pages, extracted tasks with
 * page+bbox evidence, and what was rejected for lacking a verbatim quote.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const courseCode = (form.get("courseCode") as string) || undefined;
  const files = form.getAll("pages").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "no pages" }, { status: 400 });

  const pages = [];
  let i = 1;
  for (const f of files) {
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    pages.push(await parsePageImage(b64, i++, f.type || "image/png"));
  }
  const out = await obligationsFromPages(pages, courseCode);
  const s = store();
  s.tasks.push(...out.tasks);
  log("agent", "syllabus_imported", { courseCode, tasks: out.tasks.length, rejected: out.rejected.length, provider: out.provider, model: out.model, parseErrors: pages.filter((p) => p.error).map((p) => p.error) });
  return NextResponse.json({ pages: pages.map(({ raw: _raw, ...p }) => p), ...out });
}
