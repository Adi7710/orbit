import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today";
import { OPPORTUNITIES } from "@/core/opportunities";

export const dynamic = "force-dynamic";

/**
 * The world outside the timetable, ranked for this student, plus the growth
 * plan. Both are the same values /api/today carries; this is the page-sized
 * view of them with the full list underneath. `synthetic: true` on every
 * listing: hardcoded for the demo, dates to be verified before anyone books
 * a train.
 */
export async function GET() {
  const t = await buildToday();
  return NextResponse.json({ recommended: t.opportunities, growth: t.growth, all: OPPORTUNITIES });
}
