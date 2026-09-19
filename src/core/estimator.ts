import type { Domain, Task } from "./types";

/**
 * Corrects what a student thinks a task takes with what it actually took.
 * Needs five samples, trims the best and worst, caps the multiplier at 3x.
 */
export class Estimator {
  static MIN_SAMPLES = 5;
  static MAX_MULTIPLIER = 3;
  private guessed = new Map<string, number[]>();
  private actual = new Map<string, number[]>();

  static key(courseCode: string | undefined, domain: Domain) {
    return `${courseCode ?? "*"}::${domain}`;
  }

  record(courseCode: string | undefined, domain: Domain, guessedMin: number, actualMin: number) {
    if (guessedMin <= 0 || actualMin <= 0) return;
    const k = Estimator.key(courseCode, domain);
    this.guessed.set(k, [...(this.guessed.get(k) ?? []), guessedMin]);
    this.actual.set(k, [...(this.actual.get(k) ?? []), actualMin]);
  }

  multiplier(courseCode: string | undefined, domain: Domain): number {
    const k = Estimator.key(courseCode, domain);
    const g = this.guessed.get(k) ?? [];
    const a = this.actual.get(k) ?? [];
    if (g.length < Estimator.MIN_SAMPLES) return 1;
    const ratios = g.map((x, i) => a[i] / x).sort((x, y) => x - y);
    const trimmed = ratios.length >= 3 ? ratios.slice(1, -1) : ratios;
    const mean = trimmed.reduce((s, r) => s + r, 0) / trimmed.length;
    return Math.min(Estimator.MAX_MULTIPLIER, Math.max(0.25, mean));
  }

  planningMinutes(task: Task): number {
    return Math.round(task.estimateMinutes * this.multiplier(task.courseCode, task.domain));
  }

  /** Calibration rows for the eval chart: predicted vs actual per key. */
  calibration(): { key: string; samples: number; multiplier: number; meanGuess: number; meanActual: number }[] {
    return [...this.guessed.keys()].map((k) => {
      const g = this.guessed.get(k)!, a = this.actual.get(k)!;
      const [course, domain] = k.split("::");
      return {
        key: k,
        samples: g.length,
        multiplier: this.multiplier(course === "*" ? undefined : course, domain as Domain),
        meanGuess: g.reduce((s, x) => s + x, 0) / g.length,
        meanActual: a.reduce((s, x) => s + x, 0) / a.length,
      };
    });
  }
}

/** Title heuristics for a first estimate before any samples exist. */
export function heuristicMinutes(title: string): number {
  const s = title.toLowerCase();
  if (/(exam|midterm|final)/.test(s)) return 240;
  if (/(project|paper|essay|report)/.test(s)) return 180;
  if (/(problem set|pset|homework|hw|assignment)/.test(s)) return 90;
  if (/(lab)/.test(s)) return 120;
  if (/(quiz)/.test(s)) return 45;
  if (/(reading|read|chapter)/.test(s)) return 40;
  if (/(discussion|post|reflection)/.test(s)) return 30;
  return 60;
}

// MARK: - The anchored clamp

/**
 * How far the model is allowed to move the heuristic baseline.
 *
 * This is the whole safety argument of the anchored variant, so it lives here
 * in the pure core with the rest of the arithmetic rather than inline in the
 * agent: it has to be provable without a network call or an API key.
 *
 * Half to double is deliberately generous. The model must be able to correct
 * a bad rule -- that is the entire reason for having it -- while a five-times
 * miss like "Quiz 3 prep" at 240 minutes against a 45-minute baseline becomes
 * structurally impossible instead of merely discouraged by a prompt.
 */
export const CLAMP_LO = 0.5;
export const CLAMP_HI = 2;

export interface ClampResult {
  /** What we will actually plan with. */
  minutes: number;
  /** True when code had to pull the model back. Reported by /api/eval. */
  clamped: boolean;
  lo: number;
  hi: number;
}

export function clampToBaseline(raw: number, baseline: number): ClampResult {
  const lo = Math.round(baseline * CLAMP_LO);
  const hi = Math.round(baseline * CLAMP_HI);
  const minutes = Math.min(hi, Math.max(lo, raw));
  return { minutes, clamped: minutes !== raw, lo, hi };
}
