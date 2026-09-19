import { NextResponse } from "next/server";
import { reset, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Puts the demo back to its opening state: nothing completed, no proposals,
 * normal mode, the seeded calibration history intact. Rehearsing a demo you
 * cannot rewind is how a team discovers at 10:55 that the story only works
 * once.
 */
export async function POST() {
  reset();
  const s = store();
  return NextResponse.json({ ok: true, tasks: s.tasks.length, mode: s.mode, xpWeek: s.user.xpWeek });
}
