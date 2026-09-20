/**
 * PATH live departures, from the board the Port Authority drives RidePATH with.
 *
 * https://www.panynj.gov/bin/portauthority/ridepath.json — public JSON, no
 * key, thirteen stations, seconds to arrival per destination.
 *
 * This matters because of what is *not* available. NJ Transit's realtime
 * feeds, which would cover the Hudson-Bergen Light Rail, sit behind a
 * developer account we do not have. So in Hudson County the honest position
 * is split: PATH is live, the light rail is timetable-only, and the app says
 * which is which rather than implying both are predictions.
 */

export interface PathDeparture {
  /** Station code as PATH publishes it: HOB, GRV, EXP, NEW, JSQ, WTC, 33S. */
  station: string;
  /** Where this train is going, same code space. */
  target: string;
  secondsToArrival: number;
  /** PATH's own wording: "2 min", "0 min", "Delayed". */
  text: string;
  lineColor?: string;
}

const URL = process.env.PATH_RIDEPATH_URL ?? "https://www.panynj.gov/bin/portauthority/ridepath.json";
const TTL_MS = 20_000;

/** Our GTFS stop names mapped onto PATH's station codes. */
export const PATH_CODE: Record<string, string> = {
  HOBOKEN: "HOB",
  "GROVE STREET": "GRV",
  "EXCHANGE PLACE": "EXP",
  NEWPORT: "NEW",
  "JOURNAL SQUARE": "JSQ",
  "WORLD TRADE CENTER": "WTC",
  "33RD STREET": "33S",
};

export const pathCodeForStopName = (name: string): string | undefined => {
  const n = name.toUpperCase().trim();
  return PATH_CODE[n] ?? Object.entries(PATH_CODE).find(([k]) => n.includes(k))?.[1];
};

let cache: { at: number; departures: PathDeparture[]; ok: boolean } | undefined;

export async function pathDepartures(): Promise<{ departures: PathDeparture[]; ok: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return { departures: cache.departures, ok: cache.ok };
  const departures: PathDeparture[] = [];
  let ok = false;

  if (process.env.DEMO_MODE !== "offline") {
    try {
      const res = await fetch(URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = (await res.json()) as {
          results?: { consideredStation?: string; destinations?: { label?: string; messages?: { target?: string; secondsToArrival?: string | number; arrivalTimeMessage?: string; lineColor?: string }[] }[] }[];
        };
        for (const st of json.results ?? []) {
          const station = (st.consideredStation ?? "").toUpperCase();
          if (!station) continue;
          for (const dest of st.destinations ?? []) {
            for (const m of dest.messages ?? []) {
              const secs = Number(m.secondsToArrival ?? NaN);
              if (!m.target || !Number.isFinite(secs)) continue;
              departures.push({
                station,
                target: String(m.target).toUpperCase(),
                secondsToArrival: Math.max(0, secs),
                text: m.arrivalTimeMessage ?? `${Math.round(secs / 60)} min`,
                lineColor: m.lineColor ?? undefined,
              });
            }
          }
        }
        ok = true;
      }
    } catch {
      ok = false;
    }
  }

  cache = { at: Date.now(), departures, ok };
  return { departures, ok };
}

/**
 * The next live trains from one station, soonest first.
 *
 * Deliberately not matched to GTFS trip ids: PATH's board does not publish
 * them, so this cannot be overlaid on a scheduled trip the way the Pittsburgh
 * trip-updates feed was. It is a separate, honest answer -- "the next train to
 * Hoboken is in four minutes" -- rather than a prediction pretending to belong
 * to a timetable row.
 */
export function nextFrom(departures: PathDeparture[], stationCode: string, towards?: string): PathDeparture[] {
  return departures
    .filter((d) => d.station === stationCode)
    .filter((d) => !towards || d.target === towards)
    .sort((a, b) => a.secondsToArrival - b.secondsToArrival);
}

export const resetPathCache = () => { cache = undefined; };
