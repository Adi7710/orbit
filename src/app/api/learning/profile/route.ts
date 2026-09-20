import { NextResponse } from "next/server";
import { ASPECTS } from "@/core/aspects";
import { currentWeek, learned, learnedFacts } from "@/lib/learned";

export const dynamic = "force-dynamic";

/**
 * Everything Orbit has worked out about this student, and what each thing
 * changes. Read-only. The web app, the iOS app and the voice agent all read
 * the same facts, so they can never describe the learning differently.
 */
export async function GET() {
  const l = learned();
  const facts = learnedFacts();
  return NextResponse.json({
    week: currentWeek(),
    lastReviewedWeek: l.lastReviewedWeek,
    facts,
    aspects: Object.entries(ASPECTS).map(([id, def]) => {
      const st = l.aspects[id];
      return {
        id,
        label: def.label,
        effect: def.effect,
        active: !!st?.active,
        observations: st?.observations ?? 0,
        needs: def.minObservations,
        lastReviewedWeek: st?.lastReviewedWeek ?? 0,
        memo: st?.memory.memos.at(-1)?.text ?? null,
        multipliers: st?.memory.multipliers ?? {},
        overall: st?.memory.global ?? null,
      };
    }),
  });
}
