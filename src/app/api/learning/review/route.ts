import { NextResponse } from "next/server";
import { currentWeek, reviewUpTo, reviewWeek } from "@/lib/learned";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The weekly job. Runs every aspect over the week that just ended and updates
 * what Orbit believes about this student.
 *
 *   POST /api/learning/review                 -> catch up to the current week
 *   POST /api/learning/review {"week": 3}     -> just that week
 *   POST /api/learning/review {"useModel": false}  -> code only, no Nemotron
 *
 * Safe to run twice: a week reviewed again simply re-reads the same evidence.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { week?: number; useModel?: boolean; catchUp?: boolean };
  const useModel = body.useModel !== false;
  try {
    if (typeof body.week === "number") {
      if (!Number.isFinite(body.week) || body.week < 1) return NextResponse.json({ ok: false, error: "week must be 1 or more" }, { status: 400 });
      return NextResponse.json({ ok: true, reviews: [await reviewWeek(Math.floor(body.week), { useModel })] });
    }
    const reviews = await reviewUpTo(currentWeek(), { useModel });
    return NextResponse.json({ ok: true, week: currentWeek(), reviews });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = () => NextResponse.json({ week: currentWeek(), hint: "POST to run the weekly review" });
