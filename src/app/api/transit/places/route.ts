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

  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  const places = Object.entries(BUILDINGS).map(([id, b]) => {
    // The next class still ahead at this place. A student should never type an
    // arrival time that their own timetable already knows -- and typing one
    // is how the map ended up measuring against a class five hours past.
    const next = s.blocks
      .filter((x) => x.place === id && x.start > nowMin)
      .sort((x, y) => x.start - y.start)[0];
    return {
      id,
      label: id,
      lat: b.lat,
      lon: b.lon,
      isHome: id === "Home",
      hasClassToday: s.blocks.some((x) => x.place === id),
      nextClass: next ? { title: next.title, courseCode: next.courseCode ?? null, startText: hhmm(next.start) } : null,
    };
  });

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
