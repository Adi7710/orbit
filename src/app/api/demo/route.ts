import { NextResponse } from "next/server";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Demo triggers. These change the world so the Watcher has something real to
 * react to; they never fake the reaction itself.
 *
 * POST { action: "cancel_class", blockId? }  a class comes off the calendar
 * POST { action: "restore" }                 put it back
 * POST { action: "overload", minutes? }      drop a big task on the day
 */
const g = globalThis as unknown as { __orbitDemoRemoved?: ReturnType<typeof store>["blocks"] };

export async function POST(req: Request) {
  const { action, blockId, minutes } = (await req.json().catch(() => ({}))) as { action?: string; blockId?: string; minutes?: number };
  const s = store();

  if (action === "cancel_class") {
    // Default to the class whose removal frees the most time, which is both the
    // most useful thing to demo and the most annoying thing to have happen.
    const idx = blockId
      ? s.blocks.findIndex((b) => b.id === blockId)
      : s.blocks.reduce((best, b, i, arr) => (b.kind === "class" && b.end - b.start > (arr[best]?.end ?? 0) - (arr[best]?.start ?? 0) ? i : best), s.blocks.findIndex((b) => b.kind === "class"));
    if (idx < 0) return NextResponse.json({ ok: false, error: "no class to cancel" }, { status: 409 });
    const [removed] = s.blocks.splice(idx, 1);
    g.__orbitDemoRemoved = [...(g.__orbitDemoRemoved ?? []), removed];
    log("user", "class_cancelled", { id: removed.id, title: removed.title });
    return NextResponse.json({ ok: true, cancelled: removed.title, remaining: s.blocks.length });
  }

  if (action === "restore") {
    const back = g.__orbitDemoRemoved ?? [];
    s.blocks.push(...back);
    s.blocks.sort((a, b) => a.start - b.start);
    g.__orbitDemoRemoved = [];
    return NextResponse.json({ ok: true, restored: back.length });
  }

  if (action === "overload") {
    s.tasks.push({ id: `demo-${Date.now()}`, title: "Group project deliverable", domain: "build", estimateMinutes: minutes ?? 420, source: "manual", dueAt: new Date(Date.now() + 20 * 36e5) });
    return NextResponse.json({ ok: true, added: minutes ?? 420 });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
