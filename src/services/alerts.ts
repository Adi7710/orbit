import GtfsRealtimeBindings from "gtfs-realtime-bindings";

/**
 * PRT's third realtime feed: service alerts.
 *
 * We were reading trip updates and vehicle positions and ignoring this one,
 * which is the feed that tells you the stop has moved. Right now it carries a
 * live "Temp. Stop Move: Forbes & Bouquet" on route 61 -- the exact corner the
 * demo walks to. Without it Orbit sends a student to a stop that is not there
 * and every number it says about that trip is confidently wrong.
 *
 * A detour is not a delay. A delay makes the answer late; a detour makes it
 * false, and no amount of realtime arrival prediction recovers from standing
 * at the wrong pole.
 *
 * https://truetime.portauthority.org/gtfsrt-bus/alerts (protobuf, no key)
 */
const ALERTS_URL = process.env.PRT_GTFS_ALERTS_URL ?? "https://truetime.portauthority.org/gtfsrt-bus/alerts";
const TTL_MS = 60_000; // alerts change on the order of hours, not seconds

export type AlertEffect = "DETOUR" | "STOP_MOVED" | "NO_SERVICE" | "REDUCED_SERVICE" | "SIGNIFICANT_DELAYS" | "OTHER";

export interface ServiceAlert {
  id: string;
  /** One line, as PRT wrote it. */
  header: string;
  description?: string;
  effect: AlertEffect;
  routes: string[];
  stops: string[];
  /** True when it matters for a journey right now rather than next month. */
  activeNow: boolean;
  /** Does this change where you stand, rather than just when the bus comes? */
  movesTheStop: boolean;
}

const EFFECT = GtfsRealtimeBindings.transit_realtime.Alert.Effect;

/**
 * PRT publishes most alerts as UNKNOWN_EFFECT and puts the meaning in the
 * title -- 19 of 24 on the feed right now. "Temp. Stop Move" and "Stop
 * discontinued" are stop moves however they are labelled, so the text decides
 * when the enum will not.
 */
export function classify(effectEnum: number | null | undefined, header: string): { effect: AlertEffect; movesTheStop: boolean } {
  const h = header.toLowerCase();
  if (/\b(stop (move|moved|relocat|discontinu)|temp\.? stop|new bus stop|bus stop relocat)/.test(h)) return { effect: "STOP_MOVED", movesTheStop: true };
  if (/\b(detour|closure|closed|road work)/.test(h) || effectEnum === EFFECT.DETOUR) return { effect: "DETOUR", movesTheStop: true };
  if (/\bo\/s\b|\bout of service\b|\bcancel/.test(h) || effectEnum === EFFECT.NO_SERVICE) return { effect: "NO_SERVICE", movesTheStop: false };
  if (effectEnum === EFFECT.REDUCED_SERVICE) return { effect: "REDUCED_SERVICE", movesTheStop: false };
  if (effectEnum === EFFECT.SIGNIFICANT_DELAYS) return { effect: "SIGNIFICANT_DELAYS", movesTheStop: false };
  return { effect: "OTHER", movesTheStop: false };
}

const text = (t: { translation?: { text?: string | null }[] | null } | null | undefined) =>
  (t?.translation?.[0]?.text ?? "").trim();

let cache: { at: number; alerts: ServiceAlert[]; ok: boolean } | undefined;

export async function serviceAlerts(nowEpoch = Math.floor(Date.now() / 1000)): Promise<{ alerts: ServiceAlert[]; ok: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return { alerts: cache.alerts, ok: cache.ok };
  const alerts: ServiceAlert[] = [];
  let ok = false;

  if (process.env.DEMO_MODE !== "offline") {
    try {
      const res = await fetch(ALERTS_URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
        for (const e of feed.entity) {
          const a = e.alert;
          if (!a) continue;
          const header = text(a.headerText);
          if (!header) continue;

          // No active period at all means "in force until withdrawn", which is
          // how PRT publishes most of them. Treat absence as active rather than
          // silently dropping every alert that has one.
          const periods = a.activePeriod ?? [];
          const activeNow = periods.length === 0 || periods.some((p) => {
            const start = Number(p.start ?? 0), end = Number(p.end ?? 0);
            return (!start || start <= nowEpoch) && (!end || end >= nowEpoch);
          });

          const routes = [...new Set((a.informedEntity ?? []).map((x) => x.routeId).filter((x): x is string => !!x))];
          const stops = [...new Set((a.informedEntity ?? []).map((x) => x.stopId).filter((x): x is string => !!x))];
          const { effect, movesTheStop } = classify(a.effect, header);
          alerts.push({ id: e.id ?? header, header, description: text(a.descriptionText) || undefined, effect, routes, stops, activeNow, movesTheStop });
        }
        ok = true;
      }
    } catch {
      ok = false;
    }
  }

  cache = { at: Date.now(), alerts, ok };
  return { alerts, ok };
}

/** Only the alerts that touch this trip: its route, or a stop it uses. */
export function alertsFor(all: ServiceAlert[], routes: string[], stops: string[]): ServiceAlert[] {
  const r = new Set(routes), s = new Set(stops);
  return all
    .filter((a) => a.activeNow)
    .filter((a) => a.routes.some((x) => r.has(x)) || a.stops.some((x) => s.has(x)))
    // Something that moves where you stand outranks something that changes when.
    .sort((a, b) => Number(b.movesTheStop) - Number(a.movesTheStop));
}

export const resetAlertCache = () => { cache = undefined; };
