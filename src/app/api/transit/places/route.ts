import { NextResponse } from "next/server";
import { BUILDINGS } from "@/lib/journey";
import { transitNeed } from "@/core/transitRelevance";
import { clock } from "@/services/prt";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const isPlace = (p?: string): p is keyof typeof BUILDINGS => !!p && p in BUILDINGS;

/**
 * The places a student can ask to get to, and what Orbit would do unasked.
 *
 * Deliberately cheap: no protobuf feed is fetched here. Opening the app and
 * looking at a list of destinations should cost nothing, because most of the
 * time the answer to "should I be looking at buses" is no, and a public
 * agency's servers should not be polled to establish that.
 *
 * `suggested` is the one Orbit would pick on its own -- the class it thinks
 * you are heading to -- so a client can preselect it and a student going where
 * they always go taps nothing at all.
 */
export async function GET() {
  const s = store();
  const c = clock();
  const nowMin = Math.floor(c.sec / 60);
  const need = transitNeed({ nowMin, blocks: s.blocks, isPlace });

  const places = Object.entries(BUILDINGS).map(([id, b]) => ({
    id,
    label: id,
    lat: b.lat,
    lon: b.lon,
    isHome: id === "Home",
    // Where a class actually happens today, so the picker can sort the useful ones up.
    hasClassToday: s.blocks.some((x) => x.place === id),
  }));

  return NextResponse.json({
    places: places.sort((a, b) => Number(b.hasClassToday) - Number(a.hasClassToday) || a.label.localeCompare(b.label)),
    suggested: need.to ?? null,
    reason: need.reason,
    why: need.why,
    /** True when Orbit would already be planning this without being asked. */
    planned: need.needed,
    nowText: `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`,
  }, {
    // The place list moves when the timetable does, which is monthly. The
    // suggestion inside it moves with the clock, so a minute is the ceiling.
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
