import { NextResponse } from "next/server";
import { log, store } from "@/lib/store";
import type { Mode } from "@/core/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { mode, actor = "user" } = (await req.json()) as { mode: Mode; actor?: "user" | "voice" };
  if (!["normal", "crisis", "chill"].includes(mode)) return NextResponse.json({ ok: false }, { status: 400 });
  store().mode = mode;
  log(actor, "mode_changed", { mode });
  return NextResponse.json({ ok: true, mode });
}
